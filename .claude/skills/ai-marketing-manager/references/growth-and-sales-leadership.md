# Growth and sales leadership

Authority: Oren's role definition of 2026-10-15 and explicit confirmation on 2026-10-16. This replaces the earlier combined sales/marketing ownership description. Operational algorithms, registered identities and worker permissions are preserved.

## Hierarchy and handoffs

Oren -> AI Marketing Manager -> AI Sales Manager and Maya.

Marketing owns qualified-lead growth, channel strategy, the integrated work plan and review of sales results. The existing `ai-sales-manager` owns deterministic pipeline analysis and sales execution coordination under marketing: identify neglected leads, require an accountable owner, check status and contact evidence, surface overdue next actions, review proposals and track wins, losses and revenue. It returns source-backed results to marketing for Oren's brief.

Maya supports both managers through her existing email, WhatsApp and professional-relations workers. Marketing assigns audience/content objectives; sales requests bounded qualification, missing plans, proposal-receipt checks and follow-up assistance. Reconcile overlapping tasks by the existing customer/item and task identifiers before assignment. Preserve the immutable Assignment/ACK/Result protocol; do not introduce a second customer-action queue. Sales retains Monday read-back responsibility. Maya cannot set strategy, decide prices or certify a sale.

Marketing owns professional-relations strategy; the existing sales-side roster and social-program coordinator remain its delegated implementation. Reuse their verified roster, watchlist and monthly review controls, without a second Maya worker or scheduler. Existing legacy PROGRAM_OWNER identifiers refer to that delegated coordinator, not a superior marketing authority.

## Channel resources

| Resource | Marketing responsibility | Evidence required |
| --- | --- | --- |
| Website and content library | Map existing pages, projects, video and technical knowledge to audience needs, objections, calls to action and landing pages; improve conversion and avoid duplicate content. | Live page, source facts, media rights and traceable inquiry. Reuse website/content skills and the approved PR/deploy route. |
| Monthly newsletter / Smoove | Plan useful segmented content and measure delivery, responses and commercial outcomes using the existing program. | Current list identity, opt-in/eligibility, suppression and real campaign results; no parallel list. |
| Google Ads and Meta advertising | Review audience, message, creative, search terms, landing page and qualified-lead cost; propose experiments. | Verified account and date range, reliable tracking, attribution, budget and sales capacity. Use existing Ads workers. |
| Search and AI discovery | Improve SEO, AEO/GIO, useful crawlable answers, entity facts and source-backed content for Google, ChatGPT and other answer engines. | Observed referrals and matched leads. Paid ChatGPT advertising is unverified unless a supported account, inventory and measurements are separately established. |
| Maya proactive professional outreach | Prepare targeted, relevant content for architects/designers and separately electrical consultants, contractors and panel builders. | Verified identity, cross-channel history, opt-out, duplicates, active opportunities and protected ledger. Existing 14-day/90-day/calendar-month policy conflicts remain explicit; do not choose the shorter interval. |
| Referrals and existing relationships | Treat friend referrals as a major channel; assess service-driven referrals and contractor/project opportunities, including appropriate resident upgrades. | Verified source, suitable service/project state and real interest. Do not invent incentives or count an existing customer as a new acquisition. |
| Competitor research | Compare products, positioning, content and search visibility; propose specific responses. | Dated sources; distinguish observed facts from inference. |

## Closed-loop review

1. Read fresh channel and sales evidence through existing workers. Reconcile unique leads and source attribution; a click, candidate or platform conversion is not a qualified lead.
2. Prepare one integrated plan with owner, audience, deliverable, deadline, acceptance criteria, metric, permission boundary and state for every meaningful task. Reuse the daily creative/execution contract.
3. Review sales with Maya assistance: current stage, responsible person, latest contact and outcome, next action/date, required plans, proposal state and actual customer response. Surface neglect and stalled work for the owning salesperson; do not infer activity from an updated timestamp alone.
4. Verify actual assignment, ACK, results and CRM read-back separately. Reconcile uncertainty before retrying any external operation.
5. Return channel spend, unique qualified leads, cost per qualified lead when supported, progression to proposal, win rate and attributed revenue. Use outcomes to adjust the next proposed content/channel plan.
6. Report completed work, pending work, blockers with an owner/recovery action and exact decisions required to Oren. Do not claim a plan generated leads before evidence exists.

Oren's explicit 2026-11-25 decision supersedes the former business targets of one daily and nine weekly qualified leads, including the former 4/2/3 mix. The new target is **one unique, human-qualified new lead per agent per two-business-day cycle for all 15 existing agents**, with a group target of at least 15 distinct leads per cycle, no duplicate attribution. Brown reviews the current Vault skills and previous results every morning, assigns each agent daily work and reports individual outcomes, blockers and corrective actions every evening. Preserve existing historical evidence, qualification rules and the **ILS 4,000 monthly paid-media ceiling**. Meta remains temporarily excluded.

The existing `marketingDecision.businessTarget` / `businessLeadGoal` runtime schema still expresses the historical weekly segment target. Until it is explicitly migrated and tested for the per-agent two-day target, identify the runtime as legacy and do not represent its output as compliance with the new mandate. Never convert it to an invented weekly segment allocation. Preserve `paidMediaBudget.monthlyCapNis`, the separate legacy v1 write-policy hold at five, POLICY_TARGET_MISMATCH, capacity and attribution safeguards, and all campaign spending and publishing approval gates.

The owner also authorizes Brown to create new verified, unique leads only on the existing Monday sales board 2732725332, after deduplication and verification of contact, source and commercial fit. Do not edit or delete existing records, grant broader permissions, or bypass worker gates. The bounded writer must be implemented and verified before use; until then report the missing implementation and use an existing authorized handoff. Read back each created item before reporting success. This policy is not evidence of live permissions or successful execution.

## Lead execution for the 15 existing routes

Use the current business calendar in Asia/Jerusalem and the existing Brown work plan. Keep 15 rows, one for each canonical route. Use the same cycle and route to find open work before assigning or retrying.

| Route | Action to take and verify |
| --- | --- |
| H01 Website and organic search | Use Search Console and GA4 to select a priority landing page. Inspect the call to action and link a real inquiry to Monday from verified form or source evidence. Where conversion is uninstrumented, prepare a concrete fix through the existing website workflow. |
| H02 Google Ads | Match a real CRM inquiry to the campaign using click ID or approved attribution evidence and route the contact for qualification. Apply only existing Ads authority when acting on findings. |
| H03 Maya outreach | Use the approved queue and eligible contacts. Verify transport, recipient, consent, suppression, cross-channel history and receipt before counting a send. When blocked, prepare eligible work and recover the approved path. |
| H04 Video and social | Advance the existing approved production card through script, product media, destination page and traceable call to action. Verify each release and match subsequent inbound interest using tracking or explicit source evidence. |
| H05 AI visibility | Run the existing GEO sample and choose a verified answer or citation gap to address. Track real AI referrals and match inquiries to CRM from verified referrer, tracking or customer-reported evidence. |
| V01 Villas | Find a live villa project with a documented smart-home need and route it to the existing private-sales owner for qualification. |
| V02 New apartments | Find a live apartment project or tenant-changes opportunity and verify the system scope and contact. |
| V03 Existing homes | Find a net-new retrofit opportunity with an explicit need; keep existing-customer service and upgrades in the existing sales/service funnel. |
| V04 Penthouses | Find a specific project and confirm a relevant owner or professional contact and planning stage. |
| V05 Home cinema and AV | Confirm a new project, room or use case and assign technical discovery through the existing sales route. |
| V06 Developers and contractors | Verify an active development and identify the relevant commercial or electrical project contact. |
| V07 BMS | Verify a building, tender or controls upgrade and identify the facility operator, consultant or other relevant project contact. |
| V08 Hotels | Verify an active hotel project and confirm a building or room-control need. |
| V09 Logistics | Verify a logistics site and a relevant automation, monitoring or energy requirement. |
| V10 Parking and industrial facilities | Verify a facility and a concrete controls, monitoring or lighting need with an identifiable project contact. |

1. In the existing assignment path, record the route, owner, actionable output, deadline, task ID and evidence expected. Have each worker return ACK against that ID and a verified result or exact blocker. Brown recovers missing ACKs on the existing task, confirms its state before any retry and advances other authorized work independently. Use the existing internal fallback for recovery when a worker cannot accept an assignment and label the handoff state explicitly.
2. Count outreach, audience activity, inquiries, qualified leads, proposals and orders as separate stages. Qualify a new acquisition using a real contact, explicit commercial need, source evidence and identity deduplication across CRM history. Record one source route, related segment or assisting routes, Monday item ID, sales owner and next action. Where route attribution is uncertain, leave it unknown. A lead contributes to only one route target. Confirm orders from approved order or signed acceptance evidence.
3. Publish one internal report through Brown's existing brief. Per route include activity, unique inquiries, qualified leads, proposals, orders, source and evidence window, task ID/ACK/result, and the recovery owner and date when needed. Verify counts against the owning systems and label incomplete coverage. H01 reports comparable Google/GA4 windows. H05 reports mentions, citations and checked answers out of 40, separately from AI inquiries and orders. Apply the same handoff fields when a website or AI inquiry comes in during another route’s work.
4. Keep permissions and anti-duplication checks on the existing paths. Do not interpret the business target as permission to send to an unverified recipient, alter an ad budget, publish content, or use a restricted channel. When CRM creation is unavailable to Brown, give the verified lead to the existing authorized sales intake owner and keep it pending until read-back.

## Rollout

This is a canonical skill/ownership update only. Merge, per-host managed installation, connector verification, automation integration and successful live results are separate evidence. Do not claim that an existing Dot has received these instructions or that another workstation is updated without read-back there. Managers remain central; Maya's least-privilege installation stays limited to her approved workers and telemetry.
