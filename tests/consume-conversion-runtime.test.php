<?php
declare(strict_types=1);
session_save_path(sys_get_temp_dir());
session_name('ifeel_lead');
session_id('ifeel-test-' . bin2hex(random_bytes(12)));
function verify_proof(?array $stored, string $proof): array {
    session_start();
    $_SESSION['ads_conversion_proof'] = $stored;
    session_write_close();
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $_POST = ['proof' => $proof];
    ob_start();
    include __DIR__ . '/../public/api/consume-conversion.php';
    $response = json_decode(ob_get_clean(), true, 512, JSON_THROW_ON_ERROR);
    session_start();
    if (isset($_SESSION['ads_conversion_proof'])) throw new RuntimeException('Proof not consumed');
    session_write_close();
    return $response;
}
$proof = str_repeat('b', 64);
$eventId = 'ifeel_' . str_repeat('d', 32);
$stored = ['hash' => hash('sha256', $proof), 'expires_at' => time() + 300, 'monday_item_id' => 'test-only', 'event_id' => $eventId, 'user_data' => ['sha256_email_address' => str_repeat('a', 64)]];
$ok = verify_proof($stored, $proof);
if ($ok !== ['eligible' => true, 'event_id' => $eventId, 'user_data' => ['sha256_email_address' => str_repeat('a', 64)]]) throw new RuntimeException('Valid consented proof');
if (verify_proof(null, $proof) !== ['eligible' => false]) throw new RuntimeException('Replay allowed');
if (verify_proof($stored, str_repeat('c', 64)) !== ['eligible' => false]) throw new RuntimeException('Wrong proof allowed');
$stored['expires_at'] = time() - 1;
if (verify_proof($stored, $proof) !== ['eligible' => false]) throw new RuntimeException('Expired proof allowed');
$stored['expires_at'] = time() + 300;
$stored['user_data'] = ['sha256_email_address' => 'raw@example.com'];
if (verify_proof($stored, $proof) !== ['eligible' => true, 'event_id' => $eventId]) throw new RuntimeException('Raw data exposed');
$stored['event_id'] = 'raw@example.invalid';
if (verify_proof($stored, $proof) !== ['eligible' => false]) throw new RuntimeException('Invalid event ID allowed');
unset($stored['event_id']);
if (verify_proof($stored, $proof) !== ['eligible' => false]) throw new RuntimeException('Missing event ID allowed');
session_start();
session_destroy();
echo "Session proof, replay, expiry and data isolation: passed\n";
