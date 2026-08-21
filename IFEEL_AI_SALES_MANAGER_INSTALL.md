# מנהל מכירות AI — מפרט והוראות התקנה במחשב אורן

**שם טכני קנוני:** `ai-sales-manager`
**שם תצוגה:** מנהל מכירות AI
**מחשב יעד:** מחשב אורן / Control Center
**Runtime מקומי:** `C:\ifeel-sales`
**Vault משותף:** `C:\Users\User\Dropbox\i-feel Vault`
**Google Ads account:** `251-497-1872`

## מטרה וגבול קנוני

מסמך זה מגדיר התקנה מקומית, בטוחה ו-idempotent של מנוע המכירות. יש לבצע AUDIT קריאה בלבד לפני שינוי, לשמר כל קוד, commit, בדיקה, runtime, Vault bridge או חיבור תקין, ולהשלים רק חוסרים.

`ai-sales-manager` הוא מנהל המכירות הראשי והיחיד. Codex הוא ה-orchestrator ובעל ה-state. אין ליצור `sales-manager`, `sales-orchestrator` או מנהל מקביל. `ai-service-manager` הקיים הוא worker של אותות שירות בלבד.

Claude הוא Judgment Service דרך ה-Vault בלבד. הוא אינו orchestrator ואינו בעל state. אין להוסיף Direct Claude API בשלב זה.

## ארכיטקטורת שני המחשבים

- מחשב אורן: Codex, `ai-sales-manager`, runtime מקומי, state/logs ובריף אורן.
- מחשב מאיה: Claude וה-Maya stack הקיים בלבד: `maya-admin`, `maya-whatsapp`, `maya-billing-control`, `maya-email-maintenance` והמשימות המתוזמנות שכבר קיימות שם.
- אין ליצור תיקייה או סקיל עצמאי בשם `maya-agent`. השם נשאר רק מזהה protocol במודעות ישנות של ה-bus.
- התקשורת בין המחשבים עוברת רק דרך ה-Vault המשותף ב-Dropbox.

```text
מחשב אורן / Codex
        ↓
Dropbox Vault / AI-Sales bus
        ↓
מחשב מאיה / Claude + Maya stack קיים
```

## Vault Integration v1

ה-Vault חייב להיות Obsidian Vault מקומי ומסונכרן, עם `.obsidian`, ללא placeholders מסוג Online-only.

```text
AI-Sales/
  _bus/
    maya-to-manager/
    manager-to-maya/
    to-claude/
    to-codex/
    approvals/
    processed/
  _state/
  _logs/
  _backups/
  Maya/
    Inbox/
    Tasks/
    Waiting/
    Completed/
    Escalations/
```

גבולות בעלות:

- Codex / מנהל המכירות הוא הכותב היחיד ל-`AI-Sales\_state`.
- מאיה קוראת `manager-to-maya`, `approvals`, `Maya\Tasks` ו-`Maya\Waiting`.
- מאיה כותבת `maya-to-manager`, תיקיות העבודה שלה ו-`_logs`.
- אין secrets, tokens, raw email/WhatsApp או PII עודף ב-Vault, logs או snapshots.
- מסרים הם immutable ו-idempotent. maturity 0 אינו מוחק, מזיז או מעבד קובצי bus.

Handshake v1 הוא `SYSTEM_TEST` ממאיה ותשובת `SYSTEM_TEST_RESPONSE` מהמנהל. התשובה כוללת `source_event_id`; הרצה חוזרת משתמשת באותה תשובה ואינה יוצרת כפילות.

## מקורות ומנועי הכנסה

- Monday board `2732725332` נשאר מקור התהליך הקיים. אין שינוי boards, groups, columns, automations, statuses, schema או workflow.
- Google Ads ו-Meta/Facebook/Instagram מחוברים בקריאה בלבד ורק אחרי אימות credentials. אין שינוי budget, bid, campaign, audience, creative, conversion או billing.
- Attribution נשמר חיצונית לפי `monday_item_id`, עם confidence. הוא אינו משנה את Monday ואינו ממציא התאמות.
- `daily-seo-crawl` ושיפור האתר היומי הם workers של מנוע המכירות. כל שינוי אתר עדיין עובר work branch, build, tests ו-Draft PR רק אחרי בקשה מתאימה.
- referrals נמדדים בנפרד לפי מקור, איכות, conversion והכנסה.
- existing customers נמדדים בנפרד: שדרוגים, הרחבות, תחזוקה, מוצרים משלימים ומכירה חוזרת.
- plans, proposal, follow-up, handoff ו-closeout נבדקים כשרשרת אחת. אי-התאמה מסומנת לבדיקה ואינה מתוקנת אוטומטית.
- אותות שירות, BMS quotes, procurement, handovers, content, project videos והוצאות מסחריות נכנסים כ-workers/inputs כשסקיל קיים זמין.

רק שלושה workers חדשים מותרים כאשר לא קיימת יכולת חופפת: `google-ads-manager`, `meta-ads-manager`, `lead-attribution-feedback`. הם כפופים ל-`ai-sales-manager` ואינם מנהלים ראשיים.

## Maturity וגבולות פעולה

ההתקנה מתחילה ב-`maturity 0`, מצב `DRY_RUN / REPORT_ONLY`.

מותר:

- audit מקומי;
- קריאה חיה ממקור מאומת שהוגדר read-only;
- ניתוח, סימולציה, המלצה ובריף מקומי;
- state/logs מקומיים ב-`C:\ifeel-sales`;
- מסרי handshake/judgment idempotent ב-Vault.

אסור ללא אישור נפרד בזמן הפעולה:

- כתיבה או שינוי ב-Monday;
- שליחת email או WhatsApp;
- יצירה/שינוי פגישה;
- פרסום לרשתות;
- שינוי Google/Meta או תקציב;
- שליחת הצעה, מחיר, הנחה או התחייבות;
- מחיקה, העברה או פריסה;
- push, PR, merge או שינוי production.

## Baseline של 90 יום ותיקון waste

ה-baseline מתחיל ביום ההתקנה ונמשך 90 יום. מודדים לידים לפי מסלול ומקור, qualification, זמני תגובה, plans, meetings, proposals, wins, revenue, CPL/qualified CPL, referrals, existing-customer revenue, backlog, capacity, attribution, website ו-SEO.

אין scaling אוטומטי ואין אופטימיזציה תקציבית אוטומטית בתקופה זו. עם זאת מותר כבר מהיום להפיק **המלצה בלבד** עבור:

- waste ברור;
- tracking שבור או לא אמין;
- negative-keyword candidates;
- mismatch ברור בין חיפוש, מודעה ודף נחיתה.

גם המלצות אלה אינן משנות פלטפורמה, campaign או budget.

## Capacity stop rule

כל המלצת צמיחה נעצרת כאשר אחד מהבאים מתקיים:

- סף active unowned leads חסר או נפרץ;
- זמן plans-to-proposal עולה על 7 ימי עסקים;
- SLA תגובה לליד איכותי נפרץ;
- backlog של follow-ups, plans, meetings או proposals עבר קיבולת;
- אין owner ברור להזדמנויות פעילות;
- זמני תגובה או זמן להצעה מתדרדרים;
- עומס שירות/ביצוע מסכן איכות;
- attribution או איכות הנתונים אינם אמינים.

עצירה פירושה: אין העלאת תקציב, campaign חדש או הרחבת קהל. מציגים את צוואר הבקבוק והפעולה התפעולית הדרושה. אין לנחש את סף X.

## Daily Oren Brief

כל dry-run יוצר בריף מקומי בלבד תחת `C:\ifeel-sales\logs`. הבריף כולל מצב Maya/Vault, Google/Meta/attribution, capacity, baseline, אתר/SEO, סקילים זמינים וחסרים, ופעולות העדיפות להיום. הוא אינו נשלח אוטומטית.

## רצף התקנה ובדיקה

1. בצע AUDIT read-only של worktree, runtime, Vault, Maya status, handshake, skills וחיבורי credentials בלי להציג secrets.
2. עבוד רק בענף העבודה הקיים; אין לגעת ב-checkout הפריסה של ה-runner.
3. הרץ את מתקין runtime המקומי:

   ```powershell
   .\scripts\workstations\install-oren-sales-runtime.ps1 `
     -VaultRoot "C:\Users\User\Dropbox\i-feel Vault"
   ```

4. התקן את ספריית הסקילים המנוהלת ל-Codex ול-Claude באמצעות `install-agent-config.ps1`. הסקריפט יוצר backup ואינו מוחק סקילים אישיים אחרים.
5. ענה ל-handshake והריץ dry-run:

   ```powershell
   node .claude\skills\ai-sales-manager\scripts\maya-vault-bridge.mjs `
     --config C:\ifeel-sales\config\config.json `
     --respond-system-tests

   & C:\ifeel-sales\jobs\run-morning-dry-run.ps1
   ```

6. הרץ `npm run test:ai-managers`, skill validation, `npm run build` ו-`git diff --check`.
7. אל תבצע push, PR, merge, deploy, Monday write, message send או campaign/budget change במסגרת התקנה זו.

## דרישות לקריאה חיה היום

- Google Ads: service-account/OAuth material תקין, developer token, login customer ID כאשר נדרש, הרשאת read לחשבון `251-497-1872`, ואז live verification מפורש.
- Meta: Graph API version מאושר, `act_<digits>` ad account, access token מוגן והרשאות insights/read מתאימות.
- Attribution: export מאושר, עדכני וללא PII תחת runtime `data`, keyed by `monday_item_id`, עם timestamp ו-confidence.
- Monday/Gmail/Drive/Calendar בצד מאיה: connector קיים אינו הוכחת live read. נדרש אימות קריאה בלבד ואישור אורן לפני maturity 1.
- Capacity: אורן חייב לקבוע את סף X ולספק נתוני backlog/SLA אמינים.

עד שכל תנאי חיבור מאומת, המצב הוא `CONNECTION_MISSING`; אין שימוש בנתונים היסטוריים כתחליף לנתונים חיים.
