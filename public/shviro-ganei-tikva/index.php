<?php
declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_pricing.php';

$preview = sgt_shop_local_preview();
$user = $preview ? sgt_preview_identity() : sgt_current_user();
if (!sgt_profile_allowed($user)) $user = null;
$error = '';
$notice = '';
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    try {
        sgt_verify_csrf();
        $action = sgt_post('action', 40);
        if ($action === 'request_code' || $action === 'verify_code') {
            if ($preview) throw new RuntimeException('בתצוגת הבדיקה לא נשלחים קודי כניסה.');
            if ($action === 'request_code') {
                $email = strtolower(sgt_post('email', 180));
                if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new InvalidArgumentException('יש להזין כתובת דואר אלקטרוני תקינה.');
                $profile = sgt_resident_profile($email);
                if ($profile === null) throw new InvalidArgumentException('הכתובת אינה רשומה בפרויקט. פנו אלינו כדי לבדוק את פרטי הדייר.');
                if (!sgt_send_code($profile)) throw new RuntimeException('לא ניתן לשלוח קוד כרגע. המתינו דקה ונסו שוב.');
                sgt_redirect(['access' => 'code-sent']);
            }
            if (!sgt_verify_code(sgt_post('code', 20))) throw new InvalidArgumentException('הקוד שגוי או שפג תוקפו.');
            sgt_redirect();
        } elseif ($action === 'logout') {
            sgt_logout();
            sgt_redirect();
        } elseif ($action === 'add' || $action === 'remove') {
            if ($user === null) throw new RuntimeException('יש להתחבר כדייר מאומת בפרויקט.');
            $id = sgt_post('product', 80);
            if (!isset(sgt_shop_catalog()[$id])) throw new InvalidArgumentException('פריט לא מוכר.');
            $cart = $_SESSION['sgt_cart'] ?? [];
            if ($action === 'remove') unset($cart[$id]);
            else {
                $quantity = filter_var($_POST['quantity'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 20]]);
                if ($quantity === false || ($cart[$id] ?? 0) + $quantity > 20) throw new InvalidArgumentException('אפשר לבחור בין 1 ל־20 יחידות או שעות לפריט.');
                $cart[$id] = ($cart[$id] ?? 0) + $quantity;
            }
            sgt_shop_quote($cart);
            $_SESSION['sgt_cart'] = $cart;
            $_SESSION['sgt_notice'] = $action === 'add' ? 'הפריט נוסף לרשימת השדרוגים.' : 'הפריט הוסר מהרשימה.';
            header('Location: ' . SGT_BASE_PATH . '#cart', true, 303);
            exit;
        } else throw new InvalidArgumentException('פעולה לא מוכרת.');
    } catch (Throwable $exception) { $error = $exception->getMessage(); }
}
$csrf = sgt_csrf_token();
$notice = $_SESSION['sgt_notice'] ?? '';
unset($_SESSION['sgt_notice']);
$quote = $user !== null ? sgt_shop_quote($_SESSION['sgt_cart'] ?? []) : null;
$pendingEmail = $preview ? '' : sgt_pending_email();
?><!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive,nosnippet"><title>שבירו גני תקווה — שדרוגים והדרכת אפליקציה | I Feel</title><meta name="description" content="אזור דיירי שבירו בגני תקווה: מחירי מפסקים וציוד קצה, עלויות התקנה והדרכה לשימוש באפליקציית הבית החכם. 03-508-9553"><link rel="icon" href="/assets/favicon.png"><link rel="stylesheet" href="/shviro-ganei-tikva/styles.css"></head>
<body>
<?php if ($preview): ?><div class="preview">תצוגת בדיקה פרטית · נתוני דייר פיקטיביים · אין חיוב או שליחת הזמנה</div><?php endif; ?>
<header class="header shell"><a class="logo" href="/shviro-ganei-tikva/">I FEEL<span>שבירו · המשי 19 · גני תקווה</span></a><nav aria-label="ניווט ראשי"><?php if ($user): ?><a class="cart-link" href="#app-guide">הדרכת האפליקציה</a><a class="cart-link" href="#cart">השדרוגים שלי · <?= array_sum($_SESSION['sgt_cart'] ?? []) ?></a><?php else: ?><a class="cart-link" href="tel:035089553">03-508-9553</a><?php endif; ?></nav></header>
<main class="shell">
<section class="hero"><p class="eyebrow">לדיירי שבירו בגני תקווה</p><h1>הבית שלכם,<br>האפשרויות שלכם.</h1><p>מפסקים, ציוד קצה ושדרוגים לבית החכם — עם מחירון ברור והדרכה לשימוש באפליקציה.</p><span class="pill">מחירי הציוד וההתקנה לפני מע״מ · המע״מ מפורט בסיכום</span></section>
<?php if ($error): ?><p class="alert error" role="alert"><?= sgt_h($error) ?></p><?php endif; ?>
<?php if ($notice): ?><p class="alert" role="status"><?= sgt_h($notice) ?></p><?php endif; ?>
<?php if ($user === null): ?>
<section class="login"><h2>כניסה לדיירי הפרויקט</h2><p>הזינו את כתובת הדואר הרשומה אצלנו בפרויקט שבירו, המשי 19 בגני תקווה. נשלח אליה קוד חד־פעמי לכניסה למחירון ולהדרכה.</p>
<?php if ($pendingEmail !== ''): ?><p class="alert">קוד כניסה נשלח ל־<?= sgt_h($pendingEmail) ?>.</p><form method="post"><input type="hidden" name="csrf" value="<?= sgt_h($csrf) ?>"><input type="hidden" name="action" value="verify_code"><label for="code">קוד בן 6 ספרות</label><input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required><button type="submit">כניסה לאזור הדיירים</button></form>
<?php else: ?><form method="post"><input type="hidden" name="csrf" value="<?= sgt_h($csrf) ?>"><input type="hidden" name="action" value="request_code"><label for="email">כתובת דואר אלקטרוני</label><input id="email" type="email" name="email" autocomplete="email" maxlength="180" required><button type="submit">שלחו לי קוד כניסה</button></form><?php endif; ?>
<p class="small">לא מצליחים להיכנס? <a href="tel:035089553">03-508-9553</a> · <a href="mailto:myhome@i-feel.co.il">myhome@i-feel.co.il</a></p></section>
<?php else: ?>
<div class="identity"><span>שלום, <?= sgt_h($user['name'] ?: 'דייר/ת') ?><?php if ($user['building'] !== ''): ?> · בניין <?= sgt_h($user['building']) ?><?php endif; ?><?php if ($user['apartment'] !== ''): ?> · דירה <?= sgt_h($user['apartment']) ?><?php endif; ?></span><?php if (!$preview): ?><form method="post"><input type="hidden" name="csrf" value="<?= sgt_h($csrf) ?>"><input type="hidden" name="action" value="logout"><button type="submit">יציאה</button></form><?php endif; ?></div>
<nav class="nav" aria-label="ניווט באזור הדיירים"><a href="#pricelist">מפסקים וציוד קצה</a><a href="#app-guide">איך משתמשים באפליקציה</a><a href="#how-to-order">איך מוסיפים ציוד לדירה</a></nav>
<div class="shop-layout"><section id="pricelist" aria-label="מחירון השדרוגים"><div class="section-heading"><h2>הציוד לבית שלכם</h2><span><?= count(sgt_shop_catalog()) ?> אפשרויות לשדרוג</span></div><div class="products">
<?php foreach (sgt_shop_catalog() as $product): ?><article class="product"><?php if ($product['image'] || $product['id'] === 'engraving'): ?><div class="product-image"><?php if ($product['image']): ?><img src="/shviro-ganei-tikva/assets/sku/<?= sgt_h($product['image']) ?>" alt="<?= sgt_h($product['name']) ?>" loading="lazy"><?php else: ?><span class="engraving">Aa · אבג</span><?php endif; ?></div><?php endif; ?><div class="product-body"><p class="category"><?= sgt_h($product['category']) ?></p><h3><?= sgt_h($product['name']) ?></h3><p class="description"><?= sgt_h($product['description']) ?></p><?php if ($product['sku'] !== ''): ?><p class="sku">מק״ט <?= sgt_h($product['sku']) ?></p><?php endif; ?><p class="price"><?= $product['requiresQuote'] ? 'החל מ־' : '' ?><?= sgt_shop_money($product['netCents']) ?><?= isset($product['unitLabel']) ? ' לשעה' : '' ?></p>
<p class="installation"><?php if (isset($product['installationNetCents'])): ?>ציוד ללא התקנה · התקנה: <?= sgt_shop_money($product['installationNetCents']) ?><br>סה״כ עם התקנה: <?= $product['requiresQuote'] ? 'החל מ־' : '' ?><?= sgt_shop_money($product['netCents'] + $product['installationNetCents']) ?><?php else: ?><?= isset($product['unitLabel']) ? 'חיוב לפי מספר שעות' : 'כולל התקנה' ?><?php endif; ?><br>כל הסכומים לפני מע״מ</p><?php if ($product['requiresQuote']): ?><p class="small">הדגם והמחיר הסופי ייקבעו לאחר התאמה לדירה.</p><?php endif; ?>
<form method="post"><input type="hidden" name="csrf" value="<?= sgt_h($csrf) ?>"><input type="hidden" name="action" value="add"><input type="hidden" name="product" value="<?= sgt_h($product['id']) ?>"><label class="quantity-label" for="q-<?= sgt_h($product['id']) ?>"><?= isset($product['unitLabel']) ? 'שעות' : 'כמות' ?><span class="sr-only"> — <?= sgt_h($product['name']) ?></span></label><input id="q-<?= sgt_h($product['id']) ?>" name="quantity" type="number" value="1" min="1" max="20" required><button type="submit">הוספה לרשימה</button></form></div></article><?php endforeach; ?>
</div></section>
<aside id="cart" class="cart"><h2>השדרוגים שלי</h2><?php if (!$quote['lines']): ?><p class="empty">בחרו ציוד וכמויות כדי לראות את העלות עם התקנה ומע״מ.</p><?php else: ?>
<?php foreach ($quote['lines'] as $line): ?><div class="cart-line"><strong><?= sgt_h($line['name']) ?></strong><span><?= $line['quantity'] ?> <?= sgt_h($line['unitLabel']) ?> · <?= $line['requiresQuote'] ? 'החל מ־' : '' ?><?= sgt_shop_money($line['lineCents']) ?> לפני מע״מ</span><form method="post"><input type="hidden" name="csrf" value="<?= sgt_h($csrf) ?>"><input type="hidden" name="action" value="remove"><input type="hidden" name="product" value="<?= sgt_h($line['id']) ?>"><button class="text-button" type="submit" aria-label="הסרת <?= sgt_h($line['name']) ?>">הסרה</button></form></div><?php endforeach; ?>
<div class="total"><span>ציוד והתקנה לפני מע״מ</span><strong><?= sgt_shop_money($quote['netCents']) ?></strong></div><div class="total"><span>מע״מ</span><strong><?= sgt_shop_money($quote['vatCents']) ?></strong></div><div class="total"><span><?= $quote['requiresQuote'] ? 'סה״כ התחלתי כולל מע״מ' : 'סה״כ כולל מע״מ' ?></span><strong><?= sgt_shop_money($quote['totalCents']) ?></strong></div><?php endif; ?>
<p class="small">הרשימה מיועדת לחישוב ולתיאום. הוספת פריט אינה שולחת הזמנה ואינה מחייבת בתשלום. התאמת הציוד, עבודות תשתית ותוספות שאינן כלולות ייבדקו לפני אישור ההזמנה.</p><a class="wide" href="tel:035089553">לתיאום השדרוג · 03-508-9553</a></aside></div>
<?php require __DIR__ . '/_guide.php'; ?>
<?php endif; ?>
</main><footer class="shell footer">I FEEL · שבירו, המשי 19, גני תקווה · <a href="tel:035089553">03-508-9553</a></footer>
</body></html>
