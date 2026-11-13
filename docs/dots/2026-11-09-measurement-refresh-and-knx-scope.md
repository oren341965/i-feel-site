# DOTS — 9 November 2026: restore the measurement draft

Status: Draft PR #566 only. No production content change, merge, send or Soro integration change. #594 and #569 remain separate unapproved drafts.

## Fact — business measurement comes first

Fresh Windsor connectors/accounts, fields and options discovered. GSC canonical non-www, web, all countries/devices; latest finalized day 7 November, fetched 9 November 06:27:19 UTC. Compare 11 October–7 November with 13 September–10 October (28 complete days each). GA4 property 440660138, hostname i-feel.co.il, stream 8141821132; normalize only a final slash. Organic Search and AI Assistant sessions stay separate.

| Sales page | Clicks current/prior | Impressions current/prior | CTR current/prior | Average position current/prior | Organic landing current/prior | AI landing current/prior |
|---|---:|---:|---:|---:|---:|---:|
| smart-home-villa | 1/0 | 88/79 | 1.14%/0.00% | 6.58/4.33 | 1/0 | 0/0 |
| knx-smart-home | 13/15 | 433/516 | 3.00%/2.91% | 4.46/4.85 | 10/14 | 2/1 |
| smart-home-system-upgrade | 1/0 | 21/39 | 4.76%/0.00% | 15.62/11.82 | 1/0 | 0/0 |
| structure-control | 2/1 | 950/713 | 0.21%/0.14% | 34.05/33.94 | 10/4 | 3/0 |
| bms-retrofit | 0/0 | 32/18 | 0.00%/0.00% | 56.47/13.17 | 0/0 | 0/0 |

Totals: 17/16 clicks, 1,524/1,365 impressions, CTR 1.12%/1.17%, 22/18 organic landings and 5/1 AI Assistant landings. CTR is total clicks divided by total impressions, not an average of percentages. These small rolling samples do not establish causality. AI referral traffic is not AI-answer citations. Missing rows mean no recorded activity in this scope, not proof of no actual visits.

Current events: KNX phone_click 2, whatsapp_click 7; BMS phone_click 1; villa form_start 1. Contact page generate_lead 4 and form_start 4, phone_click 8, whatsapp_click 17. No original-landing-page to Monday match was verified. Delivered/qualified leads by sales page and complete CTA coverage remain Unknown. No click/form start is counted as a lead.

Visible query opportunities: KNX: knx 62 impressions/0 clicks/average 5.68; מערכת knx 13/0/6.23; כבל knx 17/2/7.06 (product/informational intent, not automatically a villa buyer). BMS: שליטה מרכזית בבניין 7/0/9.29; בקרת מבנה התייעלות אנרגטית 4/0/14.00. A GSC average is not a fixed Google Israel rank.

Country/device query returned 17 rows and does not reconcile with whole-page totals; do not present its shares as complete. Israel KNX mobile 5/92/4.60 and desktop 3/124/4.02 are specific partial facets. Brand/nonbrand classification applies only to visible query subsets, not the full unreported population. No cross-scope comparison.

## Inference — one action: make contact transitions observable

#566 metadata initially reported mergeable=false against its old base. Merging current main locally was clean; the draft is refreshed without rewriting main or dropping subsequent changes. Inspection also found one genuine deduplication edge case: an explicitly tagged child inside an otherwise untagged contact anchor was handled by the shared tracker and the fallback. The fallback now recognizes the same closest tagged target as the shared owner. An integration regression executes both actual handlers for untagged, tagged anchor, tagged ancestor and tagged descendant placements and requires exactly one event. No form listener, lead event, payload query, new analytics library or tracking ID was added.

Queue review: smart-home-system-upgrade has 21 current impressions/1 click versus 39/0, one recorded organic landing and no verified originating lead. Visible שדרוג מערכות ישנות has 6 impressions at 14.33; another query is unrelated. This is not enough evidence for a broad rewrite or a poor-lead-quality claim. Its current copy promotes external-supplier takeover prominently; compatibility qualification remains an editorial proposal only. No title, URL, canonical, sitemap or public sales copy changes today. The apartment draft #594 remains awaiting approval, not reworked again.

## KNX professional package — editorial only, supports the upgrade journey

Target: add a short subsection to the existing /smart-home-system-upgrade/ after approval and scope review; do not create another page. Measurement acceptance is an attributable contact transition followed by independently confirmed origin-to-Monday evidence, not more article output. The package is not implemented in the site.

**Proposed SEO title:** שדרוג KNX קיים: בדיקת התאמה והרשאות שירות | I Feel

**Proposed meta description:** לפני שדרוג KNX בבית פרטי או בפרויקט מקצועי, בודקים את קובץ ETS, גרסת התוכנה והרשאות השירות. ללקוחות I Feel מסלול המשך; למערכת חיצונית בדיקת התאמה.

### H2: לפני שדרוג KNX, מבררים מה ניתן לשנות

כבר לקוחות I Feel? התחילו מתיאור השינוי הרצוי ומפרטי המערכת שברשותכם. בבית עם מערכת של ספק אחר, כדאי לתאם תחילה בדיקת התאמה: סוג הציוד, תיעוד ההתקנה, גיבוי פרויקט ETS והרשאה לגשת אליו. פעולה תקינה של לחצן או אפליקציה אינה לבדה הוכחה שאפשר לתכנת מחדש את כל המערכת.

### H3: גיבוי ETS והרשאה לפתיחה הם שתי בדיקות שונות

לפי KNX, ETS6 מייצא קובץ knxproj, שניתן לייבא באותה גרסת major/minor או בגרסה חדשה יותר, אך לא בגרסת minor ישנה יותר. בפרויקט KNX Secure נדרשת גם סיסמת פרויקט. לכן לפני שינוי, מתעדים את גרסת הקובץ ואת הגישה המורשית ובודקים עותק בסביבת עבודה מתאימה. אין לשלוח סיסמאות או מפתחות בטופס הציבורי.

### H3: מגדירים גבולות שינוי ובדיקת חזרה לשירות

אחרי בדיקת ההתאמה, ממפים איזה רכיב או תרחיש ישתנה ומה צריך להמשיך לעבוד. מחלקים את הבדיקה להפעלה מקומית, פקודה ומשוב, אינטגרציות BMS והרשאות שירות. בחיבור ל-Siemens Desigo מתאמים בנפרד את שכבת המיפוי וההרשאות. זהו תהליך עבודה מוצע של I Feel; אין כאן הבטחה לשחזור כל מערכת או דרישה חדשה של KNX.

### FAQ — visible and JSON-LD text must match if approved

1. **האם קובץ knxproj לבדו מספיק לשדרוג?** לא בהכרח. צריך לבדוק את גרסת ETS, התאמת הציוד וההרשאות; בפרויקט KNX Secure נדרשת גם סיסמת הפרויקט.
2. **האם כל מערכת של ספק אחר מתאימה לשדרוג?** ההתאמה נבדקת לפני הצעה: לפי התיעוד, סוג המערכת, הגישה המורשית והיקף השינוי. אין התחייבות מראש להחלפה חלקית או לשימור כל הציוד.
3. **מה מוסרים בבקשת בדיקת התאמה?** תיאור השינוי הרצוי, סוג המערכת ופרטי תיעוד זמינים. סיסמאות, מפתחות וקובצי אבטחה מוסרים רק בערוץ מוגן לאחר תיאום והרשאה.

```json
{"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": "האם קובץ knxproj לבדו מספיק לשדרוג?", "acceptedAnswer": {"@type": "Answer", "text": "לא בהכרח. צריך לבדוק את גרסת ETS, התאמת הציוד וההרשאות; בפרויקט KNX Secure נדרשת גם סיסמת הפרויקט."}}, {"@type": "Question", "name": "האם כל מערכת של ספק אחר מתאימה לשדרוג?", "acceptedAnswer": {"@type": "Answer", "text": "ההתאמה נבדקת לפני הצעה: לפי התיעוד, סוג המערכת, הגישה המורשית והיקף השינוי. אין התחייבות מראש להחלפה חלקית או לשימור כל הציוד."}}, {"@type": "Question", "name": "מה מוסרים בבקשת בדיקת התאמה?", "acceptedAnswer": {"@type": "Answer", "text": "תיאור השינוי הרצוי, סוג המערכת ופרטי תיעוד זמינים. סיסמאות, מפתחות וקובצי אבטחה מוסרים רק בערוץ מוגן לאחר תיאום והרשאה."}}]}
```

Merge approved answers into the existing FAQPage and visible accordion together; do not create a second graph. No rich-result guarantee. Preserve current canonical and route. Proposed outgoing links: /knx-smart-home/, /smart-home-villa/ (new-build route), /structure-control/, /siemens-desigo-bms/, /projects/ and existing /articles/knx-ip-secure-remote-access-checklist/. Proposed incoming: use existing KNX Secure article/service connections if sufficient; add at most a contextual maintenance link from an existing KNX guide after checking overlap. Do not add a new block across all sales pages.

**CTA draft:** לתוספת למערכת I Feel או לבדיקת התאמה לפרויקט קיים — ספרו לנו מה צריך להשתנות. Destination /contactus/#project-enquiry. Reuse one tracking owner; #566 fallback tracks untagged contact transitions on this sales page. Do not add a second listener or count the click as a delivered lead.

Official sources checked 9 November 2026: Project export (updated 1 September 2026 13:52), https://support.knx.org/hc/en-us/articles/360020990259-Project-export ; Security (updated 27 August 2026 10:10), https://support.knx.org/hc/en-us/articles/360018505379-Security . Current MCP notice remains dated 3 November 2026 15:02 and is already covered in the live #572 update: https://support.knx.org/hc/en-us/articles/40411574251026-Registration-of-new-MCP-Apps-for-ETS-paused-until-further-notice . No new release is claimed today.

### Maya cycle — four unsent drafts, no recipient/queue/send created

1. **LinkedIn:** לפני שדרוג KNX, מתחילים במה שקיים: סוג הציוד, גיבוי ETS והרשאת גישה. אחרי בדיקת התאמה אפשר להגדיר שינוי מצומצם ולבדוק את הפונקציות שצריכות להמשיך לעבוד. טיוטה לקישור למדריך הקיים לאחר אישור.
2. **WhatsApp מקצועי:** לקוחות I Feel שמתכננים תוספת למערכת יכולים להתחיל מתיאור הצורך. במערכת של ספק אחר נבדוק תחילה התאמה ותיעוד. סיסמאות ומפתחות אינם חלק מטופס הפנייה הציבורי.
3. **מתכנני וילות:** בתכנון בית חדש, סיכום הבעלות על גיבוי ETS והרשאות שירות עוזר גם לשינויים עתידיים. כדאי להגדיר את המסירה לפני האכלוס, לצד תרחישים ובדיקות קבלה.
4. **צוותי BMS:** לפני שינוי בממשק KNX–Desigo, מסכמים מה נקרא, מה נכתב ומי מאשר פקודה. תיעוד הפרויקט ובדיקת משובים חשובים לא פחות מהוספת מסך חדש.

These drafts belong to the existing DOTS/Maya cycle only. They are not a claim Maya is operationally complete. No email, WhatsApp send, CRM item, scheduled path or new automation was created.

## Soro — new performance evidence, not lead attribution

Gmail search from trysoro.com after 7 November and the latest two messages in thread 1a1aeefdad7ddf58 show no new reply after Matt’s 7 November 09:24 UTC confirmation: RSS/test export is unavailable while the Blog Widget is connected. No disconnect, account change or outgoing message.

Fresh GSC web data through 7 November now contains four exact ?post URLs: BMS commercial 1 impression at average91; price 13 at13.08; KNX private home 6 at11.83; planning before building 9 at18.22. Total29 impressions,0 clicks in this requested scope. This supersedes earlier no-row evidence for earlier windows, and establishes reported search exposure for those exact URLs; it does not establish a complete index-coverage report, ranking stability or causality. GA4 landing_page_plus_query_string for ?post= on3–7 November still returns no rows; no parent-page sessions or delivered leads are assigned to Soro.

Vault: /i-feel Vault/05 Marketing/AI Marketing Manager.md fetched live, frontmatter Active, source updated25 October with 8 November temporary Meta exclusion. It keeps the qualified-lead goal and explicit action gates; no Meta dependency was introduced and no mail authority was inferred. No customer or private source content was copied into this report.

## Validation / publication gate

Full build/SEO:261 HTML pages,234 public index/search/sitemap records,460 JSON-LD blocks. 19 targeted tests pass, including both actual tracker handlers. Live sitemap audit result appended after completion. No file deletion or force push. PowerShell publisher unavailable on Linux; equivalent build/tests, branch, fresh-main, size/no-deletion and exact tested Git tree checks are required before authenticated fast-forward update of the existing draft. Main remains unchanged. After exact merge approval and successful deployment, run verify-live, then verify a controlled non-lead click in GA4 and separately validate a permitted real original-page-to-Monday lead match. No declaration of completed measurement from code alone.

Live verification 9 November06:31UTC:234 distinct sitemap URLs return200, each one H1, no detected meta noindex; primary live/source loc sets match, and none of old/shopengine-template/staff-expenses is listed. robots preserves exclusions for the named AI groups. robots/llms/agent-info return200. Googlebot/bingbot/OAI-SearchBot/ClaudeBot/PerplexityBot UA probes return200; these probes do not prove actual crawler ingestion or indexing. PSI returned429, so mobile performance and field CWV remain Unknown. AI answer citations and controlled competitor ranks were not measured today.

Public Soro embed lists7 articles, including9 November03:51:55UTC: [מערכת הצללה חכמה לבית שמתוכננת נכון](https://i-feel.co.il/architects-smart-home-planning/?post=smart-home-shading-system-planning). This is public widget listing evidence, not a static independent route or proof of indexing. Saved Calendar/Keywords were not inspected; GitHub does not reveal that queue. #591 static KNX pilot is still200 with one H1 and self-canonical, and #572 still serves ets-ai-mcp-update. Current main d8a93fc41c9a9116fb8c35f602e7811b3c0ce639 has a successful production run42455335379. No redeploy or re-merge of #572.

Follow-up raw checks: new Soro shading ?post URL returns200 with the parent architect title/canonical, so the known independent-representation concern remains; this does not negate the actual GSC impressions. GP9 VideoObject in /video/ still lacks uploadDate (parsed JSON-LD), while other video objects have dates. Authentic GP9 upload date remains Unknown; no date was invented.
