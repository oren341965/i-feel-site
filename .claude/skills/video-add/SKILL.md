---
name: video-add
description: "שרשרת מלאה של הוספת סרטון הדרכה/תמיכה לאתר i-feel.co.il — מהעלאה ל-YouTube (@ifeelsmarthome) עם כותרת, תיאור והאשטאגים, ועד סיום ההטמעה באתר: כרטיס ב-/video/, סכמת VideoObject, הטמעה בדף-הנושא הרלוונטי (תמיכה טכנית / how-to), sitemap, build, אימות, commit+push ו-deploy. עובד לפי הרשימה ב-docs/video-plan.md. השתמש בסקיל בכל פעם שאורן: מבקש 'תעלה סרטון', 'סרטון הדרכה חדש', 'תוסיף וידאו לאתר', 'תעלה ליוטיוב ולאתר', 'סרטון תמיכה', 'תטפל בסרטון הבא ברשימה'; מספק קובץ וידאו או קישור YouTube של i-feel שצריך לשבץ; או שואל 'איזה סרטונים חסרים'. גם בלי המילה 'סקיל' — כל טיפול בסרטון שמיועד לאתר עובר דרך הסקיל הזה."
---

> **בעלות ואחריות על האתר:** אורן הוא בעל האתר והמטפל היחיד ב־i-feel.co.il. לשייך לאורן בלבד כל משימת אתר — קוד, תוכן, SEO, Cloudflare, אחסון ופריסה.

# הוספת סרטון וידאו ל-i-feel.co.il — שרשרת מלאה

מטרה: קלט = קובץ וידאו (או סרטון שכבר ב-YouTube) + נושא מהרשימה. פלט = סרטון ממותג בלוגו I FEEL בפתיחה ובסיום, חי ב-YouTube
ומוטמע בכל המקומות הנכונים באתר, מאומת ובאוויר. **מהיר, מסודר, בלי לשכוח שלב.**

עובדים מה-clone הקנוני בכל מחשב. בתחילת משימה יוצרים work branch חדש דרך
`scripts/workstations/new-work.ps1`; אין עבודה ישירה על `main`.

## מפת השטח — איפה סרטון "חי" באתר

סרטון הדרכה מלא נוכח ב-**עד 4 מקומות**, שכולם חייבים להישאר מסונכרנים:

1. **YouTube** — הערוץ הרשמי `@ifeelsmarthome`. מכאן מקבלים את ה-`VIDEO_ID`.
2. **דף הריכוז `/video/`** — כרטיס `<article>` עם `<iframe>` בקטגוריה הנכונה, בקובץ
   `src/page-html/page-20.html`. **וגם** אובייקט `VideoObject` בתוך מחרוזת ה-`jsonLd` ב-`src/pages/video.astro`.
3. **דף-הנושא הייעודי** (אם קיים/רלוונטי) — למשל `/smart-home-scheduling/`, `/switch-configurator/`:
   `<section id="video">` עם iframe בגוף ה-HTML + `VideoObject` ב-`jsonLd` של ה-`.astro`.
4. **`docs/video-plan.md`** — מעבירים את השורה מ"חסר" ל"בוצע" עם ה-ID.

מזהים שנגזרים מ-`VIDEO_ID` (בלי לצאת החוצה):
- embed: `https://www.youtube-nocookie.com/embed/VIDEO_ID`  ← תמיד nocookie
- watch: `https://www.youtube.com/watch?v=VIDEO_ID`
- thumbnail: `https://i.ytimg.com/vi/VIDEO_ID/hqdefault.jpg`

## שלב 0 — בחירת הנושא מהרשימה

פתח `docs/video-plan.md`. אם אורן לא ציין נושא — הצג לו את הסעיף "חסר" ושאל במה לטפל.
אל תמציא נושא שלא ברשימה בלי אישור. אם אורן רוצה להוסיף נושא חדש — הוסף שורה ל"חסר" קודם.

## שלב 0.5 — מיתוג חובה לקובץ וידאו גולמי

לפני הכנת המטא-דאטה וההעלאה, כל קובץ וידאו גולמי של I FEEL חייב לעבור מיתוג אחיד:

1. השתמש **רק** בלוגו הרשמי `public/assets/ifeel-logo.png`.
2. הרץ את הסקריפט הקנוני:
   ```powershell
   .\.claude\skills\video-add\scripts\brand-video.ps1 -InputFile "<raw-video.mp4>" -OutputFile "<ifeel-branded.mp4>"
   ```
   אם `ffmpeg` אינו זמין ב-PATH, העבר גם `-FfmpegPath "<full-path-to-ffmpeg.exe>"`.
3. הסקריפט מוסיף פתיח של 2.5 שניות וסיום של 3 שניות, עם רקע בהיר, לוגו ממורכז ו-fade עדין.
4. נשמרים כיוון הסרטון, הרזולוציה והקול. הסרטון הממותג יוצא כ-MP4 ‏(H.264/AAC) תואם YouTube.
5. הסקריפט חייב לסיים בהצלחה ולאמת: זרם וידאו, זרם שמע, גודל קובץ סביר ומשך מקור + כ-5.5 שניות.
6. צפה בפריים מהפתיחה ובפריים מהסיום לפני ההעלאה, וודא שהלוגו קריא ולא חתוך.

**אין להעלות את קובץ המקור הגולמי.** אם המיתוג או האימות נכשלו — עוצרים ומתקנים. סרטון שכבר פורסם בערוץ הרשמי אינו נערך מחדש אלא אם אורן ביקש זאת.

## שלב 1 — הכנת מטא-דאטה ל-YouTube

הכן בעברית, בסגנון הקיים בערוץ:
- **כותרת**: תיאורית + מותג. דוגמה: `כיצד לעשות תזמונים בבית חכם | i-feel`.
- **תיאור**: 2–4 שורות מה מלמדים, + שורת קישור לדף הרלוונטי באתר (`https://i-feel.co.il/…`),
  + קריאה להירשם לערוץ.
- **האשטאגים / תגיות**: 5–10, עברית ואנגלית מעורבב, מהמאגר של i-feel:
  `#בית_חכם #KNX #בקרת_מבנה #BMS #אוטומציה #ifeel #smarthome #HomeAssistant` — בחר את הרלוונטיים לנושא.
- **פורמט**: מדריכי how-to קצרים → אנכי 9:16 (כמו תזמונים/GlassWand). סקירות/פרויקטים → 16:9.

הצג את הטקסט לאורן לאישור לפני העלאה.

## שלב 2 — העלאה ל-YouTube

לאורן יש **אישור קבוע מתועד מ-2026-08-12** להעלות ולפרסם סרטוני I FEEL עתידיים ללא בקשת אישור חוזרת, כאשר:
- הערוץ המאומת הוא `@ifeelsmarthome` בלבד;
- הסרטון ממותג בלוגו I FEEL בפתיחה ובסיום;
- הכותרת, התיאור והתגיות מקצועיים, בעברית ובהתאם לנושא שסיפק אורן;
- הנראות היא `public`, אלא אם אורן ביקש אחרת.

YouTube Data API v3 מחובר לערוץ דרך OAuth מקומי. קובצי הלקוח וה-token נשמרים מחוץ לריפו,
והנתיבים שלהם מוגדרים ב-`.env.local`. ראה `docs/youtube-api-uploader.md`.

1. הרץ `npm run youtube:verify` ואמת שהתקבל הערוץ `UC7nVAqqWJiFhp-EshK2vmMA`.
2. הצג לאורן את המטא-דאטה בדוח המסירה; אין צורך לעצור לאישור נוסף כאשר תנאי האישור הקבוע מתקיימים.
3. צור metadata JSON מקומי והריץ:
   `npm run youtube:upload -- --file <video> --metadata <metadata.json> --approve-upload --approve-public`.
4. קח את `videoId` מהפלט והמשך להטמעה באתר.

אם קובצי OAuth חסרים או שהאימות נכשל, עצור ותקן את החיבור; אל תעבור לחשבון או לערוץ אחר.
שינוי ערוץ, מחיקת סרטון או פעולה מחוץ למסלול הרגיל דורשים אישור מפורש נפרד.

## שלב 3 — הטמעה בדף הריכוז `/video/`

**3א. כרטיס ב-`src/page-html/page-20.html`:** העתק `<article>` קיים מהקטגוריה הנכונה
(`#tutorials` לתמיכה/how-to, `#explanations`, `#audio`, `#projects`, `#bms`) והתאם:
- `src` של ה-iframe → `https://www.youtube-nocookie.com/embed/VIDEO_ID`
- `title` של ה-iframe → כותרת + `— i-feel`
- תגיות הצבע (`tag-private`/`tag-service`/`tag-knx`/`tag-bms`/`tag-business`) לפי הנושא
- כותרת `<h3>` וטקסט — אם יש דף-נושא, הפוך את הכותרת לקישור אליו
- how-to אנכי → עטוף במסגרת `max-w-[300px]` עם `aspect-ratio:9/16` (ראה כרטיס ה-BMS הקיים)
- אם מילאת כרטיס placeholder ("תוכן יתווסף") — החלף אותו, אל תוסיף כפול.

**3ב. סכמת VideoObject ב-`src/pages/video.astro`:** ה-`jsonLd` שם הוא **מחרוזת JSON מוברחת ידנית**
(עם `\n` ו-`\"`), לא `JSON.stringify`. הוסף אובייקט חדש ל-`@graph`, בדיוק בפורמט של הקיימים:

```json
{ "@type":"VideoObject", "@id":"https://i-feel.co.il/video/#v-SLUG",
  "name":"…", "description":"…", "uploadDate":"YYYY-MM-DD",
  "thumbnailUrl":"https://i.ytimg.com/vi/VIDEO_ID/hqdefault.jpg",
  "contentUrl":"https://www.youtube.com/watch?v=VIDEO_ID",
  "embedUrl":"https://www.youtube-nocookie.com/embed/VIDEO_ID",
  "inLanguage":"he-IL", "publisher":{ "@id":"https://i-feel.co.il/#business" } }
```

שמור על ההברחה (מרכאות → `\"`). בסוף ה-build ודא שה-JSON-LD בדף התקמפל תקין.

## שלב 4 — הטמעה בדף-הנושא (אם רלוונטי)

- **קיים דף-נושא** (`/smart-home-scheduling/`, `/switch-configurator/` וכו') → הוסף בגוף ה-HTML
  `<section id="video">` עם iframe (חקה את `smart-home-scheduling.html`), **וגם** `VideoObject`
  ב-`jsonLd` של ה-`.astro` (שם זה `JSON.stringify` רגיל — נקי יותר).
- **אין דף-נושא ורצוי אחד** (למשל "לחבר את האפליקציה") → הרץ **/new-page** לבניית הדף,
  ואז חזור לכאן להטמעה. אל תיצור דף בלי הסקיל הזה (sitemap ידני!).
- **לא צריך דף-נושא** (סקירה/פרויקט) → מספיק הכרטיס ב-/video/.

## שלב 5 — Build, אימות ו-sitemap

```powershell
cd C:\Users\salee\Documents\i-feel-site
npm run build
```

- `/video/` כבר ב-`public/sitemap.xml` — **אין צורך לעדכן** אלא אם נוצר דף-נושא חדש
  (אז /new-page מוסיף אותו ל-sitemap ידנית).
- ודא ב-`dist/`: הכרטיס מופיע ב-`video/index.html`, ה-iframe מצביע ל-`VIDEO_ID` הנכון,
  וה-JSON-LD תקין (הרם preview אם אפשר וּודא שהסרטון נטען).

## שלב 6 — עדכון הרשימה, commit ומסירה

1. ב-`docs/video-plan.md` — העבר את השורה מ"חסר" ל"בוצע" עם ה-`VIDEO_ID` ודף-הנושא.
2. פרסם work branch ו-Draft PR דרך `publish-work.ps1` עם commit ברור.
3. הרץ **/deploy-ifeel**. merge ל-`main` ופרסום חי דורשים אישור.
4. אחרי ש-GitHub Action ‏`Deploy production` ירוק — **/verify-live** לבדיקת עשן.
5. **בקשת אינדוקס ב-Google Search Console** (פעולה ידנית של אורן — צעד חשוב לתוצאה עשירה):
   בדיקת URL של `https://i-feel.co.il/video/` → "בקשת הוספה לאינדקס", כדי שה-VideoObject
   החדש ייקלט כ-video rich result (הסרטון יופיע בחיפושי גוגל, לא רק ביוטיוב). אם נוצר גם
   דף-נושא חדש (שלב 4) — בקש אינדוקס גם עבורו. תן לאורן את ה-URL/ים המדויקים להדבקה ב-GSC.
6. דווח לאורן: הנושא, ה-ID, איפה הוטמע, ותזכורת שסרטון חדש = חומר מצוין לפוסט ברשתות
   (סקיל `social-media-poster`; שליחת המייל לקרן — טיוטה בלבד).

## אל-תעשה

- אל תעלה קובץ וידאו גולמי: חובה להשתמש בפלט המאומת של `scripts/brand-video.ps1`, עם הלוגו הרשמי בפתיחה ובסיום.
- אל תחליף את הלוגו הרשמי בעיצוב מאולתר, ואל תמשיך אם בדיקת המיתוג נכשלה.
- השתמש רק בכלי API המוגן ובערוץ המאומת. האישור הקבוע מכסה העלאה ופרסום ציבורי רגילים; שינוי ערוץ, מחיקה או פעולה חריגה דורשים אישור מפורש.
- אל תשתמש ב-`youtube.com/embed` רגיל — תמיד `youtube-nocookie.com/embed` (פרטיות + קבוע באתר).
- אל תוסיף כרטיס ב-/video/ בלי VideoObject תואם ב-video.astro — ולהפך. שניהם ביחד.
- אל תשבור את מחרוזת ה-jsonLd המוברחת ב-video.astro (מרכאות `\"`, פסיקים בין אובייקטים).
- אל תמציא נושא/כותרת/תאריך. תאריך = תאריך העלאה אמיתי. נושא = מ-`video-plan.md`.
- אל תיצור דף-נושא ידנית — רק דרך /new-page (בגלל ה-sitemap).
- אל תשכח להעביר את השורה ל"בוצע" — אחרת נטפל באותו סרטון פעמיים.
