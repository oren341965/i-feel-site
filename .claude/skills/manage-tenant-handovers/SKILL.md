---
name: manage-tenant-handovers
description: Maintain, test, diagnose, and safely extend I Feel's authenticated tenant-handover workflow in the employee portal, including Monday resident lookup, handover fields, protected photo storage, employee/resident email delivery, and privacy controls. Use when a request mentions מסירות דיירים, מסירת דירה, tenant handovers, the handovers tab in staff-expenses, Monday board 2732725332 resident data, or changes to the handover form and notifications.
---

# Manage I Feel Tenant Handovers

Maintain the tenant-handover module inside `public/staff-expenses/`. Keep Monday and email secrets server-only and keep resident PII out of Git, URLs, client-editable fields, logs, and public assets.

## Start

1. Read [references/system-contract.md](references/system-contract.md) completely before changing fields, data mapping, email behavior, storage, or access control.
2. Read the repository `AGENTS.md` and use `scripts/workstations/new-work.ps1` before edits.
3. Inspect `public/staff-expenses/_tenant_handovers.php`, `_app.php`, `_labels.php`, `_email_auth.php`, `_bootstrap.php`, and the staff-expenses tests.
4. Preserve unrelated worktree changes. Never work on `main`.

## Guardrails

- Fetch groups and residents only on the authenticated PHP server. Post only Monday group/item IDs; re-fetch and authorize the item before saving.
- Never copy resident reference lists, phone numbers, email addresses, tokens, `.env` files, or server configuration into the repository, fixtures, comments, screenshots, or responses.
- Store photos and metadata only below `portal_storage_root()`, outside `public_html`. Serve photos only through the authenticated download handler.
- Accept technician identity only from the verified employee session. Restrict internal recipients to normalized `@i-feel.co.il` addresses.
- Keep the two required photos and MIME validation. Do not restore anonymous access merely to satisfy the obsolete “בלי לוגין” prototype criterion; authenticated employee access is the privacy boundary.
- Treat the resident phone-derived password as sensitive. Do not add it to audit logs or history tables. Recommend a first-login password change in resident communication.
- Do not add Monday write mutations, Make scenarios, Hashavshevet writes, new recipients, or public links without explicit scope and approval.

## Change Workflow

1. Map the requested change against the contract and state any privacy or compatibility conflict.
2. Update the smallest relevant PHP/JS/CSS files. Keep PHP compatible with the portal's supported runtime and use existing helpers for CSRF, mail, uploads, storage, sessions, escaping, and audit.
3. Add pure unit coverage in `tests/staff-expenses/portal-unit.php` and authenticated HTTP coverage in `scripts/test-staff-expenses.ps1`. Use synthetic residents only.
4. Run PHP lint on every staff-expenses PHP file, the unit test, the HTTP integration test, `npm run build`, and the skill validator.
5. Search the diff for secrets and PII patterns before publishing.
6. Use `scripts/workstations/publish-work.ps1` to commit, rebase, push, and open a Draft PR. Never merge without explicit approval.

## Diagnose

- If the tab cannot load projects, verify server-only token presence, `boards:read`, board ID, API version, cURL availability, and Monday response shape. Do not print tokens or raw GraphQL response bodies.
- If a resident is missing, verify group ID, `status` label, `numbers21`, and the six configured column IDs. A wrong status must remain hidden.
- If saving fails, verify private-storage readiness, `fileinfo`, upload limits, both image MIME types, and the one-time submission token.
- If email is partial, keep the saved record, inspect notification status and server logs, and retry only through an explicitly approved recovery path. Never resubmit the whole form blindly.
- After an approved production merge, follow the repository deployment workflow and run `verify-live`.

## Expected Handoff

Report changed behavior, validation evidence, server-only configuration required, remaining optional integrations, and the Draft PR URL. Do not claim live email or Monday success until production smoke tests confirm them.
