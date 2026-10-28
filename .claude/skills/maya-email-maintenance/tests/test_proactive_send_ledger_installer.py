"""Offline installer guards: synthetic Git repository, never a real installation."""
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import unittest

from test_proactive_send_ledger import PWSH, ps_literal, shell_environment

SCRIPTS = pathlib.Path(__file__).parents[1] / "scripts"
RELATIVE = pathlib.Path(".claude/skills/maya-email-maintenance/scripts")
RUNTIME = "proactive-send-ledger.ps1"
INSTALLER = "install-proactive-send-ledger.ps1"


@unittest.skipUnless(os.name == "nt" and PWSH and shutil.which("git"), "Windows, pwsh and Git required")
class LedgerInstallerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="maya-installer-test-")
        self.addCleanup(self.temp.cleanup)
        self.repo = pathlib.Path(self.temp.name) / "repository"
        directory = self.repo / RELATIVE
        directory.mkdir(parents=True)
        self.environment = shell_environment()
        self.environment.update({
            "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull,
            "COMPUTERNAME": "FIXTURE-NOT-MAYA",
            "USERPROFILE": str(pathlib.Path(self.temp.name) / "no-real-profile"),
            "LOCALAPPDATA": str(pathlib.Path(self.temp.name) / "no-real-state"),
        })
        for name in (RUNTIME, INSTALLER):
            # Exercise canonical Git blob hashes despite normal CRLF checkouts.
            data = (SCRIPTS / name).read_bytes().replace(b"\r\n", b"\n")
            (directory / name).write_bytes(data.replace(b"\n", b"\r\n"))
        self.git("init", "-b", "main")
        self.git("config", "core.autocrlf", "true")
        self.git("config", "core.hooksPath", str(self.repo / "no-hooks"))
        self.git("remote", "add", "origin", "https://github.com/oren341965/i-feel-site.git")
        self.commit_fixture()
        self.git("update-ref", "refs/remotes/origin/main", self.commit)

    def git(self, *args: str) -> bytes:
        completed = subprocess.run(
            ["git", "-C", str(self.repo), *args], capture_output=True,
            env=self.environment, timeout=30, check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr.decode(errors="replace"))
        return completed.stdout

    def commit_fixture(self) -> None:
        self.git("add", ".")
        self.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
                 "commit", "-m", "Isolated installer fixture")
        self.commit = self.git("rev-parse", "HEAD").decode().strip()
        blob = self.git("cat-file", "blob", f"{self.commit}:{RELATIVE.as_posix()}/{RUNTIME}")
        self.source_hash = hashlib.sha256(blob).hexdigest()

    def run_installer(self, *, apply: bool = False, source_hash: str | None = None) -> tuple[int, dict]:
        command = [
            PWSH, "-NoProfile", "-NonInteractive", "-File", str(self.repo / RELATIVE / INSTALLER),
            "-RepositoryPath", str(self.repo), "-ExpectedCommit", self.commit,
            "-ExpectedSourceSha256", source_hash or self.source_hash,
            "-ExpectedInstalledSha256", "0" * 64,
        ]
        if apply:
            command.append("-Apply")
        completed = subprocess.run(command, capture_output=True, text=True,
                                   env=self.environment, timeout=30, check=False)
        self.assertTrue(completed.stdout.strip(), completed.stderr)
        return completed.returncode, json.loads(completed.stdout.splitlines()[-1])

    def assert_blocked(self, expected: str, **kwargs) -> None:
        code, result = self.run_installer(**kwargs)
        self.assertEqual(code, 3, result)
        self.assertEqual(result["status"], "BLOCKED")
        self.assertEqual(result["code"], expected)
        self.assertFalse(result["scriptReplaced"])
        self.assertIsNone(result["existingLedgerUnchanged"])
        self.assertIsNone(result["codeBackup"])
        for counter in ("externalSends", "mondayWrites", "schedulerChanges", "ledgerTransitions"):
            self.assertEqual(result[counter], 0)

    def test_dry_run_uses_canonical_blob_hash_not_crlf_checkout_hash(self) -> None:
        checked_out = (self.repo / RELATIVE / RUNTIME).read_bytes()
        self.assertIn(b"\r\n", checked_out)
        self.assertNotEqual(hashlib.sha256(checked_out).hexdigest(), self.source_hash)
        code, result = self.run_installer()
        self.assertEqual(code, 0, result)
        self.assertEqual(result["status"], "DRY_RUN_SOURCE_VERIFIED")
        self.assertEqual(result["sourceSha256"].lower(), self.source_hash)
        self.assertFalse(result["targetVerified"])
        self.assertEqual(result["writes"], 0)
        self.assertEqual(self.git("status", "--porcelain"), b"")

    def test_apply_wrong_host_stops_before_target_or_ledger_access(self) -> None:
        self.assert_blocked("WRONG_HOST", apply=True)

    def test_dirty_source_is_rejected(self) -> None:
        path = self.repo / RELATIVE / RUNTIME
        path.write_bytes(path.read_bytes() + b"\r\n# Synthetic uncommitted change\r\n")
        self.assert_blocked("DIRTY_SOURCE")

    def test_unmerged_commit_is_rejected(self) -> None:
        path = self.repo / RELATIVE / RUNTIME
        path.write_bytes(path.read_bytes() + b"\r\n# Synthetic unmerged commit\r\n")
        self.commit_fixture()
        self.assert_blocked("GIT_VALIDATION_FAILED")

    def test_hash_mismatch_is_rejected(self) -> None:
        self.assert_blocked("SOURCE_HASH_MISMATCH", source_hash="0" * 64)

    def test_atomic_copy_preserves_acl_and_old_code_in_precreated_backup(self) -> None:
        # Only the ACL helper is loaded, never installer startup or its Apply path.
        target = pathlib.Path(self.temp.name) / "synthetic-code.ps1"
        staged, backup = target.with_suffix(".staged"), target.with_suffix(".backup")
        target.write_bytes(b"old synthetic code")
        staged.write_bytes(b"new synthetic code")
        backup.write_bytes(b"")
        code = (
            "$ErrorActionPreference='Stop'; $tokens=$null; $errors=$null; "
            f"$ast=[Management.Automation.Language.Parser]::ParseFile({ps_literal(SCRIPTS / INSTALLER)},[ref]$tokens,[ref]$errors); "
            "if($errors.Count){throw 'PARSE_FAILED'}; "
            "$function=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Copy-FileAcl'},$false); "
            ". ([scriptblock]::Create($function.Extent.Text)); "
            "$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User; "
            "$acl=[Security.AccessControl.FileSecurity]::new(); $acl.SetOwner($sid); $acl.SetAccessRuleProtection($true,$false); "
            "foreach($principal in @($sid,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) { "
            "$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($principal,'FullControl','Allow')) }; "
            f"$target={ps_literal(target)}; $staged={ps_literal(staged)}; $backup={ps_literal(backup)}; "
            "Copy-FileAcl $target $acl; "
            "$existingAcl=Get-Acl -LiteralPath $target; "
            "foreach($path in @($staged,$backup)){Copy-FileAcl $path $existingAcl}; "
            "$sections=[Security.AccessControl.AccessControlSections]'Access,Owner,Group'; "
            "$before=(Get-Acl -LiteralPath $target).GetSecurityDescriptorSddlForm($sections); "
            "if((Get-Acl -LiteralPath $staged).GetSecurityDescriptorSddlForm($sections) -ne $before){throw 'STAGED_ACL_MISMATCH'}; "
            "if((Get-Acl -LiteralPath $backup).GetSecurityDescriptorSddlForm($sections) -ne $before){throw 'BACKUP_ACL_MISMATCH'}; "
            "[IO.File]::Replace($staged,$target,$backup,$false); "
            "[pscustomobject]@{targetAcl=((Get-Acl -LiteralPath $target).GetSecurityDescriptorSddlForm($sections) -eq $before); "
            "backupAcl=((Get-Acl -LiteralPath $backup).GetSecurityDescriptorSddlForm($sections) -eq $before)} | ConvertTo-Json -Compress"
        )
        completed = subprocess.run([PWSH, "-NoProfile", "-NonInteractive", "-Command", code],
                                   capture_output=True, text=True, env=self.environment, timeout=30, check=False)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(json.loads(completed.stdout.strip()), {"targetAcl": True, "backupAcl": True})
        self.assertEqual(target.read_bytes(), b"new synthetic code")
        self.assertEqual(backup.read_bytes(), b"old synthetic code")
        self.assertFalse(staged.exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
