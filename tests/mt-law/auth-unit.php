<?php
declare(strict_types=1);

$sessionRoot = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'ifeel-mtlaw-auth-' . bin2hex(random_bytes(6));
if (!mkdir($sessionRoot, 0700, true) && !is_dir($sessionRoot)) {
    fwrite(STDERR, "FAIL: could not create temporary session directory\n");
    exit(1);
}

session_save_path($sessionRoot);
$_SERVER['HTTP_HOST'] = 'localhost';
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';

require dirname(__DIR__, 2) . '/public/mt-law/_bootstrap.php';

function auth_assert_true(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
}

$email = 'lawyer@mt-law.co.il';
$code = '654321';
$_SESSION['mtlaw_otp_email'] = $email;
$_SESSION['mtlaw_otp_hash'] = hash('sha256', $code . '|' . session_id());
$_SESSION['mtlaw_otp_expires'] = time() + 600;
$_SESSION['mtlaw_otp_attempts'] = 0;

$verified = mtlaw_verify_code($email, $code);
auth_assert_true($verified, 'A valid one-time code must verify successfully.');
$user = mtlaw_current_user();
auth_assert_true(is_array($user), 'A verified session must produce a current user.');
auth_assert_true(($user['email'] ?? '') === $email, 'The verified user email must be retained after session regeneration.');
auth_assert_true(($user['role'] ?? '') === 'member', 'An MT-Law email must receive the member role.');

mtlaw_logout();
$durableCode = '123456';
$challengeId = mtlaw_create_otp_challenge($email, $durableCode, true);
auth_assert_true(mtlaw_valid_ticket_id($challengeId), 'A durable OTP challenge must use an unguessable ticket identifier.');
unset(
    $_SESSION['mtlaw_otp_email'],
    $_SESSION['mtlaw_otp_hash'],
    $_SESSION['mtlaw_otp_expires'],
    $_SESSION['mtlaw_otp_attempts'],
    $_SESSION['mtlaw_gate_marketing_opt_in']
);
auth_assert_true(mtlaw_pending_email() === $email, 'The pending email must survive loss of the PHP session.');
auth_assert_true(mtlaw_pending_marketing_opt_in(), 'The optional mailing choice must survive loss of the PHP session.');
auth_assert_true(mtlaw_verify_code($email, $durableCode), 'A durable one-time code must verify after the PHP session is lost.');
$accessTicketId = mtlaw_cookie_ticket_id(MTLAW_ACCESS_COOKIE);
auth_assert_true(mtlaw_valid_ticket_id($accessTicketId), 'Successful verification must issue a durable access ticket.');
unset(
    $_SESSION['mtlaw_verified_email'],
    $_SESSION['mtlaw_verified_at'],
    $_SESSION['mtlaw_last_activity'],
    $_SESSION['mtlaw_gate_marketing_opt_in']
);
$recoveredUser = mtlaw_current_user();
auth_assert_true(is_array($recoveredUser) && ($recoveredUser['email'] ?? '') === $email, 'Verified access must survive loss of the PHP session.');
auth_assert_true((bool) ($_SESSION['mtlaw_gate_marketing_opt_in'] ?? false), 'The verified session must retain the mailing choice for consent recording.');
mtlaw_logout();

$gateView = file_get_contents(dirname(__DIR__, 2) . '/public/mt-law/_gate_view.php');
auth_assert_true(is_string($gateView), 'The gate view must be readable.');
auth_assert_true(substr_count($gateView, 'action="/mt-law/gate.php"') >= 4, 'Authentication and logout forms must post directly to gate.php.');
auth_assert_true(strpos($gateView, 'name="marketing_opt_in" value="yes"') !== false, 'The optional mailing consent checkbox must be present.');
auth_assert_true(strpos($gateView, 'name="marketing_opt_in" value="yes" required') === false, 'The mailing consent checkbox must be optional and unchecked by default.');
auth_assert_true(strpos($gateView, 'הבחירה אינה תנאי') !== false, 'The gate must explain that mailing consent is not required for access.');

$gateController = file_get_contents(dirname(__DIR__, 2) . '/public/mt-law/gate.php');
auth_assert_true(is_string($gateController), 'The gate controller must be readable.');
auth_assert_true(strpos($gateController, 'if (!$marketingOptIn)') === false, 'The server must not reject code requests without mailing consent.');
auth_assert_true(strpos($gateController, 'mtlaw_send_code($email, $marketingOptIn)') !== false, 'The server must persist the user\'s mailing choice with the OTP challenge.');
auth_assert_true(substr_count($gateController, 'mtlaw_pending_email()') >= 2, 'The code screen must not depend only on the PHP session.');
auth_assert_true(strpos($gateController, '/mt-law/gate.php?access=verified') !== false, 'Successful verification must redirect directly to gate.php.');

$cookieCsrf = str_repeat('a', 48);
$_SESSION['mtlaw_csrf'] = str_repeat('b', 48);
$_COOKIE[MTLAW_CSRF_COOKIE] = $cookieCsrf;
$_POST['csrf'] = $cookieCsrf;
mtlaw_verify_csrf();

$invalidCsrfRejected = false;
$_POST['csrf'] = str_repeat('c', 48);
try {
    mtlaw_verify_csrf();
} catch (RuntimeException $exception) {
    $invalidCsrfRejected = true;
}
auth_assert_true($invalidCsrfRejected, 'A token that matches neither the session nor the CSRF cookie must be rejected.');

$portalSource = file_get_contents(dirname(__DIR__, 2) . '/public/mt-law/index.php');
$bootstrapSource = file_get_contents(dirname(__DIR__, 2) . '/public/mt-law/_bootstrap.php');
auth_assert_true(is_string($bootstrapSource) && strpos($bootstrapSource, 'MTLAW_OTP_COOKIE') !== false && strpos($bootstrapSource, 'MTLAW_ACCESS_COOKIE') !== false, 'OTP and verified access must use durable HttpOnly tickets.');
auth_assert_true(is_string($portalSource) && strpos($portalSource, 'value="intercom"') !== false, 'The project form must offer intercom as a selectable system.');
auth_assert_true(is_string($bootstrapSource) && strpos($bootstrapSource, '\'intercom\' => \'אינטרקום\'') !== false, 'The lead processor must label intercom selections.');

mtlaw_logout();
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

foreach (glob($sessionRoot . DIRECTORY_SEPARATOR . '*') ?: [] as $path) {
    @unlink($path);
}
@rmdir($sessionRoot);

fwrite(STDOUT, "MT-Law authentication tests passed.\n");

