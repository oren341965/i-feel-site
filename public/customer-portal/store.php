<?php
declare(strict_types=1);
require_once __DIR__ . '/_commerce.php';
$user = cp_current_user();
if ($user === null) {
    header('Location: ' . CP_BASE_PATH . 'index.php', true, 303);
    exit;
}
$error = '';
$notice = '';
try {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        cp_verify_csrf();
        $action = cp_post('action', 40);
        if ($action === 'cart') {
            cp_cart_set(cp_post('sku', 120), (int)cp_post('qty', 3));
            $notice = 'הסל עודכן.';
        } elseif ($action === 'checkout') {
            $order = cp_create_order($user);
            $_SESSION[CP_CART_KEY] = [];
            $pay = cp_payment_link($order);
            if ($pay !== '') {
                header('Location: ' . $pay, true, 303);
                exit;
            }
            $notice = 'ההזמנה נוצרה. טרם הוגדר ספק סליקה פעיל, ולכן לא בוצע חיוב.';
        }
    }
} catch (Throwable $e) {
    $error = $e->getMessage();
}
$csrf = cp_csrf_token();
$catalog = array_map(fn($p) => cp_customer_product($p, $user), array_values(cp_catalog_all()));
$cart = cp_cart_summary($user);
?>
<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="origin-trial" content="Ah+4b0aP/hQJnF215qC+sRdcwmNp2ZlkRLld2YTDlnzGITuBdYEDsqlw9POmquiVw2rKMD52HObo3GUk+o6BcgMAAABMeyJvcmlnaW4iOiJodHRwczovL2ktZmVlbC5jby5pbDo0NDMiLCJmZWF0dXJlIjoiV2ViTUNQIiwiZXhwaXJ5IjoxNzk0ODczNjAwfQ==">
<title>חנות לקוחות I Feel</title><meta name="robots" content="noindex,nofollow">
<style>
body{margin:0;font-family:Arial,sans-serif;background:#f4f7fb;color:#102038}.wrap{max-width:1180px;margin:auto;padding:24px}.top{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}.card{background:#fff;border:1px solid #dfe7f0;border-radius:16px;padding:18px}.price{font-size:24px;font-weight:800}.old{text-decoration:line-through;color:#718096}.pill{display:inline-block;padding:6px 10px;border-radius:999px;background:#edf6ff;color:#145a94;font-weight:700}.ok{background:#ecfdf3;padding:12px;border-radius:10px}.err{background:#fff1f2;padding:12px;border-radius:10px}button{padding:10px 14px;border:0;border-radius:9px;background:#124d85;color:white;font-weight:700}input{width:70px;padding:8px}.cart{margin-top:24px}.muted{color:#62748a}a{color:#124d85}
</style>
<script src="/customer-portal/commerce-webmcp.js" defer></script>
</head>
<body><div class="wrap">
<div class="top"><div><span class="pill">I Feel Online Store</span><h1>מוצרים ללקוחות I Feel</h1><p class="muted">המחיר והזכאות מחושבים בשרת לפי חשבשבת והסכם השירות.</p></div><a href="/customer-portal/index.php">חזרה לאזור האישי</a></div>
<?php if ($error): ?><div class="err"><?= cp_h($error) ?></div><?php endif; ?>
<?php if ($notice): ?><div class="ok"><?= cp_h($notice) ?></div><?php endif; ?>
<?php if ($catalog === []): ?><div class="card"><h2>הקטלוג ממתין לסנכרון חשבשבת</h2><p>יש לייבא את קובץ המחירון/מלאי הרשמי. מוצרים לא יוצגו עד שיאושרו לרכישה אונליין.</p></div><?php else: ?>
<div class="grid">
<?php foreach ($catalog as $p): ?><article class="card">
<h2><?= cp_h($p['name']) ?></h2><div class="muted"><?= cp_h($p['brand']) ?> · <?= cp_h($p['sku']) ?></div>
<p><?= cp_h($p['description']) ?></p>
<?php if ($p['discountPercent'] > 0): ?><div class="old"><?= number_format($p['listPriceIlsVat'],2) ?> ₪</div><?php endif; ?>
<div class="price"><?= number_format($p['customerPriceIlsVat'],2) ?> ₪</div>
<div class="muted">כולל מע״מ · מלאי <?= (int)$p['stock'] ?></div>
<form method="post"><input type="hidden" name="csrf" value="<?= cp_h($csrf) ?>"><input type="hidden" name="action" value="cart"><input type="hidden" name="sku" value="<?= cp_h($p['sku']) ?>"><input name="qty" type="number" min="0" max="<?= (int)$p['stock'] ?>" value="<?= (int)(cp_cart_get()[$p['sku']] ?? 0) ?>"><button type="submit">עדכון סל</button></form>
</article><?php endforeach; ?>
</div><?php endif; ?>
<section class="card cart"><h2>הסל שלי</h2>
<?php if ($cart['items'] === []): ?><p class="muted">הסל ריק.</p><?php else: ?>
<?php foreach ($cart['items'] as $line): ?><p><?= cp_h($line['name']) ?> × <?= (int)$line['qty'] ?> = <strong><?= number_format($line['lineTotalIlsVat'],2) ?> ₪</strong></p><?php endforeach; ?>
<h3>סה״כ כולל מע״מ: <?= number_format($cart['totalIlsVat'],2) ?> ₪</h3>
<form method="post"><input type="hidden" name="csrf" value="<?= cp_h($csrf) ?>"><input type="hidden" name="action" value="checkout"><button type="submit">יצירת הזמנה והמשך לתשלום</button></form>
<?php endif; ?></section>
</div></body></html>