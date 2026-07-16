# i-feel-site — הנחיות ל-Claude

אתר **i-feel.co.il** — סטטי, נבנה ב-Astro, מתארח ב-JetServer (cPanel, LiteSpeed).

## עובדות מפתח

- **ריפו קנוני:** GitHub `oren341965/i-feel-site`, branch `main`. שני clones פעילים:
  - מחשב משרד: `C:\Users\USER\i-feel-site` (משם מריצים דיפלוי FTP)
  - מחשב בית (salee): `C:\Users\salee\Documents\i-feel-site` (עריכה + build + push בלבד — FTP חסום מ-IP ביתי)
- **תמיד `git pull origin main` לפני תחילת עבודה** — שני מחשבים דוחפים לאותו ריפו.
- **אין דיפלוי אוטומטי.** GitHub Actions חסום ע"י השרת. כל העלאה ידנית דרך הסקיל `deploy-ifeel`.
- טלפון תקני באתר: `03-508-9553`. ה-sitemap ידני (`public/sitemap.xml`) — דף חדש חייב להתווסף אליו ידנית.

## סקילים (בתיקייה `.claude/skills/`)

| סקיל | מתי |
|------|-----|
| `deploy-ifeel` | כל העלאה לשרת — build, בדיקות, FTP כירורגי, אימות. אל תעלה בלעדיו. |
| `verify-live` | בדיקת עשן של האתר החי (קריאה בלבד) — אחרי כל דיפלוי או כשמשהו חשוד. |
| `new-page` | יצירת דף חדש באתר (כולל עדכון sitemap ידני!) |
| `gallery-add` | הוספת תמונות/פרויקטים לגלריות |
| `video-add` | סרטון הדרכה/תמיכה — מ-YouTube ועד הטמעה מלאה באתר (עובד לפי `docs/video-plan.md`) |
| `content-inbox` | טיפול בתוכן שקרן מעלה דרך PR |
| `daily-seo-crawl` | סריקת SEO יומית וקידום ל-#1 |

**הסקילים בריפו הם המקור הקנוני.** עדכון סקיל = עריכה כאן, commit, push — והמחשב השני מקבל ב-pull. לא לערוך עותקים מקומיים מחוץ לריפו.

## מסמכי עבודה

- `docs/handoff/` — מסמכי מסירה בין המחשבים, כולל משימות פתוחות.
- `docs/` — מסמכי החלטות (כולל redesign עמוד הבית).
