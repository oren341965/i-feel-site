<?php
declare(strict_types=1);

/**
 * אזור דיירי שכונת הפרדס, רעננה - יזם נווה שוסטר / קבוצת דניה סיבוס
 * /neve-shuster/
 */

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_lead.php';

$error = '';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    try {
        nsh_verify_csrf();
        $action = nsh_post('action', 40);

        if ($action === 'request_code') {
            $email = strtolower(nsh_post('email', 180));
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                throw new InvalidArgumentException('יש להזין כתובת דואר אלקטרוני תקינה.');
            }
            if (!nsh_allowed_email($email)) {
                throw new InvalidArgumentException('הכתובת אינה מופיעה ברשימת דיירי הפרויקט. יש לפנות למחלקת שינויי דיירים של דניה סיבוס, או לכתוב לנו ל-myhome@i-feel.co.il.');
            }
            if (!nsh_send_code($email)) {
                throw new RuntimeException('לא ניתן לשלוח קוד כרגע. יש להמתין דקה ולנסות שוב.');
            }
            nsh_redirect(['access' => 'code-sent']);
        }

        if ($action === 'verify_code') {
            $email = nsh_pending_email();
            $code = nsh_post('code', 20);
            if (!nsh_verify_code($email, $code)) {
                throw new InvalidArgumentException('הקוד שגוי או שפג תוקפו.');
            }
            nsh_redirect(['access' => 'verified']);
        }

        if ($action === 'logout') {
            nsh_logout();
            nsh_redirect(['access' => 'logged-out']);
        }

        if ($action === 'lead') {
            $leadUser = nsh_require_user();
            $result = nsh_submit_lead($leadUser);
            nsh_redirect(['lead' => $result]);
        }

        throw new InvalidArgumentException('הפעולה המבוקשת אינה זמינה.');
    } catch (Throwable $exception) {
        $error = $exception->getMessage();
    }
}

$user = nsh_current_user();
$csrf = nsh_csrf_token();
$accessStatus = trim((string) ($_GET['access'] ?? ''));
$leadStatus = trim((string) ($_GET['lead'] ?? ''));

/* ------------------------------------------------------------------ */
/* מחירון שדרוגים - שכונת הפרדס, רעננה (קבוצת נווה שוסטר), 2.7.26      */
/* כל המחירים אינם כוללים מע"מ                                        */
/* ------------------------------------------------------------------ */
$priceGroups = [
    [
        'title' => 'חשמל חכם, תקן Z-Wave בתדר 916 המותקן בישראל',
        'rows' => [
            ['TW601090-916-R-WA', 'מפסק זכוכית טאץ Z-Wave עד 9 לחצנים TouchWand, כולל חיישן קרבה משולב, 6 מעגלים להזנות ישירות ועד 3 תרחישים', 'דורש 0 במפסק מהחשמלאי + קופסת עומק 3 מקום שוכב', '1,225', 'panel9.jpg'],
            ['Glasswand 1-b w', 'מפסק זכוכית טאץ מהודר עם לחצן בודד לתאורה, חיווי אור בהפעלה, ללא כיתוב, בצבע לבן', 'דורש 0 במפסק התאורה מצד החשמלאי', '550', 'glass-1b.jpg'],
            ['Glasswand 2-b w', 'מפסק זכוכית טאץ מהודר עם 2 לחצנים לתאורה, חיווי אור בהפעלה, ללא כיתוב, בצבע לבן', 'דורש 0 במפסק התאורה מצד החשמלאי', '563', 'glass-2b.jpg'],
            ['Glasswand 3-b w', 'מפסק זכוכית טאץ מהודר עם 3 לחצנים לתאורה, חיווי אור בהפעלה, ללא כיתוב, בצבע לבן', 'דורש 0 במפסק התאורה מצד החשמלאי', '575', 'glass-3b.jpg'],
            ['Glasswand 2-shut w', 'מפסק תריס זכוכית טאץ מהודר לעלייה ולהורדה של התריס, חיווי אור בהפעלה, ללא כיתוב, בצבע לבן', 'דורש 0 במפסק התאורה מצד החשמלאי', '575', 'glass-shutter.jpg'],
            ['129020', 'מפסק זכוכית לתנור אמבטיה Z-Wave 16A, כולל חיבור וניתוק בנפרד', 'מותקן במקום מפסק תנור של הקבלן', '580', 'glass-boiler-timer.jpg'],
            ['TW303100-916-E', 'מיקרומודול 230V, יחידה פנימית מאחורי מפסק הקבלן, עד 5 אמפר לערוץ ומקסימום 120 וואט. מתאים לכיבוי ולהדלקה של 2 מעגלי תאורה צמודים או תריס אחד', 'דורש 0 במפסק התאורה מצד החשמלאי', '463', 'micromodule.jpg'],
            ['IFW008', 'שינויי תכנות למסך המגע הקיים בדירה או תוספת רכיב הפעלה', '', '562', 'touchscreen.jpg'],
            ['TW303200-916-E', 'מתאם אלחוטי לתריסי או צלוני 24V, תריס כלוא בין חלונות. רלוונטי רק אם קיים בדירה צלון מסוג זה', 'בכמויות מסוימות עשוי להידרש ספק כוח 24V 4.2A בעלות 220 ש"ח בתוספת מע"מ', '550', 'micromodule-24v.jpg'],
        ],
    ],
    [
        'title' => 'אודיו',
        'note' => 'יש לשבת עם נציג I Feel לביצוע התאמת צרכים לפי טיפוס הדירה.',
        'rows' => [
            ['10000', 'זוג רמקולים קדמיים סטליטיים, רסיבר עם תמונת TV וכבילה ייעודית', '', '5,620', 'audio-satellites.jpg'],
            ['מקרני קול', 'סאונדבר אלחוטי איכותי לאזור הסלון, כולל סאב ומתלה אלחוטי. מגוון מוצרים בהתאמה לדייר', 'ללא צורך בהכנות חשמלאי, נדרש שקע חשמל בלבד', '1,500 עד 3,750', 'soundbar-klipsch.jpg'],
        ],
    ],
    [
        'title' => 'אזעקה אלחוטית',
        'note' => 'יש לשבת עם נציג I Feel לביצוע התאמת צרכים לפי טיפוס הדירה. אין צורך בתשתיות מצד החשמלאי.',
        'rows' => [
            ['10000', 'גלאי מגנט או גלאי נפח אלחוטי מבוסס בטריה פנימית', '', '460', ''],
            ['10000', 'גלאי עשן אלחוטי מבוסס בטריה', '', '480', ''],
            ['10000', 'גלאי הצפה אלחוטי מבוסס בטריה', '', '430', 'detector-flood.jpg'],
            ['10000', 'מערכת אזעקה אלחוטית עם גלאי מגנט בדלת וגלאי נפח פנימי', '', '3,000', ''],
        ],
    ],
];

$contacts = [
    ['name' => 'מאיה כהן', 'role' => 'אדמיניסטרציית פרויקטים', 'desc' => 'נקודת הקשר שלכם בכל נושא. מאיה מקבלת את הפנייה ומעבירה אותה לגורם המקצועי הנכון בחברה, ודואגת שתקבלו תשובה.', 'email' => 'myhome@i-feel.co.il', 'photo' => ''],
];

function nsh_head(string $title): void
{
    ?><!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive,nosnippet,noimageindex">
  <title><?= nsh_h($title) ?></title>
  <meta name="description" content="אזור מאובטח לדיירי פרויקט שכונת הפרדס, רעננה">
  <link rel="stylesheet" href="/neve-shuster/styles.css?v=8">
  <script src="/neve-shuster/form.js?v=1" defer></script>
</head>
<body>
<?php
}

function nsh_topbar(bool $withBack = true): void
{
    ?>
<header class="top">
  <img class="top__bg" src="/neve-shuster/assets/zwave-living-room.jpg" alt="" aria-hidden="true">
  <div class="shell top__bar">
    <a class="brand" href="/" aria-label="I Feel, דף הבית">
      <img src="/assets/ifeel-logo.png" alt="I Feel" width="140" height="145">
      <span>מערכות בית חכם ובקרת מבנה</span>
    </a>
    <?php if ($withBack): ?>
      <a class="button button--ghost" href="/customer-benefits/">חזרה לאזור הלקוחות</a>
    <?php else: ?>
      <span class="chip">● גישה מאובטחת לדיירי הפרויקט</span>
    <?php endif; ?>
  </div>
  <div class="shell hero">
    <p class="eyebrow">שכונת הפרדס, רעננה &middot; נווה שוסטר &middot; קבוצת דניה סיבוס</p>
    <h1>הדירה שלכם כבר חכמה.<br><em>עכשיו נחליט כמה.</em></h1>
    <div class="hero__copy">
      <p><strong>בכל דירה בפרויקט כבר מותקנת מערכת בית חכם.</strong></p>
      <p>ליד הכניסה מותקן מפסק מעוצב, עם שליטה בתאורה ובתריס הוויטרינה, והמערכת כולה ניתנת לשליטה גם מהטלפון.</p>
      <p>מכאן אפשר להמשיך ולהרחיב את הבית החכם לפי הצרכים שלכם: תריסים נוספים, אודיו, אזעקה, מצלמות, רשת ופתרונות נוספים, והכל על אותה מערכת אחת.</p>
      <p>כך אפשר לתכנן את השדרוגים כבר עכשיו, בזמן שינויי הדיירים, ולהימנע ככל האפשר מעבודות, אבק ופתיחת קירות לאחר הכניסה לדירה.</p>
    </div>
    <div class="hero__cta">
      <a class="button button--accent" href="#packages">מה אפשר לשדרג</a>
      <a class="button button--ghost" href="#quote">רוצה הצעת מחיר לדירה שלי</a>
    </div>
    <div class="hero__stats">
      <div><strong>2027</strong><span>כניסה משוערת</span></div>
      <div><strong>9,000+</strong><span>לקוחות</span></div>
      <div><strong>195</strong><span>דירות בפרויקט</span></div>
      <div><strong>חברה אחת</strong><span>תכנון, התקנה, תכנות ושירות</span></div>
    </div>
  </div>
</header>
<?php
}

function nsh_footer(): void
{
    ?>
<footer class="footer">
  <div class="shell footer__inner">
    <span>I Feel מערכות בע״מ &middot; www.i-feel.co.il</span>
    <span>אזור פרטי לדיירי שכונת הפרדס, רעננה</span>
  </div>
</footer>
</body>
</html><?php
}

/* ================================================================== */
/* מסך כניסה                                                          */
/* ================================================================== */
if ($user === null) {
    $pendingEmail = nsh_pending_email();
    nsh_head('כניסה לאזור דיירי שכונת הפרדס, רעננה | I Feel');
    nsh_topbar(false);
    ?>
<main class="main">
  <div class="shell entry">
    <section class="card">
      <figure class="panel-figure">
        <img src="/neve-shuster/assets/touchwand-panel-9.jpg" alt="Panel 9, מפסק זכוכית טאץ TouchWand בעל 9 לחצנים, המפסק המותקן בכל דירה בפרויקט" width="1100" height="705">
        <figcaption><strong>Panel 9</strong> — המפסק שמותקן בכל דירה בפרויקט. 6 הפעלות ישירות ועד 3 תרחישים, בתקן Z-Wave.</figcaption>
      </figure>
      <h2>כך נכנסים לאזור הדיירים</h2>
      <p class="lead">האזור מיועד לדיירי פרויקט שכונת הפרדס בלבד. המחירים ותנאי השדרוג אינם מוצגים לפני אימות.</p>
      <div class="steps">
        <div class="step"><b>1</b><div><strong>הזנת כתובת הדוא״ל</strong><br>יש להזין את כתובת הדואר האלקטרוני שאיתה נרשמתם אצל חברת הבנייה. לא יודעים איזו כתובת הוזנה? אפשר לפנות למחלקת שינויי דיירים.</div></div>
        <div class="step"><b>2</b><div><strong>קבלת קוד בדואר</strong><br>קוד חד פעמי בן 6 ספרות נשלח לכתובת שהוזנה, ותקף ל-10 דקות.</div></div>
        <div class="step"><b>3</b><div><strong>אימות וכניסה</strong><br>לאחר הזנת הקוד ייפתחו מה כלול בסטנדרט, חבילות השדרוג, מחירון השדרוגים המלא ותהליך שינויי התכניות.</div></div>
      </div>
      <div class="notice">
        <strong>מה מחכה בפנים</strong>
        פירוט הסטנדרט בדירה, חבילת הביניים וחבילת הפרימיום, מחירון שדרוגים פרטני, עלות עדכון תכניות, פתרונות רשת ואודיו, מצב שבת וחגים, אנשי הקשר בפרויקט והפלייר להורדה.
      </div>
      <p><a class="button button--quiet" href="/customer-benefits/">← חזרה לכל קבוצות הלקוחות</a></p>
    </section>

    <aside class="access-card" id="access">
      <h2>כניסה מאובטחת</h2>
      <p class="lead">הזינו את כתובת הדוא״ל הרשומה בפרויקט וקוד חד פעמי יישלח אליכם.</p>

      <?php if ($error !== ''): ?><div class="alert alert--error" role="alert"><?= nsh_h($error) ?></div><?php endif; ?>
      <?php if ($accessStatus === 'code-sent'): ?><div class="alert alert--ok" role="status">הקוד נשלח. כדאי לבדוק גם בתיקיית דואר הזבל. הקוד תקף ל-10 דקות.</div><?php endif; ?>
      <?php if ($accessStatus === 'logged-out'): ?><div class="alert" role="status">החיבור נותק. אפשר להיכנס שוב בכל עת.</div><?php endif; ?>
      <?php if ($accessStatus === 'required'): ?><div class="alert" role="status">כדי לצפות במידע יש לבצע אימות מחדש.</div><?php endif; ?>

      <?php if ($pendingEmail !== ''): ?>
        <form class="access-form" method="post" action="/neve-shuster/" autocomplete="one-time-code">
          <input type="hidden" name="csrf" value="<?= nsh_h($csrf) ?>">
          <input type="hidden" name="action" value="verify_code">
          <label>
            <span>הקוד שנשלח אל <?= nsh_h($pendingEmail) ?></span>
            <input type="text" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" placeholder="000000" required autofocus>
          </label>
          <button class="button" type="submit">אימות וכניסה</button>
        </form>
        <form class="resend" method="post" action="/neve-shuster/">
          <input type="hidden" name="csrf" value="<?= nsh_h($csrf) ?>">
          <input type="hidden" name="action" value="request_code">
          <input type="hidden" name="email" value="<?= nsh_h($pendingEmail) ?>">
          <button type="submit">שליחת קוד חדש</button>
        </form>
      <?php else: ?>
        <form class="access-form" method="post" action="/neve-shuster/">
          <input type="hidden" name="csrf" value="<?= nsh_h($csrf) ?>">
          <input type="hidden" name="action" value="request_code">
          <label>
            <span>כתובת הדוא״ל הרשומה אצל חברת הבנייה</span>
            <input type="email" name="email" placeholder="name@example.com" autocomplete="email" required autofocus>
          </label>
          <button class="button" type="submit">שלחו לי קוד כניסה</button>
        </form>
      <?php endif; ?>

      <div class="security-note">
        <strong>למה נדרש אימות?</strong><br>
        המחירים ותנאי הפרויקט מיועדים לדיירי שכונת הפרדס בלבד ואינם פתוחים לציבור הרחב. לא מזוהים? מחלקת שינויי דיירים של דניה סיבוס תסייע לאתר את הכתובת שנרשמה, או שאפשר לכתוב לנו ל-myhome@i-feel.co.il.
      </div>
    </aside>
  </div>
</main>
<?php
    nsh_footer();
    exit;
}

/* ================================================================== */
/* תוכן מאומת                                                         */
/* ================================================================== */
nsh_head('אזור דיירי שכונת הפרדס, רעננה | I Feel');
?>
<div class="verified-bar">
  <div class="shell">
    <span>מחובר: <?= nsh_h($user['email']) ?><?= $user['role'] === 'staff' ? ' (צוות I Feel)' : '' ?></span>
    <form method="post" action="/neve-shuster/">
      <input type="hidden" name="csrf" value="<?= nsh_h($csrf) ?>">
      <input type="hidden" name="action" value="logout">
      <button type="submit">התנתקות</button>
    </form>
  </div>
</div>
<?php nsh_topbar(true); ?>

<main class="main">
  <div class="shell">

    <ul class="toc">
      <li><a href="#standard">מה כלול בסטנדרט</a></li>
      <li><a href="#video">סרטון המוצר</a></li>
      <li><a href="#worlds">מה אפשר להוסיף</a></li>
      <li><a href="#packages">חבילות שדרוג</a></li>
      <li><a href="#pricelist">מחירון שדרוגים</a></li>
      <li><a href="#load">גופי תאורה והספקים</a></li>
      <li><a href="#more-products">מוצרים נוספים</a></li>
      <li><a href="#first-run">איך מפעילים את הבית החכם</a></li>
      <li><a href="#changes">שינויים בתכניות</a></li>
      <li><a href="#shabbat">מצב שבת וחגים</a></li>
      <li><a href="#learn">להעמיק באתר</a></li>
      <li><a href="#quote">בקשת הצעת מחיר</a></li>
      <li><a href="#contacts">יצירת קשר</a></li>
      <li><a href="#downloads">הורדות</a></li>
    </ul>

    <!-- ============ סטנדרט ============ -->
    <section class="card" id="standard">
      <h2>מה כלול בסטנדרט בכל דירה</h2>
      <p class="lead">בכל דירה מותקנת מערכת TouchWand אלחוטית בתקן Z-Wave, עם שליטה גם באמצעות SmartSphere.</p>
      <div class="split" style="margin:20px 0 6px">
        <img src="/neve-shuster/assets/touchwand-panel-9.jpg" alt="מפסק זכוכית טאץ TouchWand בעל 9 לחצנים, המפסק המותקן בדירות הפרויקט" loading="lazy" width="1100" height="705">
        <div>
          <h3 style="margin-top:0">מפסק מעוצב ליד הכניסה</h3>
          <p>שליטה בתאורה ובתריס הוויטרינה.</p>
          <p><a class="row-link" href="https://i-feel.co.il/smart-lighting/" rel="noopener" target="_blank">איך עובדת תאורה חכמה, תרחישים ועמעום ←</a><br><a class="row-link" href="https://i-feel.co.il/touchwand-app/" rel="noopener" target="_blank">מדריך האפליקציה, שליטה מהאייפון והאנדרואיד ←</a></p>
        </div>
      </div>
      <div class="grid">
        <div class="tile"><strong>מפסק מעוצב ליד הכניסה</strong><span>שליטה בתאורה ובתריס הוויטרינה.</span></div>
        <div class="tile"><strong>שליטה מהטלפון</strong><span>שליטה במערכת החכמה באמצעות אפליקציית TouchWand.</span></div>
        <div class="tile"><strong>TouchWand + Z-Wave + SmartSphere</strong><span>מערכת אחת לתפעול, לתרחישים ולהרחבות שתבחרו להוסיף לדירה.</span></div>
      </div>
    </section>

    <!-- ============ וידאו ============ -->
    <section class="card" id="video">
      <h2>רואים את המפסק בפעולה</h2>
      <p class="lead">המפסק המרכזי בדירה הוא מפסק זכוכית טאץ בעל 9 לחצנים. בסרטונים אפשר לראות אותו עובד ולראות את דוגמאות המפסקים לפני שמחליטים על שדרוגים.</p>
      <div class="grid">
        <div class="tile"><strong>סרטון המוצר</strong><span>הדגמה של מפסק TouchWand/Z-Wave, שליטה בתאורה ובתריס ושליטה מהטלפון.</span><a href="https://youtu.be/SmXbKAGoADw" rel="noopener" target="_blank">צפייה בסרטון</a></div>
        <div class="tile"><strong>המפסק בפעולה, אינסטגרם</strong><span>הדגמה קצרה של פנל 9 הלחצנים ושל דוגמאות המפסקים.</span><a href="https://www.instagram.com/reel/CvEirQIIMXj/" rel="noopener" target="_blank">צפייה ברילס</a></div>
        <div class="tile"><strong>המפסק בפעולה, טיקטוק</strong><span>אותה הדגמה, בטיקטוק.</span><a href="https://www.tiktok.com/@orenlevy4/video/7586306727516179719" rel="noopener" target="_blank">צפייה בטיקטוק</a></div>
        <div class="tile"><strong>קטלוג המוצרים</strong><span>קטלוג Z-Wave המלא להורדה.</span><a href="/assets/catalogs/zwave-catalog-2025.pdf" rel="noopener" target="_blank">פתיחת הקטלוג</a></div>
        <div class="tile"><strong>עוד סרטוני הדרכה</strong><span>ספריית הווידאו של I Feel: תזמונים, מצבי שבת, תפעול האפליקציה ועוד.</span><a href="https://i-feel.co.il/video/" rel="noopener" target="_blank">מעבר לאזור הווידאו</a></div>
        <div class="tile"><strong>כל הקטלוגים שלנו</strong><span>קטלוגים של מפסקים, בקרים, אודיו ואבטחה, מכל היצרנים שאנחנו מייבאים.</span><a href="https://i-feel.co.il/catalogs/" rel="noopener" target="_blank">מעבר לקטלוגים</a></div>
      </div>
    </section>

    <!-- ============ עולמות ============ -->
    <section class="card" id="worlds">
      <h2>מה עוד אפשר להכניס לדירה</h2>
      <p class="lead">אלה העולמות שאנחנו מחברים לאותה מערכת. אפשר להתחיל מאחד ולהוסיף בהמשך, אבל התשתית נפרסת עכשיו, בזמן הבנייה — וזה החלון הכי זול והכי נקי לעשות את זה.</p>
      <div class="media">
        <article>
          <img src="/neve-shuster/assets/motorized-shading.jpg" alt="תריס חשמלי הנשלט מהמערכת החכמה" loading="lazy">
          <div class="body"><span class="kicker">הצללה</span><h3>כל התריסים, לא רק הוויטרינה</h3><p>תריס בחדר ההורים שיורד לבד בצהריים, ותריסים שעולים יחד בבוקר. זה ההבדל שהכי מרגישים ביום־יום.</p><p><a class="row-link" href="https://i-feel.co.il/smart-lighting/" rel="noopener" target="_blank">תאורה, תריסים ותרחישים, המדריך המלא ←</a></p></div>
        </article>
        <article>
          <img src="/neve-shuster/assets/klipsch-soundbar.jpg" alt="סאונדבר Klipsch Flexus Core 300 מתחת לטלוויזיה בסלון" loading="lazy">
          <div class="body"><span class="kicker">אודיו</span><h3>אודיו לבית</h3><p>רמקולים שקועים בתקרה, סאונדבר לסלון או מערכת אודיו מלאה.</p><p>מתכננים עכשיו ומכינים את התשתיות מראש, כדי שניתן יהיה להשלים את המערכת לאחר מכן בצורה נקייה ופשוטה.</p><p><a class="row-link" href="https://i-feel.co.il/audio-and-sound-systems/" rel="noopener" target="_blank">אודיו וקולנוע ביתי, מה אנחנו עושים ←</a></p></div>
        </article>
        <article>
          <img src="/assets/articles/smart-home-alarm-system.jpg" alt="מערכת אזעקה חכמה בבית" loading="lazy">
          <div class="body"><span class="kicker">אזעקה</span><h3>שקט נפשי, גם מחו״ל</h3><p>גלאי תנועה, עשן ומגנטים לדלתות. התראה מגיעה לטלפון, והמערכת יודעת להדליק אור בכניסה חשודה.</p><p><a class="row-link" href="https://i-feel.co.il/wireless-alarm-system/" rel="noopener" target="_blank">אזעקה אלחוטית לדירה, כל מה שצריך לדעת ←</a></p></div>
        </article>
        <article>
          <img src="/neve-shuster/assets/camera-dome-card.jpg" alt="מצלמת מיני כיפה IP לבית חכם" loading="lazy">
          <div class="body"><span class="kicker">מצלמות</span><h3>לראות מה קורה בבית</h3><p>מצלמות IP ברזולוציית 4MP, בלבן או בשחור, עם ראיית לילה והקלטה. נשלטות מאותה אפליקציה של התאורה והתריסים.</p><p><a class="row-link" href="https://i-feel.co.il/smart-home/" rel="noopener" target="_blank">מצלמות ואבטחה כחלק מהבית החכם ←</a></p></div>
        </article>
        <article>
          <img src="/neve-shuster/assets/aruba-network.jpg" alt="נקודת גישה אלחוטית HP Aruba" loading="lazy">
          <div class="body"><span class="kicker">רשת</span><h3>אינטרנט שלא נופל</h3><p>ציוד HP Aruba, מהמובילים בעולם. כיסוי מלא כולל הממ״ד והמרפסת, ביצועים יציבים גם תחת עומס, ואבטחת מידע ברמה טובה. בלי אזורים מתים ובלי מהמורות בזום.</p><p><a class="row-link" href="https://i-feel.co.il/communication-networks/" rel="noopener" target="_blank">רשתות תקשורת ומתח נמוך ←</a></p></div>
        </article>
        <article>
          <img src="/neve-shuster/assets/ip-intercom.jpg" alt="אינטרקום IP עם וידאו בכניסה" loading="lazy">
          <div class="body"><span class="kicker">אינטרקום אישי לדירה</span><h3>לראות מי בדלת של הדירה שלכם</h3><p><strong>אינטרקום פרטי לדלת הכניסה של הדירה, בנוסף לאינטרקום של הבניין ולא במקומו.</strong> וידאו, דיבור ופתיחת דלת — מהמסך בבית או מהטלפון, גם כשאתם בעבודה.</p><p><a class="row-link" href="https://i-feel.co.il/gallery/אינטרקום-חכם-לבניין-מגורים/" rel="noopener" target="_blank">פרויקט אינטרקום חכם שביצענו ←</a><br><a class="row-link" href="https://i-feel.co.il/akuvox-mega-250/" rel="noopener" target="_blank">אינטרקום Akuvox, הדגמים והתשתית הנדרשת ←</a></p></div>
        </article>
      </div>
    </section>

    <!-- ============ חבילות ============ -->
    <section class="card" id="packages">
      <h2>שלוש רמות. תבחרו כמה רחוק ללכת</h2>
      <p class="lead">רוב הדיירים בוחרים את חבילת הביניים, כי התריסים הם מה שהכי מרגישים כל יום. מי שרוצה שהכל ידבר יחד הולך על פרימיום. ואפשר גם פשוט לקחת פריטים בודדים מהמחירון.</p>
      <div class="pkgs">
        <article class="pkg pkg--base">
          <h3>סטנדרט, כלול בדירה</h3>
          <ul>
            <li>קונטרולר</li>
            <li>פנל 9 לחצנים</li>
            <li>תריס ויטרינה 230V בלבד</li>
            <li>שליטה מלאה מהאפליקציה</li>
          </ul>
          <p class="price">כלול במפרט הדירה</p>
        </article>
        <article class="pkg pkg--mid">
          <h3>חבילת ביניים</h3>
          <ul>
            <li>כל מה שכלול בסטנדרט</li>
            <li>בנוסף: כל התריסים ביתר החדרים בדירה הופכים לחכמים</li>
            <li>תרחישים מהמפסקים ומהאפליקציה</li>
          </ul>
          <p class="price">הצעת מחיר אישית לפי טיפוס הדירה</p>
        </article>
        <article class="pkg pkg--premium">
          <span class="badge">הכי שלם</span>
          <h3>חבילת פרימיום</h3>
          <ul>
            <li>כל הדירה חכמה</li>
            <li>למעט תנורים, וללא חדרים רטובים</li>
            <li>שליטה בתרחישים מהמפסקים, מהאפליקציה ומהמחשב</li>
          </ul>
          <p class="price">הצעת מחיר אישית לפי טיפוס הדירה</p>
        </article>
      </div>
      <div class="callout">
        <strong>איך מקבלים מחיר לחבילה?</strong>
        מחיר החבילות נקבע לפי טיפוס הדירה ומספר נקודות התאורה והתריסים בה. מלאו את <a href="#quote">טופס הפנייה שבהמשך העמוד</a>, או כתבו למאיה כהן ב-<a href="mailto:myhome@i-feel.co.il">myhome@i-feel.co.il</a> עם מספר הדירה. נחזור אליכם עם הצעת מחיר אישית תוך יום עבודה.
      </div>
      <p>בנוסף לחבילות ניתן לשדרג ולחבר מערכות סאונד, אזעקה, מצלמות ורשת באמצעות תשתית שתיפרס בדירה, ובאפשרות הקישור למערכת האלחוטית.</p>
      <p class="lead" style="margin-top:14px">רוצים להבין מה משפיע על תקציב השדרוג של מערכת TouchWand/Z-Wave? <a href="https://i-feel.co.il/smart-home-price/" rel="noopener" target="_blank">מדריך המחירים שלנו</a> נותן תמונה מלאה.</p>
    </section>

    <!-- ============ מחירון ============ -->
    <section class="card" id="pricelist">
      <h2>המחירים, בלי הפתעות</h2>
      <p class="lead">מחירון ייעודי לשכונת הפרדס, רעננה. כל המחירים בשקלים חדשים ו<strong>אינם כוללים מע״מ</strong>. התשלום אינו כולל את עבודת החשמלאי מטעם קבלן החשמל בפרויקט.</p>

      <?php foreach ($priceGroups as $group): ?>
        <div class="table-wrap">
          <table>
            <caption><?= nsh_h($group['title']) ?><?php if (!empty($group['note'])): ?><br><small style="font-weight:400;color:#4d5766"><?= nsh_h($group['note']) ?></small><?php endif; ?></caption>
            <thead>
              <tr><th scope="col" class="th-img">תמונה</th><th scope="col">תיאור הפריט</th><th scope="col">מק״ט</th><th scope="col">מחיר יחידה<br><small style="font-weight:400">לא כולל מע״מ</small></th></tr>
            </thead>
            <tbody>
            <?php foreach ($group['rows'] as $row): ?>
              <tr>
                <td class="td-img">
                  <?php if (($row[4] ?? '') !== ''): ?>
                    <img src="/neve-shuster/assets/sku/<?= nsh_h($row[4]) ?>" alt="<?= nsh_h($row[0]) ?>" loading="lazy" width="260" height="260">
                  <?php endif; ?>
                </td>
                <td>
                  <?= nsh_h($row[1]) ?>
                  <?php if ($row[2] !== ''): ?><br><small style="color:#4d5766"><?= nsh_h($row[2]) ?></small><?php endif; ?>
                  <?php if (($row[5] ?? '') !== ''): ?><br><a class="row-link" href="<?= nsh_h($row[5]) ?>" rel="noopener" target="_blank"><?= nsh_h($row[6] ?? 'מידע נוסף') ?> ←</a><?php endif; ?>
                </td>
                <td class="sku"><?= nsh_h($row[0]) ?></td>
                <td class="price"><?= nsh_h($row[3]) ?> ₪</td>
              </tr>
            <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      <?php endforeach; ?>

      <div class="notice">
        <strong>חשוב לדעת לפני שמזמינים</strong>
        המחירים אינם כוללים מע״מ. התשלום אינו כולל את עבודת החשמלאי מטעם קבלן החשמל בפרויקט, ואת העלות הסופית של עבודת החשמלאי יש לבדוק מול מתאמת שינויי הדיירים של הפרויקט. ט.ל.ח.
      </div>
      <p><a class="button" href="#quote">בקשת הצעת מחיר לשדרוגים</a></p>
    </section>

    <!-- ============ גופי תאורה והספקים ============ -->
    <section class="card" id="load">
      <h2>גופי תאורה והספקים, מה שחשוב לדעת לפני שקונים</h2>
      <p class="lead">זה הסעיף שהכי חשוב לקרוא, וגם זה שהכי הרבה אנשים מדלגים עליו. רוב התקלות שאנחנו רואים בשטח הן לא תקלות של המערכת, אלא של עומס.</p>

      <h3>למה זה קורה</h3>
      <p>לכל רכיב במערכת יש הספק מרבי שהוא מסוגל להעביר. המיקרומודול, למשל, מוגבל ל-5 אמפר לערוץ ולמקסימום 120 וואט. אם מחברים אליו יותר ממה שהוא בנוי להעביר, הוא נשרף. זה לא כשל של המוצר, זו חריגה מהמפרט.</p>

      <div class="notice">
        <strong>לדים זה לא מה שכתוב על הקופסה</strong>
        גוף לד של 10 וואט לא בהכרח מושך 10 וואט. לשנאים ולדרייברים של לדים יש זרם התנעה גבוה בהרבה מזרם העבודה, ברגע ההדלקה. כמה גופים על מעגל אחד יכולים לעבור יחד את הסף בדיוק בשנייה הזאת, ואז הרכיב נפגע גם אם החישוב על הנייר נראה תקין.
      </div>

      <h3>מה זה אומר עבורכם, בפועל</h3>
      <ul>
        <li><strong>לפני שקונים גופי תאורה</strong> — שלחו לנו את המפרט: כמה גופים בכל מעגל, מה ההספק של כל אחד, ואיזה שנאי או דרייבר מגיע איתם.</li>
        <li><strong>לפני שמוסיפים גופים אחרי ההתקנה</strong> — כל תוספת משנה את החישוב, וגם החלפה של גוף קיים בגוף חזק יותר.</li>
        <li><strong>גופים עם עמעום</strong> — לא כל דרייבר תומך בעמעום, וגם כשהוא תומך לא כל שילוב עובד חלק. נגיד לכם מראש אם השילוב בעייתי.</li>
        <li><strong>תאורת חוץ ומרפסת</strong> — דורשת התייחסות נפרדת בגלל אורך הכבל והחשיפה לתנאי מזג האוויר.</li>
      </ul>
      <p class="lead">הרחבנו על הנושא בשני מקומות באתר: <a href="https://i-feel.co.il/smart-lighting/" rel="noopener" target="_blank">עמוד התאורה החכמה</a> מסביר איך בונים מעגלי תאורה ועמעום נכון, ו<a href="https://i-feel.co.il/smart-home-planning-mistakes/" rel="noopener" target="_blank">הטעויות הנפוצות בתכנון בית חכם</a> מרכז בדיוק את המקומות שבהם דיירים מגלים מאוחר מדי שהתשתית לא מתאימה. שווה גם לקרוא על <a href="https://i-feel.co.il/right-infrastructure-for-a-smart-home/" rel="noopener" target="_blank">התשתית הנכונה לבית חכם</a> לפני שסוגרים עם החשמלאי.</p>

      <div class="callout">
        <strong>שווה לשאול לפני, לא אחרי</strong>
        בדיקת התאמה של גופי התאורה למערכת לא עולה לכם כלום ולוקחת לנו כמה דקות. החלפת רכיב שנשרף בגלל עומס כן עולה, והיא לא נכללת באחריות. שלחו את רשימת גופי התאורה ב<a href="#quote">טופס הפנייה</a> או במייל למאיה כהן ב-<a href="mailto:myhome@i-feel.co.il">myhome@i-feel.co.il</a>.
      </div>
    </section>

    <!-- ============ מוצרים נוספים ============ -->
    <section class="card" id="more-products">
      <h2>לא ראיתם? כנראה שיש לנו את זה</h2>
      <p class="lead">המחירון שלמעלה הוא רק מה שהכי מבוקש בפרויקט. אנחנו מייבאים ומוכרים הרבה מעבר לזה, וחלק גדול מזה בכלל לא מופיע באתר. אם משהו חסר לכם — שאלו, ברוב המקרים התשובה חיובית.</p>
      <div class="media">
        <article class="media--noimg">
          <div class="body"><span class="kicker">גימור</span><h3>שקעי זכוכית בגוון המפסקים</h3><p>שקעים ומסגרות בגימור זכוכית, בלבן או בשחור, תואמים בדיוק לגוון המפסקים החכמים. הקיר נראה כמקשה אחת ולא כתערובת של אביזרים משלוש סדרות שונות. נשמח להראות לכם דוגמאות.</p><p><a class="row-link" href="https://i-feel.co.il/switch-configurator/" rel="noopener" target="_blank">מגדיר המפסקים, לראות שילובי גוונים ←</a></p></div>
        </article>
        <article>
          <img src="/neve-shuster/assets/home-cinema-room.jpg" alt="חדר קולנוע ביתי" loading="lazy">
          <div class="body"><span class="kicker">אודיו</span><h3>הרבה מעבר לשתי שורות במחירון</h3><p>רמקולים שקועים, אזורי שמע, קולנוע ביתי, פתרונות למרפסת. הצוות שלנו מתאים את המערכת לחלל ולתקציב.</p><p><a class="row-link" href="https://i-feel.co.il/gallery/חדר-קולנוע-ביתי/" rel="noopener" target="_blank">חדר קולנוע ביתי שבנינו, תמונות מהפרויקט ←</a></p></div>
        </article>
        <article>
          <img src="/neve-shuster/assets/touchwand-screen.jpg" alt="מסך מגע TouchWand לשליטה בבית החכם" loading="lazy">
          <div class="body"><span class="kicker">מערכות משלימות</span><h3>מסכי שליטה ועוד</h3><p>אינטרקום, מצלמות, רשת תקשורת, מסכי בקרה ומגוון רכיבים נוספים — כולם מתחברים לאותה מערכת אחת.</p><p><a class="row-link" href="https://i-feel.co.il/smart-home/" rel="noopener" target="_blank">הבית החכם של I Feel, כל המערכות במקום אחד ←</a></p></div>
        </article>
        <article>
          <img src="/neve-shuster/assets/camera-dome-card.jpg" alt="מצלמת מיני כיפה IP ברזולוציית 4MP" loading="lazy">
          <div class="body"><span class="kicker">מצלמות</span><h3>מצלמה בכניסה לדירה ובמרפסת</h3><p>מצלמת מיני כיפה IP ברזולוציית 4MP, דגם DS-2CD2543G2-IS עם עדשת 2.8 מ״מ, בלבן או בשחור. מותקנת מול דלת הכניסה של הדירה או במרפסת, מתחברת לאפליקציה של הבית החכם, ורואים ממנה מי מגיע גם כשלא בבית. נדרשת הכנה בזמן הבנייה.</p><p><a class="row-link" href="https://i-feel.co.il/wireless-alarm-system/" rel="noopener" target="_blank">מצלמות ואזעקה אלחוטית, איך זה מתחבר יחד ←</a></p></div>
        </article>
        <article>
          <img src="/neve-shuster/assets/outdoor-tv-balcony.jpg" alt="מסך טלוויזיה חיצוני עמיד למים במרפסת" loading="lazy">
          <div class="body"><span class="kicker">מרפסת</span><h3>מסך לד, מסך חוץ למרפסת</h3><p>מסך ייעודי לחוץ, עמיד למים, לאבק ולשמש, עם בהירות גבוהה שנראית גם באור יום. משתלב עם אודיו חוץ ועם אותה מערכת שליטה.</p><p><a class="row-link" href="https://i-feel.co.il/projector-lift-installation/" rel="noopener" target="_blank">גם מקרן ומעלית מקרן נסתרת, אם מעדיפים ←</a></p></div>
        </article>
        <article>
          <img src="/neve-shuster/assets/smart-home-app-tablet.jpg" alt="שליטה בבית החכם מהאפליקציה" loading="lazy">
          <div class="body"><span class="kicker">התאמה אישית</span><h3>ראיתם רעיון? תביאו אותו</h3><p>אם משהו קסם לכם אצל חברים או ברשת, שלחו לנו תמונה. אנחנו נבדוק אם אפשר לשלב אותו בדירה שלכם ובכמה.</p><p><a class="row-link" href="https://i-feel.co.il/projects/" rel="noopener" target="_blank">הפרויקטים שביצענו, לקבל רעיונות ←</a></p></div>
        </article>
      </div>
      <div class="callout">
        <strong>איך שואלים</strong>
        פשוט כתבו מה אתם מחפשים ב<a href="#quote">טופס הפנייה שבהמשך העמוד</a>, או במייל למאיה כהן ב-<a href="mailto:myhome@i-feel.co.il">myhome@i-feel.co.il</a>. נחזור אליכם עם אפשרויות ומחיר.
      </div>
    </section>

    <!-- ============ הפעלת TouchWand / SmartSphere ============ -->
    <section class="card" id="first-run">
      <h2>איך מפעילים את הבית החכם?</h2>
      <p class="lead">המערכת בדירה מבוססת TouchWand ומאפשרת שליטה נוחה מהטלפון על הבית החכם. כאן תוכלו למצוא את מדריך ההפעלה והחיבור לאפליקציה.</p>
      <p><a class="button button--quiet" href="https://i-feel.co.il/touchwand-app/" rel="noopener" target="_blank">למדריך SmartSphere</a></p>
      <div class="notice">
        <strong>שימו לב: ההדרכה שלכם היא העמוד הזה</strong>
        אין הדרכה פיזית בדירה בסיום ההתקנה. ההדרכה היא הקישור הזה והסרטונים שבו, והם זמינים לכם תמיד, גם בעוד שנתיים וגם בשתיים בלילה. שווה לשמור את הכתובת. מי שרוצה ליווי אישי — אנחנו עושים פגישות בזום, ואפשר לתאם אותן מול מאיה כהן.
      </div>

      <div class="split qr-split">
        <div class="qr-box">
          <img src="/neve-shuster/assets/qr-help-neve-shuster.png" alt="קוד QR לפתיחת מרכז השירות של I Feel עם פרויקט שכונת הפרדס מזוהה מראש" width="370" height="370">
          <p><strong>אותו קוד שמודבק על המפסק</strong><br>פותח את מרכז השירות כשהפרויקט שלכם כבר מזוהה. אפשר לסרוק מכאן, או ישירות מהמפסק בקיר.</p>
          <a class="button button--quiet" href="https://i-feel.co.il/help/?p=neve-shuster&amp;u=tenant" rel="noopener" target="_blank">או לחצו כאן לפתיחה ישירה</a>
        </div>
        <div>
          <h3 style="margin-top:0">המדבקה שעל המפסק</h3>
          <p>על מפסק הזכוכית עצמו מודבקת מדבקה קטנה עם קוד QR. סורקים אותה עם המצלמה של הטלפון, וזהו — לא צריך לחפש כלום ולא צריך לזכור כתובת. הקוד מוביל למרכז השירות של I Feel, וכיוון שהוא מסמן את הפרויקט שלכם, המערכת כבר יודעת שאתם דיירים בשכונת הפרדס ומציגה לכם את התכנים הרלוונטיים: תקלות נפוצות, פתרונות לפי מערכת, ופתיחת קריאת שירות.</p>
          <p>זה בדיוק אותו קוד שמופיע בעמוד הזה, אז אם אתם קוראים מהמחשב — אפשר לסרוק אותו ישר מהמסך.</p>
          <p>שווה לשמור את הכתובת במועדפים בטלפון עוד ביום הראשון. ברגע שמשהו לא מתנהג כמו שציפיתם, זו הכתובת הראשונה — לפני שמרימים טלפון.</p>
        </div>
      </div>

      <h3>שלב אחר שלב</h3>
      <ol class="steps-num">
        <li>
          <strong>מתקינים את האפליקציה</strong>
          <p><u>אנדרואיד:</u> מחפשים <em>TouchWand</em> ב-Google Play ומתקינים.<br>
          <u>אייפון:</u> אפליקציית TouchWand כבר לא זמינה בחנות של Apple, ולכן נכנסים מ-Safari לכתובת <a href="https://cloud.touchwand.com" rel="noopener" target="_blank">cloud.touchwand.com</a>, מתחברים, ואז לוחצים על כפתור השיתוף ובוחרים <em>הוספה למסך הבית</em>. מקבלים אייקון שנראה ומתנהג בדיוק כמו אפליקציה.</p>
          <a class="row-link" href="https://i-feel.co.il/touchwand-app/" rel="noopener" target="_blank">המדריך המלא לאייפון ולאנדרואיד, עם צילומי מסך ←</a>
        </li>
        <li>
          <strong>מתחברים בפעם הראשונה</strong>
          <p><strong>שם המשתמש הוא כתובת הדואר האלקטרוני שלכם</strong> — אותה כתובת שרשומה אצלנו, כפי שקיבלנו אותה מהיזם ברשימת הדיירים של הפרויקט. זו בדרך כלל אותה כתובת שאיתה נכנסתם לעמוד הזה.</p>
          <p><strong>הסיסמה נשלחת לאותה כתובת דואר אלקטרוני.</strong> פותחים את המייל, מעתיקים, ונכנסים. כדאי להציץ גם בתיקיית דואר הזבל.</p>
          <p>לא הגיעה סיסמה, או שאתם לא בטוחים איזו כתובת נמסרה ליזם? כתבו למאיה כהן ב-<a href="mailto:myhome@i-feel.co.il">myhome@i-feel.co.il</a> עם מספר הדירה והבניין, ונסדר את זה. זו בקשה שגרתית לחלוטין.</p>
          <p><strong>טיפ:</strong> אם יש בבית יותר ממשתמש אחד, בקשו מאיתנו משתמש נפרד לכל בן משפחה במקום לחלוק אחד. ככה כל אחד רואה את מה שרלוונטי לו, ואפשר להגביל ילדים מפעולות מסוימות.</p>
        </li>
        <li>
          <strong>מכיילים את התריסים</strong>
          <p>זו הפעולה הראשונה שכדאי לעשות, והיא גם הסיבה מספר אחת לקריאות שירות מיותרות בשבוע הראשון. תריס שלא כויל לא יודע מה זה 50 אחוז, ולכן נראה כאילו הוא לא מקשיב. הכיול לוקח דקה לכל תריס.</p>
          <a class="row-link" href="https://www.youtube.com/watch?v=BEKATheYp9U" rel="noopener" target="_blank">סרטון: כיול תריסים בבית חכם, שלב אחר שלב ←</a>
        </li>
        <li>
          <strong>בונים את התרחיש הראשון</strong>
          <p>התחילו מדבר אחד פשוט: תריס שעולה בבוקר או תאורה שנכבית בשעה קבועה. ברגע שהתרחיש הראשון עובד, השאר מגיע לבד.</p>
          <a class="row-link" href="https://www.youtube.com/watch?v=fIu6RUgQd6U" rel="noopener" target="_blank">סרטון: כיצד עושים תזמונים בבית חכם ←</a><br>
          <a class="row-link" href="https://i-feel.co.il/smart-home-scheduling/" rel="noopener" target="_blank">ומדריך התזמונים הכתוב באתר ←</a>
        </li>
        <li>
          <strong>מחברים את המזגן, אם שדרגתם</strong>
          <p>מזגנים מתחברים למערכת בשיוך חד־פעמי. הסרטון מראה את זה על כמה יצרנים שונים.</p>
          <a class="row-link" href="https://www.youtube.com/watch?v=mVP8OHtLjso" rel="noopener" target="_blank">סרטון: חיבור מזגנים למערכת SmartSphere ←</a>
        </li>
        <li>
          <strong>מסדרים את האייקונים במפסק</strong>
          <p>האייקונים על מפסק הזכוכית ניתנים להחלפה, וזה משנה לגמרי את תחושת השימוש כשכל לחצן מסומן במה שהוא באמת מפעיל. ההחלפה עצמה פשוטה, והסרטון מראה אותה. רוצים שנתכנן לכם אייקונים מותאמים מראש? זו שורה במחירון, 200 ₪ למפסק.</p>
          <a class="row-link" href="https://www.youtube.com/watch?v=AkwVp-VQ3r8" rel="noopener" target="_blank">סרטון: החלפת אייקונים במפסק זכוכית של 9 לחצנים ←</a><br>
          <a class="row-link" href="https://i-feel.co.il/switch-configurator/" rel="noopener" target="_blank">מגדיר המפסקים, לראות איך ייראה המפסק שלכם ←</a>
        </li>
      </ol>

      <div class="callout">
        <strong>נתקעתם? זה נורמלי, ואנחנו לא נעלמים אחרי המסירה</strong>
        רוב הדברים נפתרים בשתי דקות בטלפון. מרכז השירות שלנו נמצא ב-<a href="https://i-feel.co.il/help/?p=neve-shuster&amp;u=tenant" rel="noopener" target="_blank">i-feel.co.il/help</a> ומרכז את התקלות הנפוצות ואת הפתרונות לפי מערכת.
        אם צריך טכנאי, פותחים <a href="https://i-feel.co.il/service-request/" rel="noopener" target="_blank">קריאת שירות מקוונת</a>, ומחלקת השירות חוזרת אליכם.
        וכמובן, אפשר תמיד לכתוב למאיה כהן ב-<a href="mailto:myhome@i-feel.co.il">myhome@i-feel.co.il</a> והיא תנתב את זה פנימה.
      </div>

      <div class="notice">
        <strong>רוצים מישהו שיעבור אתכם על זה?</strong>
        אנחנו עושים פגישות ליווי בזום, שבהן עוברים על המערכת שלכם ספציפית ובונים יחד את התרחישים הראשונים. לתיאום, כתבו למאיה כהן ב-<a href="mailto:myhome@i-feel.co.il">myhome@i-feel.co.il</a>.
      </div>
    </section>

    <!-- ============ שינויים בתכניות ============ -->
    <section class="card" id="changes">
      <h2>שינויים בדירה ועלות עדכון תכניות</h2>
      <p class="lead">אם תבחרו לבצע שינויים בתכניות החשמל בדירתכם, נדרשת בניית תכניות חדשות על ידי האדריכלית שלנו.</p>

      <h3>מה נחשב שינוי</h3>
      <ul>
        <li>הוספת ציוד למערכת החשמל החכם עקב תכנון שונה של קירות או של מעגלי תאורה</li>
        <li>שינויים במיקום נקודות חשמל, מפסקים, מצלמות או אבטחה</li>
        <li>תוספות ושדרוגים הגוררים התאמות בציוד</li>
      </ul>

      <h3>למה נגבה תשלום</h3>
      <p>התהליך כרוך בעבודה מקצועית נוספת: אנחנו מוציאים תכניות מעודכנות, מעבירים אותן למחלקת שינויי הדיירים של הפרויקט, והמפקח שלנו מגיע לאתר לאשר שהחשמלאי אכן ביצע את השינוי בפועל. התשלום מכסה את העבודה הזאת ומבטיח שהשינוי יתבצע בצורה מדויקת, מסודרת וללא טעויות בשטח.</p>
      <p>שימו לב שבנפרד מעלות עדכון התכניות, שינוי מסוים עשוי לדרוש גם ציוד נוסף. אם זה המצב, נציין זאת בהצעת המחיר שתקבלו.</p>

      <p class="big-price">עלות שינוי תכניות: 540 ₪ (לא כולל מע״מ)</p>

      <div class="callout">
        <strong>מתי לא משלמים</strong>
        אין צורך בתשלום אם מבוצעת סקיצה על גבי התכנית בלבד. לפני הפקת תכנית ביצוע, תשלום השינוי ייגבה יחד עם הצעת המחיר שתישלח אליכם. שינוי התכנית לביצוע יבוצע רק לאחר קבלת התשלום בפועל.
      </div>

      <div class="notice">
        <strong>דירות עם שתי הזנות</strong>
        בדירות בהיקף של כ-40 מ״ר לחלל, על פי חוק החשמל קיימות שתי הזנות נפרדות. במקרה זה לא ניתן לרכז את כל התאורה בפנל התשעה, ונדרש מפסק נוסף, לרוב במבואה. התכניות מאושרות על ידי יועץ החשמל של הפרויקט מטעם היזם.
      </div>

      <h3>איך פותחים בקשת שינוי</h3>
      <p>שולחים מייל ל-<a href="mailto:sales@i-feel.co.il">sales@i-feel.co.il</a>, עם עותק למאיה כהן ב-<a href="mailto:myhome@i-feel.co.il">myhome@i-feel.co.il</a>, ומציינים:</p>
      <ul>
        <li>שם הפרויקט: שכונת הפרדס, רעננה</li>
        <li>מספר הדירה והבניין</li>
        <li>שם האדריכל או המעצב</li>
        <li>מספר טלפון וכתובת דוא״ל ליצירת קשר</li>
      </ul>
      <p>לאחר בקשת השינוי נחזור אליכם בדואר אלקטרוני עם התכניות החדשות. אם יש לכם אדריכל או מעצב, התיאום מתבצע מולו ישירות.</p>
      <p class="lead">לאדריכלים ולמעצבים שעובדים אתכם: יש לנו <a href="https://i-feel.co.il/architects-smart-home-planning/" rel="noopener" target="_blank">עמוד ייעודי לתכנון בית חכם עם אדריכלים</a>, ו<a href="https://i-feel.co.il/smart-home-planning/" rel="noopener" target="_blank">מדריך תכנון מלא</a> שאפשר לשלוח להם לפני הפגישה. זה חוסך סבבי תיקונים.</p>
      <p>
        <a class="button" href="#quote" data-preselect="plans">פתיחת בקשת שינוי תכניות</a>
        <span class="lead" style="display:inline-block;margin-inline-start:12px">או במייל ל-<a href="mailto:sales@i-feel.co.il">sales@i-feel.co.il</a></span>
      </p>
    </section>

    <!-- ============ שבת ============ -->
    <section class="card" id="shabbat">
      <h2>מצבי שבת ולוחות זמנים לחגי ישראל</h2>
      <p class="lead">לדיירים המעוניינים בשמירה על הלכות שבת וחג, אנו מציעים התאמות ייעודיות במערכת.</p>
      <h3>מה זה כולל</h3>
      <ul>
        <li>מצב שבת, ניהול אוטומטי של תאורה, תריסים ומכשירים חשמליים, כך שהמערכת תתפקד ללא צורך במגע או שליטה ידנית.</li>
        <li>לוחות זמנים מותאמים לחגים, יצירת תרחישים אוטומטיים ייחודיים לחגי ישראל, למשל הדלקת אורות בערב החג, כיבוי בשעות קבועות והפעלת תריסים בתזמון.</li>
        <li>בקרת מערכות מרכזיות, אפשרות לכבות או להפעיל קבוצות אורות או מערכות בהתאם לדרישות השבת.</li>
      </ul>
      <h3>מה נדרש מכם</h3>
      <ul>
        <li>לציין אילו מעגלים או מכשירים ישולבו במצב שבת, למשל תאורה בסלון או תריס בחדר ההורים.</li>
        <li>למסור שעות פעולה רצויות של כיבוי, הדלקה וטיימרים לשבתות וחגים.</li>
        <li>להחליט אם רוצים תרחישים קבועים לכל שבת, או אפשרות לשינוי מראש לפני כל חג ושבת.</li>
      </ul>
      <p>המערכת תוגדר ותותאם אישית לכל דירה, כך שתאפשר שמירה מלאה על אורח החיים הדתי לצד נוחות מקסימלית.</p>
      <div class="callout">
        <strong>רוצים לראות איך זה עובד?</strong>
        הכנו סרטון הדרכה שמראה את הגדרת מצב שבת ולוחות הזמנים במערכת.
        <a href="https://www.youtube.com/watch?v=I28b9j8MZyg" rel="noopener" target="_blank">צפייה בסרטון ביוטיוב</a>,
        או בכל סרטוני ההדרכה שלנו <a href="https://i-feel.co.il/video/#tutorials" rel="noopener" target="_blank">באזור הווידאו באתר</a>.
        בנוסף, <a href="https://i-feel.co.il/smart-home-scheduling/" rel="noopener" target="_blank">המדריך לתזמונים בבית חכם</a> מסביר צעד אחר צעד איך בונים לוח זמנים בעצמכם, בלי להזמין טכנאי.
      </div>
    </section>

    <!-- ============ להעמיק באתר ============ -->
    <section class="card" id="learn">
      <h2>רוצים להעמיק? הנה כל מה שיש לנו</h2>
      <p class="lead">הדירה שלכם היא רק ההתחלה. I Feel עוסקת בבית חכם, באודיו, באבטחה, ברשתות ובבקרת מבנה מאז 2008, עם למעלה מ-9,000 לקוחות ומעל 180 פרויקטי בקרת מבנה. ריכזנו כאן את החומר המקצועי שיעזור לכם להחליט נכון, לא רק על הפרויקט הזה.</p>
      <div class="linkcols">
        <div class="lc">
          <h3>הבית החכם, לעומק</h3>
          <ul>
          <li><a href="https://i-feel.co.il/smart-home/" rel="noopener" target="_blank">בית חכם, המדריך המלא</a> <span>מה המערכת יודעת לעשות ואיך היא נבנית</span></li>
          <li><a href="https://i-feel.co.il/smart-lighting/" rel="noopener" target="_blank">תאורה חכמה ותרחישים</a> <span>עמעום, מעגלים, תאורה סמויה ותאורת חוץ</span></li>
          <li><a href="https://i-feel.co.il/smart-home-scheduling/" rel="noopener" target="_blank">תזמונים ולוחות זמנים</a> <span>להגדיר בעצמכם, בלי טכנאי</span></li>
          <li><a href="https://i-feel.co.il/touchwand-app/" rel="noopener" target="_blank">SmartSphere ו-TouchWand</a> <span>הפעלה וחיבור לאפליקציה, שלב אחר שלב</span></li>
          </ul>
        </div>
        <div class="lc">
          <h3>אבטחה, מצלמות ואינטרקום</h3>
          <ul>
          <li><a href="https://i-feel.co.il/wireless-alarm-system/" rel="noopener" target="_blank">אזעקה אלחוטית לדירה</a> <span>Risco WiComm Pro, בלי חציבות ובלי חשמלאי</span></li>
          <li><a href="https://i-feel.co.il/risco-cloud-subscription/" rel="noopener" target="_blank">מנוי ענן לאזעקה</a> <span>מה זה נותן וכמה זה עולה</span></li>
          <li><a href="https://i-feel.co.il/gallery/אינטרקום-חכם-לבניין-מגורים/" rel="noopener" target="_blank">אינטרקום חכם, פרויקט</a> <span>תמונות מהשטח</span></li>
          <li><a href="https://i-feel.co.il/akuvox-mega-250/" rel="noopener" target="_blank">אינטרקום Akuvox</a> <span>הדגמים והתשתית שנדרשת</span></li>
          <li><a href="https://i-feel.co.il/communication-networks/" rel="noopener" target="_blank">רשת תקשורת ומתח נמוך</a> <span>כבילה, סיב אופטי וכיסוי WiFi</span></li>
          </ul>
        </div>
        <div class="lc">
          <h3>אודיו, וידאו ובידור</h3>
          <ul>
          <li><a href="https://i-feel.co.il/audio-and-sound-systems/" rel="noopener" target="_blank">אודיו וקולנוע ביתי</a> <span>Multi-room, רמקולים שקועים, Atmos</span></li>
          <li><a href="https://i-feel.co.il/gallery/חדר-קולנוע-ביתי/" rel="noopener" target="_blank">חדר קולנוע ביתי</a> <span>פרויקט שביצענו, מהתכנון ועד הכיול</span></li>
          <li><a href="https://i-feel.co.il/projector-lift-installation/" rel="noopener" target="_blank">מעלית מקרן נסתרת</a> <span>מקרן שנעלם בתקרה</span></li>
          <li><a href="https://i-feel.co.il/video/" rel="noopener" target="_blank">ספריית הווידאו</a> <span>הדגמות וסרטוני הדרכה</span></li>
          </ul>
        </div>
        <div class="lc">
          <h3>לפני שמחליטים</h3>
          <ul>
          <li><a href="https://i-feel.co.il/smart-home-price/" rel="noopener" target="_blank">כמה עולה בית חכם</a> <span>מדריך מחיר ותקציב לישראל</span></li>
          <li><a href="https://i-feel.co.il/smart-home-planning/" rel="noopener" target="_blank">תכנון בית חכם</a> <span>מה מחליטים ומתי</span></li>
          <li><a href="https://i-feel.co.il/smart-home-planning-mistakes/" rel="noopener" target="_blank">טעויות נפוצות בתכנון</a> <span>מה דיירים מגלים מאוחר מדי</span></li>
          <li><a href="https://i-feel.co.il/right-infrastructure-for-a-smart-home/" rel="noopener" target="_blank">התשתית הנכונה</a> <span>מה לבקש מהחשמלאי עכשיו</span></li>
          <li><a href="https://i-feel.co.il/architects-smart-home-planning/" rel="noopener" target="_blank">לאדריכלים ולמעצבים</a> <span>לשלוח למי שמתכנן לכם את הדירה</span></li>
          </ul>
        </div>
        <div class="lc">
          <h3>אחרי הכניסה לדירה</h3>
          <ul>
          <li><a href="https://i-feel.co.il/service-and-maintenance/" rel="noopener" target="_blank">שירות ותחזוקה</a> <span>מה כולל הליווי שלנו</span></li>
          <li><a href="https://i-feel.co.il/service-request/" rel="noopener" target="_blank">פתיחת קריאת שירות</a> <span>טופס מקוון</span></li>
          <li><a href="https://i-feel.co.il/smart-home-system-upgrade/" rel="noopener" target="_blank">שדרוג מערכת קיימת</a> <span>להוסיף יכולות בעוד כמה שנים</span></li>
          <li><a href="https://i-feel.co.il/wireless-smart-home-existing-apartment/" rel="noopener" target="_blank">בית חכם בדירה קיימת</a> <span>בלי לשבור קירות</span></li>
          <li><a href="https://i-feel.co.il/שאלות-נפוצות/" rel="noopener" target="_blank">שאלות נפוצות</a> <span>התשובות שהכי שואלים אותנו</span></li>
          </ul>
        </div>
        <div class="lc">
          <h3>מי אנחנו באמת</h3>
          <ul>
          <li><a href="https://i-feel.co.il/about-i-feel-smart-building-company/" rel="noopener" target="_blank">אודות I Feel</a> <span>מאז 2008, 9,000+ לקוחות</span></li>
          <li><a href="https://i-feel.co.il/projects/" rel="noopener" target="_blank">הפרויקטים שלנו</a> <span>וילות, דירות ומבנים</span></li>
          <li><a href="https://i-feel.co.il/structure-control/" rel="noopener" target="_blank">בקרת מבנה ו-BMS</a> <span>180+ פרויקטי בקרת מבנה</span></li>
          <li><a href="https://i-feel.co.il/brands-and-technologies/" rel="noopener" target="_blank">מותגים וטכנולוגיות</a> <span>מה אנחנו מייבאים ומתקינים</span></li>
          <li><a href="https://i-feel.co.il/catalogs/" rel="noopener" target="_blank">כל הקטלוגים</a> <span>להורדה</span></li>
          </ul>
        </div>
      </div>
      <div class="callout">
        <strong>לא מצאתם תשובה?</strong>
        כתבו למאיה כהן ב-<a href="mailto:myhome@i-feel.co.il">myhome@i-feel.co.il</a> או מלאו את <a href="#quote">טופס הפנייה</a>. אנחנו עונים תוך יום עבודה.
      </div>
    </section>

    <!-- ============ אנשי קשר ============ -->
    <section class="card" id="contacts">
      <h2>כתובת אחת לכל דבר</h2>
      <p class="lead">אין צורך לזכור מי אחראי על מה, ואין צורך לרדוף אחרי אף אחד. יש כתובת אחת, והיא דואגת לשאר.</p>

      <div class="contacts<?= count($contacts) === 1 ? ' contacts--single' : '' ?>">
        <?php foreach ($contacts as $contact): ?>
          <div class="contact">
            <?php if (($contact['photo'] ?? '') !== ''): ?>
              <img class="contact__photo" src="<?= nsh_h($contact['photo']) ?>" alt="<?= nsh_h($contact['name']) ?>" loading="lazy" width="76" height="76">
            <?php endif; ?>
            <b><?= nsh_h($contact['name']) ?></b>
            <span><?= nsh_h($contact['role']) ?></span>
            <span style="margin-top:6px"><?= nsh_h($contact['desc']) ?></span>
            <a href="mailto:<?= nsh_h($contact['email']) ?>"><?= nsh_h($contact['email']) ?></a>
          </div>
        <?php endforeach; ?>
      </div>

      <div class="callout">
        <strong>מה קורה אחרי שאתם כותבים</strong>
        מאיה קוראת את הפנייה ומנתבת אותה פנימה: שינוי תכניות ותיאום אדריכלי עוברים למחלקת התכנון, תקלות ותיאומי פיקוח למחלקת השירות והפרויקטים, ובקשה להוסיף או לשדרג משהו עוברת למחלקת המכירות לקבלת הצעת מחיר. אתם מקבלים תשובה מהגורם הרלוונטי, בלי לעבור בין אנשים.
      </div>

      <div class="callout">
        <strong>תהליך העבודה בקצרה</strong>
        תכנון ואישור התכניות, מעבר למחלקת הפרויקטים, תיאום הפיקוח והדרכת החשמלאי בשטח, ותיאומי ההתקנה. בסיום, <a href="https://i-feel.co.il/service-and-maintenance/" rel="noopener" target="_blank">מערך השירות והתחזוקה</a> של החברה מלווה אתכם גם אחרי הכניסה לדירה, ואפשר לפתוח קריאה ישירות דרך <a href="https://i-feel.co.il/service-request/" rel="noopener" target="_blank">טופס קריאת השירות</a>.
      </div>
    </section>

    <!-- ============ טופס פנייה ============ -->
    <section class="card" id="quote">
      <h2>בקשת הצעת מחיר אישית לדירה שלכם</h2>
      <p class="lead">לכל דייר קיימת הצעה מותאמת לפי טיפוס הדירה במסגרת שינויי הדיירים. אם פרטי הדירה כבר משויכים לכתובת המאומתת, הם מופיעים כאן אוטומטית ואין צורך למלא אותם שוב.</p>

      <?php if ($error !== ''): ?><div class="alert alert--error" role="alert"><?= nsh_h($error) ?></div><?php endif; ?>
      <?php if ($leadStatus === 'sent' || $leadStatus === 'sent-mail'): ?>
        <div class="alert alert--ok" role="status">הפנייה התקבלה. נחזור אליכם בהקדם, בדרך כלל תוך יום עסקים אחד.</div>
      <?php elseif ($leadStatus === 'error'): ?>
        <div class="alert alert--error" role="alert">לא הצלחנו לשלוח את הפנייה כרגע. אפשר לכתוב לנו ישירות ל-myhome@i-feel.co.il.</div>
      <?php endif; ?>

      <?php if (($user['proposal_url'] ?? '') !== ''): ?>
        <div class="personal-proposal">
          <strong>ההצעה המותאמת לדירה שלכם מוכנה</strong>
          <?php if (($user['building'] ?? '') !== '' || ($user['apartment'] ?? '') !== '' || ($user['apartment_type'] ?? '') !== ''): ?>
            <span><?= ($user['building'] ?? '') !== '' ? 'בניין ' . nsh_h($user['building']) : '' ?><?= ($user['apartment'] ?? '') !== '' ? (($user['building'] ?? '') !== '' ? ', ' : '') . 'דירה ' . nsh_h($user['apartment']) : '' ?><?= ($user['apartment_type'] ?? '') !== '' ? ((($user['building'] ?? '') !== '' || ($user['apartment'] ?? '') !== '') ? ', ' : '') . 'טיפוס ' . nsh_h($user['apartment_type']) : '' ?></span>
          <?php endif; ?>
          <a class="button button--quiet" href="<?= nsh_h($user['proposal_url']) ?>" rel="noopener" target="_blank">לצפייה בהצעה לשינויי הדיירים</a>
        </div>
      <?php else: ?>
        <div class="proposal-status" data-proposal-status role="status">בחרו בניין ומספר דירה כדי שנוכל להתאים את ההצעה הנכונה לשינויי הדיירים.</div>
      <?php endif; ?>

      <form class="access-form quote-form" data-resident-quote method="post" action="/neve-shuster/#quote">
        <input type="hidden" name="csrf" value="<?= nsh_h($csrf) ?>">
        <input type="hidden" name="action" value="lead">
        <?php if (($user['name'] ?? '') !== ''): ?>
          <div class="prefilled-field"><span>שם מלא</span><strong><?= nsh_h($user['name']) ?></strong><small>זוהה לפי הקישור האישי</small><input type="hidden" name="name" value="<?= nsh_h($user['name']) ?>"></div>
        <?php else: ?>
          <label><span>שם מלא</span><input type="text" name="name" maxlength="120" required></label>
        <?php endif; ?>

        <?php if (($user['phone'] ?? '') !== ''): ?>
          <div class="prefilled-field"><span>טלפון</span><strong><?= nsh_h($user['phone']) ?></strong><small>זוהה לפי הקישור האישי</small><input type="hidden" name="phone" value="<?= nsh_h($user['phone']) ?>"></div>
        <?php else: ?>
          <label><span>טלפון</span><input type="tel" name="phone" inputmode="tel" maxlength="20" required></label>
        <?php endif; ?>

        <?php if (($user['building'] ?? '') !== ''): ?>
          <div class="prefilled-field"><span>בניין</span><strong>בניין <?= nsh_h($user['building']) ?></strong><small>זוהה לפי הקישור האישי</small><input type="hidden" name="building" value="<?= nsh_h($user['building']) ?>" data-building-value></div>
        <?php else: ?>
          <label><span>בחירת בניין</span><select name="building" data-building-select required><option value="">בחרו בניין</option><?php for ($buildingNumber = 1; $buildingNumber <= 5; $buildingNumber++): ?><option value="<?= $buildingNumber ?>">בניין <?= $buildingNumber ?></option><?php endfor; ?></select></label>
        <?php endif; ?>

        <?php if (($user['apartment'] ?? '') !== ''): ?>
          <div class="prefilled-field"><span>מספר דירה</span><strong><?= nsh_h($user['apartment']) ?></strong><small>זוהה לפי הקישור האישי</small><input type="hidden" name="apartment" value="<?= nsh_h($user['apartment']) ?>" data-apartment-value></div>
        <?php else: ?>
          <label><span>מספר דירה</span><input type="text" name="apartment" data-apartment-input inputmode="numeric" maxlength="4" pattern="[0-9]{1,4}" placeholder="לדוגמה: 12" required></label>
        <?php endif; ?>

        <?php if (($user['apartment_type'] ?? '') !== ''): ?>
          <div class="prefilled-field"><span>טיפוס דירה</span><strong><?= nsh_h($user['apartment_type']) ?></strong><small>זוהה לפי הקישור האישי</small><input type="hidden" name="apartment_type" value="<?= nsh_h($user['apartment_type']) ?>"></div>
        <?php else: ?>
          <label><span>טיפוס דירה, אם ידוע</span><input type="text" name="apartment_type" data-apartment-type maxlength="80" placeholder="לדוגמה: 4 חדרים / טיפוס A"></label>
        <?php endif; ?>

        <fieldset class="interest-fieldset">
          <legend>במה מעוניינים</legend>
          <?php foreach (NSH_INTEREST_LABELS as $key => $label): ?>
            <label class="interest-option">
              <input type="checkbox" name="interests[]" value="<?= nsh_h($key) ?>">
              <span><?= nsh_h($label) ?></span>
            </label>
          <?php endforeach; ?>
        </fieldset>
        <label><span>הערות</span><input type="text" name="notes" maxlength="500" placeholder="למשל: מעוניין גם בהצללה בחדר ההורים"></label>
        <label class="consent-option">
          <input type="checkbox" name="consent" value="yes" required>
          <span>אני מאשר/ת ל-I Feel ליצור איתי קשר בנוגע לפנייה זו.</span>
        </label>
        <button class="button" type="submit">שליחת הבקשה</button>
      </form>
      <p class="lead" style="margin-top:12px">מעדיפים לכתוב ישירות? <a href="mailto:myhome@i-feel.co.il">myhome@i-feel.co.il</a></p>
    </section>

    <section class="cta-band">
      <h2>הזמן הכי טוב להחליט הוא עכשיו</h2>
      <p>כל עוד הדירה בבנייה, כל תוספת היא עניין של תשתית ולא של שיפוץ. אחרי המסירה זה עדיין אפשרי, אבל יקר יותר ומלוכלך יותר. שווה לפחות לשאול.</p>
      <a class="button button--accent" href="#quote">קבלו הצעת מחיר לדירה שלכם</a>
    </section>

    <!-- ============ הורדות ============ -->
    <section class="card" id="downloads">
      <h2>מסמכים להורדה</h2>
      <ul>
        <li><a href="/neve-shuster/assets/ifeel-neve-shuster-flyer.pdf" download>פלייר הפרויקט, שכונת הפרדס רעננה, נווה שוסטר (PDF)</a></li>
        <li><a href="/assets/catalogs/zwave-catalog-2025.pdf" rel="noopener">קטלוג מוצרי Z-Wave (PDF)</a></li>
      </ul>
      <p class="lead">תנאים כלליים, אבני תשלום והצעת מחיר אישית נשלחים בדואר אלקטרוני לאחר פנייה ל-<a href="mailto:sales@i-feel.co.il">sales@i-feel.co.il</a>.</p>
    </section>

  </div>
</main>
<?php nsh_footer();
