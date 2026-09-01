---
name: deploy-ifeel
description: "פריסת i-feel.co.il במסלול הבטוח והיחיד: work branch → build ובדיקות → Draft PR → merge מאושר ל-main → GitHub Actions → office self-hosted runner → FTPS ל-JetServer → verify-live. השתמש בכל בקשת העלאה, deploy, פרסום דף, build-and-publish או בדיקה אם שינוי עלה. אין לבצע FTP/cPanel ידני מתוך Claude או Codex."
---

# Deploy i-feel — GitHub הוא שער הפריסה היחיד

## עיקרון

```text
Work branch → Pull Request → checks → approved merge → GitHub artifact
→ office runner → FTPS → live verification
```

- שני המחשבים מעלים רק ל-GitHub.
- אין דחיפה ישירה ל-`main`.
- אין FTP, SFTP או cPanel ידני מתוך הסוכן.
- רק artifact שנבנה ונבדק ב-GitHub נשלח לשרת.
- הפריסה אינה מוחקת קבצים בשרת.

## שלב 1 — worktree

חובה לוודא origin=`oren341965/i-feel-site`, לעבוד בענף `work/`, ללא detached HEAD וללא שינויים לא מוסברים. אם נמצאים על `main`, פותחים ענף עבודה חדש.

## שלב 2 — build ובדיקות

הרץ `npm run build`. Build אדום עוצר פריסה.

בדוק גם:
- `public/sitemap.xml` כולל דפים חדשים שאמורים להיות מאונדקסים.
- דפי `noindex` אינם חייבים להופיע ב-sitemap.
- אין TODO/placeholder/טלפון ישן.
- נכסים וקבצים להורדה קיימים.
- אין secrets או credentials בשינויים.

### AS-MADE הוא נכס פריסה קריטי

בכל שינוי הקשור ל-AS-MADE חובה לוודא לפני merge:
- `public/as-made/index.html` קיים.
- `public/as-made/siemens-24/index.html` קיים.
- `public/as-made/files/AS-MADE_siemens-24.xlsx` קיים.
- לאחר build אותם פריטים קיימים תחת `dist/as-made/`.
- `noindex,follow` ב-AS-MADE הוא מכוון, ולכן אין להשתמש באינדוקס Google כהוכחה שהדף עלה.

## שלב 3 — PR

פרסם את ענף העבודה ופתח Draft PR. המתן ל-`Validate site`. אין לעקוף check ואין merge ל-main ללא אישור מפורש.

## שלב 4 — deployment

לאחר merge:
- GitHub בונה שוב את commit של `main`.
- נוצר artifact `site-dist-<SHA>`.
- runner עם label `ifeel-deploy` מוריד אותו.
- `scripts/deploy/ftps-upload.mjs` מעלה את `dist` לשרת.
- `scripts/deploy/verify-live.ps1` מריץ בדיקת עשן.

אם runner offline, הפריסה נשארת בתור. אין לעבור להעלאה ידנית.

## שלב 5 — אימות חי

אחרי `Deploy production` ירוק:
1. הרץ `verify-live`.
2. בדוק את ה-URL-ים ששונו, לא רק את דף הבית.
3. עבור AS-MADE, שלושת היעדים הבאים הם בדיקות חובה בכל deployment:
   - `https://i-feel.co.il/as-made/`
   - `https://i-feel.co.il/as-made/siemens-24/`
   - `https://i-feel.co.il/as-made/files/AS-MADE_siemens-24.xlsx`
4. אין להכריז שה-AS-MADE עלה עד ששלושתם מחזירים 2xx/3xx תקין והדף הראשי מכיל את הכותרת `AS-MADE`.
5. דווח commit SHA וקישור Action/PR.

## תקלות

- check נכשל → מתקנים באותו ענף/PR.
- runner offline → מחזירים את runner; אין FTP ידני.
- FTPS נכשל → בודקים secrets/חיבור בלי לחשוף סיסמה.
- verify-live נכשל → לא מכריזים על הצלחה; מתעדים URL וסטטוס ומתקנים דרך PR חדש.
- AS-MADE חסר למרות deployment ירוק → זה כשל deployment/verification, לא בעיית SEO או אינדוקס.

## גבולות

- אין להדפיס secrets.
- אין למחוק קבצים בשרת.
- אין force push.
- אין merge ל-main בלי אישור.
- אין להבטיח שהאתר עלה לפני ש-Action הפריסה ו-verify-live ירוקים.

## PHP staff-expenses

`public/staff-expenses` דורש PHP >= 7.4. מקור האמת ל-handler הוא `public/.htaccess`. לפני ואחרי build יש לוודא שה-handler נשמר, ולאחר פריסה `verify-live` חייב לוודא ש-`/staff-expenses/` מחזיר 200 ולא 503.
