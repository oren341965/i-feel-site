# בריף מסירה ל-Claude Code (המחשב עם קוד המקור)
> **ארכיון היסטורי בלבד.** ההוראות במסמך זה הוחלפו על-ידי `docs/agent-workflow.md`.
> אין ליצור ריפו חדש, לפרוס ל-Netlify או לבצע push ישיר ל-`main` לפי המסמך הישן.

> הדבק את כל מה שמתחת לקו ל-Claude Code על המחשב השני.

---

# משימה: העלאת אתר i-feel ל-GitHub, החלת 9 עדכונים, בנייה ופרסום ל-Netlify

אתה Claude Code על המחשב שבו נמצא קוד המקור של אתר i-feel.co.il. בצע את המשימה הבאה מקצה לקצה, ושאל אותי (המשתמש) רק כשצריך אישור או פרט חסר.

## הקשר טכני
- במחשב הזה יש פרויקט **Astro** של אתר i-feel.co.il, ככל הנראה בנתיב `C:\Users\<USER>\ifeel-BMS projects\ifeel-astro\`. אם לא שם — חפש תיקייה שמכילה `astro.config.mjs` ו-`package.json` עם תלות ב-`astro`.
- האתר החי מתארח על **Netlify** (פרויקט `silly-khapse-df4e92`, דומיין `www.i-feel.co.il`), כרגע בשיטת **Netlify Drop** ידנית. DNS ב-Cloudflare.
- מבנה: components משותפים (`Header.astro`, `Footer.astro`, `ContactForm.astro`), `src/data/site.ts`, `src/pages/*.astro`, `public/_redirects`.

## נתונים מאושרים (סגורים)
- מספרים: **9,000 לקוחות / 4,000 פרויקטים** — מאושר ע"י אורן.
- **WhatsApp שירות:** 053-348-1342 → `https://wa.me/972533481342`
- **WhatsApp מאיה (שיווקי):** `https://wa.me/972533450205?text=שלום%20מאיה,%20אני%20רוצה%20לקבל%20ייעוץ%20בנושא%20בית%20חכם%20או%20בקרת%20מבנה`

---

## שלב 1 — העלאה ל-GitHub
1. אתר את תיקיית הפרויקט. ודא `.gitignore` כולל `node_modules/` ו-`dist/`.
2. צור repo פרטי בשם `i-feel-site` ודחוף:
   ```bash
   git init && git add . && git commit -m "i-feel Astro site — initial"
   git branch -M main
   gh repo create i-feel-site --private --source=. --push
   ```
   (אם אין `gh` — הנחה את המשתמש דרך GitHub Desktop: Add local repository → Publish.)
3. דווח למשתמש את כתובת ה-repo.

## שלב 2 — החל את 9 העדכונים

**1. הסר "אל תמלא" (honeypot) — `src/components/ContactForm.astro`**
החלף את שדה ה-bot-field כך שלא יוצג ולא ייכנס לטקסט הסרוק:
```html
<p hidden aria-hidden="true" style="display:none"><label>Leave this field empty: <input name="bot-field" tabindex="-1" autocomplete="off" /></label></p>
```
ודא `data-netlify-honeypot="bot-field"` על ה-form. חפש בכל הפרויקט "אל תמלא" ומחק. אימות: `grep -r "אל תמלא" dist/` = 0.

**2. WhatsApp — `src/components/Header.astro` + `Footer.astro`**
הדר/פוטר גלובלי + עמודים שיווקיים → "WhatsApp של מאיה" עם `wa.me/972533450205?text=...`.
עמודי שירות בלבד → "WhatsApp שירות" עם `wa.me/972533481342`.
מימוש מומלץ: prop `waMode` (ברירת מחדל "maya"; בעמודי שירות "service").

**3+4. ניסוח אחיד "משנת 2006" — `src/data/site.ts`**
```ts
export const company = {
  foundedYear: 2006,
  blurb: "I Feel פועלת משנת 2006 ומתמחה בתכנון, התקנה ושירות למערכות בית חכם, KNX ובקרת מבנה BMS בישראל.",
  blurbMarketing: "משנת 2006, עם מעל 9,000 לקוחות ואלפי פרויקטים בישראל.",
  stats: { customers: "9,000+", projects: "4,000+", since: "2006" },
};
```
חפש והחלף בכל האתר: "15 שנות ניסיון" / "קרוב ל-20 שנות" → ניסוח אחיד.

**5. ניקוי עמודים ישנים — `public/_redirects`**
שמור 301 קיימים. KNX מאוחד סביב `/smart-home/`. לעמודים דלים: `<meta name="robots" content="noindex, follow">`.

**6. מספרים בעמוד הבית — `src/pages/index.astro` (#about)**
פסקה: "I Feel פועלת משנת 2006 ומתמחה בתכנון, התקנה ותחזוקה של מערכות בית חכם, KNX ובקרת מבנה BMS בישראל. החברה משרתת מעל 9,000 לקוחות וביצעה אלפי פרויקטים בבתים פרטיים, דירות, פרויקטי יזמים, משרדים, מלונות ומבני ציבור."
קוביות: 9,000+ לקוחות · 4,000+ פרויקטים · 2006 שנת הקמה · מחלקת שירות פנימית.

**7. שדרוג עמוד בית חכם — `src/pages/smart-home.astro`** — הוסף 11 סקשנים (H2), עוגנים #wired/#wireless/#villas/#security:
מה כוללת מערכת בית חכם · תאורה חכמה · תריסים ווילונות · מיזוג VRF · אינטרקום IP · מצלמות ואזעקה · אודיו וחדר קולנוע · תרחישים לדוגמה · מה עובד גם בלי אינטרנט · תהליך עבודה מול I Feel · שאלות ותשובות (עם JSON-LD FAQPage). [הקופי המלא לכל סקשן — ראה אימייל "✓ סופי" שנשלח לצוות, או בקש מאורן.]

**8. BMS Case Studies — `src/pages/structure-control.astro`** — 4 עמודים, מבנה: סוג · אתגר · פתרון · מערכות · תוצאה:
- קמפוס רכבת קיסריה — Siemens Desigo / KNX / DALI / HMI.
- ברינקס בני ברק — Siemens Desigo / KNX / HMI.
- Amazon Sarona — KNX / DALI / Desigo.
- D-CITY / ROXON (מלונות) — KNX / HMI / PMS / Silverbyte.
[הטקסט המורחב לכל אחד — באימייל "✓ סופי".]

**9. באנר עוגיות / GA** — לוודא שבעמודי מאמרים/בלוג טקסט הבאנר ו-GA לא נכנסים לטקסט הסרוק (טעינה דרך JS). עמוד BMS תקין.

## שלב 3 — בנייה ואימות
```bash
npm install
npm run build
grep -r "אל תמלא" dist/        # אמור: 0
grep -r "972533481342" dist/   # אמור: קיים בעמודי שירות
grep -r "972533450205" dist/   # אמור: קיים בעמודים שיווקיים
```

## שלב 4 — חיבור Netlify (פרסום אוטומטי)
בדשבורד Netlify (חשבון oren@i-feel.co.il, צוות "i feel systems"):
- חבר את ה-repo `i-feel-site` לפרויקט (Site configuration → Build & deploy → Continuous deployment → Link repository), build command `npm run build`, publish directory `dist`.
- ודא שה-deploy הראשון עבר ושעדכונים מופיעים ב-www.i-feel.co.il.
- מעתה כל push ל-main מתפרסם אוטומטית.

## בסיום
דווח למשתמש: כתובת ה-repo, שה-build עבר, שהאתר עלה, וקישור ל-deploy ב-Netlify.
