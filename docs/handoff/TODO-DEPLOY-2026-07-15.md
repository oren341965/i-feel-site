# ⏳ להעלאה מהמשרד (2026-07-16): קומיט 93e2ab6 + 525e2c8

## מה מחכה באוויר (2 קומיטים שטרם עלו מעבר לתג live)

תג `live` נמצא על `1dfe1fc`. מאז נוספו:
1. **`93e2ab6`** — פס 8 לוגואי לקוחות (מונוכרום) בדף הבית + תיקון המשפט האנגלי ב-llms.txt.
2. **`525e2c8`** — תיקון ניסוח הדסה: "הדסה נתיבות" (מוסד רפואי) במקום "בית חולים הדסה"/"מגדל אשפוז", ב-11 קבצים. **החלטת אורן 2026-07-16.**

> ⚠️ אל תערוך את הדסה מחדש — התיקון כבר נעשה בבית ונדחף (525e2c8). רק למשוך ולהעלות.

## איך להעלות (מהמחשב במשרד)

```powershell
cd C:\Users\User\ifeel-site-work
git pull origin main          # מביא 93e2ab6 + 525e2c8
npm run build                 # 129 דפים, ירוק
```

**המלצה: העלאה מלאה additive של `dist\` שוב** (כמו ב-15/7, 425 קבצים) — הכי בטוח, תופס את שני הקומיטים בלי לנחש מיפוי page-html→dist. שום דבר לא נמחק בשרת.
לחלופין, מי שרוצה כירורגי: `git diff --name-only live HEAD` ותרגם לפי הסקיל.

## אימות חי (curl, לא WebFetch)

- `https://i-feel.co.il/llms.txt` — מכיל "הדסה נתיבות", **לא** "מגדל אשפוז".
- `https://i-feel.co.il/hadassah-knx-system/` — כותרת "מערכת KNX בהדסה נתיבות", אין "בית חולים הדסה".
- `https://i-feel.co.il/` — כרטיסיית "מערכת KNX בהדסה נתיבות" + פס 8 לוגואים.
- `https://i-feel.co.il/bms-hospitals/` — הקישור אומר "הדסה נתיבות".
- בדיקת שלילה: `curl ... | grep "בית חולים הדסה\|מגדל אשפוז"` → אמור להיות ריק בכל הדפים.

## סגירה

```powershell
git tag -f live HEAD
git push origin live --force
```

## נשאר לאורן (GSC)

בקשת אינדוקס ב-Google Search Console → URL Inspection → Request Indexing עבור: `/start/`, `/help/`, 18 דפי `/structure-control/<slug>/`, ו-`/hadassah-knx-system/` (השתנה).
