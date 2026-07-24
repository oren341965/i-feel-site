<?php
declare(strict_types=1);

if (
    PHP_SAPI !== 'cli-server'
    || getenv('IFEEL_PORTAL_TEST_MODE') !== '1'
) {
    http_response_code(404);
    exit('Not found');
}

$path = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
if (!in_array($path, [
    '/staff-expenses/__test-challenge',
    '/staff-expenses/__test-login',
], true)) {
    return false;
}

$repositoryRoot = dirname(__DIR__, 2);
require_once $repositoryRoot . '/public/staff-expenses/_bootstrap.php';
require_once $repositoryRoot . '/public/staff-expenses/_email_auth.php';

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

if ($path === '/staff-expenses/__test-challenge') {
    $email = portal_normalize_company_email((string) ($_GET['email'] ?? 'worker@i-feel.co.il'));
    $code = preg_replace('/\D+/', '', (string) ($_GET['code'] ?? '123456')) ?? '';
    if ($email === null || strlen($code) !== 6) {
        http_response_code(400);
        echo json_encode(['ok' => false]);
        exit;
    }
    unset($_SESSION['portal_user']);
    $_SESSION['portal_email_challenge'] = [
        'email' => $email,
        'code_hash' => password_hash($code, PASSWORD_DEFAULT),
        'created_at' => time(),
        'sent_at' => time(),
        'expires_at' => time() + IFEEL_PORTAL_EMAIL_CODE_TTL,
        'attempts' => 0,
    ];
    echo json_encode(['ok' => true, 'csrf' => portal_csrf_token()]);
    exit;
}

$role = (string) ($_GET['role'] ?? 'employee') === 'admin' ? 'admin' : 'employee';
$email = $role === 'admin' ? 'oren@i-feel.co.il' : 'worker@i-feel.co.il';
$_SESSION['portal_user'] = [
    'username' => $role === 'admin' ? 'oren' : 'employee',
    'display_name' => $email,
    'role' => $role,
    'email' => $email,
    'auth_method' => 'test_only',
    'logged_in_at' => time(),
    'last_activity' => time(),
];
unset($_SESSION['portal_email_challenge'], $_SESSION['portal_csrf']);
echo json_encode(['ok' => true, 'role' => $role, 'csrf' => portal_csrf_token()]);

