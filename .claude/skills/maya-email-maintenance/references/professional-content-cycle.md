# Maya professional content, publishing and direct-mail cycle

## Authority and activation

Oren granted explicit standing authorization on 2026-09-04 for this bounded I Feel professional-content workflow. The authorization permits Maya, after Oren supplies the day's material and at least one approved image, to prepare and publish the relevant organic post(s) on connected I Feel channels and to send professional email to eligible contacts under the rules below without asking Oren for another per-send approval.

This standing authorization is the separate approval required by `maya-email-maintenance` for marketing, broadcasts and new-recipient professional outreach. It applies only to this workflow and does not authorize any paid-media budget, bid, campaign or targeting changes.

The workflow is staged but not active until Oren gives Maya/Codex a direct start instruction on the Maya workstation. Before that command, keep `activation_state=AWAITING_OREN_START`, do not send or publish, and do not turn on another scheduler.

After activation, keep the existing four-Skill Maya bundle. Do not add a fifth installed Skill. `maya-email-maintenance` owns the email execution surface; `management-system-telemetry` reports the run; website or manager-side work remains centralized in I Feel Management.

## Business objective

Generate professional interest, qualified traffic to `https://i-feel.co.il/`, and new leads. The normal daily working target is 40–80 professional emails across all eligible segments when enough suitable material and eligible contacts exist. Never force volume by using irrelevant content, violating the 14-day cooldown, or contacting an ineligible recipient.

## Daily source gate

1. Each morning ask Oren for one or more items for that day: topic, article, video, page, case study, product, project, guide, professional update or content idea.
2. Every distributed item must have at least one suitable image approved by Oren or the I Feel team. No image means no publication and no email for that item.
3. Do not invent a replacement topic when Oren has not supplied the day's material. Audience preparation, UTM construction, drafts and eligibility checks may continue, but new outbound distribution waits for Oren's material.

## Audience matching

Classify each supplied item to the best professional segment and create separate wording when the item fits multiple segments, without changing facts or inventing claims.

- Architects / interior designers: hidden integration, aesthetics, audio-video, ceiling planning, lighting, switches, smart home, KNX and design details.
- Electricians / electrical contractors: KNX, DALI, boards, infrastructure, wiring, installation coordination, commissioning and service.
- Electrical / low-voltage consultants: specifications, Siemens Desigo, BMS, KNX Secure, DALI, BACnet/Modbus, drawings, bills of quantities and case studies.
- Supervisors / project managers: cross-system coordination, early planning, testing, commissioning, warranty and handover.
- Building contractors / developers: infrastructure, systems coordination, tenant packages, upgrades, service, project support and handover.
- Other professional audiences only when the supplied material is genuinely relevant.

## Eligibility and list rules

Authoritative contact source: Monday board `3040781819` (`מאגר אנשי קשר / מקצוע`). Use only contacts with a verified business email, no opt-out, no duplicate identity and no operational reason to avoid contact.

Mandatory fields and rules:

- `boolean_mm6wggnf` / `ללא דיוור מקצועי`: exclude when checked.
- `date_mm6w3ncx` / `דיוור מקצועי אחרון`: record the actual professional send date.
- `date_mm6wrh6h` / `זכאי לדיוור הבא`: earliest next professional contact date, at least 14 days after the last send.
- Before each send, check contact history. One person receives at most one I Feel professional update in any 14-day period.
- After at least 14 days, use a different subject/content theme. Do not repeat the same article, video or message unless there is a material new update.
- Deduplicate by person and business email before send.
- When several suitable content items exist, run multiple audience groups in parallel, each with its own content and wording, while preserving the cooldown.
- Base target when suitable architectural content exists: up to 20 eligible architects/designers that day. Distribute the remainder across other relevant professional segments when eligible.
- Do not send irrelevant material merely to reach the daily target.

## Message and post construction

Every outbound email or post requires at least one approved image. For video content, use an approved thumbnail/frame when appropriate.

Each professional email/post should contain:

- a short interest-generating opening;
- 2–4 sentences of professional value;
- the direct verified content URL;
- a clear commercial CTA aimed at a real business action;
- the approved image/asset;
- a segment/content/date-specific UTM on the primary link.

Before sending or publishing, verify the destination URL is live, the page/video works, the image is valid and every factual statement is supported. Do not claim representation, certification, exclusivity, price, availability, savings or performance without a verified source. Preserve I Feel brand/equipment policy.

Do not change paid campaign budgets, bids, audiences or paid-media settings under this authorization.

## Constant update CTA

Every professional email must include, in addition to the primary content link, this separate CTA at the end:

`רוצים לקבל יותר עדכונים מקצועיים מ-I Feel? הוסיפו את i-feel למקורות המועדפים שלכם ב-Google.`

Verified URL:
`https://www.google.com/preferences/source?q=i-feel.co.il`

Where appropriate on site pages/posts, maintain a clear path to the article center or update mechanism. Do not create a duplicate CTA when the page already contains one.

For WebMCP/AI update mechanisms, preserve the existing connection on relevant content/landing pages. Before placing any specific WebMCP URL in email, verify the actual destination. Never invent an endpoint.

## Commercial action goal

The goal of each contact is a business action such as: plans, ceiling detail, specification, bill of quantities, request for quotation, meeting, design request or project. Opens/clicks are secondary metrics.

Route relevant replies into the AI Marketing Manager / I Feel Management flow and update the commercial stage in Monday through the bounded professional-content workflow. Do not let a marketing reply disappear in the Gmail thread.

## Monday documentation

After each successful send, update only the existing contact item on board `3040781819` within this workflow's standing authorization. Do not change board structure.

Record, when fields exist, the send date, segment, subject, content URL, UTM/campaign, image/asset, whether the update CTA was included, response status and the earliest next contact date. At minimum update:

- `דיוור מקצועי אחרון` = actual send date;
- `זכאי לדיוור הבא` = send date + at least 14 days.

If the current board lacks dedicated columns for subject, URL, UTM, asset, CTA or response, write those details as one concise item update rather than creating columns automatically.

### Hard-bounce handling after a send

After each professional-email batch, inspect permanent delivery failures and follow the verified bounce-handling workflow in the parent `SKILL.md`.

- Use Gmail to identify the exact failed recipient and original sent message.
- Match the exact professional contact on board `3040781819`, then check current direct Gmail history, Monday evidence and current official public sources using name, company and phone.
- Replace the email and resend once only when one address is strongly verified. Never guess an address pattern.
- When no verified replacement exists, delete only the exact matched professional-contact item from board `3040781819`; check and remove proven duplicate items for the same person. Never delete sales, project, service or customer items.
- Verify the corrected value or deleted item IDs and confirm that the failed address no longer exists on the professional-contact board.
- After verified handling, move only the bounce notification to Gmail Trash and keep the original sent message. A deleted contact receives no resend.
- Keep partial or ambiguous cases labeled `bounce` in the inbox and return `NEEDS_OREN` or `PARTIAL_BOUNCE_HANDLING`.

For every daily run also retain counts: sent, disqualified for opt-out, duplicate, relevance or 14-day cooldown; and business outcomes by segment/content: replies, real leads, qualified leads, meetings, RFQs, proposals and deals.

## I Feel Management integration

Use the registered Management System host `maya-front-office` and the already registered capability slug `maya-email-maintenance`. Do not invent a new capability slug.

For each activated professional-content run, report telemetry with:

- capability: `maya-email-maintenance`
- mode: `professional_content_cycle`
- one stable run key reused across retries
- `running` before the owned workflow and one terminal state `succeeded`, `failed` or `blocked`
- bounded counters for reads, writes, sends, retries and errors
- sanitized evidence only, with no contact names, email addresses, message bodies, URLs containing personal identifiers, or raw Monday/Gmail IDs in telemetry.

The operational record remains Monday until I Feel Management becomes the central dashboard/source of truth for these fields. Keep a consistent logical record shape for future sync:

`contact_id, segment, content_id_or_url, send_date, channel, campaign_or_utm, image_asset, update_subscription_cta=true, response_status, lead_status, next_contact_date`

## Work with Keren

Once Oren's material is ready, prepare a distribution package for Keren containing title, short text, at least one approved image, link, target audience, channels, commercial CTA and the constant update CTA. Keren receives a ready-to-distribute package; she is not expected to invent the topic or professional knowledge.

Keren is not a gate for Maya's direct professional email. Maya may execute the authorized email cycle after activation and all eligibility gates pass.

## Missing professional information

When a technical fact, example, photo, specification or project story is missing, request it through Maya from Kiril. Do not distribute weak or unverified technical content.

## Permanent Siemens Desigo energy-control campaign

Include a recurring professional content option for Siemens Desigo energy/building control, only for appropriate professional/commercial audiences. Never present it as private smart-home content and never send it to private consumers.

Eligible audiences: electrical/low-voltage consultants, electrical contractors, commercial customers and relevant building developers.

Core verified positioning: building management can centrally monitor and manage electrical/operational consumption and energy-control information as part of Siemens Desigo. Do not promise a percentage saving or numeric performance result without a verified source and project data.

Audience angle:

- consultants: planning, specifications and integration;
- electrical contractors: infrastructure, panels, installation and commissioning;
- commercial customers: operational visibility, control and monitoring;
- developers: early planning, operational value and lifecycle service.

Use only a live verified I Feel BMS/Desigo or relevant commercial-project page with segment UTM. Never link this campaign to a private smart-home page.

Desired action: electrical plans, specification, bill of quantities, consulting request, characterization meeting or BMS project.

## Initial ready asset for 2026-09-04

Oren already supplied and approved the ISCAR/BMS item for professional distribution.

Primary page:
`https://i-feel.co.il/structure-control/projects/iscar/`

Approved page image:
`https://i-feel.co.il/structure-control/projects/iscar/iscar-building-exterior.jpeg`

For the ISCAR mailing, target only:
- electrical / low-voltage consultants;
- electrical contractors;
- panel manufacturers.

Do not send ISCAR material to architects, interior designers, private customers or unrelated audiences.

Include this professional tip before the CTA:

`טיפ של I Feel: בפרויקט BMS כדאי להגדיר כבר בשלב התכנון את אזורי ה-DALI, קבוצות התאורה, נקודות הבקרה והתרחישים התפעוליים. תכנון מוקדם מקל משמעותית על התכנות, ה-Commissioning והתחזוקה בהמשך.`

When Oren gives the start command on Maya/Codex, this ISCAR item is the first ready campaign unless Oren supplies a newer item in that command.

## Run result

At the end of each run return a concise Hebrew status containing:

- activation state and source material used;
- image and URL verification result;
- eligible counts by segment;
- sent count by segment;
- exclusions by reason;
- Monday write/read-back status;
- relevant replies/leads created or routed;
- Management System telemetry state;
- next allowed contact date logic;
- blockers, if any.

Never report a send as complete unless the Gmail sent state and Monday contact state are both verified after the action.
