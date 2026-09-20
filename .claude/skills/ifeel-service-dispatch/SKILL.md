---
name: ifeel-service-dispatch
description: Coordinate and verify one I Feel field-service visit across Monday board 3011387201, the Google Sheet "לו\"ז", the assigned technician's Google Calendar, SUPPORT customer email, technician email, and the approved external-technician completion workflow. Use when Oren asks to schedule, confirm, move, reconcile, notify, or complete a service visit, or asks whether it appears everywhere.
---

# I Feel Service Dispatch

Coordinate one service visit as a single cross-system transaction. A visit is not complete merely because it exists in one calendar, one Monday item, or one schedule cell.

## Required sources

- Monday service board: `3011387201`.
- Google Sheet: `לו"ז`. Resolve the exact file and month tab before every read or write.
- Assigned technician's own Google Calendar when the technician has an I Feel calendar. Do not confuse it with the `לו"ז` Sheet.
- The verified I Feel Gmail identity used for technician messages.
- Customer dispatch mailbox: exactly `support@i-feel.co.il`.
- External-technician completion form: the current verified Google Apps Script form URL configured for I Feel. Never infer or reuse an old form URL.

Resolve every recipient before sending. For a known technician, verify the exact work address from recent I Feel evidence. Do not guess from a first name.

## Preflight

1. Extract the customer name, phone, email, full address, service-call number, fault, equipment or pickup instructions, technician, date, arrival window, visit type, and whether an electrician is required. Add an apartment number only when the site is an apartment and the source provides one.
2. Treat missing full address, phone, email, or confirmation as an explicit gap. An apartment number is optional and is not a gap for a private house, business, public building, or any site where it is irrelevant. Never invent one or require the customer to supply one unnecessarily.
3. Confirm that the customer accepted the visit time from direct email or another explicit source. Keep an unconfirmed proposal visibly marked `לתיאום בלבד`; do not present it as confirmed.
4. Search Monday in this order: service-call number, customer name, then phone. Update the existing item when found. Do not create a duplicate item for a form-originated call.
5. Resolve the exact `לו"ז` month tab, visit date row, and technician column from live metadata.
6. Check the technician's calendar for conflicts and duplicates in the exact date window when a technician calendar exists.
7. For the normal field-visit workflow, set `electrician_required=true` unless an authoritative operational note explicitly says that no electrician is required. The customer notice must state that an electrician must be present during our arrival.
8. Before any customer email, verify that Gmail can send as exactly `support@i-feel.co.il`. If the authenticated mailbox or send-as identity cannot be proved, stop with `SUPPORT_MAILBOX_UNAVAILABLE`. Never fall back to Oren's, Maya's, Sales, or another mailbox.

## Bidirectional Monday and schedule reconciliation

Reconcile Monday and the `לו"ז` Sheet before any customer or technician notification.

1. Use the service-call number as the strongest key. When it is unavailable, narrow candidates deterministically by verified phone, exact customer identity, date, and address. A similar name alone is not enough.
2. **Monday to `לו"ז`:** when Monday has the verified visit and the schedule is missing or incomplete, update the exact schedule cell with the verified date, arrival window, technician, customer, phone, address, fault, equipment instructions, service-call number, and confirmation state.
3. **`לו"ז` to Monday:** when the schedule contains a visit that is missing its date, hour, or technician detail in an already matched Monday service item, copy the verified scheduling facts back to that existing item. Do not create a new customer or a duplicate service item merely because a schedule row exists.
4. Monday remains the source of truth for customer identity, service-call identity, status, and durable service history. The `לו"ז` Sheet is authoritative evidence for the operational field schedule only after the row has been matched strongly to the Monday item.
5. If the sources disagree about technician, date, time, customer, phone, or address, do not choose silently. Return `RECONCILIATION_CONFLICT`, show the conflicting fields, and hold all outbound notifications until the conflict is resolved.
6. Never delete a Monday item or a schedule entry as part of reconciliation. Never overwrite another technician's unrelated schedule cell.
7. After any reconciliation write, re-read both systems. Customer and technician notifications are allowed only when the matched visit has the same customer, date, time window, technician identity, and service-call identity across the applicable sources.

## Dispatch transaction

Complete all applicable steps before reporting success:

1. **Monday**
   - Use the existing service item whenever one exists.
   - For a confirmed field visit, set visit date, visit hour, assigned technician, technician-name dropdown, and the scheduled-visit status used by the board.
   - Keep the full fault, phone, email, street, house number, city, optional apartment number when relevant, and equipment instructions in their designated columns.
   - Move an active scheduled call to the active `קריאות שירות` group when it is still in an intake/form group.
   - Add a short operational update recording the confirmation source, reconciliation result, and completed dispatch surfaces. Never put credentials or passwords in an open update.
2. **Google Sheet `לו"ז`**
   - Resolve the exact month tab, service date row, and assigned technician column from live metadata and headers.
   - Enter one complete block containing time window, customer name, phone, full address, optional apartment number when relevant, fault, equipment/pickup instructions, service-call number, and confirmation state.
   - Preserve the existing layout and formatting. Never write only a name and time when more details are available.
3. **Technician Google Calendar**
   - For an I Feel technician with a calendar, create or update one event in the technician's own calendar for the exact visit window.
   - Include customer name, phone, full address, optional apartment number when relevant, fault, equipment/pickup instructions, service-call number, and Monday link.
   - Search first and update the matching event instead of creating a duplicate.
   - For an approved external technician without an I Feel calendar, mark this surface `NOT_APPLICABLE_EXTERNAL_TECH`; do not create a fake employee calendar.
4. **Technician email**
   - Send directly to the verified technician address.
   - Include date, time window, customer name, phone, full address, optional apartment number when relevant, fault, equipment/pickup instructions, service-call number, and Monday link when one exists.
   - State clearly when an electrician is required to be present on site.
   - Verify the sent message is addressed to the intended technician.
5. **Customer email from SUPPORT**
   - Send directly to the verified customer address from exactly `support@i-feel.co.il`.
   - State the technician name, date, time window, address, and short service subject.
   - Include the sentence: `נדרש חשמלאי מטעמכם להיות נוכח בזמן הגעת הטכנאי.` whenever `electrician_required=true`.
   - When Oren instructs that a non-I Feel fault may be chargeable, include that warning clearly in this email and record that it was communicated.
   - Read the sent copy and verify its `From` identity is exactly `support@i-feel.co.il`. A message sent from another mailbox does not satisfy this step.

## Approved external technicians

Two approved external technicians are not represented as Monday employees:

- גקי סליבה / Jacky Saliba
- אחמד גיאר / Ahmad Giar

Apply these rules only after matching the technician to the approved identity using verified I Feel evidence. Do not treat every person missing from Monday as an external technician.

1. Do not create a fake Monday user, person, or technician merely to represent an external technician.
2. Keep the customer/service call itself in Monday. When the board cannot store the external technician in its employee column, preserve the external technician name in the appropriate operational update or existing free-text technician field without restructuring the board.
3. Use the exact external-technician column in the `לו"ז` Sheet when one exists. If it cannot be resolved unambiguously, return `EXTERNAL_TECH_SCHEDULE_COLUMN_MISSING` rather than writing into another technician's column.
4. Send the technician the normal dispatch email with all service details.
5. At the end of an installation performed by Jacky Saliba or Ahmad Giar, send the current verified Google Apps Script completion-form link to that technician and request completion before the installation is closed.
6. The form URL must come from the approved current configuration or other verified current I Feel evidence. If it is missing, return `MISSING_EXTERNAL_TECH_COMPLETION_FORM_URL`. Do not use an old iForms URL, search-engine result, guessed URL, or stale email link.
7. The completion result must be delivered to and verifiably include all three internal recipients:
   - Oren Levy: `oren@i-feel.co.il`
   - Cheyne Evans: `cheyne@i-feel.co.il`
   - Kiril Bannikh: `kiril@i-feel.co.il`
8. Do not mark an external installation complete until the form submission or completion receipt is verified and all three required internal recipients are present. If the form was requested but the result is not yet verified, return `WAITING_FOR_EXTERNAL_TECH_COMPLETION_FORM`.

## Cloud-service credentials

When the visit involves cloud services, require the technician to complete the customer's username/password status in the designated secure Monday field at the end of the visit. Never place a password in email, calendar text, the `לו"ז` Sheet, or an open Monday update.

## Monthly or multi-visit execution gate

For a monthly schedule review or any batch of several visits:

1. Run a complete read-only preview first.
2. Reconcile every candidate visit across Monday and `לו"ז`.
3. Return a compact matrix containing customer, date, arrival window, technician, service-call number, reconciliation state, SUPPORT sender readiness, electrician requirement, technician-email readiness, and external-form requirement when applicable.
4. Do not send customer or technician messages and do not perform batch writes until Oren explicitly approves the preview or the requested batch.
5. After approval, process each visit independently through the full transaction and completion gate. One successful visit never hides a blocker on another visit.

## Jev / TypeSafe fast path

Jev may be used to reduce large-model token use and speed up repetitive semantic checks. It is an advisory typed-judgment layer, never an authorization or source of truth.

Keep exact lookups, recipient verification, dates, writes, sends, permissions, idempotency, and read-back in deterministic code and connector calls. Use Jev only after code has supplied bounded candidate state.

Good Jev tasks for this workflow include:

- classify schedule or Monday free text as `INSTALLATION`, `SERVICE`, `SUPERVISION`, `OFFICE_OR_LEAVE`, or `OTHER`;
- select the best candidate Monday item from a small deterministic candidate set when wording differs but verified identifiers overlap;
- classify a cross-system mismatch as `NONE`, `DATE`, `TIME`, `TECHNICIAN`, `CUSTOMER`, `ADDRESS`, `FAULT`, or `MULTIPLE`;
- judge whether free-text notes add an operational exception that requires human review;
- batch independent typed judgments over the same visit state in one request.

Use Choice for one-of-a-set routing or mismatch type, Noul for a yes/no condition such as `needs_human_review`, and a Score only for graded ranking when a deterministic ordering is insufficient. Set conservative thresholds on I Feel examples. Low-confidence or conflicting judgments must fall back to deterministic review or Oren, not to an outbound action.

Never let Jev invent a customer, email address, technician, date, time, form URL, permission, or completion state. A Jev result alone can never trigger an email, Monday write, calendar write, schedule write, or form completion.

## Mandatory completion gate

After every write, re-read the exact record. Report `הושלם` only when every applicable check passes:

| Check | Required evidence |
| --- | --- |
| Monday | Existing item ID, correct group, status, date, hour, technician or verified external-technician note, and customer/service details |
| `לו"ז` Sheet | Exact month tab and technician cell contain the complete matched visit block |
| Monday ↔ `לו"ז` | Re-read proves matching customer, service call, technician, date, and arrival window |
| Technician Calendar | Exact event ID, calendar owner, time window, phone, full address, and fault, or `NOT_APPLICABLE_EXTERNAL_TECH` |
| Technician email | Sent-message ID addressed directly to the verified technician |
| Customer email | Sent-message ID addressed directly to the verified customer with `From: support@i-feel.co.il` |
| Electrician notice | Required customer notice is present when `electrician_required=true` |
| External completion form | For a completed Jacky Saliba or Ahmad Giar installation, verified completion receipt includes Oren, Cheyne, and Kiril |

If any applicable check fails, report `חלקי` and name the missing surface. Do not say the visit appears everywhere. Repair the missing surface when the user's authorization covers it, then run the gate again.

For several visits, run the full gate independently for each customer and return a compact per-customer matrix. A successful visit never hides a missing surface for another visit.

## Safety and consistency

- Monday remains the durable operational source of truth; do not add or restructure board columns.
- The `לו"ז` Sheet can provide verified schedule facts back to a strongly matched Monday item, but never overrides an unresolved conflict silently.
- Preserve conflicts between sources and ask Oren when the difference changes the technician, date, time, customer, phone, or address.
- Do not overwrite another employee's `לו"ז` cell or unrelated text.
- Do not delete or cancel items, events, or messages as part of normal coordination.
- Never send customer dispatch mail from a mailbox other than `support@i-feel.co.il`.
- Never claim a send, write, move, form completion, or calendar creation without a successful connector result and live read-back.
