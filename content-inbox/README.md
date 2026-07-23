<div dir="rtl" align="right">

# 📥 תיקיית קליטת תכנים — content-inbox

התיקייה מיועדת לחומר חדש שמגיע מקרן, ממחשב הבית או ממחשב המשרד: טקסטים, מסמכים,
תמונות, קטלוגים וחומר שיווקי. שום דבר כאן אינו מתפרסם אוטומטית.

## העלאה ממחשב שמותקן עליו הריפו

1. פותחים משימה בענף חדש:

   ```powershell
   .\scripts\workstations\new-work.ps1 -Slug content-<short-topic>
   ```

2. יוצרים תיקייה חדשה: `content-inbox/<YYYY-MM>-<short-topic>/`.
3. מעתיקים אליה את החומר החדש בלבד.
4. מפרסמים Draft PR:

   ```powershell
   .\scripts\workstations\publish-work.ps1 `
     -CommitMessage "content: add <topic> source material" `
     -PrTitle "Content: <topic>"
   ```

אין לבצע push ישיר ל-`main`. מחשב המשרד ומחשב הבית משתמשים בענפים נפרדים.

## העלאה ישירות באתר GitHub

1. נכנסים לתיקייה הזו בגיטהאב ולוחצים **Add file ← Upload files**.
2. גוררים את הקבצים.
3. בוחרים **Create a new branch for this commit and start a pull request**.
4. לוחצים **Propose changes** ואז **Create pull request**.

אחרי אישור התוכן, אורן, Claude או Codex משלבים אותו באתר. GitHub מבצע build,
ורק merge מאושר ל-`main` מפעיל את פריסת השרת דרך ה-runner של מחשב המשרד.

## כללי שמות וקבצים

- שמות באנגלית בלבד, אותיות קטנות ומקפים במקום רווחים.
- לכל נושא תיקיית משנה משלו.
- תמונות: JPG/PNG/WebP, רצוי עד 500KB לתמונה.
- וידאו וקובצי עיצוב גדולים: Git LFS בלבד.

## מה אסור

- לא מוחקים ולא משנים חומר של משימה אחרת.
- לא נוגעים ב-`src`, `public`, `dist` או בקובצי שורש כאשר המשימה היא העלאת חומר בלבד.
- לא מבצעים commit ישיר ל-`main`.
- לא מעלים סיסמאות, tokens, קובצי `.env`, פרטי FTP או מידע אישי שאינו נחוץ.

</div>
