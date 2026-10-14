<?php
declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_email_auth.php';
require_once __DIR__ . '/_mcohome_faults.php';
header('Cache-Control: private, no-store');
header('Referrer-Policy: no-referrer');
header('X-Robots-Tag: noindex, nofollow, noarchive');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
$user = portal_current_user();
if (strtolower(trim((string) ($user['email'] ?? ''))) !== 'oren@i-feel.co.il') {
    http_response_code(403); exit('Only authenticated Oren can configure this connection.');
}
$result = '';
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    try {
        portal_verify_csrf();
        $url = trim(is_string($_POST['url'] ?? null) ? $_POST['url'] : '');
        $secret = trim(is_string($_POST['secret'] ?? null) ? $_POST['secret'] : '');
        if (!preg_match('~^https://script\.google\.com/macros/s/[A-Za-z0-9_-]{20,}/exec$~', $url) || !preg_match('/^[a-f0-9]{64}$/', $secret)) {
            throw new RuntimeException('Invalid endpoint or connection key.');
        }
        $response = mcohome_request_gateway(['url' => $url, 'secret' => $secret], ['action' => 'health']);
        $health = $response['response']['health'] ?? [];
        if (!($response['ok'] ?? false) || ($health['owner'] ?? '') !== 'oren@i-feel.co.il'
            || ($health['driveFolderId'] ?? '') !== '1xEElpkLxeCgXrYBJ-920IAPuqiN-tWxw'
            || ($health['spreadsheetId'] ?? '') !== '1fYMehkRix3HTkz6EMvnrDx6eyyQJWwOVcGQYDThRthg') {
            throw new RuntimeException('Google connection verification failed; nothing was changed.');
        }
        portal_json_write(mcohome_connection_file(), ['url' => $url, 'secret' => $secret, 'verifiedAt' => date(DATE_ATOM), 'owner' => $health['owner']]);
        @chmod(mcohome_connection_file(), 0600);
        portal_audit('mcohome_gateway_connected', ['owner' => 'oren@i-feel.co.il']);
        $result = 'Connection verified and saved. No email or video was sent by this check.';
    } catch (Throwable $error) { $result = $error->getMessage(); }
}
$connected = mcohome_gateway_config() !== null;
header('Content-Type: text/html; charset=utf-8');
?>
<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MCOHome Google connection</title>
<style>body{font:18px Arial;max-width:700px;margin:30px auto;padding:20px}label{display:block;margin:20px 0}input{display:block;width:100%;padding:10px;box-sizing:border-box}button{padding:12px}p{line-height:1.5}</style>
<h1>MCOHome Google connection</h1><p>Status: <?= $connected ? 'Configured' : 'Not configured' ?></p>
<p><?= portal_h($result) ?></p><p>Only Oren can save this connection. The key stays in private portal storage, outside Git; public/api/config.php is not modified.</p>
<form method="post"><input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
<label>Apps Script deployment URL<input name="url" type="url" required autocomplete="off"></label>
<label>Private connection key<input name="secret" type="password" required pattern="[a-f0-9]{64}" autocomplete="new-password"></label>
<button>Verify and save connection</button></form></html>
