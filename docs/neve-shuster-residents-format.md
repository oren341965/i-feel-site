# שכונת הפרדס — נתוני דיירים פרטיים

`public/neve-shuster/residents.txt` הוא קובץ שרת פרטי ואסור לשמור אותו ב-Git.
הקובץ מוגן גם באמצעות `.htaccess` ומוחרג באמצעות `.gitignore` מקומי.

שורה המכילה כתובת דוא״ל בלבד ממשיכה לעבוד:

```text
resident@example.com
```

למילוי אוטומטי של טופס ההצעה ניתן להשתמש בשדות מופרדים בקו אנכי:

```text
email|building|apartment|apartment_type|name|phone|proposal_url
```

- `building`: מספר מ־1 עד 5. גם A–E ישנים מנורמלים אוטומטית ל־1–5.
- `apartment`: מספר הדירה.
- `apartment_type`: טיפוס הדירה, אם ידוע.
- `name` ו־`phone`: אופציונליים; כשהם קיימים הדייר אינו מתבקש להזינם שוב.
- `proposal_url`: קישור HTTPS תחת `i-feel.co.il` או נתיב תחת `/neve-shuster/assets/`.

אין לכלול בקובץ סיסמאות, קודי OTP, מסמכי זהות או מידע שאינו נחוץ להתאמת ההצעה.
