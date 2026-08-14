<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    echo json_encode(['eligible' => false]);
    exit;
}

session_name('ifeel_lead');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

$proof = $_POST['proof'] ?? '';
$stored = $_SESSION['ads_conversion_proof'] ?? null;
$eligible = is_string($proof)
    && preg_match('/^[a-f0-9]{64}$/', $proof) === 1
    && is_array($stored)
    && isset($stored['hash'], $stored['expires_at'], $stored['monday_item_id'])
    && is_string($stored['hash'])
    && is_numeric($stored['expires_at'])
    && (int) $stored['expires_at'] >= time()
    && trim((string) $stored['monday_item_id']) !== ''
    && hash_equals($stored['hash'], hash('sha256', $proof));

// Consume the server-side proof even when it is expired or malformed. This
// makes every successful Monday lead eligible for at most one browser event.
unset($_SESSION['ads_conversion_proof']);
session_write_close();

echo json_encode(['eligible' => $eligible], JSON_UNESCAPED_SLASHES);
