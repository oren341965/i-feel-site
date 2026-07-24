# ChatGPT Project "I Feel" — הקמה ותחזוקה

תיקייה זו מרכזת את חומרי ה-**ChatGPT Project** בשם **I Feel**, כדי ש-ChatGPT יעבוד לפי אותו נוהל
כמו Claude ו-Codex. **GitHub הוא המקור הרשמי;** ChatGPT מחזיק עותק מותאם ומשתמש בו בכל שיחת I Feel.

## הקמה חד-פעמית

1. ב-ChatGPT: צור **Project** בשם **I Feel**.
2. פתח את הגדרות הפרויקט → **Instructions**, והדבק את כל התוכן של
   [`project-instructions.md`](project-instructions.md).
3. העלה כקובצי ידע (Files) לפרויקט:
   - `docs/chatgpt-project/company-and-site-facts.md` (עובדות חברה/אתר/סקילים)
   - `AGENTS.md` (נוהל העבודה המשותף — שורש הריפו)
   - `CLAUDE.md` (הנוהל המקביל — שורש הריפו)
4. הפעל **Memory** בהגדרות ChatGPT (העדפות/פרטים קבועים — אינו תחליף להוראות הפרויקט).
5. בצע את **כל** עבודות I Feel מתוך הפרויקט הזה, לא משיחה חדשה מחוץ אליו.

## תחזוקה (כשהנוהל מתעדכן ב-GitHub)

ChatGPT אינו מסנכרן אוטומטית מ-GitHub או ממחשב מקומי. לכן בכל עדכון נוהל:

1. עדכן קודם את המקור: `AGENTS.md` / `CLAUDE.md` / `.claude/skills/` (דרך ענף עבודה + PR).
2. עדכן בהתאם את `project-instructions.md` ו-`company-and-site-facts.md` בתיקייה זו (באותו PR).
3. אחרי merge — הדבק מחדש את `project-instructions.md` ל-Project Instructions ב-ChatGPT, והחלף את
   קובצי הידע שהועלו בגרסאות המעודכנות.

## מבנה שלושת המנועים

- **GitHub `oren341965/i-feel-site`** — המקור הרשמי לנוהל, לקוד ולסקילים.
- **Claude ו-Codex** — טוענים את הנוהל והסקילים למחשב דרך `scripts/workstations/install-agent-config.ps1`.
- **ChatGPT Project "I Feel"** — מחזיק עותק מותאם של הנוהל (התיקייה הזו) ומשתמש בו בכל שיחה.
