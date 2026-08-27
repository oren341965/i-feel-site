"""Dry-run recipient and thread separation tests for the Maya draft writer."""
from __future__ import annotations

import importlib.util
import pathlib
import sys
import tempfile
import unittest
from datetime import datetime, timezone


WRITER_PATH = pathlib.Path(__file__).parents[1] / "scripts" / "draft_writer.py"
SPEC = importlib.util.spec_from_file_location("maya_draft_writer", WRITER_PATH)
writer = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = writer
SPEC.loader.exec_module(writer)


def valid_item() -> dict:
    return {
        "item_hash": "safe-test-item",
        "thread_id": "customer-thread-1",
        "local_draft": {
            "to": "Customer <customer@example.com>",
            "subject": "Follow-up",
            "body": "Draft body",
        },
        "draft_evidence": {
            "monday_item_id": "11157311720",
            "contact_verified": True,
            "contact_match": "EMAIL_STRONG",
            "verified_customer_email": "customer@example.com",
            "recipient_after_alias": "customer@example.com",
            "recipient_type": "CUSTOMER",
            "direct_customer_thread_id": "customer-thread-1",
            "source_notification_thread_id": "monday-thread-1",
            "source_system_sender": "notifications@monday.com",
            "original_thread_sender": "customer@example.com",
            "source_is_system_notification": False,
            "dedup_passed": True,
            "do_not_contact": False,
            "unanswered_attempts": 0,
            "last_proactive_followup_at": None,
        },
    }


class DomainGuardTests(unittest.TestCase):
    def assert_guarded(self, item: dict) -> None:
        self.assertEqual(writer.validate_candidate(item).status, "WRONG_RECIPIENT_GUARD")

    def test_blocked_domain_in_to(self):
        item = valid_item()
        item["local_draft"]["to"] = " notifications@MONDAY.com "
        item["draft_evidence"]["verified_customer_email"] = "notifications@monday.com"
        item["draft_evidence"]["recipient_after_alias"] = "notifications@monday.com"
        self.assert_guarded(item)

    def test_blocked_domain_in_cc(self):
        item = valid_item(); item["local_draft"]["cc"] = "Ops <bot@alerts.monday.com>"
        self.assert_guarded(item)

    def test_blocked_domain_in_bcc(self):
        item = valid_item(); item["local_draft"]["bcc"] = " BOT@MONDAY.COM "
        self.assert_guarded(item)

    def test_blocked_domain_in_reply_to(self):
        item = valid_item(); item["local_draft"]["reply_to"] = "Monday <notifications@monday.com>"
        self.assert_guarded(item)

    def test_notifications_subdomain(self):
        item = valid_item(); item["local_draft"]["cc"] = "automation@notifications.monday.com"
        self.assert_guarded(item)

    def test_display_name_case_and_whitespace(self):
        item = valid_item(); item["local_draft"]["bcc"] = "  Monday Alerts <NoTiFy@Sub.Monday.Com>  "
        self.assert_guarded(item)

    def test_redirect_alias_to_blocked_domain(self):
        item = valid_item(); item["draft_evidence"]["redirect_targets"] = ["alias@automation.monday.com"]
        self.assert_guarded(item)


class EvidenceAndThreadTests(unittest.TestCase):
    def test_system_notification_thread_cannot_be_customer_thread(self):
        item = valid_item()
        item["thread_id"] = "monday-thread-1"
        item["draft_evidence"]["direct_customer_thread_id"] = "monday-thread-1"
        item["draft_evidence"]["original_thread_sender"] = "notifications@monday.com"
        item["draft_evidence"]["source_is_system_notification"] = True
        self.assertEqual(writer.validate_candidate(item).status, "WRONG_RECIPIENT_GUARD")

    def test_recipient_copied_from_system_sender_is_blocked(self):
        item = valid_item()
        item["draft_evidence"]["source_system_sender"] = "customer@example.com"
        self.assertEqual(writer.validate_candidate(item).status, "WRONG_RECIPIENT_GUARD")

    def test_missing_item_id_needs_oren(self):
        item = valid_item(); item["draft_evidence"]["monday_item_id"] = ""
        self.assertEqual(writer.validate_candidate(item).status, "NEEDS_OREN")

    def test_ambiguous_match_needs_oren(self):
        item = valid_item(); item["draft_evidence"]["contact_match"] = "AMBIGUOUS"
        self.assertEqual(writer.validate_candidate(item).status, "NEEDS_OREN")

    def test_no_direct_thread_or_verified_new_address_needs_oren(self):
        item = valid_item()
        item["thread_id"] = ""
        item["draft_evidence"]["direct_customer_thread_id"] = ""
        item["draft_evidence"]["verified_new_recipient"] = False
        self.assertEqual(writer.validate_candidate(item).status, "NEEDS_OREN")

    def test_verified_customer_direct_thread_previews(self):
        result = writer.validate_candidate(valid_item(), datetime(2026, 8, 27, tzinfo=timezone.utc))
        self.assertEqual(result.status, "PREVIEW_OK")
        self.assertEqual(result.recipient, "customer@example.com")
        self.assertEqual(result.target_thread_id, "customer-thread-1")


class StaticSecurityTests(unittest.TestCase):
    def test_ast_allows_only_drafts_create(self):
        self.assertEqual(writer.ast_findings(str(WRITER_PATH)), [])
        self.assertEqual(writer.ALLOWED_WRITE_METHODS, frozenset({"users.drafts.create"}))

    def test_forbidden_mutation_families_fail_ast(self):
        snippets = {
            "messages_send": "svc.users().messages().send()",
            "drafts_send": "svc.users().drafts().send()",
            "trash": "svc.users().messages().trash()",
            "delete": "svc.users().messages().delete()",
            "batch_delete": "svc.users().messages().batchDelete()",
            "insert": "svc.users().messages().insert()",
            "import": "svc.users().messages().import_()",
            "forwarding": "svc.users().settings().forwardingAddresses().list()",
            "filters": "svc.users().settings().filters().create()",
            "monday_write": "monday.boards().update()",
        }
        with tempfile.TemporaryDirectory() as directory:
            for name, source in snippets.items():
                path = pathlib.Path(directory) / (name + ".py")
                path.write_text(source, encoding="utf-8")
                with self.subTest(name=name):
                    self.assertTrue(writer.ast_findings(str(path)))


if __name__ == "__main__":
    unittest.main(verbosity=2)
