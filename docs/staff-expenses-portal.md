# אזור עובדי I Feel לדיווח הוצאות

## כתובת

`https://i-feel.co.il/staff-expenses/`

העמוד אינו מקושר מתפריטי האתר ואינו נוסף ל-sitemap.

## כניסה והרשאות

- מסך הכניסה מבקש כתובת דוא״ל ארגונית בלבד.
- מתקבלות רק כתובות שמסתיימות בדיוק ב-`@i-feel.co.il`.
- לאחר הזנת הכתובת נשלח אליה קוד חד-פעמי בן 6 ספרות. הזנת כתובת בלבד אינה פותחת את הדוח.
- הקוד תקף ל-10 דקות ולשימוש אחד בלבד, עם הגבלה של 5 ניסיונות אימות.
- כל כתובת חברה מאומתת מקבלת הרשאת עובד למילוי דיווחים בלבד.
- `oren@i-feel.co.il` מקבלת כברירת מחדל הרשאת מנהל לצפייה בכל הדיווחים, הורדת מסמכים, שינוי סטטוס וייצוא CSV.

## מה כלול

- דיווח רכב ונסיעות בארץ: דלק, טיפול, תיקון, חניה, אגרות, ביטוח, רישוי, שטיפה, השכרה, מוניות ותחבורה.
- דיווח נסיעה לחו״ל: נוסע, תפקיד, מטרה, יעד, תאריכים, ימי עבודה, PNR ופירוט שורות עבור טיסות, מלון, אוכל, רכב שכור, תחבורה, חניה, תקשורת, ביטוח/אשרה, כנס והוצאות אחרות.
- דיווח הוצאה כללית.
- העלאת עד 20 מסמכים בדיווח, עד 12MB לקובץ ועד 60MB בסך הכול.

## אבטחה

- כל תוכן ודף הורדה דורשים session מאומת לאחר אימות קוד שנשלח לתיבת דוא״ל של החברה.
- קבצים נשמרים כברירת מחדל ב-`/home/ifeelco/private_expenses`, מחוץ ל-`public_html`.
- הקבצים מקבלים שמות אקראיים ומוגשים רק כ-attachment לאחר בדיקת הרשאת מנהל.
- הגבלת ניסיונות כניסה ל-5 ניסיונות בכל 15 דקות לכתובת IP.
- CSRF, cookies מסוג HttpOnly ו-SameSite, מניעת cache, noindex, CSP, חסימת iframe ובדיקת MIME לקבצים.
- יומן ביקורת שומר פעולות מרכזיות ו-hash של כתובת הדוא״ל וכתובת ה-IP, לא את הערכים הגולמיים.

## הגדרות שרת אופציונליות

הפורטל טוען את `public_html/api/config.php` הקיים, אם נמצא. אפשר להגדיר בו:

```php
define('EXPENSE_PORTAL_STORAGE_PATH', '/home/ifeelco/private_expenses');
define('EXPENSE_PORTAL_EMAIL_DOMAIN', 'i-feel.co.il');
define('EXPENSE_PORTAL_FROM_EMAIL', 'no-reply@i-feel.co.il');
define('EXPENSE_PORTAL_ADMIN_EMAILS', [
    'oren@i-feel.co.il',
]);
define('EXPENSE_PORTAL_SMTP_HOST', 'smtp.example.com');
define('EXPENSE_PORTAL_SMTP_PORT', 587);
define('EXPENSE_PORTAL_SMTP_SECURITY', 'tls'); // tls, ssl or none
define('EXPENSE_PORTAL_SMTP_USERNAME', 'no-reply@i-feel.co.il');
define('EXPENSE_PORTAL_SMTP_PASSWORD', 'server-only-secret');
```

מומלץ להגדיר SMTP מאומת. הסיסמה נשמרת רק ב-`public_html/api/config.php` שעל השרת ואינה נכנסת ל-Git. אם `EXPENSE_PORTAL_SMTP_HOST` אינו מוגדר, המערכת חוזרת ל-`mail()` לצורך תאימות. יש לכלול את תיקיית `private_expenses` בגיבוי האחסון.

## פריסה

הפריסה עוברת רק במסלול המשותף:

1. work branch ו-Draft PR דרך `scripts/workstations/publish-work.ps1`.
2. check ירוק בשם `Validate site`.
3. merge מאושר ל-`main`.
4. GitHub Actions מעביר את `dist` המאומת ל-runner של מחשב המשרד.
5. `Deploy production` מעלה ב-FTPS ללא מחיקות ומריץ verify-live.
6. לאחר הפריסה מזינים כתובת `@i-feel.co.il`, מוודאים שקוד מתקבל ושכתובת חיצונית נדחית.
7. מוודאים שהעלאת מסמך שומרת אותו מחוץ ל-`public_html` ושהורדה דורשת חשבון מנהל.

אין לבצע העלאה ידנית של `staff-expenses` מהמחשב.
