<?php
declare(strict_types=1);

function portal_test_expect(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$repositoryRoot = dirname(__DIR__, 2);
$storagePath = trim((string) getenv('PORTAL_TEST_STORAGE'));
if ($storagePath === '') {
    $storagePath = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'ifeel-portal-unit-' . bin2hex(random_bytes(6));
}

define('EXPENSE_PORTAL_STORAGE_PATH', $storagePath);
define('EXPENSE_PORTAL_MAIL_TRANSPORT', 'mail');

$_SERVER['HTTP_HOST'] = 'localhost:8080';
$_SERVER['DOCUMENT_ROOT'] = $repositoryRoot . DIRECTORY_SEPARATOR . 'public';
$_SERVER['REQUEST_URI'] = '/staff-expenses/';
$_SERVER['SCRIPT_NAME'] = '/staff-expenses/index.php';
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';

require_once $repositoryRoot . '/public/staff-expenses/_bootstrap.php';
require_once $repositoryRoot . '/public/staff-expenses/_ui.php';
require_once $repositoryRoot . '/public/staff-expenses/_email_auth.php';
require_once $repositoryRoot . '/public/staff-expenses/_labels.php';
require_once $repositoryRoot . '/public/staff-expenses/_records.php';
require_once $repositoryRoot . '/public/staff-expenses/_readiness.php';

try {
    portal_test_expect(
        portal_normalize_company_email('Worker@I-FEEL.CO.IL') === 'worker@i-feel.co.il',
        'Company email normalization failed.'
    );
    portal_test_expect(
        portal_normalize_company_email('worker@gmail.com') === null,
        'External email was accepted.'
    );
    portal_test_expect(
        portal_normalize_company_email('worker@sub.i-feel.co.il') === null,
        'Subdomain email was accepted.'
    );
    portal_test_expect(
        in_array('oren@i-feel.co.il', portal_email_admins(), true),
        'Default admin email is missing.'
    );

    portal_test_expect(portal_ini_bytes('12M') === 12 * 1024 * 1024, '12M parsing failed.');
    portal_test_expect(portal_ini_bytes('1G') === 1024 * 1024 * 1024, '1G parsing failed.');
    portal_test_expect(
        !portal_path_is_within($storagePath, $_SERVER['DOCUMENT_ROOT']),
        'Test storage unexpectedly resolves inside the public document root.'
    );

    $knownCode = '123456';
    $_SESSION['portal_email_challenge'] = [
        'email' => 'worker@i-feel.co.il',
        'code_hash' => password_hash($knownCode, PASSWORD_DEFAULT),
        'created_at' => time(),
        'sent_at' => time(),
        'expires_at' => time() + 600,
        'attempts' => 0,
    ];
    for ($attempt = 1; $attempt <= IFEEL_PORTAL_EMAIL_CODE_MAX_ATTEMPTS; $attempt++) {
        try {
            portal_verify_email_code('000000');
            throw new RuntimeException('Wrong email code was accepted.');
        } catch (RuntimeException $error) {
            portal_test_expect($error->getMessage() !== 'Wrong email code was accepted.', $error->getMessage());
        }
    }
    portal_test_expect(portal_email_challenge() === null, 'Challenge survived five wrong attempts.');
    portal_clear_login_failures();

    $_SESSION['portal_email_challenge'] = [
        'email' => 'worker@i-feel.co.il',
        'code_hash' => password_hash($knownCode, PASSWORD_DEFAULT),
        'created_at' => time(),
        'sent_at' => time(),
        'expires_at' => time() + 600,
        'attempts' => 0,
    ];
    $employee = portal_verify_email_code($knownCode);
    portal_test_expect(($employee['role'] ?? '') === 'employee', 'Employee role was not assigned.');
    portal_test_expect(($employee['email'] ?? '') === 'worker@i-feel.co.il', 'Verified email was not bound.');

    unset($_SESSION['portal_user']);
    $_SESSION['portal_email_challenge'] = [
        'email' => 'oren@i-feel.co.il',
        'code_hash' => password_hash($knownCode, PASSWORD_DEFAULT),
        'created_at' => time(),
        'sent_at' => time(),
        'expires_at' => time() + 600,
        'attempts' => 0,
    ];
    $admin = portal_verify_email_code($knownCode);
    portal_test_expect(($admin['role'] ?? '') === 'admin', 'Admin role was not assigned.');

    portal_record_email_send_attempt('worker@i-feel.co.il');
    portal_test_expect(
        portal_email_send_retry_after('worker@i-feel.co.il') > 0,
        'Cross-session email resend throttling failed.'
    );

    portal_test_expect(portal_csv_value('=2+2') === "'=2+2", 'CSV formula was not neutralized.');
    portal_test_expect(portal_csv_value('  @SUM(A1)') === "'  @SUM(A1)", 'CSV formula with whitespace was not neutralized.');
    portal_test_expect(portal_csv_value('ordinary text') === 'ordinary text', 'Safe CSV text was modified.');

    $readiness = portal_readiness_report();
    portal_test_expect(
        (bool) ($readiness['ready'] ?? false),
        'Readiness failed: ' . implode(',', $readiness['failed'] ?? [])
    );

    portal_remove_tree($storagePath);
    fwrite(STDOUT, "Staff expenses unit checks passed.\n");
} catch (Throwable $error) {
    portal_remove_tree($storagePath);
    fwrite(STDERR, "Staff expenses unit checks failed: " . $error->getMessage() . "\n");
    exit(1);
}

