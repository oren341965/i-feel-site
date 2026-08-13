<?php
declare(strict_types=1);

const IFEEL_PORTAL_EMAIL_DOMAIN = 'i-feel.co.il';
const IFEEL_PORTAL_EMAIL_CODE_TTL = 600;
const IFEEL_PORTAL_EMAIL_CODE_MAX_ATTEMPTS = 5;
const IFEEL_PORTAL_EMAIL_CODE_RESEND_SECONDS = 60;
const IFEEL_PORTAL_EMAIL_SEND_WINDOW = 900;
const IFEEL_PORTAL_EMAIL_SEND_MAX = 5;
const IFEEL_PORTAL_MAGIC_LINK_TTL = 600;
const IFEEL_PORTAL_REMEMBER_TTL = 30 * 24 * 60 * 60;
const IFEEL_PORTAL_REMEMBER_COOKIE = 'ifeel_staff_remember';

function portal_company_email_domain(): string
{
    $configured = '';
    if (defined('EXPENSE_PORTAL_EMAIL_DOMAIN')) {
        $configured = trim((string) constant('EXPENSE_PORTAL_EMAIL_DOMAIN'));
    }
    if ($configured === '') {
        $configured = trim((string) getenv('EXPENSE_PORTAL_EMAIL_DOMAIN'));
    }
    $domain = strtolower($configured !== '' ? $configured : IFEEL_PORTAL_EMAIL_DOMAIN);
    return preg_match('/^[a-z0-9.-]+$/', $domain) ? $domain : IFEEL_PORTAL_EMAIL_DOMAIN;
}

function portal_normalize_company_email(string $email): ?string
{
    $email = strtolower(trim($email));
    if ($email === '' || strlen($email) > 160 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        return null;
    }

    [$local, $domain] = array_pad(explode('@', $email, 2), 2, '');
    if ($domain !== portal_company_email_domain()) {
        return null;
    }
    if (!preg_match('/^[a-z0-9._+-]{1,64}$/', $local)) {
        return null;
    }

    return $local . '@' . $domain;
}

function portal_email_admins(): array
{
    $values = ['oren@' . portal_company_email_domain()];

    if (defined('EXPENSE_PORTAL_ADMIN_EMAILS')) {
        $configured = constant('EXPENSE_PORTAL_ADMIN_EMAILS');
        if (is_array($configured)) {
            $values = array_merge($values, $configured);
        } elseif (is_string($configured)) {
            $values = array_merge($values, preg_split('/[\s,;]+/', $configured) ?: []);
        }
    }

    $environment = trim((string) getenv('EXPENSE_PORTAL_ADMIN_EMAILS'));
    if ($environment !== '') {
        $values = array_merge($values, preg_split('/[\s,;]+/', $environment) ?: []);
    }

    $admins = [];
    foreach ($values as $value) {
        if (!is_string($value)) {
            continue;
        }
        $email = portal_normalize_company_email($value);
        if ($email !== null) {
            $admins[$email] = true;
        }
    }
    return array_keys($admins);
}

function portal_email_challenge(): ?array
{
    $challenge = $_SESSION['portal_email_challenge'] ?? null;
    if (!is_array($challenge)) {
        return null;
    }

    $email = portal_normalize_company_email((string) ($challenge['email'] ?? ''));
    $expiresAt = (int) ($challenge['expires_at'] ?? 0);
    $codeHash = (string) ($challenge['code_hash'] ?? '');
    if ($email === null || $expiresAt <= 0 || $codeHash === '') {
        unset($_SESSION['portal_email_challenge']);
        return null;
    }

    $challenge['email'] = $email;
    return $challenge;
}

function portal_clear_email_challenge(): void
{
    unset($_SESSION['portal_email_challenge']);
}

function portal_public_origin(): string
{
    $configured = '';
    if (defined('EXPENSE_PORTAL_PUBLIC_ORIGIN')) {
        $configured = rtrim(trim((string) constant('EXPENSE_PORTAL_PUBLIC_ORIGIN')), '/');
    }
    if ($configured === '') {
        $configured = rtrim(trim((string) getenv('EXPENSE_PORTAL_PUBLIC_ORIGIN')), '/');
    }
    if ($configured !== '' && preg_match('#^https://[a-z0-9.-]+(?::\d+)?$#i', $configured)) {
        return $configured;
    }

    if (portal_is_localhost()) {
        $host = strtolower(trim((string) ($_SERVER['HTTP_HOST'] ?? 'localhost')));
        if (preg_match('/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/', $host)) {
            return 'http://' . $host;
        }
    }

    return 'https://i-feel.co.il';
}

function portal_magic_link_file(string $token): string
{
    return portal_storage_root()
        . DIRECTORY_SEPARATOR
        . 'security'
        . DIRECTORY_SEPARATOR
        . 'magic-link-'
        . hash('sha256', $token)
        . '.json';
}

function portal_create_magic_link(string $email): array
{
    $token = bin2hex(random_bytes(32));
    $path = portal_magic_link_file($token);
    portal_json_write($path, [
        'email' => $email,
        'created_at' => time(),
        'expires_at' => time() + IFEEL_PORTAL_MAGIC_LINK_TTL,
    ]);

    return [
        'url' => portal_public_origin() . portal_url(['login_token' => $token]),
        'path' => $path,
    ];
}

function portal_consume_magic_link(string $token): string
{
    $token = strtolower(trim($token));
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
        throw new RuntimeException('קישור הכניסה אינו תקין. יש לבקש קישור חדש.');
    }

    $path = portal_magic_link_file($token);
    if (!is_file($path)) {
        throw new RuntimeException('קישור הכניסה כבר נוצל או שאינו תקף. יש לבקש קישור חדש.');
    }

    $claimedPath = $path . '.claimed-' . bin2hex(random_bytes(6));
    if (!@rename($path, $claimedPath)) {
        throw new RuntimeException('קישור הכניסה כבר נוצל. יש לבקש קישור חדש.');
    }

    try {
        $record = portal_json_read($claimedPath);
    } finally {
        @unlink($claimedPath);
    }

    $email = portal_normalize_company_email((string) ($record['email'] ?? ''));
    if ($email === null || (int) ($record['expires_at'] ?? 0) < time()) {
        throw new RuntimeException('תוקף קישור הכניסה פג. יש לבקש קישור חדש.');
    }

    return $email;
}

function portal_remember_file(string $token): string
{
    return portal_storage_root()
        . DIRECTORY_SEPARATOR
        . 'security'
        . DIRECTORY_SEPARATOR
        . 'remember-'
        . hash('sha256', $token)
        . '.json';
}

function portal_set_remember_cookie(string $value, int $expiresAt): void
{
    setcookie(IFEEL_PORTAL_REMEMBER_COOKIE, $value, [
        'expires' => $expiresAt,
        'path' => '/staff-expenses/',
        'secure' => portal_cookie_secure(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    if ($value === '') {
        unset($_COOKIE[IFEEL_PORTAL_REMEMBER_COOKIE]);
    } else {
        $_COOKIE[IFEEL_PORTAL_REMEMBER_COOKIE] = $value;
    }
}

function portal_create_remembered_login(string $email): void
{
    $token = bin2hex(random_bytes(32));
    $expiresAt = time() + IFEEL_PORTAL_REMEMBER_TTL;
    portal_json_write(portal_remember_file($token), [
        'email' => $email,
        'created_at' => time(),
        'expires_at' => $expiresAt,
    ]);
    portal_set_remember_cookie($token, $expiresAt);
}

function portal_revoke_remembered_login(): void
{
    $token = strtolower(trim((string) ($_COOKIE[IFEEL_PORTAL_REMEMBER_COOKIE] ?? '')));
    if (preg_match('/^[a-f0-9]{64}$/', $token)) {
        @unlink(portal_remember_file($token));
    }
    portal_set_remember_cookie('', time() - 42000);
}

function portal_complete_email_login(string $email, string $authMethod, bool $remember = true): array
{
    $email = portal_normalize_company_email($email);
    if ($email === null) {
        throw new RuntimeException('כתובת הדוא״ל אינה מורשית.');
    }

    $isAdmin = in_array($email, portal_email_admins(), true);
    $username = $isAdmin ? 'oren' : 'employee';
    $accounts = portal_users();
    $account = $accounts[$username] ?? null;
    if (!is_array($account) || !(bool) ($account['active'] ?? false)) {
        throw new RuntimeException('הגישה לכתובת זו הושבתה. יש לפנות למנהל המערכת.');
    }

    portal_clear_login_failures();
    session_regenerate_id(true);
    $_SESSION['portal_user'] = [
        'username' => $username,
        'display_name' => $isAdmin ? (string) ($account['display_name'] ?? 'אורן לוי') : $email,
        'role' => $isAdmin ? 'admin' : 'employee',
        'email' => $email,
        'auth_method' => $authMethod,
        'logged_in_at' => time(),
        'last_activity' => time(),
    ];
    portal_clear_email_challenge();
    unset($_SESSION['portal_csrf']);
    portal_csrf_token();
    if ($remember) {
        portal_revoke_remembered_login();
        portal_create_remembered_login($email);
    }
    portal_audit('email_login_success', [
        'email_hash' => hash('sha256', $email),
        'role' => $isAdmin ? 'admin' : 'employee',
        'auth_method' => $authMethod,
    ]);
    return $_SESSION['portal_user'];
}

function portal_restore_remembered_login(): ?array
{
    $token = strtolower(trim((string) ($_COOKIE[IFEEL_PORTAL_REMEMBER_COOKIE] ?? '')));
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
        return null;
    }

    $path = portal_remember_file($token);
    $record = portal_json_read($path);
    $email = portal_normalize_company_email((string) ($record['email'] ?? ''));
    if ($email === null || (int) ($record['expires_at'] ?? 0) < time()) {
        @unlink($path);
        portal_set_remember_cookie('', time() - 42000);
        return null;
    }

    // Rotate persistent credentials whenever they are used to restore a session.
    @unlink($path);
    $user = portal_complete_email_login($email, 'remembered_device', false);
    portal_create_remembered_login($email);
    return $user;
}

function portal_email_subject(string $subject): string
{
    if (function_exists('mb_encode_mimeheader')) {
        return mb_encode_mimeheader($subject, 'UTF-8', 'B', "\r\n");
    }
    return '=?UTF-8?B?' . base64_encode($subject) . '?=';
}

function portal_smtp_config(): ?array
{
    $config = null;
    if (defined('EXPENSE_PORTAL_SMTP') && is_array(constant('EXPENSE_PORTAL_SMTP'))) {
        $config = constant('EXPENSE_PORTAL_SMTP');
    }
    if (!is_array($config)) {
        $json = trim((string) getenv('EXPENSE_PORTAL_SMTP_JSON'));
        $decoded = $json === '' ? null : json_decode($json, true);
        $config = is_array($decoded) ? $decoded : null;
    }
    if (!is_array($config)) {
        return null;
    }

    $host = strtolower(trim((string) ($config['host'] ?? '')));
    $username = trim((string) ($config['username'] ?? ''));
    $password = (string) ($config['password'] ?? '');
    $encryption = strtolower(trim((string) ($config['encryption'] ?? 'starttls')));
    $port = (int) ($config['port'] ?? ($encryption === 'tls' ? 465 : 587));
    $timeout = max(3, min(30, (int) ($config['timeout'] ?? 10)));

    if (
        $host === ''
        || (!filter_var($host, FILTER_VALIDATE_IP) && !preg_match('/^[a-z0-9.-]+$/', $host))
        || $port < 1
        || $port > 65535
        || !in_array($encryption, ['starttls', 'tls'], true)
        || $username === ''
        || $password === ''
    ) {
        return null;
    }

    return [
        'host' => $host,
        'port' => $port,
        'encryption' => $encryption,
        'username' => $username,
        'password' => $password,
        'timeout' => $timeout,
    ];
}

function portal_mail_transport_mode(): string
{
    $mode = '';
    if (defined('EXPENSE_PORTAL_MAIL_TRANSPORT')) {
        $mode = strtolower(trim((string) constant('EXPENSE_PORTAL_MAIL_TRANSPORT')));
    }
    if ($mode === '') {
        $mode = strtolower(trim((string) getenv('EXPENSE_PORTAL_MAIL_TRANSPORT')));
    }
    if ($mode === '') {
        return portal_smtp_config() === null ? 'mail' : 'smtp';
    }
    return in_array($mode, ['mail', 'smtp'], true) ? $mode : 'unavailable';
}

function portal_mail_transport_available(): bool
{
    $mode = portal_mail_transport_mode();
    if ($mode === 'smtp') {
        $config = portal_smtp_config();
        return $config !== null
            && function_exists('stream_socket_client')
            && function_exists('stream_socket_enable_crypto')
            && extension_loaded('openssl');
    }
    return $mode === 'mail' && function_exists('mail');
}

function portal_smtp_read($stream, array $expectedCodes): string
{
    $response = '';
    for ($lineCount = 0; $lineCount < 50; $lineCount++) {
        $line = fgets($stream, 4096);
        if ($line === false) {
            throw new RuntimeException('SMTP server closed the connection unexpectedly.');
        }
        $response .= $line;
        if (preg_match('/^(\d{3})\s/', $line, $match)) {
            $code = (int) $match[1];
            if (!in_array($code, $expectedCodes, true)) {
                throw new RuntimeException('SMTP server rejected a command with status ' . $code . '.');
            }
            return $response;
        }
    }
    throw new RuntimeException('SMTP response was too long.');
}

function portal_smtp_write($stream, string $command): void
{
    $bytes = fwrite($stream, $command . "\r\n");
    if ($bytes === false || $bytes !== strlen($command) + 2) {
        throw new RuntimeException('SMTP command could not be sent.');
    }
}

function portal_smtp_command($stream, string $command, array $expectedCodes): string
{
    portal_smtp_write($stream, $command);
    return portal_smtp_read($stream, $expectedCodes);
}

function portal_mail_sender(): string
{
    $sender = '';
    if (defined('EXPENSE_PORTAL_FROM_EMAIL')) {
        $sender = trim((string) constant('EXPENSE_PORTAL_FROM_EMAIL'));
    }
    if ($sender === '') {
        $sender = trim((string) getenv('EXPENSE_PORTAL_FROM_EMAIL'));
    }
    return filter_var($sender, FILTER_VALIDATE_EMAIL) !== false
        ? $sender
        : 'no-reply@' . portal_company_email_domain();
}

function portal_mail_payload(string $body, array $attachments = [], ?string $htmlBody = null): array
{
    $normalizedBody = str_replace(["\r\n", "\r"], "\n", $body);
    if ($attachments === [] && $htmlBody !== null) {
        $boundary = '=_ifeel_alt_' . bin2hex(random_bytes(16));
        return [
            'headers' => ['Content-Type: multipart/alternative; boundary="' . $boundary . '"'],
            'body' => implode("\r\n", [
                '--' . $boundary,
                'Content-Type: text/plain; charset=UTF-8',
                'Content-Transfer-Encoding: 8bit',
                '',
                str_replace("\n", "\r\n", $normalizedBody),
                '--' . $boundary,
                'Content-Type: text/html; charset=UTF-8',
                'Content-Transfer-Encoding: 8bit',
                '',
                str_replace(["\r\n", "\r"], "\n", $htmlBody),
                '--' . $boundary . '--',
                '',
            ]),
        ];
    }
    if ($attachments === []) {
        return [
            'headers' => [
                'Content-Type: text/plain; charset=UTF-8',
                'Content-Transfer-Encoding: 8bit',
            ],
            'body' => str_replace("\n", "\r\n", $normalizedBody),
        ];
    }

    $boundary = '=_ifeel_' . bin2hex(random_bytes(16));
    $parts = [
        '--' . $boundary,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        str_replace("\n", "\r\n", $normalizedBody),
    ];
    foreach ($attachments as $attachment) {
        $path = (string) ($attachment['path'] ?? '');
        if (!is_file($path)) {
            throw new RuntimeException('An email attachment is missing.');
        }
        $contents = file_get_contents($path);
        if ($contents === false) {
            throw new RuntimeException('An email attachment could not be read.');
        }
        $originalName = str_replace(["\r", "\n"], '', (string) ($attachment['name'] ?? 'document'));
        $asciiName = preg_replace('/[^A-Za-z0-9._-]/', '_', $originalName) ?: 'document';
        $mime = preg_replace('/[^A-Za-z0-9.+\/-]/', '', (string) ($attachment['mime'] ?? 'application/octet-stream'))
            ?: 'application/octet-stream';
        array_push(
            $parts,
            '--' . $boundary,
            'Content-Type: ' . $mime . '; name="' . $asciiName . '"',
            'Content-Transfer-Encoding: base64',
            'Content-Disposition: attachment; filename="' . $asciiName . '"; filename*=UTF-8\'\'' . rawurlencode($originalName),
            '',
            rtrim(chunk_split(base64_encode($contents), 76, "\r\n")),
        );
    }
    $parts[] = '--' . $boundary . '--';
    $parts[] = '';

    return [
        'headers' => ['Content-Type: multipart/mixed; boundary="' . $boundary . '"'],
        'body' => implode("\r\n", $parts),
    ];
}

function portal_smtp_send(
    string $email,
    string $subject,
    string $body,
    string $sender,
    array $attachments = [],
    ?string $htmlBody = null
): bool
{
    $config = portal_smtp_config();
    if ($config === null) {
        throw new RuntimeException('Authenticated SMTP is not configured.');
    }

    $scheme = $config['encryption'] === 'tls' ? 'tls' : 'tcp';
    $remote = $scheme . '://' . $config['host'] . ':' . $config['port'];
    $context = stream_context_create([
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
            'peer_name' => $config['host'],
            'allow_self_signed' => false,
        ],
    ]);

    $errorNumber = 0;
    $errorMessage = '';
    $stream = @stream_socket_client(
        $remote,
        $errorNumber,
        $errorMessage,
        $config['timeout'],
        STREAM_CLIENT_CONNECT,
        $context
    );
    if (!is_resource($stream)) {
        throw new RuntimeException('SMTP connection failed with status ' . $errorNumber . '.');
    }

    stream_set_timeout($stream, $config['timeout']);
    try {
        portal_smtp_read($stream, [220]);
        portal_smtp_command($stream, 'EHLO i-feel.co.il', [250]);

        if ($config['encryption'] === 'starttls') {
            portal_smtp_command($stream, 'STARTTLS', [220]);
            $cryptoEnabled = stream_socket_enable_crypto($stream, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
            if ($cryptoEnabled !== true) {
                throw new RuntimeException('SMTP TLS negotiation failed.');
            }
            portal_smtp_command($stream, 'EHLO i-feel.co.il', [250]);
        }

        portal_smtp_command($stream, 'AUTH LOGIN', [334]);
        portal_smtp_command($stream, base64_encode($config['username']), [334]);
        portal_smtp_command($stream, base64_encode($config['password']), [235]);
        portal_smtp_command($stream, 'MAIL FROM:<' . $sender . '>', [250]);
        portal_smtp_command($stream, 'RCPT TO:<' . $email . '>', [250, 251]);
        portal_smtp_command($stream, 'DATA', [354]);

        $payload = portal_mail_payload($body, $attachments, $htmlBody);
        $headers = [
            'Date: ' . date(DATE_RFC2822),
            'Message-ID: <' . bin2hex(random_bytes(16)) . '@i-feel.co.il>',
            'From: I Feel <' . $sender . '>',
            'To: <' . $email . '>',
            'Subject: ' . $subject,
            'MIME-Version: 1.0',
            'X-Mailer: I Feel Staff Expenses Portal',
        ];
        $headers = array_merge($headers, $payload['headers']);
        $messageBody = preg_replace('/^\./m', '..', (string) $payload['body']) ?? (string) $payload['body'];
        $message = implode("\r\n", $headers)
            . "\r\n\r\n"
            . $messageBody;
        portal_smtp_write($stream, $message . "\r\n.");
        portal_smtp_read($stream, [250]);
        portal_smtp_command($stream, 'QUIT', [221]);
        return true;
    } finally {
        fclose($stream);
    }
}

function portal_email_send_limit_file(string $email): string
{
    return portal_storage_root()
        . DIRECTORY_SEPARATOR
        . 'security'
        . DIRECTORY_SEPARATOR
        . 'email-send-'
        . hash('sha256', portal_client_ip())
        . '-'
        . hash('sha256', $email)
        . '.json';
}

function portal_email_send_retry_after(string $email): int
{
    $data = portal_json_read(portal_email_send_limit_file($email));
    $now = time();
    $windowStart = (int) ($data['window_start'] ?? 0);
    if ($windowStart <= 0 || $now - $windowStart >= IFEEL_PORTAL_EMAIL_SEND_WINDOW) {
        return 0;
    }

    $blockedUntil = (int) ($data['blocked_until'] ?? 0);
    $lastSent = (int) ($data['last_sent'] ?? 0);
    return max(
        0,
        $blockedUntil - $now,
        IFEEL_PORTAL_EMAIL_CODE_RESEND_SECONDS - ($now - $lastSent)
    );
}

function portal_record_email_send_attempt(string $email): void
{
    $path = portal_email_send_limit_file($email);
    $data = portal_json_read($path);
    $now = time();
    $windowStart = (int) ($data['window_start'] ?? $now);
    $count = (int) ($data['count'] ?? 0);
    if ($now - $windowStart >= IFEEL_PORTAL_EMAIL_SEND_WINDOW) {
        $windowStart = $now;
        $count = 0;
    }
    $count++;

    portal_json_write($path, [
        'window_start' => $windowStart,
        'count' => $count,
        'last_sent' => $now,
        'blocked_until' => $count >= IFEEL_PORTAL_EMAIL_SEND_MAX
            ? $windowStart + IFEEL_PORTAL_EMAIL_SEND_WINDOW
            : 0,
    ]);
}

function portal_send_email_code(string $email, string $code, string $magicLink): bool
{
    $sender = portal_mail_sender();

    $subject = portal_email_subject('קישור כניסה לאזור עובדי I Feel');
    $body = implode("\r\n", [
        'שלום,',
        '',
        'לכניסה מהירה לאזור דיווח ההוצאות של I Feel יש ללחוץ על הקישור:',
        '',
        $magicLink,
        '',
        'אין צורך להעתיק קוד. הקישור תקף ל-10 דקות ולשימוש פעם אחת בלבד.',
        '',
        'אם הקישור אינו נפתח, אפשר לחזור למסך הכניסה ולהקליד את הקוד החלופי:',
        '',
        $code,
        '',
        'לאחר הכניסה המכשיר ייזכר למשך 30 יום, עד להתנתקות יזומה.',
        'אם לא ביקשת את הקוד, אין צורך לבצע פעולה.',
        '',
        'I Feel',
    ]);
    $safeLink = portal_h($magicLink);
    $safeCode = portal_h($code);
    $htmlBody = '<!doctype html><html lang="he" dir="rtl"><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#10233f">'
        . '<div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #dbe4ef;border-radius:18px;padding:32px;text-align:right">'
        . '<h1 style="font-size:24px;margin:0 0 16px">כניסה לאזור עובדי I Feel</h1>'
        . '<p style="font-size:16px;line-height:1.6">לחיצה אחת תכניס אותך ישירות לאזור דיווח ההוצאות.</p>'
        . '<p style="text-align:center;margin:28px 0"><a href="' . $safeLink . '" style="display:inline-block;background:#1769aa;color:#fff;text-decoration:none;font-weight:bold;padding:14px 24px;border-radius:10px">כניסה לאזור העובדים</a></p>'
        . '<p style="font-size:14px;line-height:1.6;color:#52657d">הקישור תקף ל־10 דקות ולשימוש פעם אחת בלבד. לאחר הכניסה המכשיר ייזכר למשך 30 יום.</p>'
        . '<hr style="border:0;border-top:1px solid #e3e9f0;margin:24px 0">'
        . '<p style="font-size:14px;line-height:1.6;color:#52657d">אם הקישור אינו נפתח, אפשר לחזור למסך הכניסה ולהקליד את הקוד החלופי:</p>'
        . '<p dir="ltr" style="font-size:28px;font-weight:bold;letter-spacing:6px;text-align:center">' . $safeCode . '</p>'
        . '<p style="font-size:13px;color:#6b7b90">אם לא ביקשת כניסה, אין צורך לבצע פעולה.</p>'
        . '</div></body></html>';
    if (portal_mail_transport_mode() === 'smtp') {
        return portal_smtp_send($email, $subject, $body, $sender, [], $htmlBody);
    }
    if (portal_mail_transport_mode() !== 'mail' || !function_exists('mail')) {
        return false;
    }

    $payload = portal_mail_payload($body, [], $htmlBody);
    $headers = [
        'From: I Feel <' . $sender . '>',
        'Reply-To: ' . $sender,
        'MIME-Version: 1.0',
        'X-Mailer: I Feel Staff Expenses Portal',
    ];
    $headers = array_merge($headers, $payload['headers']);

    return mail($email, $subject, (string) $payload['body'], implode("\r\n", $headers));
}

function portal_send_mail_with_attachments(
    string $email,
    string $subject,
    string $body,
    array $attachments = [],
    ?string $htmlBody = null
): bool {
    if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        return false;
    }
    $sender = portal_mail_sender();
    $encodedSubject = portal_email_subject($subject);
    if (portal_mail_transport_mode() === 'smtp') {
        return portal_smtp_send($email, $encodedSubject, $body, $sender, $attachments, $htmlBody);
    }
    if (portal_mail_transport_mode() !== 'mail' || !function_exists('mail')) {
        return false;
    }

    $payload = portal_mail_payload($body, $attachments, $htmlBody);
    $headers = array_merge([
        'From: I Feel <' . $sender . '>',
        'Reply-To: ' . $sender,
        'MIME-Version: 1.0',
        'X-Mailer: I Feel Staff Expenses Portal',
    ], $payload['headers']);
    return mail($email, $encodedSubject, (string) $payload['body'], implode("\r\n", $headers));
}

function portal_request_email_code(string $input): string
{
    $blocked = portal_login_is_blocked();
    if ($blocked > 0) {
        throw new RuntimeException('הכניסה נחסמה זמנית בעקבות ניסיונות רבים. ניתן לנסות שוב בעוד כ-' . (int) ceil($blocked / 60) . ' דקות.');
    }

    $email = portal_normalize_company_email($input);
    if ($email === null) {
        portal_record_login_failure();
        usleep(random_int(200000, 500000));
        throw new RuntimeException('הגישה מותרת רק באמצעות כתובת דוא״ל המסתיימת ב-@' . portal_company_email_domain() . '.');
    }

    $retryAfter = portal_email_send_retry_after($email);
    if ($retryAfter > 0) {
        throw new RuntimeException('קוד כבר נשלח לאחרונה. ניתן לבקש קוד חדש בעוד כ-' . max(1, $retryAfter) . ' שניות.');
    }

    $existing = portal_email_challenge();
    if (is_array($existing)
        && hash_equals((string) ($existing['email'] ?? ''), $email)
        && time() - (int) ($existing['sent_at'] ?? 0) < IFEEL_PORTAL_EMAIL_CODE_RESEND_SECONDS) {
        $wait = IFEEL_PORTAL_EMAIL_CODE_RESEND_SECONDS - (time() - (int) ($existing['sent_at'] ?? 0));
        throw new RuntimeException('קוד כבר נשלח. ניתן לבקש קוד חדש בעוד כ-' . max(1, $wait) . ' שניות.');
    }

    $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    portal_record_email_send_attempt($email);
    $_SESSION['portal_email_challenge'] = [
        'email' => $email,
        'code_hash' => password_hash($code, PASSWORD_DEFAULT),
        'created_at' => time(),
        'sent_at' => time(),
        'expires_at' => time() + IFEEL_PORTAL_EMAIL_CODE_TTL,
        'attempts' => 0,
    ];
    $magicLink = portal_create_magic_link($email);

    try {
        $delivered = portal_send_email_code($email, $code, (string) $magicLink['url']);
    } catch (Throwable $deliveryError) {
        error_log('[i-feel staff expenses email] ' . $deliveryError->getMessage());
        $delivered = false;
    }
    if (!$delivered) {
        @unlink((string) $magicLink['path']);
        portal_clear_email_challenge();
        portal_audit('email_code_delivery_failed', ['email_hash' => hash('sha256', $email)]);
        throw new RuntimeException('לא ניתן היה לשלוח את קוד הכניסה. יש לנסות שוב או לפנות למנהל המערכת.');
    }

    portal_audit('email_code_sent', ['email_hash' => hash('sha256', $email)]);
    return $email;
}

function portal_verify_email_code(string $input): array
{
    $blocked = portal_login_is_blocked();
    if ($blocked > 0) {
        throw new RuntimeException('הכניסה נחסמה זמנית בעקבות ניסיונות רבים. ניתן לנסות שוב בעוד כ-' . (int) ceil($blocked / 60) . ' דקות.');
    }

    $challenge = portal_email_challenge();
    if ($challenge === null) {
        throw new RuntimeException('לא נמצאה בקשת כניסה פעילה. יש להזין מחדש את כתובת הדוא״ל.');
    }
    if ((int) ($challenge['expires_at'] ?? 0) < time()) {
        portal_clear_email_challenge();
        throw new RuntimeException('תוקף קוד הכניסה פג. יש לבקש קוד חדש.');
    }

    $code = preg_replace('/\D+/', '', trim($input)) ?? '';
    $valid = strlen($code) === 6 && password_verify($code, (string) ($challenge['code_hash'] ?? ''));
    if (!$valid) {
        $challenge['attempts'] = (int) ($challenge['attempts'] ?? 0) + 1;
        $_SESSION['portal_email_challenge'] = $challenge;
        portal_record_login_failure();
        usleep(random_int(250000, 650000));

        if ($challenge['attempts'] >= IFEEL_PORTAL_EMAIL_CODE_MAX_ATTEMPTS) {
            portal_clear_email_challenge();
            throw new RuntimeException('בוצעו יותר מדי ניסיונות שגויים. יש לבקש קוד חדש מאוחר יותר.');
        }
        throw new RuntimeException('קוד הכניסה שגוי. נותרו ' . (IFEEL_PORTAL_EMAIL_CODE_MAX_ATTEMPTS - $challenge['attempts']) . ' ניסיונות.');
    }

    return portal_complete_email_login((string) $challenge['email'], 'company_email_code');
}

function portal_render_email_entry(?string $error = null, string $email = ''): void
{
    $blocked = portal_login_is_blocked();
    portal_page_start('כניסה באמצעות דוא״ל חברה');
    ?>
    <section class="login-card">
        <img src="/assets/ifeel-logo.png" alt="I Feel" class="login-logo">
        <div class="security-mark" aria-hidden="true">●</div>
        <h1>כניסה לאזור העובדים</h1>
        <p>יש להזין כתובת דוא״ל ארגונית של I Feel. יישלח אליה קישור כניסה מהיר, ללא צורך בהעתקת קוד.</p>
        <?php if ($error !== null): ?>
            <div class="alert alert--error" role="alert"><?= portal_h($error) ?></div>
        <?php endif; ?>
        <?php if ($blocked > 0): ?>
            <div class="alert alert--error" role="alert">הכניסה נחסמה זמנית. ניתן לנסות שוב בעוד כ-<?= (int) ceil($blocked / 60) ?> דקות.</div>
        <?php endif; ?>
        <form method="post" autocomplete="on" class="stack-form">
            <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
            <input type="hidden" name="action" value="request_email_code">
            <label>
                <span>דוא״ל I Feel</span>
                <input type="email" name="email" autocomplete="email" required maxlength="160" dir="ltr" placeholder="name@<?= portal_h(portal_company_email_domain()) ?>" value="<?= portal_h($email) ?>" <?= $blocked > 0 ? 'disabled' : '' ?>>
            </label>
            <button type="submit" class="button button--primary button--wide" <?= $blocked > 0 ? 'disabled' : '' ?>>שליחת קישור כניסה</button>
        </form>
        <p class="login-note">הקישור תקף ל־10 דקות ולשימוש פעם אחת בלבד. לאחר הכניסה המכשיר ייזכר למשך 30 יום. קוד בן 6 ספרות מצורף כחלופה.</p>
    </section>
    <?php
    portal_page_end();
    exit;
}

function portal_render_email_code(?string $error = null): void
{
    $challenge = portal_email_challenge();
    if ($challenge === null) {
        portal_render_email_entry($error);
    }
    $email = (string) $challenge['email'];
    $remaining = max(0, (int) ($challenge['expires_at'] ?? 0) - time());

    portal_page_start('אימות קוד כניסה');
    ?>
    <section class="login-card">
        <img src="/assets/ifeel-logo.png" alt="I Feel" class="login-logo">
        <div class="security-mark" aria-hidden="true">●</div>
        <h1>אימות כתובת הדוא״ל</h1>
        <p>קישור כניסה נשלח אל <strong dir="ltr"><?= portal_h($email) ?></strong>. אפשר ללחוץ עליו ישירות מתוך Gmail, בלי לחזור למסך הזה.</p>
        <p class="login-note">אם הקישור אינו נפתח, אפשר להקליד את הקוד החלופי בן 6 הספרות. הקוד תקף לעוד כ-<?= (int) ceil($remaining / 60) ?> דקות.</p>
        <?php if ($error !== null): ?>
            <div class="alert alert--error" role="alert"><?= portal_h($error) ?></div>
        <?php endif; ?>
        <form method="post" autocomplete="on" class="stack-form">
            <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
            <input type="hidden" name="action" value="verify_email_code">
            <label>
                <span>קוד כניסה</span>
                <input type="text" name="code" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" required dir="ltr" autofocus>
            </label>
            <button type="submit" class="button button--primary button--wide">אימות וכניסה לדוח</button>
        </form>
        <form method="post" class="inline-form">
            <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
            <input type="hidden" name="action" value="restart_email_login">
            <button type="submit" class="button button--ghost button--small">שינוי כתובת הדוא״ל</button>
        </form>
    </section>
    <?php
    portal_page_end();
    exit;
}
