# ✅ הושלם (2026-07-15, מהמחשב במשרד): האתר החי סונכרן במלואו עם הריפו

## מה בוצע

1. **יישוב הריפו** — קומיט מקומי תקוע (18 דפי מקרי בוחן BMS מ-7/6) עבר rebase על main, קונפליקט ב-page-18.html נפתר (23 כרטיסי מקרי בוחן), נדחף.
2. **llms.txt החדש** (344822a) הועלה ואומת.
3. **משיכה מהחי לפני deploy** — דף `/smart-home-support/` וחוק ה-QR redirect (`smart-apartment-from-developer` → `smart-home-support`, נוסף ישירות בשרת ב-9/7) נמשכו לריפו כדי שלא יאבדו.
4. **העלאה מלאה additive של `dist\`** — 425/425 קבצים, 0 כשלים. שום דבר לא נמחק בשרת.
5. **תג `live` הוצב על HEAD (1dfe1fc) ונדחף ל-GitHub** — שני המחשבים חולקים כעת נקודת ייחוס אחת.

## אימות חי (הכל 200 אלא אם צוין)

- `/`, `/start/`, `/help/` — עיצוב הבית החדש חי.
- 18 דפי מקרי בוחן (hot-cinema, rapid-offices, ...) — 200, תוכן נכון.
- `/structure-control/` — 23 כרטיסי מקרי בוחן.
- `/structure-control/projects/` — גלריה = 84.
- דף הבית — תג Google Ads (AW-18038181913) חי.
- `/smart-home-support/` — 200; `/smart-apartment-from-developer/` → 301 ליעד.
- sitemap / robots / llms — 200. www → non-www — 301.

## נשאר לאורן

- **דפים חדשים → Google Search Console → URL Inspection → Request Indexing**, במיוחד: `/start/`, `/help/`, ו-18 דפי `/structure-control/<slug>/`.
- הערה ל-SEO: דפי מקרי הבוחן החדשים מצהירים `canonical` על `www.i-feel.co.il` בעוד www עושה 301 ל-non-www. עובד, אבל canonical שמצביע ל-URL שמפנה מחדש אינו אידאלי — שווה ליישר בתבנית בהמשך.
