<?php
declare(strict_types=1);

function sgt_shop_catalog(): array
{
    static $catalog;
    if ($catalog === null) $catalog = array_column(require __DIR__ . '/_catalog.php', null, 'id');
    return $catalog;
}

function sgt_shop_local_preview(): bool
{
    return PHP_SAPI === 'cli-server' && defined('SGT_LOCAL_PREVIEW') && SGT_LOCAL_PREVIEW === true
        && in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
}

function sgt_shop_project_resident(?array $user): bool
{
    // Project membership, never the unrelated service-agreement flag.
    return $user !== null && ($user['role'] ?? '') === 'resident'
        && ($user['project_id'] ?? '') === 'group_mm4djwwb'
        && preg_match('/\A\d{1,20}\z/D', (string) ($user['monday_item_id'] ?? '')) === 1;
}

function sgt_shop_gross(int $netCents): int
{
    return intdiv($netCents * 118 + 50, 100);
}

function sgt_shop_money(int $cents): string
{
    return number_format($cents / 100, 2, '.', ',') . ' ₪';
}

function sgt_shop_quote(array $cart): array
{
    $catalog = sgt_shop_catalog();
    $lines = [];
    $total = 0;
    $needsQuote = false;
    foreach ($cart as $id => $quantity) {
        if (!isset($catalog[$id]) || !is_int($quantity) || $quantity < 1 || $quantity > 20) {
            throw new InvalidArgumentException('פריט או כמות אינם תקינים.');
        }
        $product = $catalog[$id];
        $unit = $product['netCents'] + ($product['installationNetCents'] ?? 0);
        $line = $unit * $quantity;
        $total += $line;
        $needsQuote = $needsQuote || $product['requiresQuote'];
        $lines[] = ['id' => $id, 'name' => $product['name'], 'quantity' => $quantity,
            'unitLabel' => $product['unitLabel'] ?? 'יח׳', 'unitCents' => $unit, 'lineCents' => $line, 'requiresQuote' => $product['requiresQuote']];
    }
    return ['lines' => $lines, 'netCents' => $total, 'vatCents' => sgt_shop_gross($total) - $total, 'totalCents' => sgt_shop_gross($total), 'requiresQuote' => $needsQuote,
        'currency' => 'ILS', 'catalogVersion' => 'shviro-ganei-tikva-2026-09-net-installation-v2'];
}
