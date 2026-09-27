<?php
declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';

$slug = (string)basename(dirname((string)($_SERVER['SCRIPT_FILENAME'] ?? '')));
$project = esp_project_by_slug($slug);
if ($project === null) { http_response_code(404); exit('Group not found'); }

$error = '';
$accessStatus = trim((string)($_GET['access'] ?? ''));
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    try {
        esp_verify_csrf();
        $action = esp_post('action', 40);
        if ($action === 'request_code') {
            $email = strtolower(esp_post('email', 180));
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                throw new InvalidArgumentException('יש להזין כתובת דואר אלקטרוני תקינה.');
            }
            $profile = esp_resident_profile_for_group($email, (string)$project['id']);
            if ($profile === null) {
                throw new InvalidArgumentException('כתובת הדואר אינה מופיעה ברשימת הדיירים שהועברה ל־I Feel עבור פרויקט זה.');
            }
            if (!esp_send_code($profile)) {
                throw new RuntimeException('לא ניתן לשלוח קוד כרגע. יש להמתין דקה ולנסות שוב.');
            }
            header('Location: /developer-projects/' . rawurlencode($project['slug']) . '/?access=code-sent', true, 303);
            exit;
        }
        if ($action === 'verify_code') {
            if (!esp_verify_code(esp_post('code', 20))) {
                throw new InvalidArgumentException('הקוד שגוי או שפג תוקפו.');
            }
            $verified = esp_current_user();
            if ($verified === null || !esp_user_has_project($verified, (string)$project['id'])) {
                esp_logout();
                throw new InvalidArgumentException('הדוא״ל המאומת אינו משויך לקבוצה זו.');
            }
            header('Location: /developer-projects/' . rawurlencode($project['slug']) . '/?access=verified', true, 303);
            exit;
        }
        if ($action === 'logout') {
            esp_logout();
            header('Location: /developer-projects/' . rawurlencode($project['slug']) . '/?access=logged-out', true, 303);
            exit;
        }
    } catch (Throwable $e) {
        $error = $e->getMessage();
    }
}

$user = esp_current_user();
if ($user !== null && !esp_user_has_project($user, (string)$project['id'])) {
    $user = null;
}
$csrf = esp_csrf_token();

const ESP_PROJECT_VAT_RATE = 0.18;

function esp_project_price(float $net): string
{
    return number_format(round($net * (1 + ESP_PROJECT_VAT_RATE), 2), 2, '.', ',');
}

function esp_project_price_range(float $minimum, float $maximum): string
{
    return esp_project_price($minimum) . ' - ' . esp_project_price($maximum);
}

$projectPriceGroups = [
    [
        'title' => 'מפסקי זכוכית ושדרוגי בית חכם',
        'rows' => [
            ['TW601090-916', 'מפסק זכוכית טאץ׳ Z-Wave עד 9 לחצנים TouchWand', 'חיישן קרבה, עד 6 מעגלים ישירים ועד 3 תרחישים.', esp_project_price(1180), 'panel9-rectangular.webp'],
            ['Glasswand 1-b w', 'מפסק זכוכית טאץ׳ עם לחצן אחד לתאורה', 'חיווי אור בהפעלה, לבן, ללא כיתוב.', esp_project_price(480), 'glass-1b.jpg'],
            ['Glasswand 2-b w', 'מפסק זכוכית טאץ׳ עם 2 לחצנים לתאורה', 'חיווי אור בהפעלה, לבן, ללא כיתוב.', esp_project_price(490), 'glass-2b.jpg'],
            ['Glasswand 3-b w', 'מפסק זכוכית טאץ׳ עם 3 לחצנים לתאורה', 'חיווי אור בהפעלה, לבן, ללא כיתוב.', esp_project_price(498), 'glass-3b.jpg'],
            ['Glasswand 2-shut w', 'מפסק זכוכית טאץ׳ לתריס', 'עלייה והורדה של התריס, חיווי אור בהפעלה.', esp_project_price(490), 'glass-shutter.jpg'],
            ['חריטה', 'חריטה מותאמת על גבי מפסק', 'יש לעדכן לפני ביצוע. המחיר למפסק.', esp_project_price(200), ''],
            ['129020', 'מפסק זכוכית Z-Wave 16A לתנור אמבטיה', 'כולל חיבור וניתוק בנפרד.', esp_project_price(485), 'glass-boiler-timer.jpg'],
            ['TW303100-916-E', 'מיקרומודול 230V מאחורי מפסק הקבלן', 'לשני מעגלי תאורה צמודים או תריס אחד, בהתאם לעומס.', esp_project_price(390), 'micromodule.jpg'],
            ['TW303200-916-E', 'מתאם אלחוטי לתריס או צלון 24V', 'לצלון כלוא בין חלונות, בכפוף להתאמה בשטח.', esp_project_price(480), 'micromodule-24v.jpg'],
        ],
    ],
    [
        'title' => 'אודיו',
        'rows' => [
            ['10000', 'זוג רמקולים קדמיים, רסיבר וכבילה ייעודית', 'התאמה לפי טיפוס הדירה.', esp_project_price(4500), 'audio-satellites.jpg'],
            ['מקרני קול', 'סאונדבר אלחוטי לסלון, כולל סאב ומתלה', 'מגוון דגמים בהתאמה לדייר.', esp_project_price_range(1200, 3350), 'soundbar-klipsch.jpg'],
        ],
    ],
    [
        'title' => 'אזעקה אלחוטית',
        'rows' => [
            ['10000', 'גלאי מגנט או גלאי נפח אלחוטי', 'דורש רכזת אזעקה אלחוטית.', esp_project_price(370), 'detector-magnetic-risco-x78-x73.jpg'],
            ['10000', 'גלאי עשן אלחוטי', 'דורש רכזת אזעקה אלחוטית.', esp_project_price(385), 'detector-smoke-risco-x35s.jpg'],
            ['10000', 'גלאי הצפה אלחוטי', 'דורש רכזת אזעקה אלחוטית.', esp_project_price(345), 'detector-flood.jpg'],
            ['10000', 'מערכת אזעקה אלחוטית בסיסית', 'כוללת גלאי מגנט בדלת וגלאי נפח פנימי.', esp_project_price(2460), 'alarm-system.jpg'],
        ],
    ],
];

?><!doctype html>
<html lang="he" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive,nosnippet,noimageindex">
<title><?= esp_h($project['title']) ?> | I Feel</title>
<meta name="description" content="אזור מאובטח ללקוחות קבוצת <?= esp_h($project['title']) ?> של I Feel">
<link rel="icon" href="/assets/favicon.png" type="image/png">
<link rel="stylesheet" href="/even-shaprut/styles.css?v=1">
</head><body>
<?php if ($user !== null): ?>
<div class="verified-bar"><div class="shell"><span>מחובר/ת באמצעות <?= esp_h($user['email'] ?? '') ?></span>
<form method="post" action=""><input type="hidden" name="csrf" value="<?= esp_h($csrf) ?>"><input type="hidden" name="action" value="logout"><button type="submit">יציאה</button></form></div></div>
<?php endif; ?>
<header class="top"><div class="shell top__bar"><a class="brand" href="/" aria-label="I Feel"><img src="/assets/ifeel-logo.png" alt="I Feel" width="140" height="145"><span>מערכות בית חכם ובקרת מבנה</span></a><a class="button button--ghost" href="/customer-benefits/">אזור הלקוחות</a></div>
<div class="shell hero"><p class="eyebrow">אזור מאובטח</p><h1><?= esp_h($project['title']) ?></h1><p>מידע ושירות ללקוחות הפרויקט. הכניסה באמצעות כתובת הדוא״ל שנמסרה ל־I Feel על ידי מחלקת שינויי הדיירים של הפרויקט. עובדי I Feel יכולים להיכנס באמצעות כתובת הדוא״ל הארגונית שלהם. קוד חד פעמי יישלח לכתובת הדוא״ל.</p></div></header>
<main class="main"><div class="shell">
<?php if ($user === null): ?>
<section class="entry"><div class="access-card">
<h2>כניסה לקבוצת <?= esp_h($project['title']) ?></h2>
<p class="lead">הזינו את כתובת הדוא״ל שנמסרה ל־I Feel על ידי מחלקת שינויי הדיירים של הפרויקט. עובדי I Feel יכולים להיכנס באמצעות כתובת הדוא״ל הארגונית שלהם.</p>
<?php if ($error !== ''): ?><div class="alert alert--error"><?= esp_h($error) ?></div><?php endif; ?>
<?php if ($accessStatus === 'code-sent' && esp_pending_email() !== ''): ?>
<div class="alert alert--ok">קוד בן 6 ספרות נשלח ל-<?= esp_h(esp_pending_email()) ?>.</div>
<form class="access-form" method="post" action="" autocomplete="one-time-code">
<input type="hidden" name="csrf" value="<?= esp_h($csrf) ?>"><input type="hidden" name="action" value="verify_code">
<label><span>קוד כניסה</span><input type="text" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required autofocus></label>
<button class="button" type="submit">כניסה</button></form>
<?php else: ?>
<?php if ($accessStatus === 'logged-out'): ?><div class="alert alert--ok">נותקת מהאזור המאובטח.</div><?php endif; ?>
<form class="access-form" method="post" action="">
<input type="hidden" name="csrf" value="<?= esp_h($csrf) ?>"><input type="hidden" name="action" value="request_code">
<label><span>כתובת דואר אלקטרוני</span><input type="email" name="email" autocomplete="email" maxlength="180" required></label>
<button class="button" type="submit">שלחו לי קוד כניסה</button></form>
<?php endif; ?>
<p class="security-note">הגישה מאובטחת ומאומתת מול רשימת הדיירים שהתקבלה ב־I Feel. כתובות הלקוחות אינן נחשפות בדף.</p>
</div></section>
<?php else: ?>
<ul class="toc" aria-label="ניווט בעמוד">
<li><a href="#resident">פרטי הדירה</a></li>
<li><a href="#smartsphere">SmartSphere</a></li>
<li><a href="#pricelist">מחירון שדרוגים</a></li>
<li><a href="#video">סרטונים</a></li>
<li><a href="#contact">יצירת קשר</a></li>
</ul>

<section class="card" id="resident"><h2>פרטי הדירה</h2><div class="grid">
<article class="tile"><strong>שם</strong><span><?= esp_h($user['name'] ?? '') ?></span></article>
<?php if (($user['building'] ?? '') !== ''): ?><article class="tile"><strong>בניין</strong><span><?= esp_h($user['building']) ?></span></article><?php endif; ?>
<?php if (($user['apartment'] ?? '') !== ''): ?><article class="tile"><strong>דירה</strong><span><?= esp_h($user['apartment']) ?></span></article><?php endif; ?>
<?php if (($user['location'] ?? '') !== ''): ?><article class="tile"><strong>כתובת</strong><span><?= esp_h($user['location']) ?></span></article><?php endif; ?>
</div></section>

<section class="card" id="smartsphere">
<h2>SmartSphere, אפליקציית הבית החכם שלכם</h2>
<p class="lead">לקוחות הפרויקטים האלה קיבלו את SmartSphere כממשק השליטה בבית החכם.</p>
<div class="grid">
<article class="tile"><strong>שליטה מהטלפון</strong><span>תאורה, תריסים, מיזוג ותרחישים מממשק SmartSphere בהתאם למערכות שהוגדרו בדירה.</span></article>
<article class="tile"><strong>תרחישים ותזמונים</strong><span>יצירת פעולות אוטומטיות ושילוב בין מערכות הבית בהתאם להגדרות הפרויקט.</span></article>
<article class="tile"><strong>הדרכת SmartSphere</strong><span>סרטוני הדרכה ושימוש במערכת.</span><a href="/video/#smart-ac-connection">לסרטוני SmartSphere</a></article>
</div>
</section>

<section class="card" id="pricelist">
<h2>מחירון שדרוגים כולל מע״מ</h2>
<p class="lead">אותו מבנה מחירון המוצג באזור אבן שפרוט. המחירים כוללים 18% מע״מ. התאמה סופית תלויה בטיפוס הדירה, בהסכם הפרויקט ובתשתיות בפועל.</p>
<?php foreach ($projectPriceGroups as $group): ?>
<div class="table-wrap"><table>
<caption><?= esp_h($group['title']) ?></caption>
<thead><tr><th class="th-img">תמונה</th><th>תיאור הפריט</th><th>מק״ט</th><th>מחיר כולל מע״מ</th></tr></thead>
<tbody>
<?php foreach ($group['rows'] as $row): ?><tr>
<td class="td-img"><?php if ($row[4] !== ''): ?><img src="/even-shaprut/assets/sku/<?= esp_h($row[4]) ?>" alt="<?= esp_h($row[1]) ?>" loading="lazy" width="260" height="260"><?php endif; ?></td>
<td><?= esp_h($row[1]) ?><?php if ($row[2] !== ''): ?><br><small><?= esp_h($row[2]) ?></small><?php endif; ?></td>
<td class="sku"><?= esp_h($row[0]) ?></td>
<td class="price" dir="ltr"><?= esp_h($row[3]) ?> ₪</td>
</tr><?php endforeach; ?>
</tbody></table></div>
<?php endforeach; ?>
<div class="notice"><strong>חשוב</strong>מחירון זה מרכז אפשרויות שדרוג של I Feel. אם קיימים תנאים או מחירים ייחודיים לפרויקט, ההצעה המאושרת לפרויקט היא הקובעת.</div>
</section>

<section class="card" id="video">
<h2>רואים את המערכת בפעולה</h2>
<div class="grid">
<article class="tile"><strong>מפסקי הזכוכית</strong><span>הדגמת מפסק זכוכית חכם, תאורה ותריסים.</span><a href="https://youtu.be/SmXbKAGoADw" rel="noopener" target="_blank">צפייה בסרטון</a></article>
<article class="tile"><strong>החלפת אייקונים במפסק 9 לחצנים</strong><span>התאמת סמלי הלחצנים.</span><a href="https://www.youtube.com/watch?v=AkwVp-VQ3r8" rel="noopener" target="_blank">צפייה בסרטון</a></article>
<article class="tile"><strong>SmartSphere ומיזוג</strong><span>חיבור ושיוך מזגנים במערכת SmartSphere.</span><a href="https://www.youtube.com/watch?v=mVP8OHtLjso" rel="noopener" target="_blank">צפייה בסרטון</a></article>
</div>
</section>

<section class="cta-band" id="contact">
<h2>רוצים לבצע שדרוג בדירה?</h2>
<p>שלחו לנו את שם הפרויקט, מספר הבניין והדירה ואת המערכות שמעניינות אתכם.</p>
<a class="button button--accent" href="mailto:myhome@i-feel.co.il?subject=<?= rawurlencode($project['title'].' - בקשת שדרוג') ?>">פנייה ל־myhome@i-feel.co.il</a>
</section>
<?php endif; ?>
</div></main>
<footer class="footer"><div class="shell footer__inner"><span>I Feel Smart Home</span><span>03-508-9553</span></div></footer>
</body></html>