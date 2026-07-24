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

## שלב 1 — בדיקת worktree

```powershell
git status
git branch --show-current
git remote get-url origin
```

חובה:

- origin הוא `oren341965/i-feel-site`;
- הענף מתחיל ב-`work/`;
- אין detached HEAD;
- אין שינויים לא מוסברים ממשימה אחרת.

אם נמצאים על `main`, אין לערוך או לפרסם. מתחילים משימה חדשה:

```powershell
.\scripts\workstations\new-work.ps1 -Slug <short-slug>
```

## שלב 2 — build ובדיקות

```powershell
npm run build
```

Build אדום עוצר את הפריסה. אין העלאה חלקית ואין עקיפה.

בדוק גם:

- `public/sitemap.xml` כולל דפים חדשים;
- אין `TODO`, placeholder או מספר טלפון ישן;
- נכסי התמונות קיימים;
- `public/api/config.php` לא נוסף ל-Git;
- אין secrets או credentials בשינויים.

## שלב 3 — פרסום ענף ו-Draft PR

```powershell
.\scripts\workstations\publish-work.ps1 `
  -CommitMessage "<message>" `
  -PrTitle "<title>"
```

הסקריפט חוסם main, force push, מחיקות לא מאושרות וקבצים גדולים שאינם ב-LFS;
מריץ build, מבצע commit ו-rebase על `origin/main`, דוחף את ענף העבודה ופותח Draft PR.

העלאת ענף העבודה מותרת. merge ל-`main` דורש אישור מפורש.

## שלב 4 — GitHub

ב-PR:

1. המתן ל-check בשם `Validate site`.
2. אם נכשל — בדוק את Actions ותקן בענף. אין לעקוף check.
3. הצג לאורן סיכום קבצים, תוצאת build וסיכון.
4. עצור לפני merge וקבל אישור.

לאחר merge:

- GitHub בונה שוב את ה-commit של `main`;
- נוצר artifact בשם `site-dist-<SHA>`;
- runner במחשב המשרד עם label ‏`ifeel-deploy` מוריד אותו;
- `scripts/deploy/ftps-upload.mjs` מעלה נכסים לפני HTML בחיבור FTPS רציף;
- אין מחיקות מרחוק;
- `scripts/deploy/verify-live.ps1` מריץ בדיקת עשן.

אם runner המשרד offline, העבודה נשארת בתור. אין לעבור לפריסה ידנית.

## שלב 5 — אימות

אחרי ש-`Deploy production` ירוק:

1. הרץ את הסקיל `verify-live`.
2. בדוק את ה-URL-ים ששונו, לא רק את דף הבית.
3. ודא שכל נכסי `/_astro/` שהדפים מפנים אליהם מחזירים 200.
4. דווח את commit SHA ואת קישור ה-Action/PR.

## תקלות

- check נכשל → מתקנים בענף ומעדכנים את אותו PR.
- conflict → `git fetch origin` ואז `git rebase origin/main`; לעולם לא force push.
- runner offline → מחזירים את השירות במחשב המשרד; לא מעלים ידנית.
- FTPS נכשל → בודקים secrets, GeoIP וחיבור runner; לא חושפים סיסמה.
- verify-live נכשל → עוצרים, מתעדים את ה-URL והסטטוס, ומכינים תיקון חדש דרך PR.

## גבולות

- אין להדפיס secrets.
- אין לשנות GitHub secrets או runner בלי אישור.
- אין למחוק קבצים בשרת.
- אין `git push --force`.
- אין merge ל-`main` בלי אישור.
- אין להבטיח שהאתר עלה לפני ש-Action הפריסה ו-verify-live ירוקים.
