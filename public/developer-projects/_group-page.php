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
                throw new InvalidArgumentException('כתובת הדואר אינה משויכת לקבוצה זו ב-Monday.');
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
<div class="shell hero"><p class="eyebrow">אזור מאובטח</p><h1><?= esp_h($project['title']) ?></h1><p>מידע ושירות ללקוחות הקבוצה. הכניסה באמצעות הדוא״ל הרשום ב-Monday וקוד חד פעמי שנשלח אליו.</p></div></header>
<main class="main"><div class="shell">
<?php if ($user === null): ?>
<section class="entry"><div class="access-card">
<h2>כניסה לקבוצת <?= esp_h($project['title']) ?></h2>
<p class="lead">הזינו את כתובת הדוא״ל הרשומה בקבוצה ב-Monday.</p>
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
<p class="security-note">הגישה נבדקת בצד השרת מול קבוצת Monday הספציפית. כתובות לקוחות אינן נחשפות בדף.</p>
</div></section>
<?php else: ?>
<section class="card"><h2>פרטי הלקוח</h2><div class="grid">
<article class="tile"><strong>שם</strong><span><?= esp_h($user['name'] ?? '') ?></span></article>
<?php if (($user['building'] ?? '') !== ''): ?><article class="tile"><strong>בניין</strong><span><?= esp_h($user['building']) ?></span></article><?php endif; ?>
<?php if (($user['apartment'] ?? '') !== ''): ?><article class="tile"><strong>דירה</strong><span><?= esp_h($user['apartment']) ?></span></article><?php endif; ?>
<?php if (($user['location'] ?? '') !== ''): ?><article class="tile"><strong>כתובת</strong><span><?= esp_h($user['location']) ?></span></article><?php endif; ?>
</div></section>

<section class="card"><h2>מפסקי הזכוכית של I Feel</h2>
<p class="lead">סרטון מוצר והדרכה למפסקי TouchWand/Z-Wave.</p>
<div class="grid">
<article class="tile"><strong>סרטון המוצר</strong><span>שליטה בתאורה, תריסים ומהטלפון.</span><a href="https://youtu.be/SmXbKAGoADw" rel="noopener" target="_blank">צפייה ביוטיוב</a></article>
<article class="tile"><strong>החלפת אייקונים במפסק 9 לחצנים</strong><span>מדריך קצר להתאמת סמלי הלחצנים.</span><a href="https://www.youtube.com/watch?v=AkwVp-VQ3r8" rel="noopener" target="_blank">צפייה ביוטיוב</a></article>
</div></section>

<section class="card"><h2>מידע ושירות</h2><div class="grid">
<article class="tile"><strong>אפליקציית TouchWand</strong><span>מידע על האפליקציה והשליטה בבית החכם.</span><a href="/touchwand-app/">פתיחת מדריך האפליקציה</a></article>
<article class="tile"><strong>ספריית הווידאו</strong><span>מדריכים והדגמות של I Feel.</span><a href="/video/">לספריית הווידאו</a></article>
<article class="tile"><strong>שירות ושדרוגים</strong><span>פנייה לצוות I Feel.</span><a href="mailto:myhome@i-feel.co.il?subject=<?= rawurlencode($project['title'].' - בקשת מידע') ?>">myhome@i-feel.co.il</a></article>
</div></section>
<?php endif; ?>
</div></main>
<footer class="footer"><div class="shell footer__inner"><span>I Feel Smart Home</span><span>03-508-9553</span></div></footer>
</body></html>