---
name: ifeel-service-dispatch
description: Coordinate and verify one I Feel field-service visit across Monday board 3011387201, the Google Sheet "לו\"ז", the assigned technician's Google Calendar, and direct customer and technician emails. Use when Oren asks to schedule, confirm, move, or complete a service visit, or asks whether it appears everywhere.
---

# I Feel Service Dispatch

Coordinate one service visit as a single cross-system transaction. A visit is not complete merely because it exists in one calendar or one Monday item.

## Required sources

- Monday service board: `3011387201`.
- Google Sheet: `לו"ז`. Resolve the exact file and month tab before every write.
- Assigned technician's own Google Calendar. Do not confuse it with the `לו"ז` Sheet.
- The authenticated I Feel Gmail account.

Resolve every recipient before sending. For a known technician, verify the exact work address from recent I Feel evidence. Do not guess from a first name.

## Preflight

1. Extract the customer name, phone, email, full address, service-call number, fault, equipment or pickup instructions, technician, date, and arrival window. Add an apartment number only when the site is an apartment and the source provides one.
2. Treat missing full address, phone, email, or confirmation as an explicit gap. An apartment number is optional and is not a gap for a private house, business, public building, or any site where it is irrelevant. Never invent one or require the customer to supply one unnecessarily.
3. Confirm that the customer accepted the visit time from direct email or another explicit source. Keep an unconfirmed proposal visibly marked `לתיאום בלבד`; do not present it as confirmed.
4. Search Monday in this order: service-call number, customer name, then phone. Update the existing item when found. Do not create a duplicate item for a form-originated call.
5. Check the technician's calendar for conflicts and duplicates in the exact date window.

## Dispatch transaction

Complete all applicable steps before reporting success:

1. **Monday**
   - Use the existing service item whenever one exists.
   - For a confirmed field visit, set visit date, visit hour, assigned technician, technician-name dropdown, and the scheduled-visit status used by the board.
   - Keep the full fault, phone, email, street, house number, city, optional apartment number when relevant, and equipment instructions in their designated columns.
   - Move an active scheduled call to the active `קריאות שירות` group when it is still in an intake/form group.
   - Add a short operational update recording the confirmation source and completed dispatch surfaces. Never put credentials or passwords in an open update.
2. **Google Sheet `לו"ז`**
   - Resolve the exact month tab, service date row, and assigned technician column from live metadata and headers.
   - Enter one complete block containing time window, customer name, phone, full address, optional apartment number when relevant, fault, equipment/pickup instructions, and confirmation state.
   - Preserve the existing layout and formatting. Never write only a name and time when more details are available.
3. **Technician Google Calendar**
   - Create or update one event in the technician's own calendar for the exact visit window.
   - Include customer name, phone, full address, optional apartment number when relevant, fault, equipment/pickup instructions, service-call number, and Monday link.
   - Search first and update the matching event instead of creating a duplicate.
4. **Technician email**
   - Send directly to the verified technician address.
   - Include date, time window, customer name, phone, full address, optional apartment number when relevant, fault, equipment/pickup instructions, service-call number, and Monday link.
5. **Customer email**
   - Send directly to the verified customer address.
   - State the technician name, date, time window, address, and short service subject.
   - When Oren instructs that a non-I Feel fault may be chargeable, include that warning clearly in this email and record that it was communicated.

## Cloud-service credentials

When the visit involves cloud services, require the technician to complete the customer's username/password status in the designated secure Monday field at the end of the visit. Never place a password in email, calendar text, the `לו"ז` Sheet, or an open Monday update.

## Mandatory completion gate

After every write, re-read the exact record. Report `הושלם` only when all five checks pass:

| Check | Required evidence |
| --- | --- |
| Monday | Existing item ID, correct group, status, date, hour, technician, and customer/service details |
| `לו"ז` Sheet | Exact month tab and technician cell contain the complete visit block |
| Technician Calendar | Exact event ID, calendar owner, time window, phone, full address, fault, and apartment number only when relevant |
| Technician email | Sent-message ID addressed directly to the verified technician |
| Customer email | Sent-message ID addressed directly to the verified customer |

If any check fails, report `חלקי` and name the missing surface. Do not say the visit appears everywhere. Repair the missing surface when the user's authorization covers it, then run the gate again.

For several visits, run the full gate independently for each customer and return a compact per-customer matrix. A successful visit never hides a missing surface for another visit.

## Safety and consistency

- Monday remains the operational source of truth; do not add or restructure board columns.
- Preserve conflicts between sources and ask Oren when the difference changes the technician, date, time, customer, or address.
- Do not overwrite another employee's `לו"ז` cell or unrelated text.
- Do not delete or cancel items, events, or messages as part of normal coordination.
- Never claim a send, write, move, or calendar creation without a successful connector result and live read-back.
