"""Windows integration tests for the protected proactive-send ledger."""
from __future__ import annotations

import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import unittest


SCRIPT = pathlib.Path(__file__).parents[1] / "scripts" / "proactive-send-ledger.ps1"
POWERSHELL = shutil.which("powershell.exe") or shutil.which("powershell")


@unittest.skipUnless(os.name == "nt" and POWERSHELL, "Windows PowerShell and DPAPI required")
class ProactiveSendLedgerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.ledger = pathlib.Path(self.temp.name) / "ledger.dpapi"

    def tearDown(self) -> None:
        self.temp.cleanup()

    def run_ledger(self, action: str, *args: str) -> tuple[int, dict]:
        command = [
            POWERSHELL,
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(SCRIPT),
            "-Action",
            action,
            "-LedgerPath",
            str(self.ledger),
            *args,
        ]
        completed = subprocess.run(command, check=False, capture_output=True, text=True)
        lines = [line for line in completed.stdout.splitlines() if line.strip()]
        return completed.returncode, json.loads(lines[-1])

    def test_initialize_reserve_commit_and_cooldown(self) -> None:
        code, initialized = self.run_ledger("Initialize")
        self.assertEqual(code, 0)
        self.assertEqual(initialized["code"], "LEDGER_INITIALIZED")

        recipient = "resident@example.com"
        topic = "even-shaprut-site-service-notice-2026"
        common = ["-Recipient", recipient, "-Topic", topic]

        code, check = self.run_ledger("Check", *common)
        self.assertEqual(code, 0)
        self.assertTrue(check["eligible"])

        code, reserve = self.run_ledger("Reserve", *common, "-OperationKey", "send:test:0001")
        self.assertEqual(code, 0)
        self.assertEqual(reserve["code"], "RESERVED")

        code, blocked = self.run_ledger("Check", *common)
        self.assertEqual(code, 0)
        self.assertFalse(blocked["eligible"])
        self.assertEqual(blocked["code"], "RECONCILIATION_REQUIRED")

        code, committed = self.run_ledger(
            "MarkSent",
            *common,
            "-OperationKey",
            "send:test:0001",
            "-GmailMessageId",
            "gmail-message-id-1",
        )
        self.assertEqual(code, 0)
        self.assertEqual(committed["code"], "SENT_VERIFIED_RECORDED")

        code, cooldown = self.run_ledger("Check", *common)
        self.assertEqual(code, 0)
        self.assertFalse(cooldown["eligible"])
        self.assertEqual(cooldown["code"], "COOLDOWN_ACTIVE")

        ciphertext = self.ledger.read_bytes()
        self.assertNotIn(recipient.encode(), ciphertext)
        self.assertNotIn(topic.encode(), ciphertext)
        self.assertNotIn(b"gmail-message-id-1", ciphertext)

    def test_uncertain_send_requires_verified_release(self) -> None:
        self.assertEqual(self.run_ledger("Initialize")[0], 0)
        common = [
            "-Recipient",
            "resident@example.com",
            "-Topic",
            "service-update",
            "-OperationKey",
            "send:test:0002",
        ]
        self.assertEqual(self.run_ledger("Reserve", *common)[1]["code"], "RESERVED")
        self.assertEqual(self.run_ledger("MarkUncertain", *common)[1]["code"], "SEND_UNCERTAIN_RECORDED")
        code, denied = self.run_ledger("Release", *common)
        self.assertEqual(code, 3)
        self.assertEqual(denied["code"], "VERIFIED_NOT_SENT_REQUIRED")
        code, released = self.run_ledger("Release", *common, "-VerifiedNotSent")
        self.assertEqual(code, 0)
        self.assertEqual(released["code"], "RELEASED_NOT_SENT")

    def test_corruption_fails_closed(self) -> None:
        self.ledger.write_bytes(b"not-a-dpapi-ledger")
        code, result = self.run_ledger("Status")
        self.assertEqual(code, 3)
        self.assertEqual(result["code"], "LEDGER_CORRUPT_OR_WRONG_IDENTITY")


if __name__ == "__main__":
    unittest.main(verbosity=2)
