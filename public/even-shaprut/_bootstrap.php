<?php
declare(strict_types=1);

/**
 * Secure resident access for Even Shaprut 5-7, Herzliya.
 * Resident eligibility and profile data are resolved server-side from Monday.
 */

if (!function_exists('str_starts_with')) {
    function str_starts_with(string $haystack, string $needle): bool
    {
        return $needle === '' || strncmp($haystack, $needle, strlen($needle)) === 0;
    }
}

const ESP_SESSION_NAME = 'ifeel_esp_access';
const ESP_ACCESS_TTL = 7200;
const ESP_OTP_TTL = 600;
const ESP_OTP_RESEND_SECONDS = 60;
const ESP_OTP_HOURLY_LIMIT = 5;
const ESP_CSRF_COOKIE = 'ifeel_esp_csrf';
const ESP_OTP_COOKIE = 'ifeel_esp_otp';
const ESP_ACCESS_COOKIE = 'ifeel_esp_verified';
const ESP_BASE_PATH = '/even-shaprut/';
const ESP_DEFAULT_BOARD_ID = '2732725332';
const ESP_MONDAY_GROUP_ID = 'group_mm15570j';
const ESP_MONDAY_GROUP_TITLE = 'אבן שפרוט';
const ESP_MONDAY_API_VERSION = '2026-07';
const ESP_STAFF_DOMAIN = 'i-feel.co.il';

if (is_file(dirname(__DIR__) . '/api/config.php')) {
    require_once dirname(__DIR__) . '/api/config.php';
}

function esp_is_https(): bool
{
    $https = strtolower((string) ($_SERVER['HTTPS'] ?? ''));
    $forwarded = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    return ($https !== '' && $https !== 'off') || $forwarded === 'https' || (int) ($_SERVER['SERVER_PORT'] ?? 0) === 443;
}

function esp_is_localhost(): bool
{
    $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
    return $host === 'localhost' || str_starts_with($host, 'localhost:') || str_starts_with($host, '127.0.0.1');
}

if (!esp_is_https() && !esp_is_localhost() && PHP_SAPI !== 'cli') {
    $host = preg_replace('/[^A-Za-z0-9.\-:]/', '', (string) ($_SERVER['HTTP_HOST'] ?? 'i-feel.co.il')) ?: 'i-feel.co.il';
    $uri = (string) ($_SERVER['REQUEST_URI'] ?? ESP_BASE_PATH);
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
header("Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'");

ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_samesite', 'Strict');
session_name(ESP_SESSION_NAME);
session_set_cookie_params([
    'lifetime' => 0,
    'path' => ESP_BASE_PATH,
    'secure' => esp_is_https(),
    'httponly' => true,
    'samesite' => 'Strict',
]);
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function esp_h($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function esp_strlen(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

function esp_substr(string $value, int $start, int $length): string
{
    return function_exists('mb_substr') ? mb_substr($value, $start, $length, 'UTF-8') : substr($value, $start, $length);
}

function esp_post(string $key, int $max = 4000): string
{
    $value = $_POST[$key] ?? '';
    if (is_array($value)) {
        return '';
    }
    $value = trim((string) $value);
    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value) ?? '';
    return esp_strlen($value) > $max ? esp_substr($value, 0, $max) : $value;
}

function esp_redirect(array $params = []): void
{
    $location = ESP_BASE_PATH;
    if ($params !== []) {
        $location .= '?' . http_build_query($params);
    }
    header('Location: ' . $location, true, 303);
    exit;
}

function esp_email_domain(string $email): string
{
    $email = strtolower(trim($email));
    $at = strrpos($email, '@');
    return $at === false ? '' : substr($email, $at + 1);
}

function esp_is_staff(string $email): bool
{
    return esp_email_domain($email) === ESP_STAFF_DOMAIN;
}

function esp_config_value(string $constantName, string $environmentName, string $fallback = ''): string
{
    if (defined($constantName)) {
        $value = trim((string) constant($constantName));
        if ($value !== '') {
            return $value;
        }
    }
    $environment = getenv($environmentName);
    return is_string($environment) && trim($environment) !== '' ? trim($environment) : $fallback;
}

function esp_monday_token(): string
{
    foreach ([
        ['CUSTOMER_PORTAL_MONDAY_TOKEN', 'CUSTOMER_PORTAL_MONDAY_TOKEN'],
        ['TENANT_HANDOVER_MONDAY_TOKEN', 'TENANT_HANDOVER_MONDAY_TOKEN'],
        ['MONDAY_API_TOKEN', 'MONDAY_API_TOKEN'],
    ] as $candidate) {
        $value = esp_config_value($candidate[0], $candidate[1]);
        if ($value !== '') {
            return $value;
        }
    }
    return '';
}

function esp_monday_board_id(): string
{
    foreach ([
        ['CUSTOMER_PORTAL_MONDAY_BOARD_ID', 'CUSTOMER_PORTAL_MONDAY_BOARD_ID'],
        ['TENANT_HANDOVER_MONDAY_BOARD_ID', 'TENANT_HANDOVER_MONDAY_BOARD_ID'],
        ['MONDAY_BOARD_ID', 'MONDAY_BOARD_ID'],
    ] as $candidate) {
        $value = esp_config_value($candidate[0], $candidate[1]);
        if (preg_match('/\A\d{1,20}\z/D', $value) === 1) {
            return $value;
        }
    }
    return ESP_DEFAULT_BOARD_ID;
}

function esp_monday_request(string $query, array $variables): array
{
    $token = esp_monday_token();
    if ($token === '') {
        throw new RuntimeException('חיבור Monday לאזור הדיירים טרם הוגדר בשרת.');
    }
    if (!function_exists('curl_init')) {
        throw new RuntimeException('השרת אינו כולל כרגע תמיכה בחיבור המאובטח ל-Monday.');
    }
    $payload = json_encode(['query' => $query, 'variables' => $variables], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($payload === false) {
        throw new RuntimeException('לא ניתן להכין את בקשת Monday.');
    }
    $ch = curl_init('https://api.monday.com/v2');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: ' . $token,
            'Content-Type: application/json',
            'API-Version: ' . ESP_MONDAY_API_VERSION,
        ],
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 12,
    ]);
    $body = curl_exec($ch);
    $error = curl_error($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($body === false || $error !== '' || $status < 200 || $status >= 300) {
        error_log('[i-feel even-shaprut] monday_transport_failed status=' . $status);
        throw new RuntimeException('לא ניתן לאמת כרגע את הכתובת מול Monday. נסו שוב בעוד רגע.');
    }
    $decoded = json_decode($body, true);
    if (!is_array($decoded) || isset($decoded['errors'])) {
        error_log('[i-feel even-shaprut] monday_graphql_failed');
        throw new RuntimeException('Monday החזיר תשובה לא תקינה. לא נשלח קוד כניסה.');
    }
    return $decoded;
}

function esp_item_columns(array $item): array
{
    $columns = [];
    foreach (($item['column_values'] ?? []) as $column) {
        if (is_array($column) && is_string($column['id'] ?? null)) {
            $columns[$column['id']] = $column;
        }
    }
    return $columns;
}

function esp_column_email(array $column): string
{
    $candidates = [(string) ($column['text'] ?? '')];
    $decoded = json_decode((string) ($column['value'] ?? ''), true);
    if (is_array($decoded)) {
        $candidates[] = (string) ($decoded['email'] ?? '');
        $candidates[] = (string) ($decoded['text'] ?? '');
    }
    foreach ($candidates as $candidate) {
        $candidate = strtolower(trim($candidate));
        if (filter_var($candidate, FILTER_VALIDATE_EMAIL)) {
            return $candidate;
        }
    }
    return '';
}

function esp_profile_from_item(array $item, string $email): array
{
    $columns = esp_item_columns($item);
    $apartment = trim((string) ($columns['numbers21']['text'] ?? ''));
    $building = trim((string) ($columns['text8']['text'] ?? ''));
    $location = trim((string) ($columns['location7']['text'] ?? ''));
    return [
        'email' => $email,
        'role' => 'resident',
        'name' => esp_substr(trim((string) ($item['name'] ?? '')), 0, 120),
        'building' => esp_substr($building, 0, 80),
        'apartment' => esp_substr($apartment, 0, 20),
        'location' => esp_substr($location, 0, 180),
        'monday_item_id' => preg_match('/\A\d{1,20}\z/D', (string) ($item['id'] ?? '')) === 1 ? (string) $item['id'] : '',
    ];
}

function esp_resident_profile(string $email): ?array
{
    static $cache = [];
    $email = strtolower(trim($email));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return null;
    }
    if (esp_is_staff($email)) {
        return [
            'email' => $email,
            'role' => 'staff',
            'name' => '',
            'building' => '',
            'apartment' => '',
            'location' => '',
            'monday_item_id' => '',
        ];
    }
    if (array_key_exists($email, $cache)) {
        return $cache[$email];
    }

    $query = <<<'GRAPHQL'
query EvenShaprutResidents($boardIds: [ID!], $groupIds: [String]) {
  boards(ids: $boardIds) {
    groups(ids: $groupIds) {
      id
      title
      items_page(limit: 500) {
        cursor
        items {
          id
          name
          column_values(ids: ["numbers21", "text8", "_____3", "location7"]) { id text value }
        }
      }
    }
  }
}
GRAPHQL;
    $response = esp_monday_request($query, [
        'boardIds' => [esp_monday_board_id()],
        'groupIds' => [ESP_MONDAY_GROUP_ID],
    ]);
    $groups = $response['data']['boards'][0]['groups'] ?? null;
    if (!is_array($groups) || count($groups) !== 1 || (string) ($groups[0]['id'] ?? '') !== ESP_MONDAY_GROUP_ID) {
        throw new RuntimeException('קבוצת אבן שפרוט לא נמצאה ב-Monday. לא נשלח קוד כניסה.');
    }
    $page = is_array($groups[0]['items_page'] ?? null) ? $groups[0]['items_page'] : [];
    $items = is_array($page['items'] ?? null) ? $page['items'] : [];
    $cursor = is_string($page['cursor'] ?? null) ? $page['cursor'] : null;
    $pages = 1;
    while ($cursor !== null && $cursor !== '' && $pages < 10) {
        $next = esp_monday_request(
            'query EvenShaprutResidentsNext($cursor: String!) { next_items_page(limit: 500, cursor: $cursor) { cursor items { id name column_values(ids: ["numbers21", "text8", "_____3", "location7"]) { id text value } } } }',
            ['cursor' => $cursor]
        );
        $nextPage = $next['data']['next_items_page'] ?? null;
        if (!is_array($nextPage)) {
            break;
        }
        $items = array_merge($items, is_array($nextPage['items'] ?? null) ? $nextPage['items'] : []);
        $cursor = is_string($nextPage['cursor'] ?? null) ? $nextPage['cursor'] : null;
        $pages++;
    }
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $columns = esp_item_columns($item);
        if (esp_column_email(is_array($columns['_____3'] ?? null) ? $columns['_____3'] : []) === $email) {
            $cache[$email] = esp_profile_from_item($item, $email);
            return $cache[$email];
        }
    }
    $cache[$email] = null;
    return null;
}

function esp_valid_token(string $token): bool
{
    return preg_match('/\A[a-f0-9]{48}\z/D', $token) === 1;
}

function esp_ticket_path(string $kind, string $ticketId): string
{
    if (!in_array($kind, ['otp', 'access'], true) || !esp_valid_token($ticketId)) {
        return '';
    }
    return rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'ifeel-esp-' . $kind . '-' . $ticketId . '.json';
}

function esp_write_ticket(string $kind, string $ticketId, array $state): bool
{
    $path = esp_ticket_path($kind, $ticketId);
    $json = $path === '' ? false : json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || @file_put_contents($path, $json, LOCK_EX) === false) {
        return false;
    }
    @chmod($path, 0600);
    return true;
}

function esp_read_ticket(string $kind, string $ticketId): ?array
{
    $path = esp_ticket_path($kind, $ticketId);
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

function esp_delete_ticket(string $kind, string $ticketId): void
{
    $path = esp_ticket_path($kind, $ticketId);
    if ($path !== '') {
        @unlink($path);
    }
}

function esp_set_private_cookie(string $name, string $value, int $expires = 0): void
{
    if (headers_sent()) {
        return;
    }
    $secure = esp_is_https() ? '; Secure' : '';
    $expiration = '';
    if ($expires > 0) {
        $expiration = '; Expires=' . gmdate('D, d M Y H:i:s', $expires) . ' GMT; Max-Age=' . max(0, $expires - time());
    } elseif ($expires < 0) {
        $expiration = '; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0';
    }
    header('Set-Cookie: ' . $name . '=' . rawurlencode($value) . $expiration . '; Path=' . ESP_BASE_PATH . '; HttpOnly; SameSite=Strict' . $secure, false);
    if ($expires < 0) {
        unset($_COOKIE[$name]);
    } else {
        $_COOKIE[$name] = $value;
    }
}

function esp_csrf_token(): string
{
    $token = is_string($_SESSION['esp_csrf'] ?? null) ? (string) $_SESSION['esp_csrf'] : '';
    if (!esp_valid_token($token)) {
        $token = bin2hex(random_bytes(24));
        $_SESSION['esp_csrf'] = $token;
    }
    $cookie = is_string($_COOKIE[ESP_CSRF_COOKIE] ?? null) ? (string) $_COOKIE[ESP_CSRF_COOKIE] : '';
    if (!esp_valid_token($cookie) || !hash_equals($token, $cookie)) {
        esp_set_private_cookie(ESP_CSRF_COOKIE, $token);
    }
    return $token;
}

function esp_verify_csrf(): void
{
    $posted = esp_post('csrf', 100);
    $session = (string) ($_SESSION['esp_csrf'] ?? '');
    $cookie = (string) ($_COOKIE[ESP_CSRF_COOKIE] ?? '');
    $valid = esp_valid_token($posted)
        && ((esp_valid_token($session) && hash_equals($session, $posted)) || (esp_valid_token($cookie) && hash_equals($cookie, $posted)));
    if (!$valid) {
        throw new RuntimeException('הטופס פג תוקף. יש לרענן את העמוד ולנסות שוב.');
    }
}

function esp_ticket_from_cookie(string $kind, string $cookieName): ?array
{
    $ticketId = is_string($_COOKIE[$cookieName] ?? null) ? (string) $_COOKIE[$cookieName] : '';
    if (!esp_valid_token($ticketId)) {
        return null;
    }
    $state = esp_read_ticket($kind, $ticketId);
    if ($state === null) {
        esp_set_private_cookie($cookieName, '', -1);
        return null;
    }
    return ['id' => $ticketId, 'state' => $state];
}

function esp_clear_ticket(string $kind, string $cookieName): void
{
    $ticketId = is_string($_COOKIE[$cookieName] ?? null) ? (string) $_COOKIE[$cookieName] : '';
    if (esp_valid_token($ticketId)) {
        esp_delete_ticket($kind, $ticketId);
    }
    esp_set_private_cookie($cookieName, '', -1);
}

function esp_rate_file(string $email): string
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    return rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'ifeel-esp-rate-' . hash('sha256', $ip . '|' . strtolower($email)) . '.json';
}

function esp_allow_code_send(string $email): bool
{
    $now = time();
    $lastSend = (int) ($_SESSION['esp_otp_sent_at'] ?? 0);
    if ($lastSend > 0 && ($now - $lastSend) < ESP_OTP_RESEND_SECONDS) {
        return false;
    }
    $path = esp_rate_file($email);
    $timestamps = [];
    if (is_file($path)) {
        $decoded = json_decode((string) @file_get_contents($path), true);
        foreach (is_array($decoded) ? $decoded : [] as $timestamp) {
            if ((int) $timestamp >= ($now - 3600)) {
                $timestamps[] = (int) $timestamp;
            }
        }
    }
    if (count($timestamps) >= ESP_OTP_HOURLY_LIMIT) {
        return false;
    }
    $timestamps[] = $now;
    @file_put_contents($path, json_encode($timestamps), LOCK_EX);
    return true;
}

function esp_send_code(array $profile): bool
{
    $email = strtolower(trim((string) ($profile['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !esp_allow_code_send($email)) {
        return false;
    }
    $ticketId = bin2hex(random_bytes(24));
    $code = (string) random_int(100000, 999999);
    $now = time();
    $state = [
        'email' => $email,
        'profile' => $profile,
        'hash' => hash('sha256', $code . '|' . $ticketId),
        'attempts' => 0,
        'sent_at' => $now,
        'expires' => $now + ESP_OTP_TTL,
    ];
    if (!esp_write_ticket('otp', $ticketId, $state)) {
        throw new RuntimeException('לא ניתן ליצור קוד כניסה כרגע.');
    }
    esp_set_private_cookie(ESP_OTP_COOKIE, $ticketId, $state['expires']);
    $_SESSION['esp_otp_sent_at'] = $now;

    $subjectText = 'קוד כניסה לאזור דיירי אבן שפרוט, הרצליה';
    $subject = '=?UTF-8?B?' . base64_encode($subjectText) . '?=';
    $body = "שלום,\n\nקוד הכניסה שלך לאזור הדיירים של אבן שפרוט 5-7, הרצליה הוא: {$code}\n\nהקוד תקף ל-10 דקות ולשימוש חד פעמי.\nאם לא ביקשת את הקוד, אפשר להתעלם מהודעה זו.\n\nI Feel מערכות בע\"מ\nמשרד 03-508-9553";
    $headers = [
        'From: I Feel Smart Home <no-reply@i-feel.co.il>',
        'Reply-To: myhome@i-feel.co.il',
        'Content-Type: text/plain; charset=UTF-8',
        'X-Auto-Response-Suppress: All',
    ];
    $sent = @mail($email, $subject, $body, implode("\r\n", $headers));
    if (!$sent) {
        esp_clear_ticket('otp', ESP_OTP_COOKIE);
    }
    return $sent;
}

function esp_pending_email(): string
{
    $ticket = esp_ticket_from_cookie('otp', ESP_OTP_COOKIE);
    return $ticket === null ? '' : strtolower(trim((string) ($ticket['state']['email'] ?? '')));
}

function esp_verify_code(string $code): bool
{
    $ticket = esp_ticket_from_cookie('otp', ESP_OTP_COOKIE);
    if ($ticket === null) {
        return false;
    }
    $code = preg_replace('/\D+/', '', $code) ?? '';
    $attempts = (int) ($ticket['state']['attempts'] ?? 0);
    if ($code === '' || $attempts >= 5) {
        return false;
    }
    $ticket['state']['attempts'] = $attempts + 1;
    esp_write_ticket('otp', $ticket['id'], $ticket['state']);
    if (!hash_equals((string) ($ticket['state']['hash'] ?? ''), hash('sha256', $code . '|' . $ticket['id']))) {
        return false;
    }
    $profile = is_array($ticket['state']['profile'] ?? null) ? $ticket['state']['profile'] : [];
    $email = strtolower(trim((string) ($profile['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return false;
    }
    $accessId = bin2hex(random_bytes(24));
    $now = time();
    if (!esp_write_ticket('access', $accessId, [
        'email' => $email,
        'profile' => $profile,
        'verified_at' => $now,
        'last_activity' => $now,
        'expires' => $now + ESP_ACCESS_TTL,
    ])) {
        return false;
    }
    session_regenerate_id(true);
    $_SESSION['esp_access_id'] = $accessId;
    esp_set_private_cookie(ESP_ACCESS_COOKIE, $accessId, $now + ESP_ACCESS_TTL);
    esp_clear_ticket('otp', ESP_OTP_COOKIE);
    return true;
}

function esp_current_user(): ?array
{
    $ticket = esp_ticket_from_cookie('access', ESP_ACCESS_COOKIE);
    if ($ticket === null) {
        return null;
    }
    $state = $ticket['state'];
    $now = time();
    if ((int) ($state['last_activity'] ?? 0) > 0 && ($now - (int) $state['last_activity']) > ESP_ACCESS_TTL) {
        esp_logout();
        return null;
    }
    $profile = is_array($state['profile'] ?? null) ? $state['profile'] : [];
    $email = strtolower(trim((string) ($profile['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        esp_logout();
        return null;
    }
    $state['last_activity'] = $now;
    $state['expires'] = $now + ESP_ACCESS_TTL;
    if (esp_write_ticket('access', $ticket['id'], $state)) {
        esp_set_private_cookie(ESP_ACCESS_COOKIE, $ticket['id'], $state['expires']);
    }
    return $profile;
}

function esp_logout(): void
{
    esp_clear_ticket('otp', ESP_OTP_COOKIE);
    esp_clear_ticket('access', ESP_ACCESS_COOKIE);
    foreach (array_keys($_SESSION) as $key) {
        if (str_starts_with((string) $key, 'esp_')) {
            unset($_SESSION[$key]);
        }
    }
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_regenerate_id(true);
    }
}
