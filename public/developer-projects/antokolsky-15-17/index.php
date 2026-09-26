<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/_bootstrap.php';

$project = esp_project_by_slug((string)basename(__DIR__));
if ($project === null) { http_response_code(404); exit('Project not found'); }
$user = esp_current_user();
if ($user === null) {
    header('Location: /developer-projects/?project=' . rawurlencode($project['slug']), true, 302);
    exit;
}
if (!esp_user_has_project($user, $project['id'])) {
    http_response_code(403);
    $denied = true;
} else {
    $denied = false;
}
$csrf = esp_csrf_token();
?><!doctype html>
<html lang="he" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive,nosnippet,noimageindex">
<title><?= esp_h($project['title']) ?> | אזור דיירים I Feel</title>
<meta name="description" content="אזור מאובטח לדיירי <?= esp_h($project['title']) ?> של I Feel">
<link rel="icon" href="/assets/favicon.png" type="image/png">
<link rel="stylesheet" href="/even-shaprut/styles.css?v=1">
</head><body>
<div class="verified-bar"><div class="shell"><span>מחובר/ת באמצעות <?= esp_h($user['email'] ?? '') ?></span><a href="/developer-projects/">לכל הפרויקטים</a></div></div>
<header class="top"><div class="shell top__bar"><a class="brand" href="/" aria-label="I Feel"><img src="/assets/ifeel-logo.png" alt="I Feel" width="140" height="145"><span>מערכות בית חכם ובקרת מבנה</span></a><a class="button button--ghost" href="/developer-projects/">אזור הלקוחות</a></div>
<div class="shell hero"><p class="eyebrow">אזור דיירים מאובטח</p><h1><?= esp_h($project['title']) ?></h1><p>מידע, סרטונים, שדרוגים ושירות לדיירי הפרויקט.</p></div></header>
<main class="main"><div class="shell">
<?php if ($denied): ?>
<section class="card"><h2>אין הרשאה לפרויקט זה</h2><p class="lead">כתובת הדוא״ל המחוברת אינה משויכת לפרויקט זה ב-Monday.</p><a class="button" href="/developer-projects/">חזרה לפרויקטים שלך</a></section>
<?php else: ?>
<section class="card"><h2>פרטי הדירה שלך</h2><div class="grid">
<article class="tile"><strong>שם</strong><span><?= esp_h($user['name'] ?? '') ?></span></article>
<?php if (($user['building'] ?? '') !== ''): ?><article class="tile"><strong>בניין</strong><span><?= esp_h($user['building']) ?></span></article><?php endif; ?>
<?php if (($user['apartment'] ?? '') !== ''): ?><article class="tile"><strong>דירה</strong><span><?= esp_h($user['apartment']) ?></span></article><?php endif; ?>
<?php if (($user['location'] ?? '') !== ''): ?><article class="tile"><strong>כתובת</strong><span><?= esp_h($user['location']) ?></span></article><?php endif; ?>
</div></section>

<section class="card"><h2>מפסקי הזכוכית של I Feel</h2>
<p class="lead">סרטון המוצר מציג את מפסק TouchWand/Z-Wave ואת השליטה בתאורה, בתריסים ומהטלפון.</p>
<div class="grid">
<article class="tile"><strong>סרטון המוצר</strong><span>הדגמה של המפסק החכם בפעולה.</span><a href="https://youtu.be/SmXbKAGoADw" rel="noopener" target="_blank">צפייה ביוטיוב</a></article>
<article class="tile"><strong>החלפת אייקונים במפסק 9 לחצנים</strong><span>מדריך קצר להתאמת סמלי הלחצנים.</span><a href="https://www.youtube.com/watch?v=AkwVp-VQ3r8" rel="noopener" target="_blank">צפייה ביוטיוב</a></article>
</div></section>

<section class="card"><h2>שדרוגים אפשריים</h2><div class="grid">
<article class="tile"><strong>בית חכם</strong><span>הרחבת שליטה בתאורה, תריסים, דוד, תרחישים ותזמונים.</span></article>
<article class="tile"><strong>אבטחה</strong><span>אזעקה, גלאים, מצלמות ואינטרקום בהתאם לתשתיות הפרויקט.</span></article>
<article class="tile"><strong>רשת ואודיו</strong><span>פתרונות Wi-Fi, רשת קווית, רמקולים ואודיו בהתאמה לדירה.</span></article>
</div>
<div class="notice"><strong>חשוב</strong>המפרט והמחירים הסופיים נקבעים לפי ההסכם, טיפוס הדירה והתשתיות בפרויקט. מידע כללי בעמוד זה אינו מחליף מפרט או הצעה מאושרת.</div></section>

<section class="card"><h2>מידע ושירות</h2><div class="grid">
<article class="tile"><strong>אפליקציית TouchWand</strong><span>מידע על האפליקציה והשליטה בבית החכם.</span><a href="/touchwand-app/">פתיחת מדריך האפליקציה</a></article>
<article class="tile"><strong>ספריית הווידאו</strong><span>מדריכים והדגמות של I Feel.</span><a href="/video/">לספריית הווידאו</a></article>
<article class="tile"><strong>שינויים ושדרוגים</strong><span>פנו אלינו עם שם הפרויקט, בניין ודירה.</span><a href="mailto:myhome@i-feel.co.il?subject=<?= rawurlencode($project['title'].' - בקשת מידע או שדרוג') ?>">myhome@i-feel.co.il</a></article>
</div></section>
<?php endif; ?>
</div></main>
<footer class="footer"><div class="shell footer__inner"><span>I Feel Smart Home</span><span>03-508-9553</span></div></footer>
</body></html>