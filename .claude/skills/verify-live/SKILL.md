---
name: verify-live
description: "בדיקת עשן מהירה של i-feel.co.il — סטטוסים, sitemap, טלפון, GA4/GSC, מחרוזות אסורות וסנכרון בין origin/main לבין פריסת GitHub Actions האחרונה. השתמש אחרי Deploy production, שינוי DNS/שרת או דיווח תקלה. הסקיל קורא בלבד."
---

> **בעלות ואחריות על האתר:** אורן הוא בעל האתר והמטפל היחיד ב־i-feel.co.il. לשייך לאורן בלבד כל משימת אתר — קוד, תוכן, SEO, Cloudflare, אחסון ופריסה.

# Verify Live — בדיקת עשן ל-i-feel.co.il

## מה הסקיל עושה

בודק שהאתר החי תקין ושמה שבאוויר תואם את הריפו. **קריאה בלבד** — שום שינוי בשרת,
בריפו או בקבצים. כל הבדיקות דרך `curl.exe` (HTML גולמי — לא WebFetch, שמסנן תגי script
ולכן מפספס GA4 ו-JSON-LD).

שני מצבים:
- **quick (ברירת מחדל)** — הבדיקות שלמטה, ~2 דקות.
- **full** — בנוסף עוברים על **כל** ה-URL-ים ב-sitemap החי ומוודאים שכולם מחזירים 200.
  להריץ כשאורן מבקש "בדיקה מלאה", אחרי שינוי גדול, או אם quick העלה חשד.

יש גם מצב **verify-fix**: אורן נותן URL + מה אמור להיות בו ("תבדוק שהתיקון עבד ב-X") —
מושכים את הדף ומחפשים את המחרוזת/התוכן הצפוי. מדווחים נמצא/לא נמצא + מזכירים שיש cache
(LiteSpeed) — אם לא נמצא, לנסות שוב אחרי דקה לפני שמכריזים על כישלון.

## הבדיקות (מצב quick)

הרץ את כולן; אסוף תוצאות ודווח בסוף. דוגמת שליפה:

```powershell
$h = curl.exe -sS 'https://i-feel.co.il/'            # תוכן
$code = curl.exe -s -o NUL -w "%{http_code}" 'https://i-feel.co.il/llms.txt'   # סטטוס בלבד
```

### 1. תשתית — כולם חייבים 200
- `https://i-feel.co.il/`
- `https://i-feel.co.il/sitemap.xml`
- `https://i-feel.co.il/robots.txt`
- `https://i-feel.co.il/llms.txt`
- `https://i-feel.co.il/google4e1be352b6edf7cc.html` — קובץ אימות GSC. **חי רק בשרת, לא בריפו.**
  אם הוא מחזיר 404 — האימות של Search Console נשבר; זו תקלה חמורה, לדווח מיד ובאדום.

### 2. דף הבית — בדיקות תוכן
על ה-HTML הגולמי של דף הבית:
- מכיל את הטלפון התקני `03-508-9553`.
- מכיל את תג ה-GA4 האמיתי `G-6MHSG7Z8DV`.
- מכיל את תג ה-Ads `AW-18038181913`.
- מכיל JSON-LD (`application/ld+json`).

### 3. מחרוזות אסורות — אסור שיופיעו בדף הבית או בדפים שנבדקים
- `G-XXXXXXXXXX` (placeholder של GA4 — כבר קרה שדלף לאוויר)
- `053-348` (טלפון ישן)
- `TODO`, `PLACEHOLDER`, `lorem`
- `localhost`, `127.0.0.1`

### 4. Sitemap — עקביות
- ה-sitemap החי זהה ל-`public/sitemap.xml` בריפו (`git -C C:\Users\USER\i-feel-site` — משוך
  את החי והשווה `Compare-Object` על רשימות ה-`<loc>`). הבדל = מישהו העלה בלי לעדכן ריפו,
  או להפך — לדווח.
- מתוך ה-sitemap, בדוק סטטוס 200 על מדגם: דף הבית + 5 הדפים עם ה-`lastmod` הכי חדש
  (אלה שהשתנו לאחרונה = הסיכוי הגבוה ביותר לשבירה). במצב full — את כולם.

### 5. סנכרון ריפו ↔ אוויר
```powershell
git -C C:\Users\USER\i-feel-site fetch origin
gh run list --repo oren341965/i-feel-site --workflow deploy.yml --branch main --status success --limit 1 --json databaseId,headSha,conclusion,updatedAt,url
git -C C:\Users\USER\i-feel-site rev-parse origin/main
```
- ה-`headSha` של הריצה הירוקה האחרונה חייב להיות זהה ל-`origin/main`.
- אם אינו זהה, יש commit ב-main שטרם נפרס או שפריסתו נכשלה/ממתינה ל-runner.
- דווח את run URL ואת שני ה-SHA-ים. אין לעבור להעלאה ידנית.

### 6. דפי מפתח (מדגם קבוע)
סטטוס 200 + הטלפון התקני בכל אחד:
- `/smart-home/` (מסלול פרטי)
- `/structure-control/` (מסלול BMS)
- `/smart-home-price/` (המרה)
- `/structure-control/projects/` (גלריית BMS — סטטית, נשברת בנפרד מה-build)
- `/projects/private-homes/` (גלריית בתים פרטיים — סטטית)

## פורמט הדוח

טבלה קצרה בסגנון:

```
✅ תשתית: 5/5 מחזירים 200
✅ דף הבית: טלפון + GA4 + Ads + Schema
✅ מחרוזות אסורות: נקי
✅ Sitemap: זהה לריפו, מדגם 6/6 תקין
⚠️ סנכרון: origin/main שונה מה-Deploy production הירוק האחרון
✅ דפי מפתח: 5/5
```

- הכל ירוק → שורה אחת: "האתר תקין, אין פערים בין הריפו לאוויר."
- יש ⚠️/❌ → מה נשבר, מה ההשפעה (במילים של אורן — "הדף לא נגיש בגוגל", לא "HTTP 404"),
  ומה הפעולה המתקנת (בדרך כלל: תיקון במקור + ‎/deploy-ifeel).
- כשל ברשת/timeout — נסה שוב פעם אחת לפני שמדווחים; ייתכן עומס רגעי בשרת.

## אל-תעשה

- אל תשנה שום דבר — לא בשרת, לא בריפו. הסקיל הזה מאבחן בלבד.
- אל תשתמש ב-WebFetch לבדיקות תגים/סקריפטים — הוא ממיר ל-markdown ומוחק אותם. רק curl.
- אל תכריז על תקלה על סמך בדיקה אחת אם ייתכן cache — אמת פעמיים בהפרש דקה.
- אל תריץ full על כל ~90 ה-URL-ים בלי סיבה — quick מספיק לשגרה.


## אזור העובדים (staff-expenses) — בדיקת PHP handler

אפליקציית PHP נפרדת שדורשת PHP >= 7.4. דיפלוי של האתר דורס את public_html/.htaccess ומסיר את בלוק ה-PHP handler של cPanel — ואז כל ה-PHP נופל לברירת המחדל של השרת (7.2) והפורטל נועל את עצמו ל-503. לבדוק בכל סבב:

- סטטוס: curl.exe -s -o NUL -w "%{http_code}" "https://i-feel.co.il/staff-expenses/" — חייב 200.
- - אם 503: curl.exe -sI "https://i-feel.co.il/staff-expenses/" — אם יש header בשם X-Ifeel-Portal-Status עם הערך php-version, זו בדיוק התקלה (רץ על PHP ישן מ-7.4).
 
  - תיקון מיידי: cPanel -> MultiPHP Manager -> לסמן i-feel.co.il -> PHP 8.3 (ea-php83) -> Apply.
  - תיקון קבוע (כבר בריפו): public/.htaccess מכיל בלוק handler עם AddHandler application/x-httpd-ea-php83 .php .php8 .phtml בתוך IfModule mime_module. אסור להסיר אותו — בלעדיו כל דיפלוי מפיל שוב את הפורטל. הערה: LiteSpeed מתעלם מ-handler ברמת תת-תיקייה, לכן הבלוק חייב להיות ב-docroot (public/.htaccess), לא רק ב-staff-expenses/.htaccess.
  - 
