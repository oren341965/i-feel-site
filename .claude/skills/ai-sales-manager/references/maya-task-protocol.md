# Maya sales task protocol

Use this contract whenever Oren says `מאיה תבדוק`, `תעביר למאיה`, `תבקש ממאיה סטטוס`, or otherwise explicitly assigns a sales follow-up to Maya. This extends the existing Vault bridge; it does not create a `maya-agent` skill, a second manager, a second queue, or a second scheduler. `maya-agent` remains the legacy Bus identity for the canonical `maya-email-maintenance` and `maya-whatsapp` workers.

## Transport and ownership

- The manager writes immutable assignments only to `${VAULT_ROOT}/AI-Sales/_bus/manager-to-maya`.
- Maya reads that queue and writes immutable ACK and Result messages only to `${VAULT_ROOT}/AI-Sales/_bus/maya-to-manager`.
- Every message uses `schema_version=2`, one stable `task_id`, and a unique `message_id`.
- Production ACK/Result messages carry a verified Maya Service Identity and machine ID. Assignment and isolated-test messages cannot claim that identity.
- The manager derives the current state from the assignment plus correlated responses and persists the derived state under the manager's local runtime. Sending a file does not complete a task.
- Do not put an email address, phone number, raw correspondence, attachment, or customer contact data in the Bus. `customer_name` is the minimum display name from the verified Monday item; `monday_item_id` is the strong identity.

## Required task snapshot

Every Assignment, ACK, and Result carries the same immutable task snapshot:

- `task_id`
- `monday_board_id` — exactly `2732725332`
- `monday_item_id` — obtained from a current live Monday read
- `customer_name`
- `current_sales_status`
- `instruction`
- `required_action`
- `created_at`
- `due_date` — nullable when Oren did not set one
- `priority` — `LOW`, `NORMAL`, `HIGH`, or `URGENT`
- `requested_by` — exactly `ai-sales-manager`
- `execution_state`
- `result` — nullable until Maya returns a result
- `next_action` — nullable until known
- `next_treatment_date` — nullable until known

The assignment also records `monday_item_source=MONDAY_LIVE`, `monday_item_verified_at`, an execution gate, test origin, and external-action counters. Reject a response when any immutable snapshot value differs from the assignment.

## State machine

Only these values are valid:

1. `ASSIGNED_TO_MAYA` — manager created the task and wrote it to the existing queue.
2. `MAYA_ACKNOWLEDGED` — a correlated ACK was received from Maya. Show `מאיה קיבלה את המשימה`.
3. `MAYA_EXECUTED` — Maya returned a structured result, but the customer or Monday completion gate is still open.
4. `WAITING_FOR_CUSTOMER` — Maya performed the permitted contact, the customer has not replied, and the exact Monday item has a verified next treatment date.
5. `RESPONSE_RECEIVED_AND_MONDAY_UPDATED` — the correlated Maya result exists and a later live Monday read-back verifies the result, next action, and treatment date when applicable. This is the only fully completed state.
6. `BLOCKED` — permissions, missing information, missing Gmail/WhatsApp/Monday access, ambiguous or missing customer, wrong identity, or another operational blocker prevented execution. `result` contains the bounded blocker reason.
7. `NEEDS_OREN_DECISION` — price, discount, commercial commitment, material complaint, proposal change, liability, legal/safety issue, or material exception requires Oren. Maya must not make that decision.

A Result without an earlier ACK is ignored for state progression and reported as `MAYA_ACK_MISSING`. A claimed completion without live Monday read-back is downgraded to `MAYA_EXECUTED` with `MONDAY_READBACK_REQUIRED`.

Manager-facing labels are fixed: `נשלח למאיה`, `מאיה קיבלה את המשימה`, `מאיה ביצעה`, `ממתינים ללקוח`, `הושלם`, `חסום`, and `נדרשת החלטת אורן`.

## Assignment flow

1. Read live Monday board `2732725332` only. Match the exact item using its item ID or other strong verified identifier; a name-only match is insufficient.
2. Reject ambiguous or missing matches. Never invent a customer name, item ID, status, due date, or instruction.
3. Preserve Oren's instruction and state the concrete check in `required_action`.
4. Create and enqueue one idempotent Assignment with `ASSIGNED_TO_MAYA`.
5. Tell Oren `נשלח למאיה`. Do not say Maya received or completed it.
6. On a valid ACK, change the derived state to `MAYA_ACKNOWLEDGED` and tell Oren `מאיה קיבלה את המשימה`.
7. On a Result, enforce the business-decision gate and the Monday read-back gate before changing the derived state.

When Maya contacted the customer and is waiting, require a suitable `next_treatment_date`; the manager applies the exact next action/date to the same Monday item only within Oren's assigned task scope and verifies it with a fresh read. Maya never changes Monday structure or writes another board.

## Sales review eligibility

During a sales review, use only board `2732725332`. Exclude the exact group `תהליך מכירה הסתיים`, a future authoritative `timeline`, and any item already handled in the current cycle without newer evidence. Never query a Projects board as part of the sales review.

## Production execution gate

Assignment is allowed even when Maya is not ready, because the task must remain visible and traceable. Production ACK and Result evidence are accepted as real only from the commissioned Maya workstation. Execution remains blocked when the live control state lacks verified skills, Service Identity, fresh worker evidence, the correct Maya Gmail profile, WhatsApp telemetry for WhatsApp work, or the required action-specific approval.

Control evidence observed on `2026-08-30` is fail-closed and must be re-verified before production use:

- Maya is documented only with zero verified Skills and no Service Identity.
- `maya-whatsapp` is Registry-only with no Telemetry.
- `maya-email-maintenance` has only an old Snapshot.
- the Gmail profile connected on the current computer belongs to Oren, not Maya; never run the Maya path from it.
- Maya is `PAUSED_BY_PHASE_2`.
- `הפעלת Maya למסרים יזומים` is pending and is not blanket authorization.

## Isolated test

An internal protocol test uses `test_task=true`, `execution_origin=ISOLATED_TEST`, zero external actions, and zero Monday writes. It may use a live-read Monday identity only as immutable input and an isolated in-memory/read-back adapter to prove Assignment → ACK → Result → Monday gate → state update. A simulated ACK or Result proves the code path only; it is never presented as Maya workstation evidence, and `completed` remains false for production readiness.

The deterministic implementation is `scripts/maya-vault-bridge.mjs`; the JSON contract is `runtime/bus-message.schema.json`.
