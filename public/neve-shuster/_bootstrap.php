<?php
declare(strict_types=1);

/**
 * אזור דיירי שכונת הפרדס, רעננה (יזם נווה שוסטר / קבוצת דניה סיבוס)
 * כניסה מאובטחת בדוא"ל + קוד חד פעמי, לפי אותו דפוס כמו /mt-law/.
 */

if (!function_exists('str_starts_with')) {
    function str_starts_with(string $haystack, string $needle): bool
    {
        return $needle === '' || strncmp($haystack, $needle, strlen($needle)) === 0;
    }
}

const NSH_SESSION_NAME = 'ifeel_nsh_access';
const NSH_ACCESS_TTL = 7200;
const NSH_OTP_TTL = 600;
const NSH_OTP_RESEND_SECONDS = 60;
const NSH_OTP_HOURLY_LIMIT = 5;
const NSH_CSRF_COOKIE = 'ifeel_nsh_csrf';
const NSH_OTP_COOKIE = 'ifeel_nsh_otp';
const NSH_ACCESS_COOKIE = 'ifeel_nsh_verified';
const NSH_BASE_PATH = '/neve-shuster/';
const NSH_DEFAULT_BOARD_ID = '2732725332';
const NSH_FALLBACK_EMAIL = 'sales@i-feel.co.il';
const NSH_STAFF_DOMAIN = 'i-feel.co.il';

/**
 * מצב רשימת הדיירים.
 * false = כל כתובת דוא"ל תקינה מקבלת קוד (הקוד עצמו מוודא בעלות על התיבה).
 * true  = רק כתובות שמופיעות ב-residents.txt (ועובדי i-feel.co.il) מקבלות גישה.
 * לאחר שמחלקת שינויי דיירים של דניה סיבוס תעביר את רשימת המיילים -
 * ממלאים את residents.txt ומעבירים את הדגל הזה ל-true.
 */
const NSH_STRICT_ALLOWLIST = false;

if (is_file(dirname(__DIR__) . '/api/config.php')) {
    require_once dirname(__DIR__) . '/api/config.php';
}

function nsh_is_https(): bool
{
    $https = strtolower((string) ($_SERVER['HTTPS'] ?? ''));
    $forwarded = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    return ($https !== '' && $https !== 'off') || $forwarded === 'https' || (int) ($_SERVER['SERVER_PORT'] ?? 0) === 443;
}

function nsh_is_localhost(): bool
{
    $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
    return $host === 'localhost' || str_starts_with($host, 'localhost:') || str_starts_with($host, '127.0.0.1');
}

if (!nsh_is_https() && !nsh_is_localhost() && PHP_SAPI !== 'cli') {
    $host = preg_replace('/[^A-Za-z0-9.\-:]/', '', (string) ($_SERVER['HTTP_HOST'] ?? 'i-feel.co.il')) ?: 'i-feel.co.il';
    $uri = (string) ($_SERVER['REQUEST_URI'] ?? NSH_BASE_PATH);
    header('Location: https://' . $host . $uri, true, 302);
    exit;
}

header('Cache-Control: no-store, private, max-age=0, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()');
header("Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'");

ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_samesite', 'Strict');
session_name(NSH_SESSION_NAME);
session_set_cookie_params([
    'lifetime' => 0,
    'path' => NSH_BASE_PATH,
    'secure' => nsh_is_https(),
    'httponly' => true,
    'samesite' => 'Strict',
]);
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function nsh_h($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function nsh_strlen(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

function nsh_substr(string $value, int $start, int $length): string
{
    return function_exists('mb_substr') ? mb_substr($value, $start, $length, 'UTF-8') : substr($value, $start, $length);
}

function nsh_post(string $key, int $max = 4000): string
{
    $value = $_POST[$key] ?? '';
    if (is_array($value)) {
        return '';
    }
    $value = trim((string) $value);
    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value) ?? '';
    if (nsh_strlen($value) > $max) {
        $value = nsh_substr($value, 0, $max);
    }
    return $value;
}

function nsh_redirect(array $params = []): void
{
    $location = NSH_BASE_PATH;
    if ($params !== []) {
        $location .= '?' . http_build_query($params);
    }
    header('Location: ' . $location, true, 303);
    exit;
}

function nsh_email_domain(string $email): string
{
    $email = strtolower(trim($email));
    $at = strrpos($email, '@');
    return $at === false ? '' : substr($email, $at + 1);
}

function nsh_normalize_building(string $building): string
{
    $building = strtoupper(trim($building));
    $letterMap = ['A' => '1', 'B' => '2', 'C' => '3', 'D' => '4', 'E' => '5'];
    if (isset($letterMap[$building])) {
        return $letterMap[$building];
    }
    return preg_match('/\A[1-5]\z/D', $building) === 1 ? $building : '';
}

function nsh_normalize_proposal_url(string $url): string
{
    $url = trim($url);
    if ($url === '') {
        return '';
    }
    if (str_starts_with($url, '/neve-shuster/assets/')) {
        return $url;
    }
    $parts = parse_url($url);
    if (!is_array($parts) || strtolower((string) ($parts['scheme'] ?? '')) !== 'https') {
        return '';
    }
    return strtolower((string) ($parts['host'] ?? '')) === 'i-feel.co.il' ? $url : '';
}

/**
 * residents.txt נשאר קובץ שרת פרטי ואינו נשמר ב-Git.
 * שורה קיימת עם כתובת דוא״ל בלבד ממשיכה לעבוד ללא שינוי.
 * כדי לאפשר מילוי אוטומטי ניתן להשתמש בפורמט:
 * email|building|apartment|apartment_type|name|phone|proposal_url
 */
function nsh_residents(): array
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }
    $cache = [];
    $path = __DIR__ . '/residents.txt';
    if (is_file($path)) {
        $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }
            $parts = array_map('trim', str_getcsv($line, '|'));
            $email = strtolower((string) ($parts[0] ?? ''));
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                continue;
            }
            $cache[$email] = [
                'building' => nsh_normalize_building((string) ($parts[1] ?? '')),
                'apartment' => preg_replace('/[^0-9]/', '', (string) ($parts[2] ?? '')) ?? '',
                'apartment_type' => nsh_substr((string) ($parts[3] ?? ''), 0, 80),
                'name' => nsh_substr((string) ($parts[4] ?? ''), 0, 120),
                'phone' => nsh_substr((string) ($parts[5] ?? ''), 0, 40),
                'proposal_url' => nsh_normalize_proposal_url((string) ($parts[6] ?? '')),
            ];
        }
    }
    return $cache;
}

function nsh_resident_profile(string $email): array
{
    $defaults = [
        'building' => '',
        'apartment' => '',
        'apartment_type' => '',
        'name' => '',
        'phone' => '',
        'proposal_url' => '',
    ];
    $email = strtolower(trim($email));
    $residents = nsh_residents();
    $profile = isset($residents[$email]) && is_array($residents[$email]) ? $residents[$email] : [];
    return array_merge($defaults, $profile);
}

function nsh_is_staff(string $email): bool
{
    return nsh_email_domain($email) === NSH_STAFF_DOMAIN;
}

function nsh_allowed_email(string $email): bool
{
    $email = strtolower(trim($email));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return false;
    }
    if (nsh_is_staff($email)) {
        return true;
    }
    if (!NSH_STRICT_ALLOWLIST) {
        return true;
    }
    return isset(nsh_residents()[$email]);
}

function nsh_role_for_email(string $email): string
{
    return nsh_is_staff($email) ? 'staff' : 'resident';
}

function nsh_valid_token(string $token): bool
{
    return preg_match('/\A[a-f0-9]{48}\z/D', $token) === 1;
}

function nsh_ticket_path(string $kind, string $ticketId): string
{
    if (!in_array($kind, ['otp', 'access'], true) || !nsh_valid_token($ticketId)) {
        return '';
    }
    return rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'ifeel-nsh-' . $kind . '-' . $ticketId . '.json';
}

function nsh_write_ticket(string $kind, string $ticketId, array $state): bool
{
    $path = nsh_ticket_path($kind, $ticketId);
    if ($path === '') {
        return false;
    }
    $json = json_encode($state, JSON_UNESCAPED_SLASHES);
    if ($json === false || @file_put_contents($path, $json, LOCK_EX) === false) {
        return false;
    }
    @chmod($path, 0600);
    return true;
}

function nsh_read_ticket(string $kind, string $ticketId): ?array
{
    $path = nsh_ticket_path($kind, $ticketId);
    if ($path === '' || !is_file($path)) {
        return null;
    }
    $raw = @file_get_contents($path);
    $state = $raw === false ? null : json_decode($raw, true);
    if (!is_array($state) || (int) ($state['expires'] ?? 0) < time()) {
        @unlink($path);
        return null;
    }
    return $state;
}

function nsh_delete_ticket(string $kind, string $ticketId): void
{
    $path = nsh_ticket_path($kind, $ticketId);
    if ($path !== '') {
        @unlink($path);
    }
}

function nsh_set_private_cookie(string $name, string $value, int $expires = 0): void
{
    if (headers_sent()) {
        return;
    }
    $secure = nsh_is_https() ? '; Secure' : '';
    $expiration = '';
    if ($expires > 0) {
        $expiration = '; Expires=' . gmdate('D, d M Y H:i:s', $expires) . ' GMT; Max-Age=' . max(0, $expires - time());
    } elseif ($expires < 0) {
        $expiration = '; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0';
    }
    header('Set-Cookie: ' . $name . '=' . rawurlencode($value) . $expiration . '; Path=' . NSH_BASE_PATH . '; HttpOnly; SameSite=Strict' . $secure, false);
    if ($expires < 0) {
        unset($_COOKIE[$name]);
    } else {
        $_COOKIE[$name] = $value;
    }
}

function nsh_set_csrf_cookie(string $token): void
{
    nsh_set_private_cookie(NSH_CSRF_COOKIE, $token);
}

function nsh_csrf_token(): string
{
    $sessionToken = is_string($_SESSION['nsh_csrf'] ?? null) ? (string) $_SESSION['nsh_csrf'] : '';
    $cookieToken = is_string($_COOKIE[NSH_CSRF_COOKIE] ?? null) ? (string) $_COOKIE[NSH_CSRF_COOKIE] : '';
    if (!nsh_valid_token($sessionToken)) {
        $sessionToken = nsh_valid_token($cookieToken) ? $cookieToken : bin2hex(random_bytes(24));
        $_SESSION['nsh_csrf'] = $sessionToken;
    }
    if ($cookieToken === '' || !hash_equals($sessionToken, $cookieToken)) {
        nsh_set_csrf_cookie($sessionToken);
    }
    return $sessionToken;
}

function nsh_verify_csrf(): void
{
    $posted = nsh_post('csrf', 100);
    $stored = (string) ($_SESSION['nsh_csrf'] ?? '');
    $cookie = (string) ($_COOKIE[NSH_CSRF_COOKIE] ?? '');
    $sessionMatches = nsh_valid_token($stored) && nsh_valid_token($posted) && hash_equals($stored, $posted);
    $cookieMatches = nsh_valid_token($cookie) && nsh_valid_token($posted) && hash_equals($cookie, $posted);
    if (!$sessionMatches && !$cookieMatches) {
        throw new RuntimeException('הטופס פג תוקף. יש לרענן את העמוד ולנסות שוב.');
    }
}

function nsh_cookie_ticket_id(string $cookieName): string
{
    $ticketId = is_string($_COOKIE[$cookieName] ?? null) ? (string) $_COOKIE[$cookieName] : '';
    return nsh_valid_token($ticketId) ? $ticketId : '';
}

function nsh_otp_ticket(): ?array
{
    $ticketId = nsh_cookie_ticket_id(NSH_OTP_COOKIE);
    if ($ticketId === '') {
        return null;
    }
    $state = nsh_read_ticket('otp', $ticketId);
    if ($state === null) {
        nsh_set_private_cookie(NSH_OTP_COOKIE, '', -1);
        return null;
    }
    return ['id' => $ticketId, 'state' => $state];
}

function nsh_create_otp_challenge(string $email, string $code): string
{
    $ticketId = bin2hex(random_bytes(24));
    $now = time();
    $state = [
        'email' => strtolower(trim($email)),
        'hash' => hash('sha256', $code . '|' . $ticketId),
        'expires' => $now + NSH_OTP_TTL,
        'attempts' => 0,
        'sent_at' => $now,
    ];
    if (!nsh_write_ticket('otp', $ticketId, $state)) {
        throw new RuntimeException('לא ניתן ליצור קוד כניסה כרגע.');
    }
    nsh_set_private_cookie(NSH_OTP_COOKIE, $ticketId, $state['expires']);
    return $ticketId;
}

function nsh_clear_otp_challenge(): void
{
    $ticketId = nsh_cookie_ticket_id(NSH_OTP_COOKIE);
    if ($ticketId !== '') {
        nsh_delete_ticket('otp', $ticketId);
    }
    nsh_set_private_cookie(NSH_OTP_COOKIE, '', -1);
}

function nsh_pending_email(): string
{
    $ticket = nsh_otp_ticket();
    if ($ticket !== null) {
        $email = strtolower(trim((string) ($ticket['state']['email'] ?? '')));
        if (nsh_allowed_email($email)) {
            return $email;
        }
    }
    $email = strtolower(trim((string) ($_SESSION['nsh_otp_email'] ?? '')));
    $expires = (int) ($_SESSION['nsh_otp_expires'] ?? 0);
    return nsh_allowed_email($email) && $expires >= time() ? $email : '';
}

function nsh_access_ticket(): ?array
{
    $ticketId = nsh_cookie_ticket_id(NSH_ACCESS_COOKIE);
    if ($ticketId === '') {
        return null;
    }
    $state = nsh_read_ticket('access', $ticketId);
    if ($state === null) {
        nsh_set_private_cookie(NSH_ACCESS_COOKIE, '', -1);
        return null;
    }
    return ['id' => $ticketId, 'state' => $state];
}

function nsh_create_access_ticket(string $email, int $verifiedAt): string
{
    $ticketId = bin2hex(random_bytes(24));
    $now = time();
    $state = [
        'email' => strtolower(trim($email)),
        'verified_at' => $verifiedAt,
        'last_activity' => $now,
        'expires' => $now + NSH_ACCESS_TTL,
    ];
    if (!nsh_write_ticket('access', $ticketId, $state)) {
        return '';
    }
    nsh_set_private_cookie(NSH_ACCESS_COOKIE, $ticketId, $state['expires']);
    return $ticketId;
}

function nsh_clear_access_ticket(): void
{
    $ticketId = nsh_cookie_ticket_id(NSH_ACCESS_COOKIE);
    if ($ticketId !== '') {
        nsh_delete_ticket('access', $ticketId);
    }
    nsh_set_private_cookie(NSH_ACCESS_COOKIE, '', -1);
}

function nsh_current_user(): ?array
{
    $email = strtolower(trim((string) ($_SESSION['nsh_verified_email'] ?? '')));
    $verifiedAt = (int) ($_SESSION['nsh_verified_at'] ?? 0);
    $lastActivity = (int) ($_SESSION['nsh_last_activity'] ?? 0);
    $now = time();

    if ($email === '' || !nsh_allowed_email($email) || $verifiedAt <= 0) {
        $ticket = nsh_access_ticket();
        if ($ticket === null) {
            return null;
        }
        $email = strtolower(trim((string) ($ticket['state']['email'] ?? '')));
        $verifiedAt = (int) ($ticket['state']['verified_at'] ?? 0);
        $lastActivity = (int) ($ticket['state']['last_activity'] ?? 0);
        if ($email === '' || !nsh_allowed_email($email) || $verifiedAt <= 0) {
            nsh_clear_access_ticket();
            return null;
        }
        $_SESSION['nsh_verified_email'] = $email;
        $_SESSION['nsh_verified_at'] = $verifiedAt;
    }
    if ($lastActivity > 0 && ($now - $lastActivity) > NSH_ACCESS_TTL) {
        nsh_logout();
        return null;
    }

    $_SESSION['nsh_last_activity'] = $now;
    $ticket = nsh_access_ticket();
    if ($ticket === null) {
        nsh_create_access_ticket($email, $verifiedAt);
    } else {
        $ticket['state']['last_activity'] = $now;
        $ticket['state']['expires'] = $now + NSH_ACCESS_TTL;
        if (nsh_write_ticket('access', $ticket['id'], $ticket['state'])) {
            nsh_set_private_cookie(NSH_ACCESS_COOKIE, $ticket['id'], $ticket['state']['expires']);
        }
    }
    return array_merge([
        'email' => $email,
        'domain' => nsh_email_domain($email),
        'role' => nsh_role_for_email($email),
    ], nsh_resident_profile($email));
}

function nsh_require_user(): array
{
    $user = nsh_current_user();
    if ($user === null) {
        nsh_redirect(['access' => 'required']);
    }
    return $user;
}

function nsh_logout(): void
{
    nsh_clear_otp_challenge();
    nsh_clear_access_ticket();
    foreach (array_keys($_SESSION) as $key) {
        if (str_starts_with((string) $key, 'nsh_')) {
            unset($_SESSION[$key]);
        }
    }
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_regenerate_id(true);
    }
}

function nsh_rate_file(string $email): string
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    return rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'ifeel-nsh-' . hash('sha256', $ip . '|' . strtolower($email)) . '.json';
}

function nsh_allow_code_send(string $email): bool
{
    $now = time();
    $lastSessionSend = (int) ($_SESSION['nsh_otp_sent_at'] ?? 0);
    if ($lastSessionSend > 0 && ($now - $lastSessionSend) < NSH_OTP_RESEND_SECONDS) {
        return false;
    }
    $ticket = nsh_otp_ticket();
    if ($ticket !== null) {
        $ticketEmail = strtolower(trim((string) ($ticket['state']['email'] ?? '')));
        $ticketSentAt = (int) ($ticket['state']['sent_at'] ?? 0);
        if ($ticketEmail === strtolower(trim($email)) && $ticketSentAt > 0 && ($now - $ticketSentAt) < NSH_OTP_RESEND_SECONDS) {
            return false;
        }
    }
    $path = nsh_rate_file($email);
    $timestamps = [];
    if (is_file($path)) {
        $raw = file_get_contents($path);
        $decoded = $raw === false ? null : json_decode($raw, true);
        if (is_array($decoded)) {
            foreach ($decoded as $timestamp) {
                $timestamp = (int) $timestamp;
                if ($timestamp >= ($now - 3600)) {
                    $timestamps[] = $timestamp;
                }
            }
        }
    }
    if (count($timestamps) >= NSH_OTP_HOURLY_LIMIT) {
        return false;
    }
    $timestamps[] = $now;
    @file_put_contents($path, json_encode($timestamps), LOCK_EX);
    return true;
}

function nsh_send_code(string $email): bool
{
    if (!nsh_allowed_email($email) || !nsh_allow_code_send($email)) {
        return false;
    }
    $code = (string) random_int(100000, 999999);
    $email = strtolower(trim($email));
    $ticketId = nsh_create_otp_challenge($email, $code);
    $_SESSION['nsh_otp_email'] = $email;
    $_SESSION['nsh_otp_hash'] = hash('sha256', $code . '|' . session_id());
    $_SESSION['nsh_otp_expires'] = time() + NSH_OTP_TTL;
    $_SESSION['nsh_otp_attempts'] = 0;
    $_SESSION['nsh_otp_sent_at'] = time();

    $subjectText = 'קוד כניסה לאזור דיירי שכונת הפרדס, רעננה';
    $subject = '=?UTF-8?B?' . base64_encode($subjectText) . '?=';
    $body = "שלום,\n\nקוד הכניסה שלך לאזור הדיירים של שכונת הפרדס, רעננה הוא: {$code}\n\nהקוד תקף ל-10 דקות ולשימוש חד פעמי.\nאם לא ביקשת את הקוד, אפשר להתעלם מהודעה זו.\n\nI Feel מערכות בע\"מ\nמשרד 03-508-9553";
    $headers = [
        'From: I Feel Smart Home <no-reply@i-feel.co.il>',
        'Reply-To: myhome@i-feel.co.il',
        'Content-Type: text/plain; charset=UTF-8',
        'X-Auto-Response-Suppress: All',
    ];
    $sent = @mail($email, $subject, $body, implode("\r\n", $headers));
    if (!$sent) {
        nsh_delete_ticket('otp', $ticketId);
        nsh_set_private_cookie(NSH_OTP_COOKIE, '', -1);
        unset($_SESSION['nsh_otp_email'], $_SESSION['nsh_otp_hash'], $_SESSION['nsh_otp_expires'], $_SESSION['nsh_otp_attempts']);
    }
    return $sent;
}

function nsh_verify_code(string $email, string $code): bool
{
    $email = strtolower(trim($email));
    $code = preg_replace('/\D+/', '', $code) ?? '';
    $ticket = nsh_otp_ticket();
    $usingTicket = $ticket !== null;
    if ($usingTicket) {
        $storedEmail = strtolower(trim((string) ($ticket['state']['email'] ?? '')));
        $storedHash = (string) ($ticket['state']['hash'] ?? '');
        $expires = (int) ($ticket['state']['expires'] ?? 0);
        $attempts = (int) ($ticket['state']['attempts'] ?? 0);
    } else {
        $storedEmail = strtolower((string) ($_SESSION['nsh_otp_email'] ?? ''));
        $storedHash = (string) ($_SESSION['nsh_otp_hash'] ?? '');
        $expires = (int) ($_SESSION['nsh_otp_expires'] ?? 0);
        $attempts = (int) ($_SESSION['nsh_otp_attempts'] ?? 0);
    }
    if ($email === '' || $code === '' || $email !== $storedEmail || $storedHash === '' || time() > $expires || $attempts >= 5) {
        return false;
    }
    $_SESSION['nsh_otp_attempts'] = $attempts + 1;
    if ($usingTicket) {
        $ticket['state']['attempts'] = $attempts + 1;
        nsh_write_ticket('otp', $ticket['id'], $ticket['state']);
        $candidate = hash('sha256', $code . '|' . $ticket['id']);
    } else {
        $candidate = hash('sha256', $code . '|' . session_id());
    }
    if (!hash_equals($storedHash, $candidate)) {
        return false;
    }
    session_regenerate_id(true);
    $verifiedAt = time();
    $_SESSION['nsh_verified_email'] = $email;
    $_SESSION['nsh_verified_at'] = $verifiedAt;
    $_SESSION['nsh_last_activity'] = $verifiedAt;
    nsh_create_access_ticket($email, $verifiedAt);
    nsh_clear_otp_challenge();
    unset($_SESSION['nsh_otp_email'], $_SESSION['nsh_otp_hash'], $_SESSION['nsh_otp_expires'], $_SESSION['nsh_otp_attempts']);
    return true;
}
