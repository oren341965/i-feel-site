# i-feel-site — הנחיות ל-ChatGPT / Codex

תחולה: הכללים במסמך זה חלים על הריפו `i-feel-site` ועל חומר שהמשתמש הגדיר במפורש כחומר
לאתר I Feel. אין להעלות לריפו הזה קבצים מפרויקטים אחרים, מסמכים פנימיים או חומר לקוחות
רק מפני שההנחיות מותקנות גם ברמת המשתמש.

אתר `i-feel.co.il` הוא אתר Astro סטטי. מקור האמת היחיד לקוד, לתוכן ולסקילים הוא:

- GitHub: `oren341965/i-feel-site`
- ענף ייצור: `main`
- סקילים משותפים: `.claude/skills/`

## ארכיטקטורת העבודה

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

- אין העלאה ישירה ל-JetServer מ-Claude, מ-Codex או מאחד ממחשבי העריכה.
- שני המחשבים רשאים להעלות קוד וחומר לענפי עבודה ב-GitHub.
- רק merge מאושר ל-`main` מפעיל את מסלול הפריסה.
- אין מחיקות בשרת כחלק מהפריסה. קבצים חדשים/מעודכנים מועלים; קבצים ישנים נשארים עד אישור מחיקה נפרד.

## נוהל Git חובה

לעולם לא עובדים ישירות על `main`, ולעולם לא משתמשים באותו ענף משני מחשבים.

בתחילת משימה חדשה:

```powershell
.\scripts\workstations\new-work.ps1 -Slug <short-english-slug>
```

הסקריפט דורש worktree נקי, מבצע `git fetch origin`, ויוצר ענף חדש מ-`origin/main` בשם הכולל את שם המחשב.

לפני העלאה ל-GitHub:

1. הרץ build ובדיקות.
2. בצע commit בענף העבודה.
3. בצע `git fetch origin` ו-`git rebase origin/main`.
4. פתור conflicts בלי force push.
5. דחוף רק את ענף העבודה ופתח Pull Request.

המסלול המועדף:

```powershell
.\scripts\workstations\publish-work.ps1 -CommitMessage "<message>" -PrTitle "<title>"
```

הסקריפט חוסם:

- עבודה על `main` או `master`;
- force push;
- קבצים מעל מגבלת GitHub;
- מחיקות, אלא אם המשתמש אישר מחיקה במפורש;
- push כאשר build או בדיקות נכשלו.

`git push` ישיר הוא חריג. השתמש בסקריפט הבטוח.

## רמות אישור

### מותר לבצע אוטומטית

- קריאה, מחקר, עריכת קבצים ובדיקות מקומיות.
- יצירת ענף עבודה חדש.
- build, lint ובדיקות.
- commit מקומי.
- העלאת ענף עבודה ל-GitHub ופתיחת Draft PR דרך `publish-work.ps1`.
- הוספת חומר חדש ל-`content-inbox/` בענף עבודה.

### דורש אישור מפורש

- merge ל-`main`.
- מחיקת קובץ מהריפו או מהשרת.
- שינוי secrets, הרשאות GitHub, branch protection או הגדרת runner.
- שליחת מייל/הודעה, פרסום ברשת או פעולה כספית.

## חומר שמגיע משני המחשבים

- חומר גולמי חדש נכנס ל-`content-inbox/<YYYY-MM>-<slug>/`.
- מוסיפים בלבד; לא משנים או מוחקים חומר של משימה אחרת.
- שמות קבצים באנגלית, אותיות קטנות ומקפים במקום רווחים.
- סרטונים וקובצי עיצוב גדולים מנוהלים ב-Git LFS.
- אין להכניס סיסמאות, tokens, קובצי `.env`, פרטי FTP או מידע אישי שאינו נחוץ.

## סקילים משותפים

- `.claude/skills/` היא ספריית המקור הקנונית לשני המנועים.
- Claude קורא אותה ישירות מתוך הריפו.
- סקריפט `scripts/workstations/install-agent-config.ps1` מתקין עותקים מנוהלים אל:
  - `%USERPROFILE%\.claude\skills`
  - `%USERPROFILE%\.codex\skills`
- עדכון סקיל מתבצע רק בריפו, ב-PR. אין לערוך את העותקים המותקנים.
- הסנכרון אינו מוחק סקילים אישיים אחרים; לפני החלפת סקיל מנוהל הוא יוצר גיבוי.

## כללי אתר

- טלפון תקני: `03-508-9553` (`+972-3-508-9553`).
- `public/sitemap.xml` ידני; דף חדש חייב להתווסף אליו.
- קבצים רגישים כגון `public/api/lead.php`, `public/.htaccess` וקובצי אימות דורשים כוונה מפורשת.
- אין לשנות `public/api/config.php`; הוא מקומי לשרת ואינו נשמר ב-Git.
- אחרי merge ופריסה יש להריץ את `verify-live`.
