<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$error = '';
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    try {
        esp_verify_csrf();
        $action = esp_post('action', 40);
        if ($action === 'request_code') {
            $email = strtolower(esp_post('email', 180));
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                throw new InvalidArgumentException('יש להזין כתובת דואר אלקטרוני תקינה.');
            }
            $profile = esp_resident_profile($email);
            if ($profile === null) {
                throw new InvalidArgumentException('הכתובת אינה משויכת ב-Monday לפרויקט אבן שפרוט. בדקו את הכתובת הרשומה בפרויקט או כתבו לנו ל-myhome@i-feel.co.il.');
            }
            if (!esp_send_code($profile)) {
                throw new RuntimeException('לא ניתן לשלוח קוד כרגע. יש להמתין דקה ולנסות שוב.');
            }
            esp_redirect(['access' => 'code-sent']);
        }
        if ($action === 'verify_code') {
            if (!esp_verify_code(esp_post('code', 20))) {
                throw new InvalidArgumentException('הקוד שגוי או שפג תוקפו.');
            }
            esp_redirect(['access' => 'verified']);
        }
        if ($action === 'logout') {
            esp_logout();
            esp_redirect(['access' => 'logged-out']);
        }
        throw new InvalidArgumentException('הפעולה המבוקשת אינה זמינה.');
    } catch (Throwable $exception) {
        $error = $exception->getMessage();
    }
}

$user = esp_current_user();
$csrf = esp_csrf_token();
$accessStatus = trim((string) ($_GET['access'] ?? ''));

const ESP_VAT_RATE = 0.18;

function esp_price_with_vat(float $net): string
{
    return number_format(round($net * (1 + ESP_VAT_RATE), 2), 2, '.', ',');
}

function esp_price_range_with_vat(float $minimum, float $maximum): string
{
    return esp_price_with_vat($minimum) . ' - ' . esp_price_with_vat($maximum);
}

$priceGroups = [
    [
        'title' => 'חשמל חכם Z-Wave בתדר 916 המותאם לישראל',
        'rows' => [
            ['TW601090-916', 'מפסק זכוכית טאץ׳ Z-Wave עד 9 לחצנים TouchWand', 'כולל חיישן קרבה, 6 מעגלים להזנות ישירות ועד 3 תרחישים. דורש אפס במפסק וקופסת עומק 3 מקום שוכב.', esp_price_with_vat(1180), 'panel9-rectangular.webp'],
            ['Glasswand 1-b w', 'מפסק זכוכית טאץ׳ מהודר עם לחצן בודד לתאורה', 'חיווי אור בהפעלה, ללא כיתוב, בצבע לבן. דורש אפס במפסק התאורה מצד החשמלאי.', esp_price_with_vat(480), 'glass-1b.jpg'],
            ['Glasswand 2-b w', 'מפסק זכוכית טאץ׳ מהודר עם 2 לחצנים לתאורה', 'חיווי אור בהפעלה, ללא כיתוב, בצבע לבן. דורש אפס במפסק התאורה מצד החשמלאי.', esp_price_with_vat(490), 'glass-2b.jpg'],
            ['Glasswand 3-b w', 'מפסק זכוכית טאץ׳ מהודר עם 3 לחצנים לתאורה', 'חיווי אור בהפעלה, ללא כיתוב, בצבע לבן. דורש אפס במפסק התאורה מצד החשמלאי.', esp_price_with_vat(498), 'glass-3b.jpg'],
            ['Glasswand 2-shut w', 'מפסק זכוכית טאץ׳ מהודר לעלייה ולהורדה של תריס', 'חיווי אור בהפעלה, ללא כיתוב, בצבע לבן. דורש אפס במפסק מצד החשמלאי.', esp_price_with_vat(490), 'glass-shutter.jpg'],
            ['חריטה', 'חריטה מותאמת על גבי מפסק', 'יש לעדכן מראש ולפני ביצוע. המחיר למפסק בודד.', esp_price_with_vat(200), ''],
            ['TW501000', 'ACWAND - חיישן טמפרטורה מוגבר לשליטה על מזגן', 'מתחבר ב-Wi-Fi עם כניסה לשקע חשמלי. דורש שקע חשמל פנוי ומגע יבש בהזנת המזגן מצד החשמלאי.', esp_price_with_vat(490), 'touchscreen.jpg'],
            ['129020', 'מפסק זכוכית Z-Wave 16A לתנור אמבטיה', 'כולל חיבור וניתוק בנפרד. מותקן במקום מפסק התנור של הקבלן.', esp_price_with_vat(485), 'glass-boiler-timer.jpg'],
            ['TW303100-916-E', 'מיקרומודול 230V מאחורי מפסק הקבלן', 'עד 5 אמפר לערוץ ומקסימום 120 וואט; מתאים לשני מעגלי תאורה צמודים או לתריס אחד.', esp_price_with_vat(390), 'micromodule.jpg'],
            ['IFW008', 'שינויי תכנות למסך המגע הקיים בדירה או תוספת רכיב הפעלה', '', esp_price_with_vat(450), 'panel9-rectangular.webp'],
            ['TW303200-916-E', 'מתאם אלחוטי לתריס או צלון 24V כלוא בין חלונות', 'בכמויות מסוימות יידרש ספק כוח 24V 4.2A נוסף; התאמה סופית לאחר בדיקת הדירה.', esp_price_with_vat(480), 'micromodule-24v.jpg'],
        ],
    ],
    [
        'title' => 'אודיו',
        'note' => 'נדרשת התאמת צרכים עם נציג I Feel לפי טיפוס הדירה.',
        'rows' => [
            ['10000', 'זוג רמקולים רצפתיים, רסיבר עם תמונת TV וכבילה ייעודית', '', esp_price_with_vat(4500), 'audio-satellites.jpg'],
            ['מקרני קול', 'סאונדבר אלחוטי איכותי לסלון, כולל סאב ומתלה אלחוטי', 'מגוון מוצרים בהתאמה לדייר; נדרש שקע חשמל בלבד.', esp_price_range_with_vat(1200, 3350), 'soundbar-klipsch.jpg'],
        ],
    ],
    [
        'title' => 'אזעקה אלחוטית',
        'note' => 'הציוד אלחוטי ואינו דורש תשתיות מצד החשמלאי. נדרשת התאמת צרכים לפי טיפוס הדירה.',
        'rows' => [
            ['10000', 'גלאי מגנט או גלאי נפח אלחוטי מבוסס סוללה', '', esp_price_with_vat(370), 'detector-motion.jpg'],
            ['10000', 'גלאי עשן אלחוטי מבוסס סוללה', '', esp_price_with_vat(385), 'detector-smoke.jpg'],
            ['10000', 'גלאי הצפה אלחוטי מבוסס סוללה', '', esp_price_with_vat(345), 'detector-flood.jpg'],
            ['10000', 'מערכת אזעקה אלחוטית עם גלאי מגנט בדלת וגלאי נפח פנימי', '', esp_price_with_vat(2460), 'alarm-system.jpg'],
        ],
    ],
];
?><!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive,nosnippet,noimageindex">
  <title>אזור דיירי אבן שפרוט 5-7, הרצליה | I Feel</title>
  <meta name="description" content="אזור מאובטח לדיירי פרויקט אבן שפרוט 5-7, הרצליה">
  <link rel="icon" href="/assets/favicon.png" type="image/png">
  <link rel="stylesheet" href="/even-shaprut/styles.css?v=1">
</head>
<body>
<?php if ($user !== null): ?>
  <div class="verified-bar"><div class="shell"><span>מחובר/ת באמצעות <?= esp_h($user['email']) ?></span><form method="post" action="/even-shaprut/"><input type="hidden" name="csrf" value="<?= esp_h($csrf) ?>"><input type="hidden" name="action" value="logout"><button type="submit">יציאה</button></form></div></div>
<?php endif; ?>
<header class="top">
  <img class="top__bg" src="/even-shaprut/assets/project-flyer-cover.png" alt="" aria-hidden="true">
  <div class="shell top__bar">
    <a class="brand" href="/" aria-label="I Feel, דף הבית"><img src="/assets/ifeel-logo.png" alt="I Feel" width="140" height="145"><span>מערכות בית חכם ובקרת מבנה</span></a>
    <a class="button button--ghost" href="/customer-benefits/">חזרה לאזור הלקוחות</a>
  </div>
  <div class="shell hero">
    <p class="eyebrow">אזור דיירים מאובטח</p>
    <h1>אבן שפרוט 5-7, הרצליה <em>הבית החכם שלכם</em></h1>
    <p>המפרט שהותקן בדירה, אפשרויות השדרוג, מחירון כולל מע״מ והפלייר של הפרויקט - במקום אחד.</p>
    <?php if ($user !== null): ?><div class="hero__cta"><a class="button button--accent" href="#standard">מה כלול בדירה</a><a class="button button--ghost" href="#pricelist">למחירון השדרוגים</a></div><?php endif; ?>
  </div>
</header>

<main class="main"><div class="shell">
<?php if ($user === null): ?>
  <section class="entry">
    <div class="access-card">
      <p class="eyebrow" style="color:#8d672e">כניסה לדיירי הפרויקט</p>
      <h2>קוד חד-פעמי לדואר הרשום ב-Monday</h2>
      <p class="lead">הזינו את כתובת הדואר שמופיעה בכרטיס הדייר בפרויקט אבן שפרוט. אם הכתובת משויכת לפרויקט, יישלח אליה קוד כניסה.</p>
      <?php if ($error !== ''): ?><div class="alert alert--error" role="alert"><?= esp_h($error) ?></div><?php endif; ?>
      <?php if ($accessStatus === 'code-sent' && esp_pending_email() !== ''): ?>
        <div class="alert alert--ok">קוד בן 6 ספרות נשלח ל-<?= esp_h(esp_pending_email()) ?>.</div>
        <form class="access-form" method="post" action="/even-shaprut/" autocomplete="one-time-code">
          <input type="hidden" name="csrf" value="<?= esp_h($csrf) ?>"><input type="hidden" name="action" value="verify_code">
          <label><span>קוד כניסה</span><input type="text" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required autofocus></label>
          <button class="button" type="submit">כניסה לאזור הדיירים</button>
        </form>
      <?php else: ?>
        <?php if ($accessStatus === 'logged-out'): ?><div class="alert alert--ok">נותקת מהאזור המאובטח.</div><?php endif; ?>
        <form class="access-form" method="post" action="/even-shaprut/">
          <input type="hidden" name="csrf" value="<?= esp_h($csrf) ?>"><input type="hidden" name="action" value="request_code">
          <label><span>כתובת דואר אלקטרוני</span><input type="email" name="email" autocomplete="email" maxlength="180" required></label>
          <button class="button" type="submit">שלחו לי קוד כניסה</button>
        </form>
      <?php endif; ?>
      <p class="security-note">הבדיקה מתבצעת בשרת מול קבוצת אבן שפרוט ב-Monday. כתובות הדיירים אינן נשמרות בקוד האתר ואינן נחשפות בדף.</p>
    </div>
    <div class="card">
      <h2>מה מחכה לכם בפנים</h2>
      <div class="steps"><div class="step"><b>1</b><div><strong>המפרט בדירה</strong><br>מה כבר מסופק בכל דירה בפרויקט.</div></div><div class="step"><b>2</b><div><strong>מחירון ברור</strong><br>מחירי שדרוג לצרכן, כולל 18% מע״מ.</div></div><div class="step"><b>3</b><div><strong>פלייר הפרויקט</strong><br>המסמך המלא של אשטרום ו-I Feel להורדה.</div></div></div>
    </div>
  </section>
<?php else: ?>
  <ul class="toc" aria-label="ניווט בעמוד"><li><a href="#standard">המפרט בדירה</a></li><li><a href="#flyer">פלייר הפרויקט</a></li><li><a href="#pricelist">מחירון שדרוגים</a></li><li><a href="#contact">יצירת קשר</a></li></ul>

  <?php if (($user['role'] ?? '') === 'resident' && (($user['building'] ?? '') !== '' || ($user['apartment'] ?? '') !== '')): ?>
    <section class="card"><h2>שלום<?= ($user['name'] ?? '') !== '' ? ' ' . esp_h($user['name']) : '' ?></h2><p class="lead">זוהיתם כדיירי אבן שפרוט<?php if (($user['building'] ?? '') !== ''): ?> · בניין <?= esp_h($user['building']) ?><?php endif; ?><?php if (($user['apartment'] ?? '') !== ''): ?> · דירה <?= esp_h($user['apartment']) ?><?php endif; ?>.</p></section>
  <?php endif; ?>

  <section class="card" id="standard">
    <h2>מערכת הבית החכם המסופקת בכל דירה</h2>
    <p class="lead">לפי מפרט הפרויקט אבן שפרוט 5-7, הרצליה.</p>
    <div class="grid">
      <article class="tile"><strong>שליטה בתאורה</strong><span>מתג מעוצב בכניסה לשליטה על התאורה בחלל המרכזי, מתג זכוכית לתאורת המסדרון ומתג זכוכית לתאורת המרפסת.</span></article>
      <article class="tile"><strong>תריסים חשמליים</strong><span>שליטה על שני תריסים חשמליים במטבח ובסלון.</span></article>
      <article class="tile"><strong>דוד חכם</strong><span>שליטה נוחה בדוד כחלק ממערכת הבית החכם.</span></article>
      <article class="tile"><strong>מיזוג באזור המרכזי</strong><span>כיבוי והדלקה מהפנל בכניסה. נדרש מגע יבש מקבלן המיזוג.</span></article>
      <article class="tile"><strong>שליטה מרחוק</strong><span>בקר לניהול באמצעות טלפון או מחשב, כולל תרחישים, תזמונים ושעוני שבת מובנים.</span></article>
    </div>
    <div class="notice"><strong>תיאום תשתיות</strong>התאמת נקודות האפס, הקופסאות והמגעים היבשים צריכה להתבצע מול קבלן החשמל וקבלן המיזוג לפני הביצוע.</div>
  </section>

  <section class="card split" id="flyer">
    <div><p class="eyebrow" style="color:#8d672e">אשטרום · בית חכם</p><h2>פלייר הפרויקט</h2><p class="lead">הפלייר המלא מפרט את יכולות המערכת בדירה ואת אפשרויות השדרוג בתאורה, תריסים, אודיו, אזעקה ומיזוג.</p><a class="button" href="/even-shaprut/assets/ifeel-even-shaprut-flyer.pdf" download>הורדת הפלייר כ-PDF</a></div>
    <img src="/even-shaprut/assets/project-flyer-cover.png" alt="שער פלייר אבן שפרוט 5-7, הרצליה של אשטרום ו-I Feel" loading="lazy">
  </section>

  <section class="card" id="pricelist">
    <h2>מחירון שדרוגים כולל מע״מ</h2>
    <p class="lead">כל המחירים בשקלים חדשים ו<strong>כוללים 18% מע״מ</strong>. הסכומים חושבו ממחירי הבסיס במסמך שסופק לפרויקט.</p>
    <?php foreach ($priceGroups as $group): ?>
      <div class="table-wrap"><table>
        <caption><?= esp_h($group['title']) ?><?php if (!empty($group['note'])): ?><br><small style="font-weight:400;color:#4d5766"><?= esp_h($group['note']) ?></small><?php endif; ?></caption>
        <thead><tr><th scope="col" class="th-img">תמונה</th><th scope="col">תיאור הפריט</th><th scope="col">מק״ט</th><th scope="col">מחיר ליחידה<br><small style="font-weight:400">כולל מע״מ</small></th></tr></thead>
        <tbody><?php foreach ($group['rows'] as $row): ?><tr>
          <td class="td-img"><?php if ($row[4] !== ''): ?><img src="/even-shaprut/assets/sku/<?= esp_h($row[4]) ?>" alt="<?= esp_h($row[1]) ?>" loading="lazy" width="260" height="260"><?php endif; ?></td>
          <td><?= esp_h($row[1]) ?><?php if ($row[2] !== ''): ?><br><small style="color:#4d5766"><?= esp_h($row[2]) ?></small><?php endif; ?></td>
          <td class="sku"><?= esp_h($row[0]) ?></td><td class="price" dir="ltr" data-label="מחיר כולל מע״מ"><?= esp_h($row[3]) ?> ₪</td>
        </tr><?php endforeach; ?></tbody>
      </table></div>
    <?php endforeach; ?>
    <div class="notice"><strong>חשוב לדעת לפני שמזמינים</strong>המחירים כוללים מע״מ ואינם כוללים עבודת חשמלאי מטעם קבלן החשמל בפרויקט. התאמה סופית ועלויות נוספות, אם יידרשו, ייקבעו לאחר בדיקת טיפוס הדירה והתשתיות. ט.ל.ח.</div>
  </section>

  <section class="cta-band" id="contact"><h2>רוצים להתאים שדרוג לדירה?</h2><p>שלחו לנו את מספר הבניין והדירה ואת המערכות שמעניינות אתכם, ונחזור עם התאמה מסודרת.</p><a class="button button--accent" href="mailto:myhome@i-feel.co.il?subject=אבן%20שפרוט%205-7%20הרצליה%20-%20בקשת%20שדרוג">פנייה ל-myhome@i-feel.co.il</a></section>
<?php endif; ?>
</div></main>
<footer class="footer"><div class="shell footer__inner"><span>I Feel Smart Home</span><span>אבן שפרוט 5-7, הרצליה · 03-508-9553</span></div></footer>
</body></html>
