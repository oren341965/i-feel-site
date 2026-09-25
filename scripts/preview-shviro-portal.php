<?php
declare(strict_types=1);
// Local-only synthetic preview: php -S 127.0.0.1:8788 -t public scripts/preview-shviro-portal.php
if (PHP_SAPI !== 'cli-server' || !in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) { http_response_code(403); exit; }
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (in_array($path, ['/', '/shviro-ganei-tikva/', '/shviro-ganei-tikva/index.php'], true)) {
    define('SGT_LOCAL_PREVIEW', true);
    function sgt_preview_identity(): ?array {
        $scenario = $_GET['scenario'] ?? 'resident';
        if ($scenario === 'guest') return null;
        return ['role' => 'resident', 'project_id' => $scenario === 'other' ? 'group_mm15570j' : 'group_mm4djwwb',
            'monday_item_id' => '999999', 'name' => 'דייר/ת בדיקה', 'email' => 'resident@example.invalid', 'building' => '19', 'apartment' => '12'];
    }
    require dirname(__DIR__) . '/public/shviro-ganei-tikva/index.php';
    return true;
}
if ($path === '/shviro-ganei-tikva/styles.css' || $path === '/assets/favicon.png'
    || preg_match('~\A/shviro-ganei-tikva/assets/sku/[a-z0-9-]+\.(jpg|webp|png)\z~D', $path)) return false;
http_response_code(404); echo 'Not found';
