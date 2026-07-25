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

$gateView = file_get_contents(dirname(__DIR__, 2) . '/public/mt-law/_gate_view.php');
auth_assert_true(is_string($gateView), 'The gate view must be readable.');
auth_assert_true(substr_count($gateView, 'action="/mt-law/gate.php"') >= 4, 'Authentication and logout forms must post directly to gate.php.');
auth_assert_true(strpos($gateView, 'name="marketing_opt_in" value="yes"') !== false, 'The optional mailing consent checkbox must be present.');
auth_assert_true(strpos($gateView, 'name="marketing_opt_in" value="yes" required') === false, 'The mailing consent checkbox must be optional and unchecked by default.');
auth_assert_true(strpos($gateView, 'הבחירה אינה תנאי') !== false, 'The gate must explain that mailing consent is not required for access.');

$gateController = file_get_contents(dirname(__DIR__, 2) . '/public/mt-law/gate.php');
auth_assert_true(is_string($gateController), 'The gate controller must be readable.');
auth_assert_true(strpos($gateController, 'if (!$marketingOptIn)') === false, 'The server must not reject code requests without mailing consent.');
auth_assert_true(strpos($gateController, '$_SESSION[\'mtlaw_gate_marketing_opt_in\'] = $marketingOptIn;') !== false, 'The server must preserve the user\'s actual mailing choice.');
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
