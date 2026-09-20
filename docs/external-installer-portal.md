# External installer portal

## Purpose

The external installer portal is a separate, noindex application at:

`https://i-feel.co.il/external-installer/`

It is not an employee portal and does not expose employee expenses, vehicles, handovers, supervision, staff administration, or employee navigation.

## Access model

1. An external installer enters an allowlisted email address.
2. The portal sends a six-digit one-time code to that address.
3. The installer completes name and mobile details in protected server storage.
4. The installer searches for a customer or project by name. Before approval, search results expose only the customer/project name and whether the source is Service or Projects.
5. Selecting a customer creates an access request and emails the internal approvers.
6. The approval link does not approve access by itself. The approver must authenticate using an allowlisted `@i-feel.co.il` address and a separate one-time email code.
7. Approval creates a single-use grant link bound to the installer email and the exact Monday board/item pair. The link expires after eight hours.
8. The installer must still be authenticated with the same allowlisted email. Only then are the minimum operational customer details loaded from Monday.
9. The approved installer can submit the normal installation/service completion fields plus protected uploads.
10. The customer grant is removed from the session after the report is submitted. A new customer or a new session requires a new approval request.

## Initial authorized installers

Production configuration should initially contain only the two currently approved external installers:

- Jack Saliba
- Ahmad Jayyar

Their actual email addresses are verified operational data and must be configured only in the server-only allowlist. Do not commit those addresses to Git.

## Internal approvers

By default the code permits the three I Feel approval mailboxes:

- Oren
- Cheyne
- Support

The approver list can be overridden in server configuration. An approval link can be forwarded, but it remains unusable until one of the configured internal mailboxes completes its own email-code authentication.

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

define('EXTERNAL_INSTALLER_REPORT_RECIPIENTS', [
    'oren@i-feel.co.il',
    'cheyne@i-feel.co.il',
    'kiril@i-feel.co.il',
]);

define('EXTERNAL_INSTALLER_MONDAY_TOKEN', 'SERVER_ONLY_READ_TOKEN');
```

The Monday token needs `boards:read` only for:

- Service board `3011387201`
- Projects board `3249720207`

Do not grant Monday write scope to this portal.

## Customer privacy

Before approval the browser receives only:

- customer/project display name
- source kind: service or project
- opaque board/item identifiers required to request access

Phone, address, fault description, equipment notes, customer email, Dropbox links, financial values, and other Monday columns are not included in pre-approval responses.

After approval the server re-fetches the exact Monday item and returns only the operational fields needed for the visit, such as phone, site address, scheduled date/time, fault subject, and equipment note. Customer email is not displayed.

## Stored data

All installer profiles, access requests, grant tokens, audit data, uploaded photos/documents, and completion reports remain below the existing private portal storage root outside `public_html`.

Tokens are stored by hash-derived filenames. Approval and grant tokens are removed when used or decided.

## Production acceptance

Before enabling the URL for installers:

1. Configure only Jack Saliba and Ahmad Jayyar in the server-only allowlist.
2. Confirm the Monday token is read-only and limited to the required boards.
3. Confirm one-time codes are delivered to both installers.
4. Confirm an unlisted external email is rejected.
5. Confirm pre-approval customer search reveals no phone, address, email, fault, or other PII.
6. Request access to a synthetic/test customer and verify approval email delivery to Oren, Cheyne, and Support.
7. Verify a forwarded approval link cannot approve without an authorized I Feel mailbox code.
8. Approve the request and verify only the selected customer opens.
9. Attempt to alter board/item IDs and verify the server continues to use the server-side grant.
10. Submit a report with an upload and confirm the report is stored privately and notifications reach the configured report recipients.
11. Start a new session and verify the prior customer grant is unavailable.
12. Verify the employee portal continues to operate normally with its own session cookie.
