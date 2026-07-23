# i-feel-site — הנחיות ל-Claude

תחולה: הכללים במסמך זה חלים על הריפו `i-feel-site` ועל חומר שהמשתמש הגדיר במפורש כחומר
לאתר I Feel. אין להעלות לריפו הזה קבצים מפרויקטים אחרים, מסמכים פנימיים או חומר לקוחות
רק מפני שההנחיות מותקנות גם ברמת המשתמש.

אתר `i-feel.co.il` הוא אתר Astro סטטי. מקור האמת היחיד לקוד, לתוכן ולסקילים הוא GitHub:

- ריפו: `oren341965/i-feel-site`
- ענף ייצור: `main`
- סקילים משותפים: `.claude/skills/`

קרא ופעל גם לפי `AGENTS.md`; הוא מסמך מדיניות העבודה המשותף ל-Claude ול-ChatGPT/Codex.

## הכלל המרכזי

```text
מחשב בית / מחשב משרד
        ↓ work branch + Pull Request
      GitHub
        ↓ build + checks
      main
        ↓ GitHub Actions
Office self-hosted runner
        ↓ FTPS מישראל
JetServer
```

- מותר להעלות ענף עבודה ל-GitHub ולפתוח Draft PR דרך הסקריפט הבטוח.
- אסור לדחוף ישירות ל-`main`.
- אסור לבצע FTP/cPanel ידני מתוך Claude.
- רק merge מאושר ל-`main` מפעיל פריסה.
- הפריסה אינה מוחקת קבצים בשרת.

## נוהל Git חובה

בתחילת משימה חדשה:

```powershell
.\scripts\workstations\new-work.ps1 -Slug <short-english-slug>
```

הסקריפט יוצר ענף ייחודי למחשב מ-`origin/main`. אין להשתמש באותו ענף משני מחשבים.

לפני העלאה:

```powershell
.\scripts\workstations\publish-work.ps1 -CommitMessage "<message>" -PrTitle "<title>"
```

הסקריפט מריץ build ובדיקות, חוסם מחיקות לא מאושרות, מבצע commit, ‏rebase על `origin/main`, דוחף את ענף העבודה ופותח Draft PR.

לעולם:

- אין `git push --force`.
- אין push ישיר ל-`main`.
- אין הנחה ש-`pull` בתחילת העבודה לבדו מונע conflict.
- אין פריסה מעותק מקומי שלא עבר דרך GitHub.

## סקילים

`.claude/skills/` היא ספריית המקור הקנונית. סקריפט ההתקנה מעתיק אותה גם ל-`%USERPROFILE%\.codex\skills`, כך שאותם סקילים זמינים ל-Claude ול-Codex בשני המחשבים.

סקילים מרכזיים:

| סקיל | שימוש |
|---|---|
| `deploy-ifeel` | build, PR, המתנה ל-merge/Actions ואימות הפריסה |
| `verify-live` | בדיקת עשן קריאה בלבד |
| `new-page` | דף חדש כולל sitemap |
| `gallery-add` | תמונות ופרויקטים |
| `video-add` | סרטון והטמעה באתר |
| `content-inbox` | קליטת חומר דרך branch ו-PR |
| `private-home-case-study` | מקרה בוחן לבית פרטי |
| `daily-seo-crawl` | בדיקות SEO |
| `audit-bms-quotes` | ביקורת הצעות מחיר BMS |
| `mailing-list-collector` | איסוף רשימת דיוור לקריאה בלבד |
| `procurement-po-tracker` | מעקב רכש וחשבוניות |
| `autopilot-ifeel` | ריצה אוטונומית עם גבולות אישור |

## גבולות אישור

מותר אוטומטית:

- קריאה, עריכה, build ובדיקות.
- יצירת ענף עבודה.
- commit מקומי.
- העלאת ענף עבודה ופתיחת Draft PR דרך `publish-work.ps1`.

דורש אישור מפורש:

- merge ל-`main`.
- מחיקה מכל סוג.
- שינוי secrets, הרשאות GitHub או runner.
- שליחת הודעה, פרסום או פעולה כספית.

## עובדות אתר

- טלפון: `03-508-9553` / `+972-3-508-9553`.
- sitemap ידני: `public/sitemap.xml`.
- חומר חדש: `content-inbox/<YYYY-MM>-<slug>/`.
- אין לשמור סודות בריפו.
- `public/api/config.php` הוא קובץ שרת מקומי ואינו נפרס מ-Git.
