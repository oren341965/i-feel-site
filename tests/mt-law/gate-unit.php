<?php
declare(strict_types=1);

$root = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'ifeel-mtlaw-test-' . bin2hex(random_bytes(6));
define('MTLAW_PRIVATE_STORAGE_PATH', $root);

$_SESSION = [];
$_POST = [];
$_SERVER['REQUEST_METHOD'] = 'GET';
$GLOBALS['mtlaw_test_user'] = null;
$GLOBALS['mtlaw_test_csrf_valid'] = true;

function mtlaw_current_user(): ?array
{
    $user = $GLOBALS['mtlaw_test_user'] ?? null;
    return is_array($user) ? $user : null;
}

function mtlaw_post(string $key, int $max = 4000): string
{
    $value = $_POST[$key] ?? '';
    if (!is_scalar($value)) {
        return '';
    }
    return substr(trim((string) $value), 0, $max);
}

function mtlaw_verify_csrf(): void
{
    if (($GLOBALS['mtlaw_test_csrf_valid'] ?? false) !== true) {
        throw new RuntimeException('invalid test csrf');
    }
}

require dirname(__DIR__, 2) . '/public/mt-law/_gate_data.php';

function assert_same($expected, $actual, string $message): void
{
    if ($expected !== $actual) {
        fwrite(STDERR, "FAIL: {$message}\nExpected: " . var_export($expected, true) . "\nActual: " . var_export($actual, true) . "\n");
        exit(1);
    }
}

function assert_true(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
}

$verifiedAt = time();
$_SESSION = [
    'mtlaw_verified_at' => $verifiedAt,
    'mtlaw_gate_marketing_opt_in' => false,
];
mtlaw_gate_record_verified_access(['email' => 'lawyer@mt-law.co.il', 'role' => 'member']);
$contacts = mtlaw_gate_read_contacts();
assert_same('opt-in-required', $contacts['lawyer@mt-law.co.il']['mailing_permission'] ?? null, 'Unchecked consent must not authorize mailing.');
assert_same(1, $contacts['lawyer@mt-law.co.il']['verified_count'] ?? null, 'First verified access should be counted.');
assert_same('mt-law', $contacts['lawyer@mt-law.co.il']['organization'] ?? null, 'MT-Law contact should be classified correctly.');

$_SESSION = [
    'mtlaw_verified_at' => $verifiedAt + 1,
    'mtlaw_gate_marketing_opt_in' => true,
];
mtlaw_gate_record_verified_access(['email' => 'lawyer@mt-law.co.il', 'role' => 'member']);
$contacts = mtlaw_gate_read_contacts();
assert_same('explicit-consent', $contacts['lawyer@mt-law.co.il']['mailing_permission'] ?? null, 'Checked consent after verified email must authorize mailing.');
assert_same(2, $contacts['lawyer@mt-law.co.il']['verified_count'] ?? null, 'Repeated verified access should be counted once per session.');
assert_same(MTLAW_GATE_CONSENT_VERSION, $contacts['lawyer@mt-law.co.il']['marketing_consent_version'] ?? null, 'Consent version must be stored.');
assert_same(hash('sha256', MTLAW_GATE_CONSENT_TEXT), $contacts['lawyer@mt-law.co.il']['marketing_consent_text_hash'] ?? null, 'Consent text hash must be stored.');
assert_true((string) ($contacts['lawyer@mt-law.co.il']['marketing_consent_at'] ?? '') !== '', 'Consent timestamp must be stored.');

$_SESSION = [
    'mtlaw_verified_at' => $verifiedAt + 2,
    'mtlaw_gate_marketing_opt_in' => true,
];
mtlaw_gate_record_verified_access(['email' => 'oren@i-feel.co.il', 'role' => 'staff']);
$contacts = mtlaw_gate_read_contacts();
assert_same('opt-in-required', $contacts['oren@i-feel.co.il']['mailing_permission'] ?? null, 'I Feel test access must not join the MT-Law mailing list.');
assert_same('i-feel', $contacts['oren@i-feel.co.il']['organization'] ?? null, 'I Feel staff should be classified separately.');

$_SERVER['REQUEST_METHOD'] = 'POST';
$_POST = [
    'action' => 'lead',
    'name' => 'שם לא מורשה',
    'phone' => '050-000-0000',
];
$GLOBALS['mtlaw_test_csrf_valid'] = false;
mtlaw_gate_capture_lead_profile(['email' => 'lawyer@mt-law.co.il', 'role' => 'member']);
$contacts = mtlaw_gate_read_contacts();
assert_same(null, $contacts['lawyer@mt-law.co.il']['full_name'] ?? null, 'Invalid CSRF must not update the verified contact profile.');

$_POST = [
    'action' => 'lead',
    'name' => 'דנה כהן',
    'phone' => '052-123-4567',
];
$GLOBALS['mtlaw_test_csrf_valid'] = true;
mtlaw_gate_capture_lead_profile(['email' => 'lawyer@mt-law.co.il', 'role' => 'member']);
$contacts = mtlaw_gate_read_contacts();
assert_same('דנה', $contacts['lawyer@mt-law.co.il']['first_name'] ?? null, 'First name should be captured from a submitted lead.');
assert_same('כהן', $contacts['lawyer@mt-law.co.il']['last_name'] ?? null, 'Last name should be captured from a submitted lead.');
assert_same('052-123-4567', $contacts['lawyer@mt-law.co.il']['phone'] ?? null, 'Phone should be captured from a submitted lead.');

$stats = mtlaw_gate_stats();
assert_same(1, $stats['verified'] ?? null, 'Only MT-Law contacts should be counted in the verified audience.');
assert_same(1, $stats['subscribers'] ?? null, 'Only explicit MT-Law consent should count as a subscriber.');
assert_same(2, $stats['accesses'] ?? null, 'Verified access total should exclude I Feel staff.');

$storedPath = mtlaw_gate_contacts_path();
$expectedPrefix = $root . DIRECTORY_SEPARATOR;
assert_true(strncmp($storedPath, $expectedPrefix, strlen($expectedPrefix)) === 0, 'Registry must use the configured private storage root.');
assert_true(is_file($storedPath), 'Registry JSON should exist.');
assert_true(is_file($root . DIRECTORY_SEPARATOR . '.htaccess'), 'Private storage should contain a deny rule.');

$iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
    RecursiveIteratorIterator::CHILD_FIRST
);
foreach ($iterator as $item) {
    $item->isDir() ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
}
@rmdir($root);

fwrite(STDOUT, "MT-Law gate registry tests passed.\n");
