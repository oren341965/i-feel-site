# DOTS — 5.11.2026 — AI access to ETS

## Fact — measurement first
Sources rediscovered in Windsor. GSC canonical property https://i-feel.co.il/, web, fresh data disabled; latest finalized date returned Nov2 (requested Nov1–4). GA4 property440660138, stream8141821132, hostname i-feel.co.il; trailing slash normalized for landing_page. Current28days:Oct6–Nov2; previous:Sep8–Oct5. Do not compare rolling windows as a one-day uplift or attribute change to unpublished work.

| Sales page | Clicks | Impressions | CTR | Avg position | Organic landing sessions | AI sessions |
|---|---:|---:|---:|---:|---:|---:|
| /smart-home-villa/ | 1 | 95 | 1.05% | 6.0947 | 1 | 0 |
| /knx-smart-home/ | 12 | 424 | 2.83% | 4.375 | 9 | 2 |
| /smart-home-system-upgrade/ | 1 | 24 | 4.17% | 14.4583 | 1 | 0 |
| /structure-control/ | 3 | 887 | 0.34% | 33.5986 | 10 | 3 |
| /bms-retrofit/ | 0 | 22 | 0.00% | 43.5909 | 0 | 0 |

Five-page totals:17 vs14 clicks;1452 vs1474 impressions;21 vs18 organic sessions;5 vs4 identified AI sessions. Source-defined GA4 events:4 generate_lead in contactus, not CRM verified leads. One cta_click in the existing KNX–BACnet article is recorded in a period ending Nov2: it predates draft#569 and is NOT evidence of that draft's performance. No cta_click returned on the five sales pages; full coverage Unknown. KNX sales has6 whatsapp_click and2 phone_click, BMS1 phone_click; villa1 form_start. None are verified CRM conversions.

Current country/device breakdown retrieved separately: returned rows include KNX Israel/mobile5clicks84impressions and desktop1click104impressions. Segment totals do not reconcile to page totals; do not calculate whole-site country shares from this response. Visible query rows are separately classified by a narrow brand rule (i-feel/i feel/ifeel/איי פיל); these rows do not cover all page totals. Generic knx:53impressions0clicks avg5.5283; בית חכם knx:43impressions1click avg1.2093. Broad BMS traffic contains drive-control queries; search intent remains an opportunity, not proof of cause.

## Selected update — Inference
A fresh official KNX support notice from Nov3 changes the context of AI-to-ETS access. Improve the existing security guide and link it from the existing KNX sales page. No competing URL or daily rewrite of sales titles. This gives prospective owners a concrete question to discuss with an integrator. Ranking/lead impact is a hypothesis.

Primary source (updated Nov3,2026; retrieved Nov5): https://support.knx.org/hc/en-us/articles/40411574251026-Registration-of-new-MCP-Apps-for-ETS-paused-until-further-notice
Fact: pause applies to registration and first-time validation of NEW MCP apps for ETS; installed apps continue working. It is not a blanket AI ban. Four-question review workflow is I Feel interpretation, not a new KNX standard or a service already delivered.

## Content package
SEO title retained: KNX Secure ו-Security Proxy: שדרוג ETS6.4 | i-feel
Meta retained: איך משדרגים אבטחת KNX קיימת? Security Proxy, ETS6.4, IP Secure, גישה מאובטחת, בדיקות מסירה ואינטגרציה ל-BMS.
H2: AI ו-ETS: מה השתנה בהודעת KNX מ-3.11.2026?
H3: איך זה נוגע לבעל מערכת KNX? / ארבע שאלות לבדיקה מקצועית.
Two FAQ answers added via the existing array, rendered both visibly and in FAQPage JSON-LD. dateModified, visible date and sitemap lastmod aligned Nov5. New anchored inbound link from KNX sales; outgoing KNX/upgrade/Desigo/BMS/projects links. Explicit cta_click knx_ets_ai_review uses existing shared tracker; no listener or lead event added. PR#566 and#569 checked:still open/draft, not merged; no duplication.

## Maya / LinkedIn / WhatsApp — drafts only, not sent
1. AI יכול לסייע בהבנת מערכת KNX, אבל גישה לפרויקט ETS היא שלב אחר. לפני שינוי צריך להבין מי מאשר, איזה מידע יוצא מהמחשב ואיך משחזרים את הפרויקט.
2. עדכון KNX מ-3.11: הושהו רישום ואימות ראשוני של אפליקציות MCP חדשות ל-ETS. אפליקציות מותקנות ממשיכות לעבוד. בטיוטת המאמר הסברנו מה זה אומר לבעלי מערכות.
3. יש מערכת KNX קיימת ורוצים לשפר תרחישים או שירות? אפשר להתחיל בשיחה עם I Feel גם בלי לדעת מה מותקן. היקף הבדיקה והשדרוג נקבע לפי הציוד והפרויקט.
4. ליועצים ולאינטגרטורים: לפני גישת AI ל-ETS, הפרידו בין קריאה לכתיבה, בדקו תיעוד מידע שיוצא החוצה והגדירו אישור פעולה ותוכנית שחזור. זהו תהליך בדיקה מוצע, לא תקן חדש.

## KPI, guardrail, stop rule
Monitor the new CTA only after approved release; follow KNX/upgrade organic landing sessions and CRM-matched leads. Do not promise counts or infer a content lift from small samples. No project exports, credentials, device programming or customer tests. If event duplication, unapproved writes or recovery uncertainty occurs, stop the change and review. Never count form_start or generate_lead as confirmed Monday delivery without matching evidence. No merge, deploy, email, campaign or budget changes.

## Verification and limitations
Full build:255HTML,229public index/sitemap records,461JSON-LD blocks.36relevant tests passed.12FAQ answers match visible content; new CTA occurs once; existing contact anchor resolves in rendered HTML. No new route or schema type change. Live HTTP audit recorded separately in final PR. Actual Google URL Inspection, controlled ChatGPT/Gemini/Perplexity citation tests, field CWV and native browser/mobile QA unavailable. Search samples are not Google Israel rank tracking. Competitor samples identified Vitrea existing-system messaging and INSPERA KNX integration; no rank/traffic comparisons inferred. Vault search returned old Knowledge and Completed files, not a verified relevant Active document; no private customer facts used.


Live audit Nov5:229 unique URLs across both public sitemaps returned HTTP200 and one H1. robots/llms/agent-info returned200. Homepage user-agent probes for Google/Bing/OAI-SearchBot/ClaudeBot/PerplexityBot returned200; not proof of real crawler indexing. PSI429; field CWV Unknown. No new route; existing page is indexable by rendered canonical/sitemap/metadata checks, actual Google indexed status Unknown.
