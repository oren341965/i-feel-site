<?php
declare(strict_types=1);
// Synthetic access tickets are available only to the local PHP test server.
if (PHP_SAPI !== 'cli-server' || !in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) {
    http_response_code(403); exit;
}
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if ($path !== '/test-access') return false;
require dirname(__DIR__, 2) . '/public/developer-projects/_bootstrap.php';
$scenario = $_GET['scenario'] ?? 'resident';
$ticketId = bin2hex(random_bytes(24));
$profile = ['email' => 'resident@example.invalid', 'role' => 'resident', 'name' => 'Synthetic resident',
    'building' => '1', 'apartment' => '22', 'location' => '', 'monday_item_id' => '123456',
    'projects' => [['id' => $scenario === 'other' ? 'group_mm1hqj4x' : 'group_mm15570j', 'slug' => 'even-shaprut']]];
$expires = time() + 600;
if ($scenario !== 'forged') esp_write_ticket('access', $ticketId, [
    'profile' => $profile, 'expires' => $scenario === 'expired' ? time() - 1 : $expires,
    'last_activity' => $scenario === 'inactive' ? time() - ESP_ACCESS_TTL - 1 : time(),
]);
esp_set_private_cookie(ESP_ACCESS_COOKIE, $ticketId, $expires);
echo 'Synthetic test access';
