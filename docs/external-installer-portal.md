# External installer portal

## Purpose

The external installer portal is a separate, noindex application at:

`https://i-feel.co.il/external-installer/`

It is not an employee portal and does not expose employee expenses, vehicles, handovers, supervision, staff administration, or employee navigation.

## Access model

1. An external installer enters an allowlisted email address.
2. The portal sends a six-digit one-time code to that address.
3. The installer completes name and mobile details in protected server storage.
4. The installer sees only work-order items whose verified installer-email column exactly matches the signed-in address.
5. Opening an assigned work order creates a short-lived server-side grant bound to the installer email and exact Monday board/item pair.
6. The server loads the minimum operational customer details, site contacts and an existing approved Dropbox plan link from Monday.
7. The installer updates each installation stage, including times, completed work, missing work, faults, next steps, quantities and protected uploads.
8. The final report requires photos/documents and either a customer signature or a reason why the customer was unavailable.
9. The customer grant is removed from the session after the final report is submitted.

Legacy request/approval links remain supported for existing records, but new free customer search and ad-hoc access requests are rejected server-side.

## Initial authorized installers

Production configuration should initially contain only the two currently approved external installers:

- Jack Saliba
- Ahmad Jayyar

Their actual email addresses are verified operational data and must be configured only in the server-only allowlist. Do not commit those addresses to Git.

## Internal approvers

Legacy approval links permit these I Feel approval mailboxes by default:

- Oren
- Cheyne
- Support

The approver list can be overridden in server configuration. An approval link can be forwarded, but it remains unusable until one of the configured internal mailboxes completes its own email-code authentication.

## Internal reviewers

The read-only review dashboard is available from the staff link on the portal login page. By default it permits:

- Oren
- Cheyne
- Arik
- Kiril

Review access is separate from approval authority. Arik and Kiril can inspect assignments but cannot approve an installer's customer-access request unless they are also explicitly added to the server-only approver list.

## Server-only configuration

Add the production values to `public_html/api/config.php`. This file is not tracked by Git.

Example only:

```php
define('EXTERNAL_INSTALLER_ALLOWLIST', [
    'installer-one@example.invalid' => [
        'name' => 'External Installer One',
        'active' => true,
    ],
    'installer-two@example.invalid' => [
        'name' => 'External Installer Two',
        'active' => true,
    ],
]);

define('EXTERNAL_INSTALLER_APPROVERS', [
    'oren@i-feel.co.il',
    'cheyne@i-feel.co.il',
    'support@i-feel.co.il',
]);

define('EXTERNAL_INSTALLER_REVIEWERS', [
    'oren@i-feel.co.il',
    'cheyne@i-feel.co.il',
    'arik@i-feel.co.il',
    'kiril@i-feel.co.il',
]);

define('EXTERNAL_INSTALLER_REPORT_RECIPIENTS', [
    'oren@i-feel.co.il',
    'cheyne@i-feel.co.il',
    'arik@i-feel.co.il',
    'kiril@i-feel.co.il',
]);

define('EXTERNAL_INSTALLER_MONDAY_TOKEN', 'SERVER_ONLY_READ_TOKEN');
```

The Monday token needs `boards:read` only for:

- Service board `3011387201`
- Projects board `3249720207`
- Sales board `2732725332`
- External installer directory board `18431928427`
- External installer work-order board `18431962854`

Do not grant Monday write scope to this portal.

## Customer privacy

There is no customer search for external installers. Before opening an assignment, the installer receives only the assigned work-order summary. Customer operational details are fetched only after the server verifies that the assignment email exactly matches the authenticated installer.

The portal does not display financial values. Project contacts are limited to operational roles used at the site. Plan links are accepted only over HTTPS from approved Dropbox or I Feel hosts.

## Stored data

All installer profiles, access requests, grant tokens, audit data, uploaded photos/documents, and completion reports remain below the existing private portal storage root outside `public_html`.

Tokens are stored by hash-derived filenames. Approval and grant tokens are removed when used or decided.

## Live work order and subtasks

After a customer is approved, the installer works inside a persistent work-order view rather than a one-time completion form.

The initial fixed subtasks are:

- התקנת כבילה
- התקנת מערכת אזעקה
- התקנת מצלמות
- התקנת אינטרקום
- התקנת רשת תקשורת

Each subtask stores a status (`not_started`, `in_progress`, `completed`, or `blocked`), start/end times, planned and actual quantities, completed work, missing work, faults, next steps, notes, protected photos/documents and the last update time. The installer can save progress repeatedly during the work and later continue from the stored state after re-authentication and a valid assignment grant.

When the cabling subtask changes to `completed`, the portal sends a one-time email update to Cheyne and records an idempotent notification marker so repeated saves do not send duplicate completion messages.

The final work report includes the overall work-order status, a snapshot of all stage details, work times, faults, missing items, handover state, protected uploads and customer confirmation. Customer confirmation is either a stored signature plus signer name, or a mandatory unavailable reason.

## Production acceptance

Before enabling the URL for installers:

1. Configure only Jack Saliba and Ahmad Jayyar in the server-only allowlist.
2. Confirm the Monday token is read-only and limited to the required boards.
3. Confirm one-time codes are delivered to both installers.
4. Confirm an unlisted external email is rejected.
5. Confirm each installer sees only work orders assigned to the exact authenticated email.
6. Open a synthetic/test assignment and verify only its customer, contacts and approved plan link are shown.
7. Attempt to alter assignment, board or item IDs and verify the server continues to use the server-side grant.
8. Save every stage with quantities, issues, missing work and photos, then verify the reviewer view.
9. Verify a completed stage cannot be saved without a description of the completed work.
10. Submit a final report with uploads and a customer signature, then repeat with the customer-unavailable reason flow.
11. Confirm reports and files are stored privately and notifications reach Oren, Cheyne, Arik and Kiril.
12. Start a new session and verify the prior customer grant is unavailable.
13. Verify the employee portal continues to operate normally with its own session cookie.
