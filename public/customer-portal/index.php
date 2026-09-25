<?php
declare(strict_types=1);
require_once __DIR__ . '/_portal.php';

$error = '';
$notice = '';
$action = cp_post('action', 40);

try {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        cp_verify_csrf();
        if ($action === 'request_code') {
            $email = strtolower(cp_post('email', 180));
            $profile = cp_customer_profile($email);
            if ($profile === null) {
                throw new RuntimeException('לא נמצא לקוח פעיל עם כתובת הדוא"ל הזו במערכת I Feel.');
            }
            if (!cp_send_code($profile)) {
                throw new RuntimeException('לא ניתן לשלוח קוד כרגע. נסו שוב בעוד דקה.');
            }
            $notice = 'קוד כניסה נשלח לכתובת הדוא"ל הרשומה.';
        } elseif ($action === 'verify_code') {
            if (!cp_verify_code(cp_post('code', 20))) {
                throw new RuntimeException('קוד הכניסה שגוי או שפג תוקפו.');
            }
            header('Location: ' . CP_BASE_PATH . 'index.php', true, 303);
            exit;
        } elseif ($action === 'logout') {
            cp_logout();
            header('Location: ' . CP_BASE_PATH . 'index.php', true, 303);
            exit;
        }
    }
} catch (Throwable $e) {
    $error = $e->getMessage();
}

$user = cp_current_user();
$pendingEmail = cp_pending_email();
$csrf = cp_csrf_token();
$products = $user ? cp_eligible_products($user) : [];
?>
<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>אזור לקוחות I Feel</title>
  <meta name="robots" content="noindex,nofollow">
  <link rel="icon" type="image/png" href="/assets/favicon.png">
  <style>
    body{margin:0;font-family:Arial,sans-serif;background:#f4f7fb;color:#102038}
    .wrap{max-width:980px;margin:0 auto;padding:32px 18px}.card{background:#fff;border:1px solid #dfe7f0;border-radius:18px;padding:24px;margin:18px 0;box-shadow:0 8px 24px rgba(16,32,56,.06)}
    h1{font-size:38px;margin:0 0 8px}h2{margin-top:0}.muted{color:#62748a}.ok{background:#ecfdf3;border:1px solid #a7f3c1;padding:12px;border-radius:10px}.err{background:#fff1f2;border:1px solid #fecdd3;padding:12px;border-radius:10px}
    label{display:block;font-weight:700;margin:14px 0 6px}input{width:100%;box-sizing:border-box;padding:13px;border:1px solid #becbdd;border-radius:10px;font-size:16px}
    button{margin-top:14px;padding:12px 18px;border:0;border-radius:10px;background:#124d85;color:#fff;font-weight:700;cursor:pointer}.secondary{background:#eef3f8;color:#17324f}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.pill{display:inline-block;padding:6px 10px;border-radius:999px;background:#edf6ff;color:#145a94;font-weight:700}
    .product{border:1px solid #dde6ef;border-radius:14px;padding:16px}.top{display:flex;justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap}
  </style>
  <script src="/customer-portal/portal-webmcp.js" defer></script>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div><div class="pill">I Feel Customer Portal + WebMCP</div><h1>אזור הלקוחות</h1><p class="muted">גישה מאובטחת לפי פרטי הלקוח והסכם השירות ב-Monday.</p></div>
      <a href="/"><img src="/assets/ifeel-logo.png" alt="I Feel" style="height:48px"></a>
    </div>

    <?php if ($error !== ''): ?><div class="err"><?= cp_h($error) ?></div><?php endif; ?>
    <?php if ($notice !== ''): ?><div class="ok"><?= cp_h($notice) ?></div><?php endif; ?>

    <?php if ($user === null): ?>
      <section class="card">
        <h2>כניסה באמצעות קוד חד פעמי</h2>
        <?php if ($pendingEmail === ''): ?>
          <form method="post" action="">
            <input type="hidden" name="csrf" value="<?= cp_h($csrf) ?>">
            <input type="hidden" name="action" value="request_code">
            <label for="email">כתובת הדוא"ל הרשומה ב-I Feel</label>
            <input id="email" name="email" type="email" required autocomplete="email">
            <button type="submit">שלחו לי קוד כניסה</button>
          </form>
        <?php else: ?>
          <p class="muted">הקוד נשלח אל <?= cp_h($pendingEmail) ?>.</p>
          <form method="post" action="">
            <input type="hidden" name="csrf" value="<?= cp_h($csrf) ?>">
            <input type="hidden" name="action" value="verify_code">
            <label for="code">קוד בן 6 ספרות</label>
            <input id="code" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code">
            <button type="submit">כניסה לאזור האישי</button>
          </form>
        <?php endif; ?>
      </section>
    <?php else: ?>
      <section class="card">
        <div class="top">
          <div>
            <h2>שלום <?= cp_h($user['name'] ?? '') ?></h2>
            <p class="muted">הזיהוי בוצע מול כתובת הדוא"ל הרשומה ב-I Feel.</p>
          </div>
          <form method="post" action="">
            <input type="hidden" name="csrf" value="<?= cp_h($csrf) ?>">
            <input type="hidden" name="action" value="logout">
            <button class="secondary" type="submit">יציאה</button>
          </form>
        </div>
        <div class="grid">
          <div><strong>הסכם שירות</strong><br><?= !empty($user['service_agreement']) ? 'פעיל' : 'לא מסומן כפעיל' ?></div>
          <div><strong>קטגוריית לקוח</strong><br><?= cp_h($user['category'] ?: 'לא הוגדר') ?></div>
          <div><strong>כתובת</strong><br><?= cp_h($user['address'] ?: 'לא הוגדרה') ?></div>
          <div><strong>מפתח חשבשבת</strong><br><?= cp_h($user['accounting_key'] ?: 'לא הוגדר') ?></div>
        </div>
      </section>

      <section class="card">
        <h2>מוצרים ושירותים זמינים</h2>
        <?php if ($products === []): ?>
          <p>כרגע לא מסומן במערכת הסכם שירות פעיל. בשלב הבא נוסיף גם מסלול רכישה ללקוחות ללא הסכם במחיר רגיל.</p>
        <?php else: ?>
          <div class="grid">
            <?php foreach ($products as $product): ?>
              <article class="product">
                <strong><?= cp_h($product['name']) ?></strong>
                <p class="muted"><?= cp_h($product['category']) ?></p>
                <span class="pill"><?= $product['status'] === 'eligible' ? 'זכאי' : 'דורש בדיקה' ?></span>
              </article>
            <?php endforeach; ?>
          </div>
        <?php endif; ?>
        <p class="muted" style="margin-top:18px">רכישה ותשלום עדיין אינם פעילים בגרסה זו. הם יופעלו רק לאחר חיבור קטלוג, מחירון ואישור תהליך התשלום.</p>
      </section>
    <?php endif; ?>
  </div>
</body>
</html>
