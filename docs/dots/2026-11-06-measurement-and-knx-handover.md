# DOTS — 6 November 2026

Status: measurement PR #566 refreshed; content below is an unsent editorial draft, not a public site change. No new landing page, sales title rewrite, email or Soro setting change.

## Business measurement first

Fresh Windsor account/field/options discovery completed. GSC canonical https://i-feel.co.il/, web, all countries/devices; latest finalized row 3 November, fetched 6 November 06:29 UTC. Compare 7 October–3 November with 9 September–6 October, 28 days each. GA4 property 440660138, stream 8141821132, hostname i-feel.co.il; normalize only final slash on landing paths. Organic Search and AI Assistant sessions remain separate.

| Page | Clicks current/prior | Impressions current/prior | CTR current/prior | Position current/prior | Organic landing current/prior | AI current/prior |
|---|---:|---:|---:|---:|---:|---:|
| smart-home-villa | 1/0 | 95/70 | 1.05%/0% | 6.21/7.33 | 1/0 | 0/0 |
| knx-smart-home | 11/15 | 433/531 | 2.54%/2.82% | 4.37/5.30 | 9/15 | 2/2 |
| smart-home-system-upgrade | 1/0 | 20/42 | 5%/0% | 15.80/10.45 | 1/0 | 0/0 |
| structure-control | 3/0 | 881/800 | 0.34%/0% | 33.53/31.73 | 10/3 | 3/1 |
| bms-retrofit | 0/0 | 24/15 | 0%/0% | 50.71/10.73 | 0/0 | 0/0 |

Totals: 16/15 clicks, 1,453/1,458 impressions, CTR 1.10%/1.03%, 21/18 organic landing sessions, 5/3 AI sessions. Zeros mean no recorded row/events, not proof that no real visit or enquiry occurred. Position is a GSC average, not a fixed Google Israel rank. Query rows are privacy-filtered and not a complete decomposition of page totals.

KNX query opportunity: "knx" 58 impressions, zero clicks, position 5.57; "מערכת knx" 10, zero, 6.30; "בית חכם knx" 46, one, 1.20. The villa page's overall 6.21 average must not be interpreted as that position for villa buyer terms: visible "תכנון בית חכם" has three impressions at 51.67. Inference: preserve the strong KNX sales page and first make its contact journey observable. Do not infer content causality from these small samples.

Observed current events: KNX WhatsApp 6 and phone 2; BMS phone 1; villa form_start 1. contactus generate_lead 4, form_start 4, phone 8, WhatsApp 18. None is a verified original-landing-page-to-Monday lead match. Full CTA coverage remains Unknown. #566 adds only the missing internal-contact fallback, deduplicating existing tagged links; no new form listener.

## Publication and technical evidence

#572 merge da58392c642d1012c8682efe702780bd7a491460 deployed successfully in run 41981272695. A later successful production run 42094180555 matches current main 78f2ddc2828cef949e89905a5f51aa2d62dbdeca. Live raw HTML plus rendered browser check on 6 November confirms the ets-ai-mcp-update section, one knx_ets_ai_review CTA, 12 FAQ entries, modified date 5 November, KNX sales-page backlink and contact form anchor. Three referenced /_astro assets return 200.

Full live sitemap check: primary 216 URLs, secondary 16, four shared, 228 distinct; all return 200, exactly one H1, no detected meta noindex, valid JSON-LD. Primary loc set matches source. Auxiliary robots/llms/agent-info/GSC verification/staff portal return 200. Googlebot, bingbot, OAI-SearchBot, ClaudeBot and PerplexityBot user-agent probes return 200; this does not prove real crawler access or indexing. Search Console index coverage, controlled AI-answer citations, competitor ranks and field Core Web Vitals remain Unknown. The sitemap total changed since yesterday because current main changed; no deletion was made in this run.

## Soro — distinguish vendor statements, publication and attribution

Gmail thread 1a1aeefdad7ddf58 contains actual replies from Matt on 6 November, most recently 06:06 UTC. He says Brand DNA changes affect future content, existing schedules need manual review, and Soro has no built-in lead attribution. His estimates are not measured results. No reply yet to Oren's final consolidated brief at 06:27 UTC as of this check. No messages sent.

The live public Soro embed and browser listing identify four published entries, with vendor publication timestamps:

| Date | Title | Public link |
|---|---|---|
| 6 Nov | בקרת תאורה DALI למשרדים עם שליטה מדויקת | https://i-feel.co.il/architects-smart-home-planning/?post=dali-lighting-control-for-offices |
| 5 Nov | מערכת KNX לבית פרטי שמתוכננת נכון לשנים קדימה | https://i-feel.co.il/architects-smart-home-planning/?post=knx-system-for-private-home |
| 4 Nov | כמה עולה בית חכם? כך בונים תקציב נכון לפרויקט | https://i-feel.co.il/architects-smart-home-planning/?post=kama-oleh-bait-hacham |
| 3 Nov | תכנון בית חכם לפני בנייה שמונע שינויים יקרים | https://i-feel.co.il/architects-smart-home-planning/?post=tichnun-bayit-chacham-lifnei-bniya |

Public listing is evidence of publication, not indexing, rankings or leads. Latest final GSC day predates three of these entries. Query-parameter routing requires separate attribution/indexability inspection before counting the parent architect page's traffic as Soro. Never attribute ordinary article traffic to Soro without exact URL evidence. Current Soro-attributed delivered leads: Unknown, not zero. Vault search found historical Knowledge/Completed references but no verified current Active document; no customer facts were drawn from them.

Follow-up inspection: all four exact ?post URLs return HTTP 200, but raw HTML gives the parent architect-page title and canonical and lacks each article's own slug/content. In the rendered KNX post, the article body and BlogPosting do load, while canonical still points to the parent and two H1s remain (parent plus article). This is a confirmed implementation discrepancy, not proof of Google's selected canonical or deindexing. Recommendation: plan one independently crawlable canonical representation per article, reconcile existing topic overlap, and verify both raw and rendered output before any approved change. Do not simply rewrite the parent canonical for every query parameter or add these URLs to the sitemap blindly.

Exact ?post GSC rows through 3 November and GA4 landing_page_plus_query_string rows for 3–5 November returned no rows. These are absence of recorded results in those requested scopes, not proof of zero readers, no indexing or no future value. No Soro-attributed lead was inferred.

Validation: full build/SEO gates passed (255 HTML, 228 indexable/search/sitemap records, 459 JSON-LD blocks); 18 targeted attribution/conversion/search tests passed, including the new five-page trailing-slash regression. Diff check clean; no deletions. PowerShell publisher is unavailable on this Linux host; equivalent fresh-base, build/test, size/no-deletion and exact local/remote Git tree checks precede authenticated fast-forward update of the existing Draft PR. This does not merge main or deploy.

## KNX editorial package — draft only, supports villa and KNX sales pages

Target an existing planning guide (/articles/smart-home-planning-before-building/) after content review, not a new competing page. Preserve its current SEO title/meta unless separate approval selects the proposed alternatives. No unverified project case study.

Proposed SEO title: תכנון KNX לווילה: מה בודקים לפני המסירה | I Feel

Proposed meta: מתכננים KNX לווילה? הגדירו מראש תרחישים, בדיקות מסירה, גיבוי ETS והרשאות שירות. כך הופכים מפרט לבית שקל להפעיל ולתחזק, משלב התכנון ועד האכלוס.

### H2: מסירת KNX מתחילה כבר בתכנון הווילה

בית חכם צריך להיות נוח גם ביום שאחרי האכלוס. לפני שמסיימים את מפרט החשמל, כדאי להגדיר לא רק אילו מעגלים יהיו חכמים, אלא גם איך בודקים שהבית עובד כפי שתוכנן. רשימת המסירה צריכה לחבר בין שם החדר, הלחצן, מעגל התאורה, התריס והמיזוג, ולתאר את התוצאה שהדייר מצפה לקבל.

### H3: בודקים תרחיש שלם, ולא רק שכל לחצן מגיב

בתרחיש יציאה, למשל, מתעדים אילו אורות נכבים, אילו תריסים זזים ומה קורה למיזוג. בודקים גם כיצד חוזרים לשליטה ידנית, ומה אמור לקרות לאחר הפסקת חשמל או אובדן חיבור לרשת. אלה בדיקות שמגדירים לפי הציוד והפרויקט, ולא הבטחה שכל מערכת ממשיכה לפעול באותה צורה בכל כשל. עבודות חשמל ובדיקות שמשפיעות על מערכת פעילה מבוצעות בידי בעלי המקצוע המורשים ובחלון מתואם.

### H3: קובץ ETS, גרסה והרשאות הם חלק מהמסירה

ETS6 מאפשר לייצא פרויקט לקובץ knxproj. קובץ כזה צריך להתאים לגרסת ETS שבה פותחים אותו: לפי KNX, ייבוא אפשרי באותה גרסת major/minor או בגרסה חדשה יותר, ולא בגרסת minor ישנה יותר. לכן כדאי לתעד לצד הגיבוי את גרסת סביבת העבודה ולוודא שניתן לפתוח את הקובץ בסביבת בדיקה מורשית.

בפרויקט KNX Secure נדרשת סיסמת פרויקט. ניתן לשמור גם גיבוי keyring בהתאם לתצורה ולהרשאות; הוא אינו מחליף את פרויקט ETS. את הקובץ ואת פרטי הגישה מוסרים לבעל ההרשאה בערוץ מתאים, ולא בטופס ציבורי. מסירת קובץ אינה לבדה הוכחה שכל תרחיש נבדק, ושם המוצר Secure אינו הוכחה שההגנה הופעלה בפרויקט.

### H3: מתאמים מראש מי נותן שירות

סיכום המסירה צריך לזהות איש קשר לשירות, היקף אחריות ותהליך אישור לשינויים. כאשר KNX מחובר ל-BMS או ל-Siemens Desigo, מגדירים גם מי רשאי לקרוא ולשנות כל נקודה ואיך מאמתים משוב. זו המלצת עבודה של I Feel, ולא דרישה חדשה שהוכרזה בתקן.

### FAQ — same text for visible FAQ and JSON-LD

1. **האם גיבוי ETS מחליף בדיקות מסירה?** לא. גיבוי שומר את פרויקט ההנדסה; בדיקות מסירה בודקות שהתפקוד בפועל מתאים לתרחישים ולמפרט שסוכמו.
2. **איזה קובץ מקבלים מגיבוי ETS6?** ייצוא הפרויקט יוצר קובץ knxproj. מתעדים את גרסת ETS, את תאריך הגיבוי ואת ההרשאות הדרושות לפתיחה.
3. **מה מיוחד במסירת KNX Secure?** יש לתאם שמירה מוגנת של פרויקט ETS, סיסמת הפרויקט ומידע האבטחה הרלוונטי, לפי בעלות והרשאות. אין לפרסם מפתחות או סיסמאות בטופס פנייה.

```json
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"האם גיבוי ETS מחליף בדיקות מסירה?","acceptedAnswer":{"@type":"Answer","text":"לא. גיבוי שומר את פרויקט ההנדסה; בדיקות מסירה בודקות שהתפקוד בפועל מתאים לתרחישים ולמפרט שסוכמו."}},{"@type":"Question","name":"איזה קובץ מקבלים מגיבוי ETS6?","acceptedAnswer":{"@type":"Answer","text":"ייצוא הפרויקט יוצר קובץ knxproj. מתעדים את גרסת ETS, את תאריך הגיבוי ואת ההרשאות הדרושות לפתיחה."}},{"@type":"Question","name":"מה מיוחד במסירת KNX Secure?","acceptedAnswer":{"@type":"Answer","text":"יש לתאם שמירה מוגנת של פרויקט ETS, סיסמת הפרויקט ומידע האבטחה הרלוונטי, לפי בעלות והרשאות. אין לפרסם מפתחות או סיסמאות בטופס פנייה."}}]}
```

Merge these entries into the target page's existing FAQ graph when implemented; do not emit a duplicate FAQPage. Preserve canonical. No claim of guaranteed rich results.

Internal links out: /smart-home-villa/ (בית חכם לווילה), /knx-smart-home/ (תכנון KNX), /structure-control/ (BMS), /siemens-desigo-bms/ (Desigo), /projects/private-homes/ (פרויקטים אמיתיים). Proposed incoming links only if absent: villa planning section and KNX integrator section, using descriptive anchors; don't add another repetitive promotion block.

CTA draft: **מתכננים וילה? נגדיר יחד את המערכת ואת בדיקות המסירה.** Link /contactus/#project-enquiry. Use the existing tracking owner; do not add a second listener. Intended KPI: attributable contact transitions and CRM-confirmed villa enquiries, not number of new FAQ entries. Measurement acceptance: controlled non-lead click produces exactly one cta_click, existing phone/WhatsApp events remain separate; then verify GA4 ingestion and permitted real enquiry attribution. Stop before publication if attribution, existing FAQ merging or exact approval remains unresolved.

Sources checked 6 November 2026 (no new release claimed): KNX Project export, updated 1 September 2026 13:52, https://support.knx.org/hc/en-us/articles/360020990259-Project-export ; KNX Security, updated 27 August 2026 10:10, https://support.knx.org/hc/en-us/articles/360018505379-Security . Commissioning workflow and CTA are I Feel editorial recommendations, not manufacturer requirements.

### Maya professional cycle — four unsent drafts

1. **LinkedIn:** בתכנון KNX לווילה כדאי להגדיר גם את יום המסירה: אילו תרחישים נבדקים, מי שומר את גיבוי ETS ואיך מאשרים שינוי בעתיד. לחצן שמגיב הוא רק חלק מהבדיקה; חשוב שהבית יתנהג לפי התכנון. טיוטה לקישור למדריך הקיים לאחר אישור.
2. **WhatsApp מקצועי:** בפרויקט KNX חדש, האם מפרט המסירה כולל תרחישים, משובים וגיבוי ETS שניתן לפתוח? כדאי לסכם זאת לפני סגירת התכנון. אם יש וילה על הפרק, אפשר לעבור יחד על התוכניות ועל בדיקות הקבלה.
3. **לאדריכלים:** תכנון נקודות ומתגים הוא התחלה. במסירת וילה נרצה שגם אורח או בן משפחה יוכל להפעיל את הבית בצורה ברורה, עם תרחישים עקביים והדרכה קצרה. אפשר להגדיר את חוויית השימוש כבר בשלב התוכניות.
4. **לצוותי BMS:** בחיבור KNX ל-Desigo כדאי למסור יחד מפת נקודות, כיווני פקודה ומשוב, הרשאות וגיבוי. נוהל המסירה צריך לזהות מי אחראי לכל שכבה. התאמה למוצר ולפרויקט נבדקת בנפרד.

These remain in the existing DOTS/Maya draft cycle; no queue, recipient list, message, CRM item or separate automation was created.
