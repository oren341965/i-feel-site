"""Windows integration tests for the protected proactive-send ledger."""
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import tempfile
import unittest


SCRIPT = pathlib.Path(__file__).parents[1] / "scripts" / "proactive-send-ledger.ps1"
def find_shell(*names: str, fallback: pathlib.Path | None = None) -> str | None:
    """Discover installed engines only; never install or change execution policy."""
    for name in names:
        found = shutil.which(name)
        if found:
            return found
    return str(fallback) if fallback and fallback.is_file() else None


POWERSHELL = find_shell(
    "powershell.exe", "powershell",
    fallback=pathlib.Path(os.environ.get("SystemRoot", r"C:\Windows"))
    / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe",
)
PWSH = find_shell(
    "pwsh.exe", "pwsh",
    fallback=pathlib.Path(os.environ.get("ProgramFiles", r"C:\Program Files"))
    / "PowerShell" / "7" / "pwsh.exe",
)
SHELL_POLICIES: dict[str, str] = {}


def ps_literal(value: pathlib.Path | str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def canonical_timestamp(value: str) -> str:
    # PowerShell 7's JSON serializer may omit zero fractional seconds. Preserve
    # all nonzero digits (including the seventh tick digit), not just microseconds.
    return re.sub(
        r"\.(\d+)(?=Z$|[+-]\d{2}:\d{2}$)",
        lambda match: "." + match[1].rstrip("0") if match[1].rstrip("0") else "",
        value.replace("+00:00", "Z"),
    )


def shell_environment() -> dict[str, str]:
    # A PS7-launched Python process may carry PS7 module paths into Windows
    # PowerShell 5.1. Let each child discover its own built-in modules. This
    # does not change any execution policy or the parent process environment.
    environment = os.environ.copy()
    for key in list(environment):
        if key.lower() == "psmodulepath":
            del environment[key]
    return environment


class _LedgerTestCases:
    shell: str

    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="maya-ledger-test-")
        self.ledger = pathlib.Path(self.temp.name) / "ledger.dpapi"

    def tearDown(self) -> None:
        self.temp.cleanup()

    def run_ledger(self, action: str, *args: str, shell: str | None = None) -> tuple[int, dict]:
        engine = shell or self.shell
        if engine not in SHELL_POLICIES:
            policy = self.run_inspection(
                "[pscustomobject]@{policy=(Get-ExecutionPolicy).ToString()} | ConvertTo-Json -Compress",
                shell=engine,
            )
            SHELL_POLICIES[engine] = policy["policy"]
        if SHELL_POLICIES[engine] == "Restricted":
            self.skipTest(f"BLOCKED: {engine} execution policy is Restricted; no bypass attempted")
        command = [
            engine,
            "-NoProfile",
            "-NonInteractive",
            "-File",
            str(SCRIPT),
            "-Action",
            action,
            "-LedgerPath",
            str(self.ledger),
            *args,
        ]
        completed = subprocess.run(
            command, check=False, capture_output=True, text=True,
            timeout=30, env=shell_environment(),
        )
        lines = [line for line in completed.stdout.splitlines() if line.strip()]
        self.assertTrue(lines, f"No ledger result; exit={completed.returncode}: {completed.stderr}")
        return completed.returncode, json.loads(lines[-1])

    def run_inspection(self, code: str, *, shell: str | None = None) -> dict:
        completed = subprocess.run(
            [shell or self.shell, "-NoProfile", "-NonInteractive", "-Command", code],
            check=False, capture_output=True, text=True, timeout=30, env=shell_environment(),
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        lines = [line for line in completed.stdout.splitlines() if line.strip()]
        self.assertTrue(lines, completed.stderr)
        return json.loads(lines[-1])

    def assert_private_acl(self, path: pathlib.Path) -> None:
        result = self.run_inspection(
            "$ErrorActionPreference = 'Stop'; "
            f"$acl = Microsoft.PowerShell.Security\\Get-Acl -LiteralPath {ps_literal(path)}; "
            "$sidType = [Security.Principal.SecurityIdentifier]; "
            "$rules = @($acl.GetAccessRules($true, $true, $sidType) | ForEach-Object { "
            "[pscustomobject]@{sid=$_.IdentityReference.Value; rights=[int]$_.FileSystemRights; "
            "type=$_.AccessControlType.ToString(); inherited=$_.IsInherited; "
            "inheritance=$_.InheritanceFlags.ToString(); propagation=$_.PropagationFlags.ToString()} }); "
            "[pscustomobject]@{currentSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; "
            "ownerSid=$acl.GetOwner($sidType).Value; protected=$acl.AreAccessRulesProtected; "
            "fullControl=[int][Security.AccessControl.FileSystemRights]::FullControl; rules=$rules} "
            "| ConvertTo-Json -Compress -Depth 5"
        )
        self.assertEqual(result["ownerSid"], result["currentSid"])
        self.assertTrue(result["protected"])
        expected_sids = {result["currentSid"], "S-1-5-18"}
        self.assertEqual({rule["sid"] for rule in result["rules"]}, expected_sids)
        self.assertEqual(len(result["rules"]), len(expected_sids))
        for rule in result["rules"]:
            self.assertEqual(rule["rights"], result["fullControl"])
            self.assertEqual(rule["type"], "Allow")
            self.assertFalse(rule["inherited"])
            self.assertEqual(rule["inheritance"], "None")
            self.assertEqual(rule["propagation"], "None")

    def decrypt_fixture(self, *, shell: str | None = None) -> dict:
        # This path is always an isolated synthetic fixture, never the real journal.
        return self.run_inspection(
            "$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.Security; "
            f"$bytes = [IO.File]::ReadAllBytes({ps_literal(self.ledger)}); "
            "$plain = [Security.Cryptography.ProtectedData]::Unprotect($bytes, "
            "[Text.Encoding]::UTF8.GetBytes('i-feel:maya:proactive-send-ledger:v1'), "
            "[Security.Cryptography.DataProtectionScope]::CurrentUser); "
            "[Text.Encoding]::UTF8.GetString($plain)",
            shell=shell,
        )

    def assert_entries_preserved(self, original: dict, updated: dict) -> None:
        for entry_key, entry in original.items():
            self.assertIn(entry_key, updated)
            self.assertEqual(set(updated[entry_key]), set(entry))
            for field, value in entry.items():
                actual = updated[entry_key][field]
                if field.endswith("At"):
                    self.assertEqual(canonical_timestamp(actual), canonical_timestamp(value))
                else:
                    self.assertEqual(actual, value)

    def test_initialize_reserve_commit_and_cooldown(self) -> None:
        code, initialized = self.run_ledger("Initialize")
        self.assertEqual(code, 0, initialized)
        self.assertEqual(initialized["code"], "LEDGER_INITIALIZED")
        self.assert_private_acl(self.ledger)

        recipient = "resident@example.com"
        topic = "even-shaprut-site-service-notice-2026"
        common = ["-Recipient", recipient, "-Topic", topic]

        code, check = self.run_ledger("Check", *common)
        self.assertEqual(code, 0, check)
        self.assertTrue(check["eligible"])

        code, reserve = self.run_ledger("Reserve", *common, "-OperationKey", "send:test:0001")
        self.assertEqual(code, 0)
        self.assertEqual(reserve["code"], "RESERVED")
        self.assert_private_acl(self.ledger)
        self.assert_private_acl(pathlib.Path(str(self.ledger) + ".previous"))

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
        self.assert_private_acl(self.ledger)
        self.assert_private_acl(pathlib.Path(str(self.ledger) + ".previous"))

        code, cooldown = self.run_ledger("Check", *common)
        self.assertEqual(code, 0, cooldown)
        self.assertFalse(cooldown["eligible"])
        self.assertEqual(cooldown["code"], "COOLDOWN_ACTIVE")

        ciphertext = self.ledger.read_bytes()
        self.assertNotIn(recipient.encode(), ciphertext)
        self.assertNotIn(topic.encode(), ciphertext)
        self.assertNotIn(b"gmail-message-id-1", ciphertext)
        plaintext = self.decrypt_fixture()
        self.assertEqual(plaintext["schemaVersion"], 1)
        self.assertEqual(len(plaintext["entries"]), 1)
        entry = next(iter(plaintext["entries"].values()))
        self.assertEqual(entry["status"], "sent_verified")
        self.assertEqual(entry["gmailMessageIdHash"], hashlib.sha256(b"gmail-message-id-1").hexdigest())

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

    def test_check_and_status_preserve_ciphertext_hash_and_acl(self) -> None:
        self.assertEqual(self.run_ledger("Initialize")[0], 0)
        self.assertEqual(self.run_ledger(
            "Reserve", "-Recipient", "fixture@example.com", "-Topic", "fixture-topic",
            "-OperationKey", "send:readonly:0001",
        )[0], 0)
        before = self.ledger.read_bytes()
        before_hash = hashlib.sha256(before).hexdigest()
        before_stat = self.ledger.stat()
        previous = pathlib.Path(str(self.ledger) + ".previous").read_bytes()
        for action in ("Check", "Status"):
            args = ["-Recipient", "fixture@example.com", "-Topic", "fixture-topic"] if action == "Check" else []
            code, result = self.run_ledger(action, *args)
            self.assertEqual(code, 0)
            self.assertTrue(result["ok"])
            self.assertEqual(self.ledger.read_bytes(), before)
            self.assertEqual(hashlib.sha256(self.ledger.read_bytes()).hexdigest(), before_hash)
            self.assertEqual(self.ledger.stat().st_mtime_ns, before_stat.st_mtime_ns)
            self.assertEqual(pathlib.Path(str(self.ledger) + ".previous").read_bytes(), previous)
            self.assert_private_acl(self.ledger)

    def test_90_day_cooldown_boundary_is_culture_independent(self) -> None:
        self.assertEqual(self.run_ledger("Initialize")[0], 0)
        common = ["-Recipient", "fixture@example.com", "-Topic", "fixture-topic"]
        self.assertEqual(self.run_ledger(
            "Reserve", *common, "-OperationKey", "send:culture:0001",
            "-ObservedAt", "2026-01-01T12:34:56Z", "-CooldownDays", "90",
        )[0], 0)
        self.assertEqual(self.run_ledger(
            "MarkSent", *common, "-OperationKey", "send:culture:0001",
            "-GmailMessageId", "synthetic-culture-message",
            "-ObservedAt", "2026-01-01T12:34:56Z",
        )[0], 0)
        before = self.ledger.read_bytes()
        for culture in ("en-US", "en-IL"):
            for observed_at, expected in (
                ("2026-04-01T12:34:55Z", "COOLDOWN_ACTIVE"),
                ("2026-04-01T12:34:56Z", "ELIGIBLE"),
            ):
                with self.subTest(culture=culture, observed_at=observed_at):
                    # Set culture only in the isolated child process. Invoking
                    # the script normally still honors its execution policy.
                    result = self.run_inspection(
                        "$ErrorActionPreference = 'Stop'; "
                        "[Threading.Thread]::CurrentThread.CurrentCulture = "
                        f"[Globalization.CultureInfo]::GetCultureInfo({ps_literal(culture)}); "
                        f"& {ps_literal(SCRIPT)} -Action Check -LedgerPath {ps_literal(self.ledger)} "
                        "-Recipient 'fixture@example.com' -Topic 'fixture-topic' "
                        f"-CooldownDays 90 -ObservedAt {ps_literal(observed_at)}"
                    )
                    self.assertEqual(result["code"], expected)
                    self.assertEqual(result["eligible"], expected == "ELIGIBLE")
                    self.assertEqual(self.ledger.read_bytes(), before)

    def test_unrelated_reservation_preserves_existing_sent_entry(self) -> None:
        self.assertEqual(self.run_ledger("Initialize")[0], 0)
        common = ["-Recipient", "original@example.com", "-Topic", "original-topic"]
        self.assertEqual(self.run_ledger(
            "Reserve", *common, "-OperationKey", "send:preserve:0001",
            "-ObservedAt", "2026-01-01T12:34:56.1234567Z",
        )[0], 0)
        self.assertEqual(self.run_ledger(
            "MarkSent", *common, "-OperationKey", "send:preserve:0001",
            "-GmailMessageId", "synthetic-preserved-message",
            "-ObservedAt", "2026-01-01T12:34:56.1234567Z",
        )[0], 0)
        original = self.decrypt_fixture()
        self.assertEqual(self.run_ledger(
            "Reserve", "-Recipient", "new@example.com", "-Topic", "new-topic",
            "-OperationKey", "send:preserve:0002",
        )[0], 0)
        updated = self.decrypt_fixture()
        self.assertEqual(updated["schemaVersion"], original["schemaVersion"])
        self.assertEqual(canonical_timestamp(updated["createdAt"]), canonical_timestamp(original["createdAt"]))
        self.assertEqual(len(updated["entries"]), 2)
        self.assert_entries_preserved(original["entries"], updated["entries"])
        self.assert_private_acl(self.ledger)
        self.assert_private_acl(pathlib.Path(str(self.ledger) + ".previous"))

    def test_acl_failure_keeps_existing_ledger_and_cleans_only_fixture_temp(self) -> None:
        self.assertEqual(self.run_ledger("Initialize")[0], 0)
        self.assertEqual(self.run_ledger(
            "Reserve", "-Recipient", "fixture@example.com", "-Topic", "fixture-topic",
            "-OperationKey", "send:acl:0001",
        )[0], 0)
        before = self.ledger.read_bytes()
        previous_path = pathlib.Path(str(self.ledger) + ".previous")
        previous = previous_path.read_bytes()
        # Load only production function definitions via AST; never dot-source the
        # script's startup/default-path actions. Inject failure at the ACL boundary
        # in this child process, without changing any real ACL or execution policy.
        result = self.run_inspection(
            "$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.Security; "
            "$tokens = $null; $errors = $null; "
            f"$ast = [Management.Automation.Language.Parser]::ParseFile({ps_literal(SCRIPT)}, [ref]$tokens, [ref]$errors); "
            "if ($errors.Count -gt 0) { throw 'FIXTURE_SOURCE_PARSE_FAILED' }; "
            "$names = @('Protect-Bytes','Unprotect-Bytes','Read-Ledger','Write-Ledger'); "
            "$definitions = $ast.FindAll({param($node) "
            "$node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -in $names}, $false); "
            "foreach ($definition in $definitions) { . ([scriptblock]::Create($definition.Extent.Text)) }; "
            "function Set-PrivateFileAcl { param([string]$Path) throw 'TEST_ACL_DENIED' }; "
            f"$fixturePath = {ps_literal(self.ledger)}; "
            "$ledger = Read-Ledger -Path $fixturePath; "
            "$ledger.entries | Add-Member -NotePropertyName 'not-committed' -NotePropertyValue @{status='reserved'}; "
            "$caught = $null; try { Write-Ledger -Path $fixturePath -Ledger $ledger } "
            "catch { $caught = $_.Exception.Message }; "
            "[pscustomobject]@{failure=$caught} | ConvertTo-Json -Compress"
        )
        self.assertEqual(result["failure"], "TEST_ACL_DENIED")
        self.assertEqual(self.ledger.read_bytes(), before)
        self.assertEqual(previous_path.read_bytes(), previous)
        self.assertEqual(list(pathlib.Path(self.temp.name).glob("*.tmp")), [])
        self.assert_private_acl(self.ledger)
        self.assertEqual(self.run_ledger("Status")[1]["entryCount"], 1)


@unittest.skipUnless(os.name == "nt" and POWERSHELL, "Windows PowerShell 5.1 and DPAPI required")
class WindowsPowerShellLedgerTests(_LedgerTestCases, unittest.TestCase):
    shell = POWERSHELL


@unittest.skipUnless(os.name == "nt" and PWSH, "Windows PowerShell 7 and DPAPI required")
class PowerShell7LedgerTests(_LedgerTestCases, unittest.TestCase):
    shell = PWSH

    @unittest.skipUnless(POWERSHELL, "Both Windows PowerShell 5.1 and PowerShell 7 required")
    def test_windows_powershell_ledger_survives_pwsh_write_and_round_trip(self) -> None:
        self.assertEqual(self.run_ledger("Initialize", shell=POWERSHELL)[0], 0)
        original_args = ["-Recipient", "original@example.com", "-Topic", "original-fixture-topic"]
        self.assertEqual(self.run_ledger(
            "Reserve", *original_args, "-OperationKey", "send:cross:0001", shell=POWERSHELL,
        )[0], 0)
        self.assertEqual(self.run_ledger(
            "MarkSent", *original_args, "-OperationKey", "send:cross:0001",
            "-GmailMessageId", "synthetic-gmail-cross-0001", shell=POWERSHELL,
        )[0], 0)
        original = self.decrypt_fixture(shell=POWERSHELL)
        original_bytes = self.ledger.read_bytes()
        self.assertEqual(self.run_ledger("Status")[1]["sentVerifiedCount"], 1)
        self.assertEqual(self.run_ledger("Check", *original_args, "-CooldownDays", "90")[1]["code"], "COOLDOWN_ACTIVE")
        self.assertEqual(self.ledger.read_bytes(), original_bytes)
        self.assertEqual(self.run_ledger(
            "Reserve", "-Recipient", "new@example.com", "-Topic", "new-fixture-topic",
            "-OperationKey", "send:cross:0002", "-CooldownDays", "90",
        )[0], 0)
        self.assert_private_acl(self.ledger)
        final = self.decrypt_fixture(shell=POWERSHELL)
        self.assertEqual(final["schemaVersion"], 1)
        self.assertEqual(canonical_timestamp(final["createdAt"]), canonical_timestamp(original["createdAt"]))
        self.assertEqual(len(final["entries"]), 2)
        self.assert_entries_preserved(original["entries"], final["entries"])
        code, status = self.run_ledger("Status", shell=POWERSHELL)
        self.assertEqual(code, 0)
        self.assertEqual(status["sentVerifiedCount"], 1)
        self.assertEqual(status["reservedCount"], 1)
        for value in (b"original@example.com", b"new@example.com", b"synthetic-gmail-cross-0001"):
            self.assertNotIn(value, self.ledger.read_bytes())


if __name__ == "__main__":
    unittest.main(verbosity=2)
