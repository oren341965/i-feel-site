# YouTube API uploader

העלאה אוטומטית לערוץ `@ifeelsmarthome` משתמשת ב־OAuth Desktop של פרויקט Google Cloud
`I Feel YouTube Automation`. הסודות נשמרים מקומית בלבד.

## הגדרה מקומית

הוסף ל־`.env.local` (הקובץ מוחרג מ־Git) נתיבים מוחלטים:

```dotenv
YOUTUBE_OAUTH_CLIENT_FILE=C:\path\to\client.json
YOUTUBE_OAUTH_TOKEN_FILE=C:\path\to\token.json
```

אימות חיבור בטוח, ללא העלאה:

```powershell
npm run youtube:verify
```

הכלי עוצר אם החשבון אינו הערוץ הרשמי `UC7nVAqqWJiFhp-EshK2vmMA`.

## העלאה

צור קובץ metadata לאחר אישור אורן:

```json
{
  "title": "כותרת | i-feel",
  "description": "תיאור מאושר",
  "tags": ["בית חכם", "KNX", "ifeel"],
  "privacyStatus": "private"
}
```

לאחר אישור מפורש של הקובץ, הכותרת, התיאור, התגיות והנראות:

```powershell
npm run youtube:upload -- --file C:\path\video.mp4 --metadata C:\path\metadata.json --approve-upload
```

`privacyStatus: "public"` דורש גם `--approve-public`. הכלי אינו מודיע למנויים בזמן ההעלאה.
הפלט כולל `videoId`, המשמש להטמעה ב־`/video/`, ב־VideoObject ובדף הנושא.
