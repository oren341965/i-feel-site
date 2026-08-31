"""Create bounded Gmail drafts from verified customer evidence; never send."""
from __future__ import annotations

import argparse
import ast
import base64
import hashlib
import json
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import getaddresses
from typing import Any

BASE = os.path.dirname(os.path.abspath(__file__))
TOKEN = os.path.join(BASE, "credentials", "token.json")
QUEUE = os.path.join(BASE, "protected_queue")
LOCK = os.path.join(QUEUE, "draft-writer.lock")
EXPECTED_MAILBOX = "myhome@i-feel.co.il"
REQUIRED_SCOPE = "https://www.googleapis.com/auth/gmail.modify"
ALLOWED_WRITE_METHODS = frozenset({"users.drafts.create"})
FORBIDDEN_NAMES = frozenset({
    "send", "trash", "untrash", "delete", "batchDelete", "insert", "import_",
    "modify", "batchModify", "update", "forward", "getAutoForwarding", "updateAutoForwarding",
})
FORBIDDEN_RESOURCES = frozenset({"filters", "forwardingAddresses"})
BLOCKED_DOMAIN = "monday.com"
MAX_UNANSWERED_ATTEMPTS = 2
MIN_FOLLOWUP_INTERVAL = timedelta(days=7)
REQUIRED_RESPONSE_CHANNELS = frozenset({"GMAIL_ALL_THREADS", "WHATSAPP_DIRECT", "MONDAY_ITEM"})


@dataclass(frozen=True)
class GuardResult:
    status: str
    reason: str
    recipient: str = ""
    target_thread_id: str = ""


def chain(node: ast.AST) -> str:
    parts: list[str] = []
    current = node
    while isinstance(current, ast.Attribute):
        parts.append(current.attr)
        current = current.value
        if isinstance(current, ast.Call):
            current = current.func
    if isinstance(current, ast.Name):
        parts.append(current.id)
    return ".".join(reversed(parts))


def ast_findings(path: str) -> list[str]:
    with open(path, encoding="utf-8") as source:
        tree = ast.parse(source.read(), filename=path)
    findings: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)) and any("monday" in alias.name.lower() for alias in node.names):
            findings.add("monday_import")
        if isinstance(node, ast.Call):
            value = chain(node.func)
            segments = set(value.split("."))
            if segments & FORBIDDEN_NAMES:
                findings.add("forbidden_method:" + value)
            if segments & FORBIDDEN_RESOURCES or any("forward" in part.lower() for part in segments):
                findings.add("forbidden_resource:" + value)
            if "monday" in value.lower():
                findings.add("monday_call:" + value)
    return sorted(findings)


def atomic_json(path: str, value: dict[str, Any]) -> None:
    temporary = path + ".tmp"
    with open(temporary, "w", encoding="utf-8") as output:
        json.dump(value, output, ensure_ascii=False, indent=2)
    os.replace(temporary, path)


def normalized_addresses(*values: Any) -> list[str]:
    flattened: list[str] = []
    for value in values:
        if isinstance(value, list):
            flattened.extend(str(entry) for entry in value)
        elif value:
            flattened.append(str(value))
    normalized = [address.strip().lower() for _, address in getaddresses(flattened) if address.strip()]
    return list(dict.fromkeys(normalized))


def domain_is_blocked(address: str) -> bool:
    if "@" not in address:
        return False
    domain = address.rsplit("@", 1)[1].rstrip(".").lower()
    return domain == BLOCKED_DOMAIN or domain.endswith("." + BLOCKED_DOMAIN)


def bounded_hash(value: Any) -> str:
    return hashlib.sha256(str(value or "").encode("utf-8")).hexdigest()[:16]


def guard_log(status: str, reason: str, item: dict[str, Any], thread_id: str = "") -> None:
    print(
        "%s reason=%s item_hash=%s thread_hash=%s" % (
            status,
            re.sub(r"[^A-Z0-9_:-]", "_", reason.upper())[:80],
            bounded_hash(item.get("item_hash") or item.get("message_id")),
            bounded_hash(thread_id),
        )
    )


def parse_timestamp(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def validate_candidate(item: dict[str, Any], now: datetime | None = None) -> GuardResult:
    """Return PREVIEW_OK only for a strongly evidenced customer recipient."""
    local = item.get("local_draft") or {}
    evidence = item.get("draft_evidence") or {}
    now = now or datetime.now(timezone.utc)

    to_values = [local.get("to"), evidence.get("verified_customer_email"), evidence.get("recipient_after_alias")]
    recipient_addresses = normalized_addresses(*to_values)
    cc_addresses = normalized_addresses(local.get("cc"))
    bcc_addresses = normalized_addresses(local.get("bcc"))
    reply_to_addresses = normalized_addresses(local.get("reply_to"))
    original_sender = normalized_addresses(evidence.get("original_thread_sender"))
    system_senders = normalized_addresses(evidence.get("source_system_sender"), evidence.get("automation_senders"))
    alias_targets = normalized_addresses(evidence.get("recipient_after_alias"), evidence.get("redirect_targets"))

    field_sets = {
        "TO": recipient_addresses,
        "CC": cc_addresses,
        "BCC": bcc_addresses,
        "REPLY_TO": reply_to_addresses,
        "ALIAS_TARGET": alias_targets,
    }
    for field_name, addresses in field_sets.items():
        if any(domain_is_blocked(address) for address in addresses):
            return GuardResult("WRONG_RECIPIENT_GUARD", "BLOCKED_DOMAIN_" + field_name)

    if len(recipient_addresses) != 1:
        return GuardResult("NEEDS_OREN", "RECIPIENT_NOT_UNAMBIGUOUS")
    recipient = recipient_addresses[0]
    if recipient in system_senders:
        return GuardResult("WRONG_RECIPIENT_GUARD", "RECIPIENT_FROM_SYSTEM_SENDER")

    source_thread_id = str(evidence.get("source_notification_thread_id") or "")
    direct_thread_id = str(evidence.get("direct_customer_thread_id") or "")
    requested_thread_id = str(item.get("thread_id") or direct_thread_id or "")
    source_is_blocked = bool(evidence.get("source_is_system_notification")) or any(
        domain_is_blocked(address) for address in original_sender
    )
    if source_is_blocked and requested_thread_id and requested_thread_id == source_thread_id:
        return GuardResult("WRONG_RECIPIENT_GUARD", "SYSTEM_THREAD_CUSTOMER_DRAFT")

    required = {
        "MONDAY_ITEM_ID": bool(re.fullmatch(r"[0-9]+", str(evidence.get("monday_item_id") or ""))),
        "VERIFIED_CONTACT": evidence.get("contact_verified") is True,
        "STRONG_MATCH": evidence.get("contact_match") in {"EMAIL_STRONG", "PHONE_STRONG"},
        "CUSTOMER_TYPE": evidence.get("recipient_type") == "CUSTOMER",
        "DEDUP": evidence.get("dedup_passed") is True,
        "NO_DNC": evidence.get("do_not_contact") is False,
        "DIRECT_OR_VERIFIED_NEW": bool(direct_thread_id) or evidence.get("verified_new_recipient") is True,
    }
    missing = [name for name, passed in required.items() if not passed]
    if missing:
        return GuardResult("NEEDS_OREN", "MISSING_" + "_".join(missing[:3]))
    if evidence.get("verified_customer_email", "").strip().lower() != recipient:
        return GuardResult("NEEDS_OREN", "VERIFIED_EMAIL_MISMATCH")
    if source_is_blocked and direct_thread_id and direct_thread_id == source_thread_id:
        return GuardResult("WRONG_RECIPIENT_GUARD", "SYSTEM_THREAD_REUSED")

    # Absence of a reply in one Gmail thread is never proof that nobody answered.
    # Every proactive reminder must carry a fresh, fail-closed response check over
    # all three authoritative surfaces and a stable recipient/topic dedup key.
    checked_channels = {
        str(channel).strip().upper()
        for channel in (evidence.get("response_channels_checked") or [])
        if str(channel).strip()
    }
    if evidence.get("response_check_complete") is not True or not REQUIRED_RESPONSE_CHANNELS.issubset(checked_channels):
        return GuardResult("NEEDS_OREN", "CROSS_CHANNEL_RESPONSE_CHECK_INCOMPLETE")
    if not str(evidence.get("followup_topic_key") or "").strip():
        return GuardResult("NEEDS_OREN", "FOLLOWUP_TOPIC_KEY_MISSING")
    if not str(evidence.get("recipient_topic_dedup_key") or "").strip():
        return GuardResult("NEEDS_OREN", "RECIPIENT_TOPIC_DEDUP_KEY_MISSING")
    if evidence.get("response_detected") is True:
        return GuardResult("NEEDS_OREN", "RESPONSE_ALREADY_RECEIVED")
    if any(
        evidence.get(flag) is True
        for flag in (
            "gmail_reply_detected",
            "whatsapp_reply_detected",
            "monday_update_detected",
        )
    ):
        return GuardResult("NEEDS_OREN", "RESPONSE_ALREADY_RECEIVED")
    if int(evidence.get("unanswered_attempts", MAX_UNANSWERED_ATTEMPTS + 1)) >= MAX_UNANSWERED_ATTEMPTS:
        return GuardResult("NEEDS_OREN", "UNANSWERED_ATTEMPT_LIMIT")
    last_followup = parse_timestamp(evidence.get("last_proactive_followup_at"))
    if last_followup and now - last_followup < MIN_FOLLOWUP_INTERVAL:
        return GuardResult("NEEDS_OREN", "SEVEN_DAY_LIMIT")

    target_thread_id = direct_thread_id or ""
    return GuardResult("PREVIEW_OK", "VERIFIED_CUSTOMER", recipient, target_thread_id)


def existing_draft_threads(service: Any) -> set[str]:
    threads: set[str] = set()
    page_token: str | None = None
    while True:
        request = service.users().drafts().list(userId="me", maxResults=100, pageToken=page_token)
        page = request.execute()
        for entry in page.get("drafts", []):
            draft = service.users().drafts().get(userId="me", id=entry["id"], format="minimal").execute()
            thread_id = (draft.get("message") or {}).get("threadId")
            if thread_id:
                threads.add(thread_id)
        page_token = page.get("nextPageToken")
        if not page_token:
            return threads


def run(limit: int, max_create: int, dry_run: bool = False) -> int:
    findings = ast_findings(os.path.abspath(__file__))
    if findings:
        print("AST_SECURITY_FAILED", ",".join(findings))
        return 4
    os.makedirs(QUEUE, exist_ok=True)
    try:
        descriptor = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(descriptor, str(os.getpid()).encode())
        os.close(descriptor)
    except FileExistsError:
        print("SKIPPED_ALREADY_RUNNING run_lock=released_by_owner")
        return 2
    created = verified = duplicates = reviewed = blocked = 0
    finalized: list[tuple[str, dict[str, Any]]] = []
    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        credentials = Credentials.from_authorized_user_file(TOKEN)
        if set(credentials.scopes or []) != {REQUIRED_SCOPE}:
            print("BLOCKED_SCOPE")
            return 5
        service = build("gmail", "v1", credentials=credentials, cache_discovery=False)
        profile = service.users().getProfile(userId="me").execute()
        if (profile.get("emailAddress") or "").lower() != EXPECTED_MAILBOX:
            print("BLOCKED_WRONG_MAILBOX")
            return 6
        draft_threads = existing_draft_threads(service)
        for name in sorted(os.listdir(QUEUE)):
            if reviewed >= limit or not name.endswith(".json") or name.startswith("checkpoint-"):
                continue
            path = os.path.join(QUEUE, name)
            with open(path, encoding="utf-8") as source:
                item = json.load(source)
            if item.get("state") != "classified":
                continue
            local = item.get("local_draft")
            if not local:
                continue
            guard = validate_candidate(item)
            if guard.status != "PREVIEW_OK":
                item["draft_status"] = guard.status
                item["guard_reason"] = guard.reason
                guard_log(guard.status, guard.reason, item, item.get("thread_id", ""))
                blocked += 1
            elif guard.target_thread_id and guard.target_thread_id in draft_threads:
                item["draft_status"] = "existing_draft_same_thread"
                duplicates += 1
                verified += 1
            elif dry_run:
                item["draft_status"] = "PREVIEW_OK"
            elif created < max_create:
                message = EmailMessage()
                message["To"] = guard.recipient
                for header, key in (("Cc", "cc"), ("Bcc", "bcc"), ("Reply-To", "reply_to")):
                    addresses = normalized_addresses(local.get(key))
                    if addresses:
                        message[header] = ", ".join(addresses)
                safe_subject = re.sub(r"[\r\n]+", " ", str(local["subject"])).strip()[:900]
                message["Subject"] = safe_subject
                message.set_content(str(local["body"]))
                raw = base64.urlsafe_b64encode(message.as_bytes()).decode()

                # Final hard guard: no Gmail mutation occurs before this second validation passes.
                final_guard = validate_candidate(item)
                if final_guard.status != "PREVIEW_OK":
                    item["draft_status"] = final_guard.status
                    item["guard_reason"] = final_guard.reason
                    guard_log(final_guard.status, final_guard.reason, item, guard.target_thread_id)
                    blocked += 1
                else:
                    payload: dict[str, Any] = {"raw": raw}
                    if final_guard.target_thread_id:
                        payload["threadId"] = final_guard.target_thread_id
                    result = service.users().drafts().create(
                        userId="me", body={"message": payload}
                    ).execute()
                    readback = service.users().drafts().get(
                        userId="me", id=result["id"], format="minimal"
                    ).execute()
                    if final_guard.target_thread_id and (readback.get("message") or {}).get("threadId") != final_guard.target_thread_id:
                        print("VERIFY_STOP")
                        return 7
                    item["draft_status"] = "created_and_verified"
                    item["gmail_draft_hash"] = bounded_hash(result["id"])
                    if final_guard.target_thread_id:
                        draft_threads.add(final_guard.target_thread_id)
                    created += 1
                    verified += 1
            else:
                item["draft_status"] = "deferred_by_create_limit"
                atomic_json(path, item)
                continue
            item["checkpoint_at"] = datetime.now(timezone.utc).isoformat()
            finalized.append((path, item))
            reviewed += 1

        checkpoint = {
            "schema": "ifeel-maya-protected-checkpoint-v2",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "reviewed_hashes": [bounded_hash(item.get("item_hash")) for _, item in finalized],
            "reviewed": reviewed,
            "created": created,
            "verified": verified,
            "duplicates": duplicates,
            "blocked": blocked,
            "dry_run": dry_run,
        }
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        atomic_json(os.path.join(QUEUE, "checkpoint-" + stamp + ".json"), checkpoint)
        for path, item in finalized:
            item.pop("body", None)
            item["state"] = "reviewed"
            atomic_json(path, item)
        print("DRAFT_WRITER_OK mailbox=%s reviewed=%d created=%d verified=%d duplicates=%d blocked=%d dry_run=%s sends=0 deletions=0 monday_writes=0 run_lock=released" % (
            EXPECTED_MAILBOX, reviewed, created, verified, duplicates, blocked, str(dry_run).lower()
        ))
        return 0
    finally:
        try:
            os.remove(LOCK)
        except FileNotFoundError:
            pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=3)
    parser.add_argument("--max-create", type=int, default=1)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    return run(max(1, min(args.limit, 10)), max(0, min(args.max_create, 10)), args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
