<?php
declare(strict_types=1);
require_once __DIR__ . '/_portal.php';

const CP_CATALOG_PATH = __DIR__ . '/catalog/hashavshevet-products.json';
const CP_CART_KEY = 'cp_cart';
const CP_VAT_RATE = 0.18;

function cp_catalog_all(): array {
    if (!is_file(CP_CATALOG_PATH)) return [];
    $raw = @file_get_contents(CP_CATALOG_PATH);
    $data = $raw === false ? null : json_decode($raw, true);
    $items = is_array($data['products'] ?? null) ? $data['products'] : [];
    $out = [];
    foreach ($items as $item) {
        if (!is_array($item)) continue;
        $sku = trim((string)($item['sku'] ?? ''));
        $name = trim((string)($item['name'] ?? ''));
        $price = (float)($item['priceIlsVat'] ?? 0);
        $online = !empty($item['online']);
        if ($sku === '' || $name === '' || $price <= 0 || !$online) continue;
        $out[$sku] = [
            'sku' => $sku,
            'name' => $name,
            'category' => trim((string)($item['category'] ?? 'מוצרים')),
            'brand' => trim((string)($item['brand'] ?? '')),
            'description' => trim((string)($item['description'] ?? '')),
            'priceIlsVat' => round($price, 2),
            'stock' => max(0, (int)($item['stock'] ?? 0)),
            'imageUrl' => trim((string)($item['imageUrl'] ?? '')),
            'online' => true,
        ];
    }
    return $out;
}

function cp_customer_discount_percent(array $profile): int {
    return !empty($profile['service_agreement']) ? 50 : 0;
}

function cp_customer_product(array $product, array $profile): array {
    $discount = cp_customer_discount_percent($profile);
    $list = (float)$product['priceIlsVat'];
    $price = round($list * (100 - $discount) / 100, 2);
    return $product + [
        'listPriceIlsVat' => $list,
        'discountPercent' => $discount,
        'customerPriceIlsVat' => $price,
    ];
}

function cp_cart_get(): array {
    $cart = is_array($_SESSION[CP_CART_KEY] ?? null) ? $_SESSION[CP_CART_KEY] : [];
    $clean = [];
    foreach ($cart as $sku => $qty) {
        $sku = trim((string)$sku);
        $qty = max(0, min(99, (int)$qty));
        if ($sku !== '' && $qty > 0) $clean[$sku] = $qty;
    }
    $_SESSION[CP_CART_KEY] = $clean;
    return $clean;
}

function cp_cart_set(string $sku, int $qty): void {
    $catalog = cp_catalog_all();
    if (!isset($catalog[$sku])) throw new RuntimeException('המוצר אינו זמין לרכישה אונליין.');
    if ($catalog[$sku]['stock'] <= 0) throw new RuntimeException('המוצר אינו במלאי כרגע.');
    $qty = max(0, min($qty, min(99, $catalog[$sku]['stock'])));
    $cart = cp_cart_get();
    if ($qty === 0) unset($cart[$sku]); else $cart[$sku] = $qty;
    $_SESSION[CP_CART_KEY] = $cart;
}

function cp_cart_summary(array $profile): array {
    $catalog = cp_catalog_all();
    $lines = [];
    $total = 0.0;
    foreach (cp_cart_get() as $sku => $qty) {
        if (!isset($catalog[$sku])) continue;
        $p = cp_customer_product($catalog[$sku], $profile);
        $line = round($p['customerPriceIlsVat'] * $qty, 2);
        $total += $line;
        $lines[] = [
            'sku' => $sku, 'name' => $p['name'], 'qty' => $qty,
            'unitPriceIlsVat' => $p['customerPriceIlsVat'],
            'listPriceIlsVat' => $p['listPriceIlsVat'],
            'discountPercent' => $p['discountPercent'],
            'lineTotalIlsVat' => $line,
        ];
    }
    return ['items' => $lines, 'totalIlsVat' => round($total, 2), 'currency' => 'ILS'];
}

function cp_order_dir(): string {
    $configured = cp_config_value('CUSTOMER_PORTAL_ORDER_DIR', 'CUSTOMER_PORTAL_ORDER_DIR');
    $dir = $configured !== '' ? $configured : rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'ifeel-commerce-orders';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        throw new RuntimeException('לא ניתן ליצור מאגר הזמנות.');
    }
    return $dir;
}

function cp_create_order(array $profile): array {
    $summary = cp_cart_summary($profile);
    if ($summary['items'] === []) throw new RuntimeException('הסל ריק.');
    $id = date('YmdHis') . '-' . bin2hex(random_bytes(4));
    $order = [
        'id' => $id, 'status' => 'pending_payment', 'createdAt' => gmdate('c'),
        'customer' => [
            'name' => (string)($profile['name'] ?? ''),
            'email' => (string)($profile['email'] ?? ''),
            'mondayItemId' => (string)($profile['monday_item_id'] ?? ''),
            'accountingKey' => (string)($profile['accounting_key'] ?? ''),
            'serviceAgreement' => !empty($profile['service_agreement']),
        ],
        'cart' => $summary,
    ];
    $path = cp_order_dir() . DIRECTORY_SEPARATOR . 'order-' . $id . '.json';
    $json = json_encode($order, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($json === false || @file_put_contents($path, $json, LOCK_EX) === false) {
        throw new RuntimeException('לא ניתן לשמור את ההזמנה.');
    }
    @chmod($path, 0600);
    $_SESSION['cp_last_order_id'] = $id;
    cp_send_order_confirmation($order);
    return $order;
}


function cp_order_path(string $id): string {
    if (preg_match('/\A\d{14}-[a-f0-9]{8}\z/D', $id) !== 1) return '';
    return cp_order_dir() . DIRECTORY_SEPARATOR . 'order-' . $id . '.json';
}

function cp_read_order(string $id): ?array {
    $path = cp_order_path($id);
    if ($path === '' || !is_file($path)) return null;
    $raw = @file_get_contents($path);
    $order = $raw === false ? null : json_decode($raw, true);
    return is_array($order) ? $order : null;
}

function cp_write_order(array $order): bool {
    $id = (string)($order['id'] ?? '');
    $path = cp_order_path($id);
    if ($path === '') return false;
    $json = json_encode($order, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    return $json !== false && @file_put_contents($path, $json, LOCK_EX) !== false;
}

function cp_send_order_confirmation(array $order): void {
    $to = trim((string)($order['customer']['email'] ?? ''));
    $ops = cp_config_value('CUSTOMER_PORTAL_ORDER_EMAIL', 'CUSTOMER_PORTAL_ORDER_EMAIL', 'sales@i-feel.co.il');
    $subjectText = 'הזמנה חדשה באתר I Feel ' . (string)$order['id'];
    $subject = '=?UTF-8?B?' . base64_encode($subjectText) . '?=';
    $lines = [
        'מספר הזמנה: ' . (string)$order['id'],
        'לקוח: ' . (string)($order['customer']['name'] ?? ''),
        'סה"כ כולל מע"מ: ' . number_format((float)($order['cart']['totalIlsVat'] ?? 0), 2) . ' ₪',
        '',
    ];
    foreach (($order['cart']['items'] ?? []) as $item) {
        $lines[] = (string)$item['sku'] . ' | ' . (string)$item['name'] . ' | ' . (int)$item['qty'] . ' | ' . number_format((float)$item['lineTotalIlsVat'], 2) . ' ₪';
    }
    $body = implode("\n", $lines);
    $headers = [
        'From: I Feel Online Store <no-reply@i-feel.co.il>',
        'Reply-To: sales@i-feel.co.il',
        'Content-Type: text/plain; charset=UTF-8',
    ];
    if (filter_var($to, FILTER_VALIDATE_EMAIL)) @mail($to, $subject, $body, implode("\r\n", $headers));
    if (filter_var($ops, FILTER_VALIDATE_EMAIL) && strtolower($ops) !== strtolower($to)) @mail($ops, $subject, $body, implode("\r\n", $headers));
}

function cp_payment_link(array $order): string {
    $template = cp_config_value('CUSTOMER_PORTAL_PAYMENT_URL_TEMPLATE', 'CUSTOMER_PORTAL_PAYMENT_URL_TEMPLATE');
    if ($template === '') return '';
    return strtr($template, [
        '{orderId}' => rawurlencode((string)$order['id']),
        '{amount}' => rawurlencode(number_format((float)$order['cart']['totalIlsVat'], 2, '.', '')),
        '{currency}' => 'ILS',
        '{email}' => rawurlencode((string)$order['customer']['email']),
    ]);
}