
# ניהול מאוחד של לו״ז הטכנאים

## Runtime authority and shared ownership

For current business hours and routine cadence read [sales email and WhatsApp coordination](sales-email-whatsapp.md).

This reference is shared by the existing maya-email-maintenance and maya-whatsapp workers. It is workflow guidance, not a new skill, scheduler or authorization. Read this complete reference for technician schedule review, changes, dispatch and installation closeout; also read the existing channel-specific references.

The standing channel authorization dated 2026-09-23 supersedes earlier blanket WhatsApp-disabled and scheduler-paused language for the two existing workers. Current cadence is defined in sales-email-whatsapp.md: email every two hours from 08:00 and WhatsApp ten minutes later during the configured workday. Existing dispatch deadlines and WhatsApp ownership remain unchanged. Both use the existing maya-whatsapp run-lock.mjs lock, keep its holder session, check ownership before every mutation, honor the four-minute expiry and twenty-second cleanup margin, and release only their owned lock in finally. LOCKED defers the pass. No third worker or scheduler is introduced.

Email owns read-only schedule reconciliation and separately authorized direct-thread replies. WhatsApp alone owns daily next-day technician schedule and field-photo dispatch. Email must not duplicate that dispatch; changing its channel requires explicit assignment. Routine work requires fresh identity, exact recipient, current conversation, opt-out, duplicate and read-back gates, without repeat approval for already-authorized scope. Preserve Israeli business-hour and holiday restrictions; read-only triage may run outside send hours.

Monday remains read-only. General schedule/Calendar writes are not authorized by routine operation; separately approved interactive booking scopes remain distinct. Customer-action Bus productionExecutionAllowed remains false; Windows, integrated and social schedulers remain disabled. Do not enable marketing, credential changes or new commitments. Missing evidence blocks only dependent work. Telemetry failure never justifies a resend.

Keep one operational owner per visit across both workers and preserve channel locks, fresh identity checks, opt-out, response checks and verified-send deduplication. Resolve existing visits before creating any new record. The email worker's technician-scheduling.md retains detailed full-day presentation and cross-system verification rules. The WhatsApp worker's next-day-technician-schedule.md retains the authorized dispatch deadline and field-content-daily.md retains the bounded photo workflow, subject to current channel restrictions.

Credentials remain in the approved secret store only, as required by workstation AGENTS.md. For closeout, inspect only non-secret completion evidence or an approved secure reference. Never retrieve, display, copy or request plaintext passwords by email/WhatsApp, nor provision secrets or write credentials to Monday. If required access evidence is missing, leave closeout incomplete and route a request for secure completion through an authorized channel; any Oren copy requires verified identity and send authority. Do not read back secret values as proof of completion.


נהל כל ביקור כתהליך אחד: זיהוי הלקוח והטכנאי, בדיקת זמינות, הצלבה בין המערכות, עדכון מורשה, הודעות ואימות. אל תריץ תהליכים מקבילים לאותו ביקור דרך ערוצי תקשורת שונים. ai-service-manager נשאר גורם בקרה נפרד.

## מקורות המידע

- קובץ הלו״ז המשותף: https://docs.google.com/spreadsheets/d/1_r2WSYvpUWlBRz_6yX5Yqr5KKUAOVNpte6CoZYttdII/edit — מקור השיבוץ והזמינות המוצגים, אך לא הוכחה שהלקוח אישר ביקור.
- Monday: הפריט המדויק של הלקוח, הפרויקט, ההתקנה או השירות הוא מקור לפרטי העבודה, היקף, סטטוס והערות. אין לרשום בלו״ז את מספר הפריט של Monday.
- Google Calendar: אירועים קיימים, זמינות והזמנות. הזמנה שנשלחה אינה הוכחת קבלה.
- דוא״ל ו-WhatsApp: מקור לשינויים, אישורי לקוחות, ביטולים, דחיות, תקלות ועדכוני טכנאים.

זהה לקוח באמצעות טלפון או דוא״ל מאומת וקישור לפריט המדויק; שם דומה לבדו אינו מספיק. זהה טכנאי באמצעות מדריך עובדים או איש קשר מאומת.

## WhatsApp של מאיה

WhatsApp הוא ערוץ עבודה נדרש של מאיה לניהול הלו״ז. כאשר החיבור פעיל ומורשה, קרא הודעות נכנסות ושלח הודעות ללקוחות ולטכנאים לפי הצורך.

אל תעקוף חיבור חסר או הרשאה חסרה. אם סביבת ההרצה אינה מאפשרת קריאה או שליחה ב-WhatsApp, דווח BLOCKED לגבי פעולת WhatsApp והמשך רק בחלקים שאינם תלויים בה.

בכל הודעה נכנסת:
1. קרא את תוכן ההודעה והבן אם מדובר באישור, שינוי שעה, דחייה, ביטול, תקלה, פנצ'ר/עיכוב של טכנאי, צורך בציוד, שינוי באתר או מידע תפעולי אחר.
2. זהה את הביקור או הפרויקט המדויק.
3. בדוק את הלו״ז, Monday, Google Calendar, הדוא״ל ושרשור ה-WhatsApp הרלוונטי.
4. עדכן את הטכנאי כאשר השינוי משפיע על עבודתו. בהתקנה או בפרויקט, ודא שגם המפקח/איש הקשר הרלוונטי מקבל עדכון כאשר הדבר נדרש.
5. אם שינוי מחייב עדכון מערכות, בצע רק את השינויים המורשים ואמת אותם לאחר הכתיבה.
6. אם חסר פרט שמונע החלטה בטוחה, בקש מאורן להשלים את הפרט ואל תנחש.

## ריצה מחזורית לפי הערוץ

השתמש בשתי ההרצות הקיימות בלבד: מייל אחת לשעתיים מ-08:00 ווואטסאפ עשר דקות אחריו, לפי sales-email-whatsapp.md. כל עובד ממשיך מהנקודה האחרונה שלו וקורא רק את המידע הנחוץ לפעולה שבאחריותו. בדיקות חוצות ערוצים אינן הרצת תחזוקת מייל נוספת. לפי המשימה ובחלון הריצה התחום:

- קרא הודעות דוא״ל חדשות ורלוונטיות מאז המחזור הקודם.
- קרא הודעות WhatsApp חדשות ורלוונטיות מאז המחזור הקודם.
- בדוק את הלו״ז של היום ואת יום העבודה הבא.
- בדוק שינויים ב-Monday וב-Google Calendar המשפיעים על ביקורים קיימים.
- חפש ביטולים, דחיות, הקדמות, שינויי כתובת, עיכובי טכנאים, תקלות רכב, מחלה, ציוד חסר, בקשות לקוח ושינויי משך עבודה.
- הצלֵב את כל המקורות כדי לוודא שהמידע עקבי ושכל גורם שצריך לדעת קיבל עדכון.
- אל תיצור הודעה חוזרת אם אותו עדכון כבר נשלח ואומת.
- דווח PARTIAL או BLOCKED אם אחד המקורות הדרושים אינו זמין.

הריצה המחזורית אינה מחליפה תיאום אנושי כאשר חסר מידע מהותי.

## פרטים שחייבים להופיע בלו״ז

אל תרשום מספר פריט Monday בתוך הלו״ז.

- בשירות: רשום את טלפון הלקוח.
- בהתקנה/פרויקט: רשום את טלפון הלקוח ואת טלפון המפקח או איש הקשר באתר, כאשר קיים ורלוונטי.
- רשום שם לקוח/אתר, כתובת, שעות, מהות העבודה, משך וציוד נדרש כאשר הנתונים מאומתים.
- אם פרט חובה חסר, מאיה צריכה לפנות לאורן ולבקש השלמה לפני פעולה שתלויה בפרט החסר.

## יצירה או שינוי של ביקור

1. קרא את כל בלוק הטכנאי והתאריך, כולל נוסחאות, עיצוב, אימותי נתונים ומיזוגים. בדוק גם יומן, זמני מעבר ומשך העבודה. תפוס ביומן או בלו״ז הוא קונפליקט.
2. קבע תאריך, חלון הגעה, משך עבודה, טכנאי, כתובת, איש קשר וציוד לפי מידע מאומת בלבד.
3. חפש ביקור או אירוע קיים לפני יצירה כדי למנוע כפילויות.
4. בצע רק שינויים מורשים ב-Monday, בלו״ז ובאירוע היומן.
5. לביקור יום מלא, שריין בבירור את כל בלוק הטכנאי/התאריך מבלי לפגוע במידע סמוך.
6. קרא חזרה כל שינוי ואמת את השעה המקומית Asia/Jerusalem.
7. לאחר שינוי מהותי, עדכן את הלקוח ואת הטכנאי בערוצים המורשים ואמת את ההודעה.
8. אם מערכת אחת נכשלה, דווח PARTIAL ופרט מה הושלם ומה לא.

## עדכוני לקוחות וטכנאים

הודעת לקוח כוללת רק את הביקור שלו: תאריך, חלון הגעה, מהות העבודה והכנה נדרשת מאומתת.

הודעת טכנאי כוללת את עבודתו, שעות, כתובת, אנשי קשר, טלפונים, ציוד ופרטי ביצוע נדרשים.

לפני שליחה, קרא את ההתכתבות העדכנית וחפש הודעה שקולה שכבר נשלחה. השתמש בזהות נמען, זהות ביקור/משימה, תאריך יעד וסוג עדכון כמפתח למניעת כפילויות חוצה ערוצים.

הבדל בין נשלח, נמסר ונקרא. במקרה של תוצאה לא ודאית, בדוק לפני ניסיון נוסף.

## הפצת הלו״ז למחר

שלח לכל טכנאי הודעה אישית עם ״הלו״ז שלך למחר — [יום ותאריך]״ ובה שעות, אתר, עבודה, משך, טלפונים וציוד כפי שנרשמו.

בדוק גם עבודה מרחוק, משרד, חופשה ואיסוף ציוד. עמודה ריקה מאומתת משמעה שאין כרגע משימה רשומה, לא הבטחה ליום חופש.

אל תשלח בשבת או בחג ישראלי. השתמש ביום העבודה המותר הקודם לכיסוי ימי העבודה עד ההפצה הבאה לפי הלו״ז ולוח חגים מאומת.

## סגירת התקנה ובדיקת מסמכים ב-Monday

אל תסמן התקנה או הגעה כנסגרה לפני שבדקת את פריט הלקוח/הפרויקט ב-Monday ואת סיכום ההתקנה. בסיום כל הגעה אצל לקוח, ודא את הפריטים הבאים:

1. קיים טופס סיום/אישור עבודה חתום על ידי הלקוח או הנציג המוסמך באתר.
2. אם סופק ציוד, קיימות תעודות משלוח מתאימות והן חתומות או מאושרות לפי הנוהל.
3. קיים סיכום התקנה ברור: מה בוצע, מה נשאר פתוח, תקלות או חריגים, ציוד שסופק והמשך נדרש.
4. לכל לקוח או מערכת שדורשים גישה, אמת ראיית השלמה שאינה סודית או הפניה מאושרת למאגר הסודות. אין לקרוא או להעתיק את הסיסמה עצמה; פעל לפי שער ההרשאות לעיל.
5. אם חסרה ראיית השלמה של הגישה, בקש מהמתקין להשלים אותה במסלול המאובטח המאושר, רק בערוץ מורשה. העתק לאורן מחייב כתובת מאומתת והרשאת שליחה. אין לבקש שישלח סיסמה בהודעה.
6. אם חסר טופס חתום, תעודת משלוח, סיכום התקנה או פרטי גישה נדרשים, השאר את ההתקנה במצב פתוח/חסר תיעוד ודווח מה בדיוק חסר. אל תסמן COMPLETED עד שהחסר הושלם ואומת.
7. לאחר שהמסמכים והנתונים הושלמו, קרא אותם חזרה מ-Monday ואמת שהם משויכים לפריט הנכון וללקוח הנכון.

בסקירת הלו״ז התחומה, בדוק התקנות רלוונטיות שהסתיימו מאז הבדיקה הקודמת וחפש חוסרים בתהליך הסגירה. זו בדיקת ראיות בקריאה בלבד; אין לשנות סטטוס סגירה במאנדיי מכוח ההרשאה השוטפת.

## סיכום יום ותמונות

ב-15:00, כאשר הערוץ מורשה, פנה פעם אחת לכל טכנאי שביצע עבודת שטח ובקש תמונות וסיכום קצר: מה בוצע ומה נשאר פתוח. החרג משרד, חופשה, רופא ואיסוף ציוד בלבד.

כאשר מדובר בהתקנה שהסתיימה, כלול בבדיקה גם טופס חתום, תעודות משלוח אם סופק ציוד, סיכום התקנה ופרטי הגישה הנדרשים ב-Monday.

בקש להימנע מפנים, מספרי בית ורכב, מסמכים, קודים ופרטי אבטחה. הורדת מדיה, עיבוד ופרסום הם תהליכים נפרדים.

## תזמון, מניעת כפילויות ודיווח

השתמש במקור נהלים אחד ובבעלות אחת לכל פעולה: מייל להצלבה ומענה מורשה, וואטסאפ להפצה היומית ולתמונות. שמור את תדירויות העובדים הקיימים; אל תיצור מתזמן נוסף או משלוח יומי מקביל במייל.

שמור מנגנוני זהות, נעילה ואימות שליחה של כל ערוץ. אל תחזור על פעולה עסקית בגלל כשל טלמטריה.

דווח לפי ביקור ולפי מערכת: מה נקרא, עודכן, נשלח ואומת, מה ממתין ומדוע. השתמש ב-COMPLETED, PARTIAL או BLOCKED לפי התוצאה בפועל.


## Installed ownership and runtime gate — 2026-09-23

This is a versioned local supplement to canonical base 147e858472043ec4461e749d4ca2341ba93ac5df, not a newly published canonical release. Both channel skills read this one reference. The base release pointer and manifest remain unchanged.

The standing channel authority and ownership rules at the top of this reference apply. A valid shared lock serializes mutations; it is not cross-channel deduplication. Before an interactive visit update or proactive reminder, check current direct-channel history and the authoritative visit using recipient/topic/visit/date/update identity; use the protected Gmail proactive ledger when applicable. Missing required history blocks that send. No cross-channel atomic deduplication runtime is claimed as implemented.

The single-owner daily WhatsApp dispatch uses its verified direct-chat ledger and exact recipient/date/content checks; it is not blocked solely because a separate generalized cross-channel atomic ledger is unimplemented. Email never runs this daily dispatch. For reminders preserve the existing seven-day cooldown and two-unanswered-attempt ceiling.

For detailed booking presentation and cross-system read-back use [technician-scheduling.md](technician-scheduling.md). For next-day deadline, recipients and verification use [next-day-technician-schedule.md](../../maya-whatsapp/references/next-day-technician-schedule.md); for field-photo details use [field-content-daily.md](../../maya-whatsapp/references/field-content-daily.md). The field-content reference's old cadence is superseded by sales-email-whatsapp.md; preserve its privacy and duplicate guards. If the installed cadence cannot meet an existing dispatch deadline, report DISPATCH_WINDOW_CONFLICT with the next scheduled run; do not silently claim coverage or create another scheduler.

Verify this local supplement with the composite installation check. Canonical-only Verify remains BLOCKED_LOCAL_SUPPLEMENT; neither the canonical source manifest nor base release is changed. Documentation checks do not prove live delivery. Notify only for meaningful completion, failure, actionable blockers or Oren decisions; remain quiet when unchanged.


## Installation dispatch completeness — Oren correction, 2026-09-23

Before sending an installation assignment or treating next-day installation dispatch as complete, verify the exact customer/project, visit date and assigned technician against the live Projects board. Require an installation record for that visit and the correct installation-form link. A schedule row, Calendar invitation or WhatsApp assignment alone is not an installation record or proof that the technician received the form.

- Find and reuse an existing installation for the same project, visit and technician; do not create duplicates. Confirm the actual board/item/form mapping from live evidence, never from a guessed board or URL.
- The authorized project workflow must open the installation and issue its form as part of the same assignment workflow. Maya's standing Monday access remains read-only: if the record or form is missing, report INSTALLATION_RECORD_OR_FORM_MISSING to Oren/the responsible project workflow, with the exact visit and missing step. Do not silently proceed as though dispatch is complete or infer Monday write authority from this documentation update.
- Verify separately: installation record exists; form belongs to that installation; form was sent to the verified technician; delivery/receipt evidence if available. Report sent, delivered and acknowledged accurately. A configured Monday automation is not evidence that it ran.
- Check current direct correspondence before any authorized form send. If Oren or another operator already sent the correct form manually, reconcile that evidence and do not resend or retrigger the automation. An uncertain send requires reconciliation, not automatic retry. Resolve only the missing step and preserve completed steps.
- Keep the visit PARTIAL/BLOCKED until its required record and form evidence are verified. This gate applies to installation assignments; do not invent installation records for unrelated supervision or service visits.

## ETS applicability — Oren correction, 2026-09-23

Check the exact customer's delivery notes for supplied KNX equipment before classifying an ETS file as required. With verified KNX delivery, check the project-specific ETS backup in Dropbox and evidence of sending it to tech@i-feel.co.il; file presence alone does not prove email delivery or that it is the latest backup. Without evidence of KNX equipment, do not label ETS as missing. Unavailable or incomplete delivery notes mean applicability is unverified, not proof that the customer has no KNX. A generic template is not a verified customer backup.

## Service email and closeout evidence — 2026-09-24

For service board 3011387201, read current column metadata and the exact item before interpreting automation results. A successful automation run proves execution only, not delivery or resolution.

- Preserve the verified customer relation and email across descriptive item renames. Name-only rematching must not replace an established customer link. If a relation or mirrored email disappears, compare activity history with the verified customer record and report CUSTOMER_LINK_OR_EMAIL_LOST. A blank mirror must not erase a verified email. Routine workers report this drift; only explicitly authorized interactive repair may restore the exact verified relation/contact and must read it back.
- For an authorized booking change, verify the recipient, assigned technician, date and hour before changing the status that triggers confirmation. Read back all fields and inspect the actual sent message for the exact recipient/visit. Never toggle status to manufacture a retry; reconcile previous sends first. Missing or literal template placeholders mean confirmation is incomplete.
- Track separately: technician form dispatched; technician summary submitted; required signature received; summary PDF generated; customer outcome documented; case closed. Outgoing form email does not prove submission or repair completion. A summary-status label such as 'טרם נשלח טופס' must be interpreted against its live automation mapping, not changed merely because a request email was sent.
- When closeout is requested, trace the live signature-to-document-to-status automation chain. Verify the summary belongs to this visit, states what was fixed and what remains, and includes required attachments. Missing summary/signature/PDF means CLOSEOUT_EVIDENCE_MISSING. Do not fabricate an attachment, submit a production test form, infer technical resolution, or close on email-send evidence alone.
- A permission denial editing a Monday automation means MONDAY_AUTOMATION_OWNER_REQUIRED. Record the exact rule and required correction for its creator/board owner; do not switch identity or route to evade that denial. A local instruction fix does not repair the underlying Monday automation.

Report each destination and stage using actual evidence. A repaired field or installed skill is PARTIAL until required live outcomes are verified. Preserve the existing WhatsApp runtime limit and continuation; do not spend the whole dispatch window on broad historical audits.

## Shared visit synchronization — Oren instruction, 2026-09-27

Read [visit-calendar-sync.md](visit-calendar-sync.md) before every visit change or reconciliation. It supersedes this document's older blanket Monday/Sheet/Calendar read-only and email-read-only reconciliation wording only for its matched visit scope. Every authorized changing operator completes all destinations; the existing email worker repairs missing destinations every two hours. WhatsApp retains its separate daily schedule/photo and companion ownership. All unrelated restrictions, exact identities, source conflicts, verified read-back and composite installation rules remain.
