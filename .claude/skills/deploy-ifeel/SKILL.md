---
name: deploy-ifeel
description: "העלאת אתר i-feel.co.il לאוויר בצורה בטוחה — build, בדיקות קדם-העלאה, העלאת FTP כירורגית ואימות שהאתר חי ותקין. השתמש בסקיל הזה בכל פעם שאורן כותב: 'תעלה לאתר', 'תעלה את השינויים', 'דיפלוי', 'deploy', 'תעשה build ותעלה', 'FTP', 'תעלה לאוויר', 'תפרסם את הדף', 'תבדוק שהאתר באוויר', 'האם השינוי עלה', 'verify live', 'תעלה את ה-dist'. גם בסוף כל עבודה על קוד האתר כשמגיע שלב ההעלאה — אל תעלה קבצים לשרת בלי לעבור את הצ'קליסט של הסקיל הזה. אין לאתר דיפלוי אוטומטי (GitHub Actions חסום ע\"י השרת) — כל העלאה היא ידנית, ורק מהמחשב במשרד (FTP חסום מ-IP ביתי)."
---

> **בעלות ואחריות על האתר:** אורן הוא בעל האתר והמטפל היחיד ב־i-feel.co.il. לשייך לאורן בלבד כל משימת אתר — קוד, תוכן, SEO, Cloudflare, אחסון ופריסה.

# Deploy i-feel.co.il — build → בדיקות → FTP → אימות

## למה הסקיל הזה קיים

בעבר היו כמה תקלות דיפלוי: `dist/` לא מסונכרן עם מה שחי באוויר, קבצים הועלו לפני בדיקות,
ומספרי טלפון ישנים דלפו לאתר. הסקיל הזה קיים כדי שכל העלאה תעבור את אותו מסלול בדוק.
אל תדלג על שלבים גם אם ההעלאה נראית "קטנה" — רוב התקלות קרו דווקא בהעלאות קטנות.

## עובדות קבועות

| מה | ערך |
|----|-----|
| ריפו קנוני | GitHub `oren341965/i-feel-site` (branch `main`) — clone במשרד: `C:\Users\User\ifeel-site-work` (אומת 2026-07-15); clone בבית (salee): `C:\Users\salee\Documents\i-feel-site` |
| GitHub | `oren341965/i-feel-site` |
| Build | `npm run build` → פלט ב-`dist\` |
| שרת | JetServer (cPanel), host `185.56.74.12`, יעד `public_html/` |
| משתמש FTP | `ifeelco` |
| סיסמת FTP | שמורה ב-`%APPDATA%\FileZilla\recentservers.xml` (מקודדת base64 בתג `<Pass>`) |
| אתר חי | `https://i-feel.co.il/` |
| טלפון תקני | `03-508-9553` (בפורמט בינלאומי: `+972-3-508-9553`) |

**אזהרות:**
- **FTP עובד רק מהמחשב במשרד.** אומת 2026-07-15: חומת האש של JetServer חוסמת את פורטי הניהול (21/22/990/2083) מ-IP ביתי/סלולרי. מהמחשב הביתי (salee) עושים רק edit + build + git push; את ההעלאה עצמה מריצים מהמשרד אחרי `git pull`. אל תבזבז זמן על ניסיונות FTP מהבית.
- `D:\Claude\i-feel-site` הוא clone ישן ולא מסונכרן — **אסור לגעת בו**. עובדים רק על ה-clones שברשימה למעלה.
- `.github/workflows/deploy.yml` קיים אבל **לא עובד** (השרת חוסם IP של GitHub). אל תסמוך עליו ואל תגיד לאורן "זה יעלה לבד".
- לעולם אל תדפיס את סיסמת ה-FTP לצ'אט, ללוג או לקובץ.

## שלב 0 — בדיקות בטיחות בריפו

```powershell
cd C:\Users\USER\i-feel-site
git status
git branch --show-current
```

- אם יש שינויים לא-committed שאינם חלק מהעבודה הנוכחית — עצור ושאל את אורן מה הם.
- אם לא נמצאים על `main` — עצור. מיזוג ל-main קודם, דיפלוי אחר כך.
- `git pull origin main` לפני build, כדי לא לדרוס עבודה שנעשתה בסשן אחר.

## שלב 1 — Build

```powershell
npm run build
```

Build אדום = עוצרים. אין העלאה חלקית של build שנכשל, אף פעם.

## שלב 2 — בדיקות קדם-העלאה על dist\

הרץ את כולן לפני שנוגעים ב-FTP:

1. **Sitemap מול דפים**: כל `<loc>` ב-`dist\sitemap.xml` חייב להתאים לקובץ קיים ב-`dist\`
   (למשל `https://i-feel.co.il/smart-home/` → `dist\smart-home\index.html`). ולהפך — דף חדש
   שנוצר בעבודה הזו חייב להופיע ב-sitemap (ה-sitemap ידני! `public/sitemap.xml`).
2. **טלפונים**: חפש בקבצים ששונו את `03-508-9553`. מספרים אסורים שאסור שיופיעו: `053-348`,
   מספרים ישנים אחרים. `Grep` על dist של הדפים ששונו.
3. **קבצי תשתית קיימים ב-dist**: `sitemap.xml`, `robots.txt`, `llms.txt`, `.htaccess`, `CNAME`.
   שים לב: קובץ האימות של GSC (`google4e1be352b6edf7cc.html`) חי **רק בשרת** ולא בריפו —
   הוא לא אמור להופיע ב-dist, ואסור למחוק אותו מהשרת לעולם.
4. **קישורים פנימיים**: בדפים ששונו/נוצרו — ודא שכל `href` פנימי מצביע על נתיב שקיים ב-`dist\`.
5. **אין placeholders**: חפש `TODO`, `PLACEHOLDER`, `lorem`, `G-XXXXXXXXXX` בדפים ששונו.

נכשלה בדיקה → מתקנים במקור (`src/`), בונים מחדש, ובודקים שוב. לא מעלים "ונתקן אחר כך".

## שלב 3 — אילו קבצים מעלים

הדיפלוי הוא **כירורגי**: מעלים רק את מה שהשתנה, לא את כל `dist\`.

- קיים tag בשם `live` שמסמן את ה-commit האחרון שהועלה (הוקם 2026-07-03 עם העלאה מלאה):
  ```powershell
  git diff --name-only live HEAD
  ```
  תרגם כל קובץ מקור לפלט שלו: `src/pages/foo.astro` או `src/page-html/foo.html` → `dist\foo\index.html`;
  `public/X` → `dist\X`; שינוי ב-`BaseLayout.astro`/`Header.astro`/`Footer.astro`/`src/data/*` → **כל דפי ה-HTML השתנו** (העלאת כל דפי ה-HTML).
- אם ה-tag ‏`live` נעלם — אמור לאורן שאין נקודת ייחוס, והצע העלאה מלאה של `dist\` (בטוח יותר מניחוש).

הצג לאורן את רשימת הקבצים לפני ההעלאה.

## שלב 4 — העלאה ב-FTP (curl)

שליפת סיסמה בלי להדפיס אותה:

```powershell
[xml]$fz = Get-Content "$env:APPDATA\FileZilla\recentservers.xml"
$server = $fz.FileZilla3.RecentServers.Server | Where-Object { $_.User -eq 'ifeelco' } | Select-Object -First 1
$pass = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($server.Pass.'#text'))
```

העלאת כל קובץ (שמור על מבנה התיקיות של dist; לנתיבים בעברית קודד כל מקטע עם `[Uri]::EscapeDataString`):

```powershell
curl.exe -sS --user "ifeelco:$pass" -T "dist\<path>\index.html" "ftp://185.56.74.12/public_html/<path>/index.html" --ftp-create-dirs
```

כללים:
- **לעולם לא מוחקים קבצים בשרת.** אם צריך להסיר דף — 301 ב-`.htaccess`, לא מחיקה, ורק באישור אורן.
- קבצים רגישים שמעלים רק אם שונו בכוונה ובאישור: `.htaccess`, `api/lead.php` (endpoint של לידים ל-Monday!), `google4e1be352b6edf7cc.html`.
- העלאה נכשלת (timeout / 530) → נסה שוב פעם אחת; נכשל שוב → עצור ודווח, אל תמשיך חצי-דיפלוי בשקט.

## שלב 5 — אימות שהאתר חי ותקין

מיד אחרי ההעלאה, בדוק דרך `curl.exe` של ה-URL-ים החיים (לא WebFetch — הוא מוחק תגי script):

1. `https://i-feel.co.il/` — סטטוס 200, הדף נטען.
2. כל דף ששונה/נוצר — סטטוס 200 **וגם** שהתוכן החדש באמת שם (חפש מחרוזת ייחודית מהשינוי — כותרת חדשה, טלפון, קישור). זה מה שתופס העלאות שלא נקלטו.
3. `https://i-feel.co.il/sitemap.xml` — כולל את הדפים החדשים.
4. `https://i-feel.co.il/robots.txt` ו-`/llms.txt` — 200.
5. אם שונו redirects — בדוק שה-URL הישן מחזיר 301 ליעד הנכון.

יש cache בשרת (LiteSpeed) — אם רואים תוכן ישן, נסה שוב אחרי דקה לפני שמכריזים על תקלה.

## שלב 6 — סגירה

1. עדכן את נקודת הייחוס לדיפלוי הבא:
   ```powershell
   git tag -f live HEAD
   ```
2. דווח לאורן: מה הועלה (רשימת דפים), מה אומת, ומה נשאר לו — בעיקר:
   **דף חדש? → Google Search Console → URL Inspection → Request Indexing** עבור ה-URL המלא.
3. אם ההעלאה כללה שינוי מהותי — הצע commit + push ל-GitHub אם עוד לא נעשה, כדי שהריפו ישקף את מה שחי.

## אל-תעשה (סיכום)

- אל תעלה בלי build ירוק ובלי שלב 2 מלא.
- אל תדפיס סיסמה. אל תשמור אותה בקובץ.
- אל תמחק שום דבר ב-public_html.
- אל תעבוד על D:\Claude\i-feel-site.
- אל תבטיח "GitHub יעלה את זה" — אין דיפלוי אוטומטי.
