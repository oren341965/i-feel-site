---
name: verify-live
description: "בדיקת עשן מהירה של i-feel.co.il — סטטוסים, sitemap, טלפון, GA4/GSC, נכסי AS-MADE, מחרוזות אסורות וסנכרון בין origin/main לבין פריסת GitHub Actions האחרונה. השתמש אחרי Deploy production, שינוי DNS/שרת או דיווח תקלה. הסקיל קורא בלבד."
---

# Verify Live — בדיקת עשן ל-i-feel.co.il

הסקיל קורא בלבד ובודק שהאתר החי תואם את הריפו. לבדיקות תגים/HTML יש להשתמש ב-curl על HTML גולמי.

## quick

בדיקות חובה:

### תשתית
כל היעדים הבאים חייבים להחזיר 200/redirect תקין:
- `/`
- `/sitemap.xml`
- `/robots.txt`
- `/llms.txt`
- `/google4e1be352b6edf7cc.html`
- `/staff-expenses/`

### דף הבית
בדוק:
- `03-508-9553`
- GA4 `G-6MHSG7Z8DV`
- Ads `AW-18038181913`
- JSON-LD

### מחרוזות אסורות
אסור למצוא:
- `G-XXXXXXXXXX`
- `053-348`
- `TODO`, `PLACEHOLDER`, `lorem`
- `localhost`, `127.0.0.1`

### Sitemap
השווה sitemap חי ל-`public/sitemap.xml`. דפי `noindex` אינם חייבים להיכלל.

### סנכרון ריפו מול production
ה-`headSha` של ריצת deployment הירוקה האחרונה חייב להיות זהה ל-`origin/main`. אם לא, אין להכריז שהגרסה האחרונה עלתה.

### דפי מפתח
בדוק לפחות:
- `/smart-home/`
- `/structure-control/`
- `/smart-home-price/`
- `/structure-control/projects/`
- `/projects/private-homes/`

## AS-MADE — בדיקות חובה בכל quick

AS-MADE הוא כלי תפעולי קריטי ואינו תלוי באינדוקס Google. הדפים כוללים `noindex,follow` בכוונה.

בכל הרצת quick חובה לבדוק:
1. `https://i-feel.co.il/as-made/`
2. `https://i-feel.co.il/as-made/siemens-24/`
3. `https://i-feel.co.il/as-made/files/AS-MADE_siemens-24.xlsx`

תנאי הצלחה:
- שלושת היעדים מחזירים 2xx או redirect תקין.
- הדף הראשי מכיל `AS-MADE`.
- דף Siemens 24 מכיל `5WG1568-1AB81` או `N 568/81`.
- קובץ Excel זמין להורדה ואינו HTML של דף שגיאה.

אם אחד מהם נכשל, יש לדווח במפורש: `AS-MADE production verification failed` ולא לסווג זאת כבעיית SEO.

## verify-fix

כאשר נבדק תיקון ספציפי, משוך את ה-URL החי וחפש את הסמן הצפוי. אם ייתכן cache, נסה שוב לפני הכרזה על כישלון.

## full

בנוסף ל-quick, עבור על כל ה-URL-ים ב-sitemap החי וודא שהם תקינים. AS-MADE עדיין נבדק בנפרד גם אם אינו ב-sitemap.

## פורמט דוח

דוגמה:

```text
✅ תשתית תקינה
✅ דף הבית תקין
✅ Sitemap תואם
✅ סנכרון main↔production תקין
✅ דפי מפתח תקינים
✅ AS-MADE: main + Siemens 24 + Excel תקינים
```

אם יש כשל, ציין URL, סטטוס, השפעה והפעולה הנדרשת.

## אל תעשה

- אל תשנה שרת או ריפו מתוך הסקיל הזה.
- אל תשתמש באינדוקס Google כהוכחה שדף `noindex` קיים או חסר.
- אל תכריז על הצלחת deployment רק בגלל שדף הבית עובד.
- אל תעקוף כשל AS-MADE.
