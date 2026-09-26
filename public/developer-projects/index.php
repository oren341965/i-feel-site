<?php
declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';
$error='';
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
  try {
    esp_verify_csrf();
    $action=esp_post('action',40);
    if ($action==='request_code') {
      $email=strtolower(esp_post('email',180));
      if (!filter_var($email,FILTER_VALIDATE_EMAIL)) throw new InvalidArgumentException('יש להזין כתובת דואר אלקטרוני תקינה.');
      $profile=esp_resident_profile($email);
      if ($profile===null) throw new InvalidArgumentException('כתובת הדואר אינה משויכת כרגע לפרויקט יזמי מאושר ב-Monday. אפשר לפנות ל-myhome@i-feel.co.il.');
      if (!esp_send_code($profile)) throw new RuntimeException('לא ניתן לשלוח קוד כרגע. יש להמתין דקה ולנסות שוב.');
      esp_redirect(['access'=>'code-sent']);
    }
    if ($action==='verify_code') {
      if (!esp_verify_code(esp_post('code',20))) throw new InvalidArgumentException('הקוד שגוי או שפג תוקפו.');
      esp_redirect(['access'=>'verified']);
    }
    if ($action==='logout') { esp_logout(); esp_redirect(['access'=>'logged-out']); }
  } catch (Throwable $e) { $error=$e->getMessage(); }
}
$user=esp_current_user(); $csrf=esp_csrf_token(); $accessStatus=trim((string)($_GET['access']??''));
?><!doctype html><html lang="he" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive,nosnippet,noimageindex">
<title>אזור לקוחות פרויקטי יזמים | I Feel</title>
<meta name="description" content="אזור מאובטח ללקוחות פרויקטי יזמי בנייה של I Feel">
<link rel="icon" href="/assets/favicon.png" type="image/png">
<link rel="stylesheet" href="/even-shaprut/styles.css?v=1">
</head><body>
<?php if ($user!==null): ?><div class="verified-bar"><div class="shell"><span>מחובר/ת באמצעות <?= esp_h($user['email']) ?></span><form method="post" action="/developer-projects/"><input type="hidden" name="csrf" value="<?= esp_h($csrf) ?>"><input type="hidden" name="action" value="logout"><button type="submit">יציאה</button></form></div></div><?php endif; ?>
<header class="top"><div class="shell top__bar"><a class="brand" href="/" aria-label="I Feel"><img src="/assets/ifeel-logo.png" alt="I Feel" width="140" height="145"><span>מערכות בית חכם ובקרת מבנה</span></a><a class="button button--ghost" href="/customer-benefits/">חזרה לאזור הלקוחות</a></div>
<div class="shell hero"><p class="eyebrow">אזור לקוחות מאובטח</p><h1>פרויקטי יזמי הבנייה של I Feel</h1><p>כניסה לפי כתובת הדואר הרשומה ב-Monday. לאחר האימות יוצגו הפרויקט והמידע המשויך ללקוח.</p></div></header>
<main class="main"><div class="shell">
<?php if ($user===null): ?>
<section class="entry"><div class="access-card"><h2>כניסה באמצעות הדוא״ל הרשום בפרויקט</h2>
<?php if ($error!==''): ?><div class="alert alert--error"><?= esp_h($error) ?></div><?php endif; ?>
<?php if ($accessStatus==='code-sent' && esp_pending_email()!==''): ?>
<div class="alert alert--ok">קוד בן 6 ספרות נשלח ל-<?= esp_h(esp_pending_email()) ?>.</div>
<form class="access-form" method="post" action="/developer-projects/"><input type="hidden" name="csrf" value="<?= esp_h($csrf) ?>"><input type="hidden" name="action" value="verify_code"><label><span>קוד כניסה</span><input type="text" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required></label><button class="button" type="submit">כניסה</button></form>
<?php else: ?>
<form class="access-form" method="post" action="/developer-projects/"><input type="hidden" name="csrf" value="<?= esp_h($csrf) ?>"><input type="hidden" name="action" value="request_code"><label><span>כתובת דואר אלקטרוני</span><input type="email" name="email" autocomplete="email" maxlength="180" required></label><button class="button" type="submit">שלחו לי קוד כניסה</button></form>
<?php endif; ?><p class="security-note">האימות מתבצע בצד השרת מול קבוצות פרויקטי היזמים ב-Monday. כתובות לקוחות אינן נשמרות בקוד האתר.</p></div></section>
<?php else: ?>
<section class="card"><h2>הפרויקטים שלך</h2><p class="lead">המערכת זיהתה את כתובת הדואר שלך בפרויקטים הבאים:</p><div class="grid">
<?php foreach (($user['projects']??[]) as $project): ?><article class="tile"><strong><?= esp_h($project['title']??'פרויקט') ?></strong><span><?php if (($user['building']??'')!==''): ?>בניין <?= esp_h($user['building']) ?> · <?php endif; ?><?php if (($user['apartment']??'')!==''): ?>דירה <?= esp_h($user['apartment']) ?><?php endif; ?></span><?php if (($project['slug']??'')!==''): ?><a href="/developer-projects/<?= esp_h($project['slug']) ?>/">כניסה לאתר הפרויקט</a><?php endif; ?></article><?php endforeach; ?>
</div></section>
<section class="card"><h2>מפסקי הזכוכית של I Feel</h2><p class="lead">סרטון המוצר מציג את מפסק TouchWand/Z-Wave ואת השליטה בתאורה, תריסים ומהטלפון.</p><div class="tile"><strong>סרטון המוצר</strong><span>פתיחה ביוטיוב בערוץ I Feel.</span><a href="https://youtu.be/SmXbKAGoADw" rel="noopener" target="_blank">צפייה בסרטון</a></div></section>
<section class="card"><h2>מידע ושירות לפרויקט</h2><div class="grid"><article class="tile"><strong>מפרט ושדרוגים</strong><span>המידע הייעודי לכל פרויקט יתווסף כאן לפי חומרי הפרויקט והשלב במאנדיי.</span></article><article class="tile"><strong>פנייה לצוות I Feel</strong><span>לשינויים, תיאומים ושאלות על הדירה.</span><a href="mailto:myhome@i-feel.co.il">myhome@i-feel.co.il</a></article></div></section>
<?php endif; ?>
</div></main><footer class="footer"><div class="shell footer__inner"><span>I Feel Smart Home</span><span>03-508-9553</span></div></footer></body></html>