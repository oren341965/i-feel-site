# DOTS — 4.11.2026 — KNX/BACnet handover

## Measurement first
Windsor sources rediscovered: Search Console non-www property and GA4 440660138 / stream 8141821132. Latest finalized GSC day returned: 2026-11-01 (queried through Nov 3, fresh data disabled). The 28-day periods remain Oct 5–Nov 1 versus Sep 7–Oct 4; reuse the existing workbook observations rather than duplicate unchanged data.

| Sales page | GSC clicks | Impressions | CTR | Position | Organic landing sessions | AI landing sessions |
|---|---:|---:|---:|---:|---:|---:|
| smart-home-villa | 1 | 90 | 1.11% | 6.00 | 1 | 0 |
| knx-smart-home | 12 | 432 | 2.78% | 4.29 | 9 | 2 |
| smart-home-system-upgrade | 1 | 24 | 4.17% | 14.17 | 1 | 0 |
| structure-control | 3 | 888 | 0.34% | 33.54 | 9 | 2 |
| bms-retrofit | 0 | 21 | 0% | 41.81 | 0 recorded | 0 recorded |

GSC scope: web, all countries/devices; no www double-counting. GA4 scope: public hostname and verified stream; normalize trailing slash in landing_page. Sessions are not clicks or people. Source-identified AI sessions are not AI citations. Prior combined totals: 14 clicks / 1495 impressions / 18 organic landing sessions / 4 AI; current: 17 / 1455 / 20 / 4. No causal uplift claim. Individual query knx: 53 impressions, 0 clicks, average position 5.5472. The more specific בית חכם knx has 43 impressions and average position 1.2093; do not characterize the entire site as having no top positions. Visible query rows do not reconcile to page totals because query reporting can omit queries.

## Selected improvement and content package
Inference: a concrete description of commissioning deliverables may help technical readers assess the integrator and reach the KNX sales path. This is a hypothesis, not a proven conversion lift. Improve the existing gateway article; do not create a competing page or rewrite the sales-page title.
- SEO title retained: KNX ו-BACnet: בחירת Gateway ל-BMS | i-feel
- Meta description retained: Gateway KNX-BACnet: Server מול Client, מיפוי נקודות, COV, BACnet/SC, Modbus ו-Siemens Desigo. מדריך תכנון ומסירה ל-BMS.
- New H2: מסירת KNX ו-BMS: איך יודעים שהנקודה באמת עובדת?
- H3: שתי בדיקות משלימות: ההתקן והממשק; דוגמת מסירה לחדר אחד.
- Two new FAQ entries generated into both visible HTML and existing FAQPage JSON-LD.
- dateModified, visible update date and sitemap lastmod aligned to Nov 4.
- Existing inbound link from knx-smart-home targets the new section; section links back to KNX sales, BMS, Desigo and projects.
- One explicit cta_click with cta_id=knx_bms_handover_consultation, destination existing contact form. Shared tracker only; no new listener or lead event. PR #566 remains open/draft; do not duplicate its implementation.
- Primary source: https://support.knx.org/hc/en-us/articles/360019120699-Devices-Diagnostics-Detailed — updated Sep 1, 2026, checked Nov 4. KNX checks are source-supported; proposed interface acceptance steps are I Feel interpretation. No claim of a new standard or completed customer test.

## KPI / guardrail / stop rule
After approved publication, record release date and monitor article-to-sales/contact CTA clicks, organic landing sessions on KNX sales and CRM-matched leads. No guaranteed lead count. No clinical/safety-critical equipment disconnection; any live test needs site authorization and recovery plan. If telemetry duplicates an event or form/CRM mapping fails, stop rollout and investigate. generate_lead is not CRM proof. Current per-sales-page verified leads remain Unknown. No emails, campaign edits, CRM writes, merges or production deploys.

## Distribution drafts — Maya / LinkedIn / WhatsApp, not sent
1. מסך BMS מציג מצב תקין — אבל האם הציוד באמת ביצע את הפקודה? בטיוטת העדכון שלנו למדריך KNX–BACnet הוספנו דוגמה שמפרידה בין פקודה, משוב ומדידה בשטח. הקישור יתווסף רק אחרי פרסום מאושר.
2. בדיקת Devices Diagnostics ב-ETS חשובה לבדיקת התקנים והתאמתם לפרויקט. במסירה משלבים גם בדיקת קצה לקצה עד מסך הניהול: יחידות, הרשאות ותגובה לשינוי מקומי. זהו תהליך בדיקה מוצע, לא תקן חדש.
3. מערכת KNX קיימת, ואין לכם מושג איזה Gateway מותקן? אפשר להתחיל בשיחה עם I Feel. נגדיר יחד מה לא עובד ואיזה מידע נחוץ; לא צריך להכין מפרט טכני לפני הפנייה. התאמה והיקף שירות נבדקים פרטנית.
4. ליועצים ולבוני לוחות: לפני אישור מסירה, הגדירו בנפרד פקודה ומשוב, מדידה וטמפרטורה מבוקשת, מקור סמכות ותצוגת נתון מיושן. I Feel מסייעת בתכנון KNX ובאינטגרציה ל-BMS בהתאם למפרט הפרויקט.

## Verification
Full npm build / rendered SEO gates passed: 255 HTML pages, 229 public index records and sitemap entries, 461 JSON-LD blocks. 36 relevant SEO/safety/attribution/conversion tests passed. All 11 article FAQ answers appear in visible content. No new route, no sensitive API/config change, no deletions. Mobile browser visual QA and Search Console URL Inspection were not performed. Live crawl results are recorded separately after completion. Search samples are not Google Israel rank measurements or ChatGPT/Gemini/Perplexity answer tests. Active-vault source status could not be verified; no customer claims inferred from old or completed files.

Live audit Nov 4: production sitemap has 217 distinct URLs, all HTTP 200, one H1 per fetched page, no explicit meta noindex detected. The tracked manual sitemap matches production at 217 URLs. The build-generated sitemap has 229 public URLs; the 12 generated additions need separate deployment verification. Do not report 229 live sitemap URLs. robots.txt, llms.txt and agent-info.json return 200. Homepage requests bearing Googlebot, bingbot, OAI-SearchBot, ClaudeBot and PerplexityBot user agents return 200; this is a probe, not proof of actual crawler access/indexing. PSI mobile API returned 429: performance and CWV Unknown. No current AI answer-engine sessions or Google Israel SERP rank measurement was performed.
