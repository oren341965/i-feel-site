---
name: new-page
description: "יצירת דף חדש באתר i-feel.co.il לפי הצ'קליסט המלא: בדיקה שאין דף קיים שמכסה את הנושא (strengthen-don't-duplicate), גוף HTML בעברית RTL, עטיפת Astro עם schema מלא, קישורים פנימיים מדפי-אב, עדכון sitemap ידני (חובה — בלעדיו גוגל לא מגלה את הדף!), build ואימות, ומסירת URL מוכן לבקשת אינדוקס ב-GSC. השתמש בסקיל בכל פעם שאורן מבקש: 'תבנה דף חדש', 'דף נחיתה', 'עמוד חדש לאתר', 'תוסיף עמוד על X', 'תיצור דף ל...', 'new page', 'landing page', או כשמגיע תוכן חדש (מגיטלי/קרן/content-inbox) שצריך להפוך לעמוד באתר. גם כשנראה שצריך דף חדש אבל אולי עדיף לחזק דף קיים — הסקיל הזה מכריע."
---

# דף חדש ב-i-feel.co.il — מהרעיון עד URL מוכן לאינדוקס

## ארכיטקטורת האתר (חובה להבין לפני שנוגעים)

האתר הוא Astro סטטי ב-`C:\Users\USER\i-feel-site`. כל דף מורכב משני קבצים:

1. **גוף התוכן** — `src/page-html/<slug>.html`: HTML גולמי בעברית, RTL, מעוצב ב-Tailwind
   (נטען מ-CDN בזמן ריצה), פונט Heebo.
2. **עטיפת Astro** — `src/pages/<slug>.astro`: מייבאת את ה-HTML עם `?raw` ועוטפת ב-`BaseLayout`
   עם כל ה-meta וה-schema.

ה-`BaseLayout` כבר מספק: `lang="he" dir="rtl"`, Header/Footer, favicon, גופן, GA4/Ads tag,
ו-JSON-LD בסיסי של העסק. הדף רק מוסיף meta ייעודי ו-JSON-LD משלו.

## שלב 1 — האם בכלל צריך דף חדש? (חוק strengthen-don't-duplicate)

לפני יצירה, חפש בנושא בדפים הקיימים:

```
Grep על src/pages/ ו-src/page-html/ עם מילות המפתח של הנושא
```

- אם יש דף שכבר מכסה את הנושא → **המלץ לחזק אותו** במקום ליצור חדש. דף כפול מפצל את
  הדירוג ופוגע ב-SEO. אמור זאת לאורן במפורש.
- דף חדש מוצדק רק כשהוא **דף שער נבדל** (distinct gate page) — נושא/כוונת-חיפוש שאין
  לה עמוד, או פרויקט/מקרה-בוחן חדש.
- **בדוק גם את הזיכרון, לא רק את הקוד**: קרא את קבצי הזיכרון של פרויקטי ה-SEO (בעיקר
  project_ifeel_seo_moneypages) לפני שקובעים title/H1. ייתכן שעמוד קיים כבר **מדורג** על
  הביטוי המבוקש והוחלט בעבר לא לבנות לו מתחרה — במקרה כזה הדף החדש חייב למקד ביטוי
  נבדל ב-title/H1 ולהשאיר את ביטוי-הראש לעמוד המדורג. (קרה ב-2026-07-03 עם "שדרוג בית
  חכם" — נתפס ותוקן, אבל רק כי הזיכרון נקרא בזמן.)
- אל תנפח דפים עשירים קיימים בתוכן גנרי — שכבת ההוכחה (פרויקטים עם נתונים אמיתיים)
  שווה יותר מעוד טקסט.

## שלב 2 — Slug

- אנגלית, kebab-case: `smart-home-scheduling`, `bms-hospitals`. ה-URL הסופי: `https://i-feel.co.il/<slug>/`.
- הימנע מ-slug בעברית (גרמו בעבר לבעיות 404 בגוגל Ads). קיימים היסטורית אבל לא יוצרים חדשים.
- דפי פרויקט BMS יושבים תחת `src/pages/structure-control/` (או `structure-control/projects/`).

## שלב 3 — גוף התוכן (`src/page-html/<slug>.html`)

פתח דף קיים דומה כתבנית — למשל `src/page-html/smart-home-planning.html` לדף מדריך,
או דף פרויקט מ-structure-control לדף מקרה-בוחן — והתאם את המבנה. כללי תוכן:

- עברית, RTL. כותרת H1 אחת עם מילת המפתח הראשית.
- **טלפון תקני בלבד**: `03-508-9553`. אסור להשתמש במספרים אחרים.
- CTA ברור (טופס יצירת קשר / `tel:` / קישור ל-`/contactus/` / WhatsApp של מאיה — ראה דפוס בדפים קיימים).
- **טענות אמון מאושרות בלבד** (אישר אורן): "מאז 2008", "9,000+ לקוחות", "180+ פרויקטי BMS",
  "אלפי דירות". שום מספר אחר בלי אישור מפורש.
- תמונות: מ-`public/assets/` (נתיב `/assets/...`), עם `alt` בעברית. `loading="lazy"` לתמונות מתחת לקפל.

## שלב 4 — עטיפת Astro (`src/pages/<slug>.astro`)

העתק את המבנה מ-`src/pages/smart-home-planning.astro` — זה הפורמט הקנוני:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import content from '../page-html/<slug>.html?raw';

const meta = {
  title: "<כותרת עם מילת מפתח> | i-feel",
  description: "<עד ~155 תווים, כולל הטלפון 03-508-9553>",
  canonical: "https://i-feel.co.il/<slug>/",
  ogTitle: "...", ogDescription: "...",
  ogUrl: "https://i-feel.co.il/<slug>/",
  ogImage: "https://i-feel.co.il/assets/og-cover.jpg",
  jsonLd: JSON.stringify({ "@context": "https://schema.org", "@graph": [ /* ראה למטה */ ] })
};
---
<BaseLayout {...meta}>
  <Fragment set:html={content} />
</BaseLayout>
```

ה-`@graph` תמיד כולל:
1. **LocalBusiness** עם `"@id": "https://i-feel.co.il/#business"` (העתק מדף קיים — כתובת אימבר 14 פתח תקווה, טלפון `+972-3-508-9553`).
2. **BreadcrumbList** — דף הבית → דף-האב (למשל `/smart-home/` או `/structure-control/`) → הדף החדש.
3. לפי סוג הדף: **Service** (דף שירות), **FAQPage** (אם יש שאלות-תשובות בגוף — חובה שהטקסט
   ב-schema יהיה זהה לטקסט בדף), **Article** (מאמר), **VideoObject** (אם יש וידאו — עם `uploadDate` אמיתי, לא placeholder).

## שלב 5 — קישורים פנימיים (בלי זה הדף יתום)

- הוסף קישור לדף החדש **מלפחות 2 דפים רלוונטיים**, בגוף התוכן (`src/page-html/` של אותם דפים) —
  קישור בגוף שווה יותר מקישור בתפריט.
- דפי-אב טיפוסיים: `/smart-home/` (פרטי, קובץ `page-16.html`), `/structure-control/` (BMS, קובץ `page-18.html`),
  `/contractor-customer-care/` (יזמים, קובץ `page-08.html`), `/smart-home-planning/`, `/projects/`.
- שים לב: אם דף מקשר מכיל FAQPage schema בגוף (למשל `page-16.html`) והוספת שאלה ל-FAQ —
  עדכן גם את ה-JSON-LD שבסוף הקובץ, הטקסטים חייבים להיות זהים.
- ודא אחרי build שהקישורים **מופיעים ויזואלית בגוף הדף החי** — לא רק ב-HTML נסתר.
- תפריט (Header) ופוטר — רק אם אורן ביקש במפורש; לא כל דף נכנס לניווט.

## שלב 6 — Sitemap (ידני! השלב שהכי קל לשכוח)

`public/sitemap.xml` מתוחזק **ביד** — אין יצירה אוטומטית. בלי שורה כאן, גוגל לא יגלה את הדף. הוסף:

```xml
<url>
  <loc>https://i-feel.co.il/<slug>/</loc>
  <lastmod>YYYY-MM-DD</lastmod>
  <changefreq>monthly</changefreq>
  <priority>0.8</priority>
</url>
```

(priority: ‎0.8 לדף שירות/שער, ‎0.7 לדף פרויקט/מאמר.)

בנוסף: עדכן `lastmod` לדפים שקיבלו קישור נכנס. `public/llms.txt` — הוסף שורה ב-Key Pages.
אם הדף מחליף URL ישן — הוסף 301 ב-`public/.htaccess` מה-slug הישן לחדש.

## שלב 7 — Build ואימות

```powershell
cd C:\Users\USER\i-feel-site
npm run build
```

בדוק ב-`dist\`:
- `dist\<slug>\index.html` נוצר, מכיל את התוכן, `dir="rtl"`.
- ה-JSON-LD מתפרסר (חלץ את בלוקי ה-script ובדוק ConvertFrom-Json).
- כל הקישורים הפנימיים בדף מצביעים על נתיבים שקיימים ב-`dist\`.
- הדפים שקיבלו קישור אל הדף החדש — נבנו מחדש והקישור בפנים.

אם אפשר — הרם preview (`npm run dev`) ובדוק ויזואלית: מובייל, RTL, תמונות נטענות.

## שלב 8 — מסירה

1. Commit + push ל-`main` (או branch אם העבודה גדולה). הערה: commit message עם מרכאות
   כפולות בעברית שובר here-string ב-PowerShell 5.1 — השתמש בכמה דגלי `-m` פשוטים.
2. אמור לאורן להריץ **/deploy-ifeel** (או הרץ אותו אם אורן כבר אישר להעלות).
3. אחרי שהדף חי — תן לאורן את השורה המוכנה:
   > Google Search Console → URL Inspection → `https://i-feel.co.il/<slug>/` → Request Indexing
4. הזכר שהדף החדש הוא מועמד לפוסט ברשתות (יש pipeline ב-`D:\Claude\ifeel-social\`) — רק אם רלוונטי.

## אל-תעשה (סיכום)

- אל תיצור דף כשאפשר לחזק דף קיים — קודם בודקים (כולל בזיכרון!), אחר כך יוצרים.
- אל תתחרה ב-title/H1 על ביטוי שעמוד קיים כבר מדורג עליו.
- אל תשכח את ה-sitemap — זו הטעות החוזרת מספר 1.
- אל תשתמש בטלפון שאינו 03-508-9553 ובטענות מספריות לא מאושרות.
- אל תשאיר את הדף יתום — מינימום 2 קישורים פנימיים נכנסים.
- אל תמציא `uploadDate` או נתוני schema — רק ערכים אמיתיים.
