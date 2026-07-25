<?php
declare(strict_types=1);

if (!function_exists('str_starts_with')) {
    function str_starts_with(string $haystack, string $needle): bool
    {
        return $needle === '' || strncmp($haystack, $needle, strlen($needle)) === 0;
    }
}

const MTLAW_SESSION_NAME = 'ifeel_mt_law_access';
const MTLAW_ACCESS_TTL = 7200;
const MTLAW_OTP_TTL = 600;
const MTLAW_OTP_RESEND_SECONDS = 60;
const MTLAW_OTP_HOURLY_LIMIT = 5;
const MTLAW_CSRF_COOKIE = 'ifeel_mt_law_csrf';
const MTLAW_OTP_COOKIE = 'ifeel_mt_law_otp';
const MTLAW_ACCESS_COOKIE = 'ifeel_mt_law_verified';
const MTLAW_DEFAULT_BOARD_ID = '2732725332';
const MTLAW_FALLBACK_EMAIL = 'sales@i-feel.co.il';
const MTLAW_ALLOWED_DOMAINS = ['i-feel.co.il', 'mt-law.co.il'];

if (is_file(dirname(__DIR__) . '/api/config.php')) {
    require_once dirname(__DIR__) . '/api/config.php';
}

function mtlaw_is_https(): bool
{
    $https = strtolower((string) ($_SERVER['HTTPS'] ?? ''));
    $forwarded = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    return ($https !== '' && $https !== 'off') || $forwarded === 'https' || (int) ($_SERVER['SERVER_PORT'] ?? 0) === 443;
}

function mtlaw_is_localhost(): bool
{
    $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
    return $host === 'localhost' || str_starts_with($host, 'localhost:') || str_starts_with($host, '127.0.0.1');
}

if (!mtlaw_is_https() && !mtlaw_is_localhost() && PHP_SAPI !== 'cli') {
    $host = preg_replace('/[^A-Za-z0-9.\-:]/', '', (string) ($_SERVER['HTTP_HOST'] ?? 'i-feel.co.il')) ?: 'i-feel.co.il';
    $uri = (string) ($_SERVER['REQUEST_URI'] ?? '/mt-law/');
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
session_name(MTLAW_SESSION_NAME);
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/mt-law/',
    'secure' => mtlaw_is_https(),
    'httponly' => true,
    'samesite' => 'Strict',
]);
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function mtlaw_h($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function mtlaw_strlen(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

function mtlaw_substr(string $value, int $start, int $length): string
{
    return function_exists('mb_substr') ? mb_substr($value, $start, $length, 'UTF-8') : substr($value, $start, $length);
}

function mtlaw_post(string $key, int $max = 4000): string
{
    $value = $_POST[$key] ?? '';
    if (is_array($value)) {
        return '';
    }
    $value = trim((string) $value);
    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value) ?? '';
    if (mtlaw_strlen($value) > $max) {
        $value = mtlaw_substr($value, 0, $max);
    }
    return $value;
}

function mtlaw_post_array(string $key, int $maxItems = 10, int $maxLength = 80): array
{
    $values = $_POST[$key] ?? [];
    if (!is_array($values)) {
        return [];
    }
    $result = [];
    foreach (array_slice($values, 0, $maxItems) as $value) {
        if (!is_scalar($value)) {
            continue;
        }
        $item = trim((string) $value);
        $item = preg_replace('/[^A-Za-z0-9_\-]/', '', $item) ?? '';
        if ($item !== '') {
            $result[] = substr($item, 0, $maxLength);
        }
    }
    return array_values(array_unique($result));
}

function mtlaw_base_path(): string
{
    return '/mt-law/';
}

function mtlaw_redirect(array $params = []): void
{
    $location = mtlaw_base_path();
    if ($params !== []) {
        $location .= '?' . http_build_query($params);
    }
    header('Location: ' . $location, true, 303);
    exit;
}

function mtlaw_valid_csrf_token(string $token): bool
{
    return preg_match('/\A[a-f0-9]{48}\z/D', $token) === 1;
}

function mtlaw_set_csrf_cookie(string $token): void
{
    if (headers_sent()) {
        return;
    }
    $secure = mtlaw_is_https() ? '; Secure' : '';
    header(
        'Set-Cookie: ' . MTLAW_CSRF_COOKIE . '=' . rawurlencode($token)
        . '; Path=/mt-law/; HttpOnly; SameSite=Strict' . $secure,
        false
    );
    $_COOKIE[MTLAW_CSRF_COOKIE] = $token;
}

function mtlaw_csrf_token(): string
{
    $sessionToken = is_string($_SESSION['mtlaw_csrf'] ?? null) ? (string) $_SESSION['mtlaw_csrf'] : '';
    $cookieToken = is_string($_COOKIE[MTLAW_CSRF_COOKIE] ?? null) ? (string) $_COOKIE[MTLAW_CSRF_COOKIE] : '';

    if (!mtlaw_valid_csrf_token($sessionToken)) {
        $sessionToken = mtlaw_valid_csrf_token($cookieToken) ? $cookieToken : bin2hex(random_bytes(24));
        $_SESSION['mtlaw_csrf'] = $sessionToken;
    }
    if ($cookieToken === '' || !hash_equals($sessionToken, $cookieToken)) {
        mtlaw_set_csrf_cookie($sessionToken);
    }
    return $sessionToken;
}

function mtlaw_verify_csrf(): void
{
    $posted = mtlaw_post('csrf', 100);
    $stored = (string) ($_SESSION['mtlaw_csrf'] ?? '');
    $cookie = (string) ($_COOKIE[MTLAW_CSRF_COOKIE] ?? '');
    $sessionMatches = mtlaw_valid_csrf_token($stored) && mtlaw_valid_csrf_token($posted) && hash_equals($stored, $posted);
    $cookieMatches = mtlaw_valid_csrf_token($cookie) && mtlaw_valid_csrf_token($posted) && hash_equals($cookie, $posted);
    if (!$sessionMatches && !$cookieMatches) {
        throw new RuntimeException('הטופס פג תוקף. יש לרענן את העמוד ולנסות שוב.');
    }
}

function mtlaw_email_domain(string $email): string
{
    $email = strtolower(trim($email));
    $at = strrpos($email, '@');
    return $at === false ? '' : substr($email, $at + 1);
}

function mtlaw_allowed_email(string $email): bool
{
    $email = strtolower(trim($email));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return false;
    }
    return in_array(mtlaw_email_domain($email), MTLAW_ALLOWED_DOMAINS, true);
}

function mtlaw_role_for_domain(string $domain): string
{
    return $domain === 'i-feel.co.il' ? 'staff' : 'member';
}

function mtlaw_valid_ticket_id(string $ticketId): bool
{
    return preg_match('/\A[a-f0-9]{48}\z/D', $ticketId) === 1;
}

function mtlaw_ticket_path(string $kind, string $ticketId): string
{
    if (!in_array($kind, ['otp', 'access'], true) || !mtlaw_valid_ticket_id($ticketId)) {
        return '';
    }
    return rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR)
        . DIRECTORY_SEPARATOR
        . 'ifeel-mtlaw-' . $kind . '-' . $ticketId . '.json';
}

function mtlaw_write_ticket(string $kind, string $ticketId, array $state): bool
{
    $path = mtlaw_ticket_path($kind, $ticketId);
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

function mtlaw_read_ticket(string $kind, string $ticketId): ?array
{
    $path = mtlaw_ticket_path($kind, $ticketId);
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

function mtlaw_delete_ticket(string $kind, string $ticketId): void
{
    $path = mtlaw_ticket_path($kind, $ticketId);
    if ($path !== '') {
        @unlink($path);
    }
}

function mtlaw_set_private_cookie(string $name, string $value, int $expires = 0): void
{
    if (headers_sent()) {
        return;
    }
    $secure = mtlaw_is_https() ? '; Secure' : '';
    $expiration = '';
    if ($expires > 0) {
        $expiration = '; Expires=' . gmdate('D, d M Y H:i:s', $expires) . ' GMT; Max-Age=' . max(0, $expires - time());
    } elseif ($expires < 0) {
        $expiration = '; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0';
    }
    header(
        'Set-Cookie: ' . $name . '=' . rawurlencode($value)
        . $expiration . '; Path=/mt-law/; HttpOnly; SameSite=Strict' . $secure,
        false
    );
    if ($expires < 0) {
        unset($_COOKIE[$name]);
    } else {
        $_COOKIE[$name] = $value;
    }
}

function mtlaw_cookie_ticket_id(string $cookieName): string
{
    $ticketId = is_string($_COOKIE[$cookieName] ?? null) ? (string) $_COOKIE[$cookieName] : '';
    return mtlaw_valid_ticket_id($ticketId) ? $ticketId : '';
}

function mtlaw_otp_ticket(): ?array
{
    $ticketId = mtlaw_cookie_ticket_id(MTLAW_OTP_COOKIE);
    if ($ticketId === '') {
        return null;
    }
    $state = mtlaw_read_ticket('otp', $ticketId);
    if ($state === null) {
        mtlaw_set_private_cookie(MTLAW_OTP_COOKIE, '', -1);
        return null;
    }
    return ['id' => $ticketId, 'state' => $state];
}

function mtlaw_create_otp_challenge(string $email, string $code, bool $marketingOptIn): string
{
    $ticketId = bin2hex(random_bytes(24));
    $now = time();
    $state = [
        'email' => strtolower(trim($email)),
        'hash' => hash('sha256', $code . '|' . $ticketId),
        'expires' => $now + MTLAW_OTP_TTL,
        'attempts' => 0,
        'sent_at' => $now,
        'marketing_opt_in' => $marketingOptIn,
    ];
    if (!mtlaw_write_ticket('otp', $ticketId, $state)) {
        throw new RuntimeException('Could not persist the one-time code challenge.');
    }
    mtlaw_set_private_cookie(MTLAW_OTP_COOKIE, $ticketId, $state['expires']);
    return $ticketId;
}

function mtlaw_clear_otp_challenge(): void
{
    $ticketId = mtlaw_cookie_ticket_id(MTLAW_OTP_COOKIE);
    if ($ticketId !== '') {
        mtlaw_delete_ticket('otp', $ticketId);
    }
    mtlaw_set_private_cookie(MTLAW_OTP_COOKIE, '', -1);
}

function mtlaw_pending_email(): string
{
    $ticket = mtlaw_otp_ticket();
    if ($ticket !== null) {
        $email = strtolower(trim((string) ($ticket['state']['email'] ?? '')));
        if (mtlaw_allowed_email($email)) {
            return $email;
        }
    }

    $email = strtolower(trim((string) ($_SESSION['mtlaw_otp_email'] ?? '')));
    $expires = (int) ($_SESSION['mtlaw_otp_expires'] ?? 0);
    return mtlaw_allowed_email($email) && $expires >= time() ? $email : '';
}

function mtlaw_pending_marketing_opt_in(): bool
{
    $ticket = mtlaw_otp_ticket();
    if ($ticket !== null) {
        return (bool) ($ticket['state']['marketing_opt_in'] ?? false);
    }
    return (bool) ($_SESSION['mtlaw_gate_marketing_opt_in'] ?? false);
}

function mtlaw_access_ticket(): ?array
{
    $ticketId = mtlaw_cookie_ticket_id(MTLAW_ACCESS_COOKIE);
    if ($ticketId === '') {
        return null;
    }
    $state = mtlaw_read_ticket('access', $ticketId);
    if ($state === null) {
        mtlaw_set_private_cookie(MTLAW_ACCESS_COOKIE, '', -1);
        return null;
    }
    return ['id' => $ticketId, 'state' => $state];
}

function mtlaw_create_access_ticket(string $email, int $verifiedAt, bool $marketingOptIn = false): string
{
    $ticketId = bin2hex(random_bytes(24));
    $now = time();
    $state = [
        'email' => strtolower(trim($email)),
        'verified_at' => $verifiedAt,
        'last_activity' => $now,
        'expires' => $now + MTLAW_ACCESS_TTL,
        'marketing_opt_in' => $marketingOptIn,
    ];
    if (!mtlaw_write_ticket('access', $ticketId, $state)) {
        return '';
    }
    mtlaw_set_private_cookie(MTLAW_ACCESS_COOKIE, $ticketId, $state['expires']);
    return $ticketId;
}

function mtlaw_clear_access_ticket(): void
{
    $ticketId = mtlaw_cookie_ticket_id(MTLAW_ACCESS_COOKIE);
    if ($ticketId !== '') {
        mtlaw_delete_ticket('access', $ticketId);
    }
    mtlaw_set_private_cookie(MTLAW_ACCESS_COOKIE, '', -1);
}

function mtlaw_current_user(): ?array
{
    $email = strtolower(trim((string) ($_SESSION['mtlaw_verified_email'] ?? '')));
    $verifiedAt = (int) ($_SESSION['mtlaw_verified_at'] ?? 0);
    $lastActivity = (int) ($_SESSION['mtlaw_last_activity'] ?? 0);
    $now = time();

    if ($email === '' || !mtlaw_allowed_email($email) || $verifiedAt <= 0) {
        $ticket = mtlaw_access_ticket();
        if ($ticket === null) {
            return null;
        }
        $email = strtolower(trim((string) ($ticket['state']['email'] ?? '')));
        $verifiedAt = (int) ($ticket['state']['verified_at'] ?? 0);
        $lastActivity = (int) ($ticket['state']['last_activity'] ?? 0);
        if ($email === '' || !mtlaw_allowed_email($email) || $verifiedAt <= 0) {
            mtlaw_clear_access_ticket();
            return null;
        }
        $_SESSION['mtlaw_verified_email'] = $email;
        $_SESSION['mtlaw_verified_at'] = $verifiedAt;
        $_SESSION['mtlaw_gate_marketing_opt_in'] = (bool) ($ticket['state']['marketing_opt_in'] ?? false);
    }
    if ($lastActivity > 0 && ($now - $lastActivity) > MTLAW_ACCESS_TTL) {
        mtlaw_logout();
        return null;
    }

    $_SESSION['mtlaw_last_activity'] = $now;
    $ticket = mtlaw_access_ticket();
    if ($ticket === null) {
        mtlaw_create_access_ticket($email, $verifiedAt, (bool) ($_SESSION['mtlaw_gate_marketing_opt_in'] ?? false));
    } else {
        $ticket['state']['last_activity'] = $now;
        $ticket['state']['expires'] = $now + MTLAW_ACCESS_TTL;
        if (mtlaw_write_ticket('access', $ticket['id'], $ticket['state'])) {
            mtlaw_set_private_cookie(MTLAW_ACCESS_COOKIE, $ticket['id'], $ticket['state']['expires']);
        }
    }
    $domain = mtlaw_email_domain($email);
    return [
        'email' => $email,
        'domain' => $domain,
        'role' => mtlaw_role_for_domain($domain),
    ];
}

function mtlaw_require_user(): array
{
    $user = mtlaw_current_user();
    if ($user === null) {
        mtlaw_redirect(['access' => 'required']);
    }
    return $user;
}

function mtlaw_logout(): void
{
    mtlaw_clear_otp_challenge();
    mtlaw_clear_access_ticket();
    foreach (array_keys($_SESSION) as $key) {
        if (str_starts_with((string) $key, 'mtlaw_')) {
            unset($_SESSION[$key]);
        }
    }
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_regenerate_id(true);
    }
}

function mtlaw_rate_file(string $email): string
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    return rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'ifeel-mtlaw-' . hash('sha256', $ip . '|' . strtolower($email)) . '.json';
}

function mtlaw_allow_code_send(string $email): bool
{
    $now = time();
    $lastSessionSend = (int) ($_SESSION['mtlaw_otp_sent_at'] ?? 0);
    if ($lastSessionSend > 0 && ($now - $lastSessionSend) < MTLAW_OTP_RESEND_SECONDS) {
        return false;
    }
    $ticket = mtlaw_otp_ticket();
    if ($ticket !== null) {
        $ticketEmail = strtolower(trim((string) ($ticket['state']['email'] ?? '')));
        $ticketSentAt = (int) ($ticket['state']['sent_at'] ?? 0);
        if ($ticketEmail === strtolower(trim($email)) && $ticketSentAt > 0 && ($now - $ticketSentAt) < MTLAW_OTP_RESEND_SECONDS) {
            return false;
        }
    }

    $path = mtlaw_rate_file($email);
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
    if (count($timestamps) >= MTLAW_OTP_HOURLY_LIMIT) {
        return false;
    }
    $timestamps[] = $now;
    @file_put_contents($path, json_encode($timestamps), LOCK_EX);
    return true;
}

function mtlaw_send_code(string $email, bool $marketingOptIn = false): bool
{
    if (!mtlaw_allowed_email($email) || !mtlaw_allow_code_send($email)) {
        return false;
    }

    $code = (string) random_int(100000, 999999);
    $email = strtolower(trim($email));
    $ticketId = mtlaw_create_otp_challenge($email, $code, $marketingOptIn);
    $_SESSION['mtlaw_otp_email'] = $email;
    $_SESSION['mtlaw_otp_hash'] = hash('sha256', $code . '|' . session_id());
    $_SESSION['mtlaw_otp_expires'] = time() + MTLAW_OTP_TTL;
    $_SESSION['mtlaw_otp_attempts'] = 0;
    $_SESSION['mtlaw_otp_sent_at'] = time();
    $_SESSION['mtlaw_gate_marketing_opt_in'] = $marketingOptIn;

    $subjectText = 'קוד כניסה להטבת עובדי I Feel ו-MT-Law';
    $subject = '=?UTF-8?B?' . base64_encode($subjectText) . '?=';
    $body = "שלום,\n\nקוד הכניסה שלך לעמוד ההטבה של I Feel הוא: {$code}\n\nהקוד תקף ל-10 דקות ולשימוש חד פעמי.\nאם לא ביקשת את הקוד, אפשר להתעלם מהודעה זו.\n\nI Feel Smart Home";
    $headers = [
        'From: I Feel Smart Home <no-reply@i-feel.co.il>',
        'Reply-To: sales@i-feel.co.il',
        'Content-Type: text/plain; charset=UTF-8',
        'X-Auto-Response-Suppress: All',
    ];

    $sent = @mail($email, $subject, $body, implode("\r\n", $headers));
    if (!$sent) {
        mtlaw_delete_ticket('otp', $ticketId);
        mtlaw_set_private_cookie(MTLAW_OTP_COOKIE, '', -1);
        unset(
            $_SESSION['mtlaw_otp_email'],
            $_SESSION['mtlaw_otp_hash'],
            $_SESSION['mtlaw_otp_expires'],
            $_SESSION['mtlaw_otp_attempts'],
            $_SESSION['mtlaw_gate_marketing_opt_in']
        );
    }
    return $sent;
}

function mtlaw_verify_code(string $email, string $code): bool
{
    $email = strtolower(trim($email));
    $code = preg_replace('/\D+/', '', $code) ?? '';
    $ticket = mtlaw_otp_ticket();
    $usingTicket = $ticket !== null;
    if ($usingTicket) {
        $storedEmail = strtolower(trim((string) ($ticket['state']['email'] ?? '')));
        $storedHash = (string) ($ticket['state']['hash'] ?? '');
        $expires = (int) ($ticket['state']['expires'] ?? 0);
        $attempts = (int) ($ticket['state']['attempts'] ?? 0);
        $marketingOptIn = (bool) ($ticket['state']['marketing_opt_in'] ?? false);
    } else {
        $storedEmail = strtolower((string) ($_SESSION['mtlaw_otp_email'] ?? ''));
        $storedHash = (string) ($_SESSION['mtlaw_otp_hash'] ?? '');
        $expires = (int) ($_SESSION['mtlaw_otp_expires'] ?? 0);
        $attempts = (int) ($_SESSION['mtlaw_otp_attempts'] ?? 0);
        $marketingOptIn = (bool) ($_SESSION['mtlaw_gate_marketing_opt_in'] ?? false);
    }

    if ($email === '' || $code === '' || $email !== $storedEmail || $storedHash === '' || time() > $expires || $attempts >= 5) {
        return false;
    }

    $_SESSION['mtlaw_otp_attempts'] = $attempts + 1;
    if ($usingTicket) {
        $ticket['state']['attempts'] = $attempts + 1;
        mtlaw_write_ticket('otp', $ticket['id'], $ticket['state']);
        $candidate = hash('sha256', $code . '|' . $ticket['id']);
    } else {
        $candidate = hash('sha256', $code . '|' . session_id());
    }
    if (!hash_equals($storedHash, $candidate)) {
        return false;
    }

    session_regenerate_id(true);
    $verifiedAt = time();
    $_SESSION['mtlaw_verified_email'] = $email;
    $_SESSION['mtlaw_verified_at'] = $verifiedAt;
    $_SESSION['mtlaw_last_activity'] = $verifiedAt;
    $_SESSION['mtlaw_gate_marketing_opt_in'] = $marketingOptIn;
    mtlaw_create_access_ticket($email, $verifiedAt, $marketingOptIn);
    mtlaw_clear_otp_challenge();
    unset(
        $_SESSION['mtlaw_otp_email'],
        $_SESSION['mtlaw_otp_hash'],
        $_SESSION['mtlaw_otp_expires'],
        $_SESSION['mtlaw_otp_attempts']
    );
    return true;
}

function mtlaw_label(string $group, string $value): string
{
    $labels = [
        'property' => [
            'new' => 'בנייה חדשה',
            'renovation' => 'שיפוץ',
            'existing' => 'בית או דירה קיימים',
            'checking' => 'בדיקת אפשרויות',
        ],
        'scope' => [
            'full' => 'מערכת בית חכם מלאה',
            'partial' => 'מערכת נקודתית',
            'advice' => 'נדרשת המלצה',
        ],
        'system' => [
            'smart-electricity' => 'חשמל חכם',
            'audio' => 'אודיו',
            'alarm' => 'אזעקה',
            'cameras' => 'מצלמות',
            'intercom' => 'אינטרקום',
        ],
        'alarm' => [
            'wired' => 'אזעקה קווית',
            'wireless' => 'אזעקה אלחוטית',
            'recommend' => 'נדרשת המלצה לסוג האזעקה',
            'none' => 'לא נבחרה אזעקה',
        ],
        'camera' => [
            'ready' => 'יש הכנות למצלמות',
            'partial' => 'יש הכנות חלקיות',
            'none' => 'אין הכנות',
            'unknown' => 'לא ידוע אם קיימות הכנות',
        ],
        'budget' => [
            'over' => 'מעל 15,000 ש״ח',
            'under' => 'עד 15,000 ש״ח',
            'unknown' => 'טרם נקבע',
        ],
        'gift' => [
            'turntable' => 'פטיפון Argon Audio TT MK2',
            'tc4' => 'Siemens TC4',
            'none' => 'ללא בחירת מתנה בשלב זה',
        ],
        'contact' => [
            'email' => 'דואר אלקטרוני',
            'whatsapp' => 'WhatsApp',
            'scheduled-call' => 'שיחה מתוזמנת בלבד',
        ],
        'timeline' => [
            'now' => 'מיידי, עד חודש',
            'quarter' => 'בחודשים הקרובים',
            'later' => 'בהמשך השנה',
            'unknown' => 'טרם נקבע',
        ],
    ];
    return $labels[$group][$value] ?? $value;
}

function mtlaw_monday_request(string $query, array $variables, string $token): array
{
    $payload = json_encode([
        'query' => $query,
        'variables' => $variables,
    ], JSON_UNESCAPED_UNICODE);
    if ($payload === false) {
        throw new RuntimeException('Could not encode Monday request');
    }

    $ch = curl_init('https://api.monday.com/v2');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: ' . $token,
            'Content-Type: application/json',
            'API-Version: 2025-01',
        ],
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 12,
    ]);
    $body = curl_exec($ch);
    $error = curl_error($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($body === false || $error !== '') {
        throw new RuntimeException('Monday request failed: ' . $error);
    }
    $decoded = json_decode($body, true);
    if ($status >= 400 || !is_array($decoded) || isset($decoded['errors'])) {
        throw new RuntimeException('Monday API error: HTTP ' . $status . ' ' . $body);
    }
    return $decoded;
}

function mtlaw_fallback_mail(array $lead, string $reason): bool
{
    $to = getenv('LEAD_FALLBACK_EMAIL') ?: MTLAW_FALLBACK_EMAIL;
    $subjectText = 'פנייה מעמוד הטבת MT-Law, ' . ($lead['name'] ?: 'ללא שם');
    $subject = '=?UTF-8?B?' . base64_encode($subjectText) . '?=';
    $body = implode("\n", [
        'פנייה מעמוד הטבת עובדי MT-Law',
        'סיבת ניתוב למייל: ' . $reason,
        '',
        'שם: ' . $lead['name'],
        'טלפון: ' . $lead['phone'],
        'מייל מאומת: ' . $lead['email'],
        'אופן קשר מועדף: ' . $lead['contact_preference'],
        '',
        $lead['message'],
        '',
        'נשלח: ' . gmdate('c'),
        'IP: ' . ($_SERVER['REMOTE_ADDR'] ?? ''),
    ]);
    $headers = [
        'From: I Feel Website <no-reply@i-feel.co.il>',
        'Reply-To: ' . $lead['email'],
        'Content-Type: text/plain; charset=UTF-8',
    ];
    return @mail($to, $subject, $body, implode("\r\n", $headers));
}

function mtlaw_submit_lead(array $user): string
{
    $name = mtlaw_post('name', 120);
    $phone = mtlaw_post('phone', 80);
    $property = mtlaw_post('property', 40);
    $scope = mtlaw_post('scope', 40);
    $systems = mtlaw_post_array('systems', 10, 50);
    $alarm = mtlaw_post('alarm_type', 40);
    $camera = mtlaw_post('camera_preparations', 40);
    $budget = mtlaw_post('budget', 40);
    $gift = mtlaw_post('gift', 40);
    $timeline = mtlaw_post('timeline', 40);
    $contact = mtlaw_post('contact_preference', 40);
    $notes = mtlaw_post('notes', 1800);
    $consent = mtlaw_post('consent', 10);

    $allowedProperty = ['new', 'renovation', 'existing', 'checking'];
    $allowedScope = ['full', 'partial', 'advice'];
    $allowedSystems = ['smart-electricity', 'audio', 'alarm', 'cameras', 'intercom'];
    $allowedAlarm = ['wired', 'wireless', 'recommend', 'none'];
    $allowedCamera = ['ready', 'partial', 'none', 'unknown'];
    $allowedBudget = ['over', 'under', 'unknown'];
    $allowedTimeline = ['now', 'quarter', 'later', 'unknown'];
    $allowedContact = ['email', 'whatsapp', 'scheduled-call'];

    if ($name === '' || $phone === '' || $consent !== 'yes') {
        throw new InvalidArgumentException('יש למלא שם, טלפון ואישור להעברת הפנייה.');
    }
    if (!in_array($property, $allowedProperty, true) || !in_array($scope, $allowedScope, true)) {
        throw new InvalidArgumentException('יש לבחור את מצב הנכס והיקף המערכת.');
    }
    $systems = array_values(array_intersect($systems, $allowedSystems));
    if ($systems === []) {
        throw new InvalidArgumentException('יש לבחור לפחות מערכת אחת.');
    }
    if (!in_array($alarm, $allowedAlarm, true)) {
        $alarm = 'none';
    }
    if (!in_array($camera, $allowedCamera, true)) {
        $camera = 'unknown';
    }
    if (!in_array($budget, $allowedBudget, true)) {
        $budget = 'unknown';
    }
    if (!in_array($timeline, $allowedTimeline, true)) {
        $timeline = 'unknown';
    }
    if (!in_array($contact, $allowedContact, true)) {
        $contact = 'email';
    }

    $turntableEligible = $budget === 'over';
    $tc4Eligible = $property === 'new' && $scope === 'full';
    if ($turntableEligible && $tc4Eligible) {
        if (!in_array($gift, ['turntable', 'tc4'], true)) {
            throw new InvalidArgumentException('יש לבחור מתנה אחת בלבד: פטיפון או TC4.');
        }
    } elseif ($turntableEligible) {
        $gift = 'turntable';
    } elseif ($tc4Eligible) {
        $gift = 'tc4';
    } else {
        $gift = 'none';
    }

    $systemLabels = array_map(static function (string $item): string {
        return mtlaw_label('system', $item);
    }, $systems);
    $messageLines = [
        'זכאות: 10% הנחה על כלל הפריטים בהצעה',
        'מצב הנכס: ' . mtlaw_label('property', $property),
        'היקף מבוקש: ' . mtlaw_label('scope', $scope),
        'מערכות: ' . implode(', ', $systemLabels),
        'סוג אזעקה: ' . mtlaw_label('alarm', $alarm),
        'הכנות למצלמות: ' . mtlaw_label('camera', $camera),
        'היקף רכישה משוער: ' . mtlaw_label('budget', $budget),
        'בחירת מתנה: ' . mtlaw_label('gift', $gift) . ' (מתנה אחת בלבד)',
        'לוח זמנים: ' . mtlaw_label('timeline', $timeline),
        'אופן קשר מועדף: ' . mtlaw_label('contact', $contact),
        'הערות: ' . ($notes !== '' ? $notes : '-'),
    ];

    $lead = [
        'name' => $name,
        'phone' => $phone,
        'email' => $user['email'],
        'contact_preference' => mtlaw_label('contact', $contact),
        'message' => implode("\n", $messageLines),
    ];

    $token = getenv('MONDAY_API_TOKEN') ?: '';
    $boardId = getenv('MONDAY_BOARD_ID') ?: MTLAW_DEFAULT_BOARD_ID;
    $groupId = getenv('MONDAY_GROUP_ID') ?: null;
    $phoneDigits = preg_replace('/\D+/', '', $phone) ?: '0';
    $itemName = trim('MT-Law, ' . $name . ', ' . mtlaw_label('scope', $scope));

    $updateBody = implode("\n", [
        '**פנייה מעמוד ההטבה המאובטח לעובדי MT-Law**',
        '',
        '* שם: ' . $name,
        '* טלפון: ' . $phone,
        '* מייל מאומת: ' . $user['email'],
        '* סוג משתמש: ' . ($user['role'] === 'staff' ? 'עובד I Feel' : 'עובד MT-Law'),
        '* אופן קשר מועדף: ' . mtlaw_label('contact', $contact),
        '* מקור: /mt-law/',
        '* נשלח: ' . gmdate('c'),
        '',
        '**פרטי הבקשה**',
        $lead['message'],
    ]);

    try {
        if ($token === '') {
            throw new RuntimeException('MONDAY_API_TOKEN is not configured');
        }
        $requiredColumns = [
            'phone' => [
                'phone' => $phoneDigits,
                'countryShortName' => 'IL',
            ],
            '_____3' => [
                'email' => $user['email'],
                'text' => $user['email'],
            ],
        ];
        $extraColumns = [
            'dropdown_mm3s443s' => ['ids' => [5]],
            'color_mm3sddjy' => ['label' => 'ליד חדש'],
            'short_textzqle0408' => 'mt-law-portal',
            'short_text99tuldfa' => 'employee-benefit',
            'short_text2l9c35ow' => 'mt-law-10-percent-2026',
        ];
        $mutation = 'mutation ($boardId: ID!, $groupId: String, $itemName: String!, $columnValues: JSON) { create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id } }';
        $variables = [
            'boardId' => $boardId,
            'groupId' => $groupId,
            'itemName' => $itemName,
            'columnValues' => json_encode(array_merge($requiredColumns, $extraColumns), JSON_UNESCAPED_UNICODE),
        ];
        try {
            $created = mtlaw_monday_request($mutation, $variables, $token);
        } catch (Throwable $columnError) {
            error_log('[i-feel mt-law] full Monday create failed, retrying required columns: ' . $columnError->getMessage());
            $variables['columnValues'] = json_encode($requiredColumns, JSON_UNESCAPED_UNICODE);
            $created = mtlaw_monday_request($mutation, $variables, $token);
        }
        $itemId = $created['data']['create_item']['id'] ?? null;
        if (!$itemId) {
            throw new RuntimeException('Monday item was not created');
        }
        mtlaw_monday_request(
            'mutation ($itemId: ID!, $body: String!) { create_update(item_id: $itemId, body: $body) { id } }',
            ['itemId' => $itemId, 'body' => $updateBody],
            $token
        );
        return 'sent';
    } catch (Throwable $error) {
        error_log('[i-feel mt-law lead] ' . $error->getMessage());
        return mtlaw_fallback_mail($lead, $error->getMessage()) ? 'sent-mail' : 'error';
    }
}

