# Hashavshevet customer intake to Monday

Use this reference only when Oren gives explicit, action-specific authorization to create or update a customer/lead in Monday from a Hashavshevet (HSD) account-card screen, screenshot, export, or stated account details.

## Target

- Monday board: `2732725332` (`מכירות`)
- Hashavshevet customer key target column: `______9` (`חשבשבת`)

## Mandatory source extraction

Read every clearly available identity/contact field before writing:

- customer/company name
- `מפתח` (Hashavshevet customer key)
- `מספר` if separately shown
- email
- phone
- address
- tax/company identifier when clearly shown

`מפתח` and `מספר` are different fields. Never substitute one for the other.

## Critical mapping

When the Hashavshevet card shows a value next to `מפתח`, that exact value is mandatory in Monday column `______9` (`חשבשבת`). Do not leave `______9` empty when `מפתח` is readable.

Known Monday mappings for this intake path:

| Source field | Monday column |
| --- | --- |
| customer/project display name | item name |
| `מפתח` | `______9` (`חשבשבת`) |
| address | `location7` |
| email | `_____3` |
| phone | `phone` |
| category | `dropdown5` when supported by evidence/context |
| project type | `dropdown_mm3s6hwc` when supported by evidence/context |

Do not write the separate Hashavshevet `מספר` value into `______9` unless the source explicitly states that `מספר` is the customer key, which is not the normal HSD account-card layout.

## Duplicate check before create

Before opening a new item, check the live sales board using strong identifiers in this order when available:

1. exact Hashavshevet `מפתח`
2. exact normalized email
3. exact normalized phone
4. customer/company name plus address

A matching contact on another project does not automatically block creation. If the evidence shows this is a distinct project/site, create a separate sales item and document the related existing record in an item update.

## Write and verification sequence

1. Re-read live Monday metadata if column IDs or labels may have changed.
2. Perform the duplicate check.
3. Create/update the item only under Oren's explicit authorization.
4. Include `______9` in the same write whenever `מפתח` is available.
5. Read the created/updated item back from Monday.
6. Verify at minimum:
   - `______9` equals the source `מפתח`
   - email is correct
   - phone is correct
   - address is correct
7. If any mandatory field failed to persist, correct it before reporting completion.

## Fail-closed rules

- If `מפתח` is present but unreadable or ambiguous, do not guess it. Ask for a clearer image or the exact value.
- Never report the customer as fully established until the post-write read-back confirms the key and contact fields.
- Keep customer PII out of Git, shared logs, and telemetry. This reference contains only schema/field rules, never live customer values.
