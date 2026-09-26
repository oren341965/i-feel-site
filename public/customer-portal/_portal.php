<?php
declare(strict_types=1);

if (!function_exists('str_starts_with')) {
    function str_starts_with(string $haystack, string $needle): bool
    {
        return $needle === '' || strncmp($haystack, $needle, strlen($needle)) === 0;
    }
}

/**
 * Secure I Feel customer portal foundation.
 * Customer identity is verified by email OTP and customer eligibility is
 * resolved server-side from Monday board 2732725332.
 */

const CP_SESSION_NAME = 'ifeel_customer_portal';
const CP_ACCESS_TTL = 7200;
const CP_OTP_TTL = 600;
const CP_OTP_RESEND_SECONDS = 60;
const CP_OTP_HOURLY_LIMIT = 5;
const CP_CSRF_COOKIE = 'ifeel_cp_csrf';
const CP_OTP_COOKIE = 'ifeel_cp_otp';
const CP_ACCESS_COOKIE = 'ifeel_cp_verified';
const CP_BASE_PATH = '/customer-portal/';
const CP_DEFAULT_BOARD_ID = '2732725332';
const CP_MONDAY_API_VERSION = '2026-07';

if (is_file(dirname(__DIR__) . '/api/config.php')) {
    require_once dirname(__DIR__) . '/api/config.php';
}

function cp_is_https(): bool
{
    $https = strtolower((string) ($_SERVER['HTTPS'] ?? ''));
    $forwarded = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    return ($https !== '' && $https !== 'off') || $forwarded === 'https' || (int) ($_SERVER['SERVER_PORT'] ?? 0) === 443;
}

function cp_is_localhost(): bool
{
    $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
    return $host === 'localhost' || str_starts_with($host, 'localhost:') || str_starts_with($host, '127.0.0.1');
}

if (!cp_is_https() && !cp_is_localhost() && PHP_SAPI !== 'cli') {
    $host = preg_replace('/[^A-Za-z0-9.\-:]/', '', (string) ($_SERVER['HTTP_HOST'] ?? 'i-feel.co.il')) ?: 'i-feel.co.il';
    $uri = (string) ($_SERVER['REQUEST_URI'] ?? CP_BASE_PATH . 'index.php');
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
session_name(CP_SESSION_NAME);
session_set_cookie_params([
    'lifetime' => 0,
    'path' => CP_BASE_PATH,
    'secure' => cp_is_https(),
    'httponly' => true,
    'samesite' => 'Strict',
]);
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function cp_h($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function cp_post(string $key, int $max = 4000): string
{
    $value = $_POST[$key] ?? '';
    if (is_array($value)) {
        return '';
    }
    $value = trim((string) $value);
    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value) ?? '';
    if (function_exists('mb_strlen') && mb_strlen($value, 'UTF-8') > $max) {
        $value = mb_substr($value, 0, $max, 'UTF-8');
    } elseif (strlen($value) > $max) {
        $value = substr($value, 0, $max);
    }
    return $value;
}

function cp_config_value(string $constantName, string $environmentName, string $fallback = ''): string
{
    if (defined($constantName)) {
        $value = trim((string) constant($constantName));
        if ($value !== '') return $value;
    }
    $value = getenv($environmentName);
    return is_string($value) && trim($value) !== '' ? trim($value) : $fallback;
}

function cp_monday_token(): string
{
    return cp_config_value('CUSTOMER_PORTAL_MONDAY_TOKEN', 'CUSTOMER_PORTAL_MONDAY_TOKEN',
        cp_config_value('MONDAY_API_TOKEN', 'MONDAY_API_TOKEN'));
}

function cp_monday_board_id(): string
{
    $value = cp_config_value('CUSTOMER_PORTAL_MONDAY_BOARD_ID', 'CUSTOMER_PORTAL_MONDAY_BOARD_ID',
        cp_config_value('MONDAY_BOARD_ID', 'MONDAY_BOARD_ID', CP_DEFAULT_BOARD_ID));
    return preg_match('/\A\d{1,20}\z/D', $value) === 1 ? $value : CP_DEFAULT_BOARD_ID;
}

function cp_monday_request(string $query, array $variables): array
{
    $token = cp_monday_token();
    if ($token === '' || !function_exists('curl_init')) {
        throw new RuntimeException('חיבור Monday לפורטל הלקוחות עדיין אינו זמין.');
    }
    $payload = json_encode(['query' => $query, 'variables' => $variables], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($payload === false) throw new RuntimeException('לא ניתן להכין את בקשת Monday.');

    $ch = curl_init('https://api.monday.com/v2');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: ' . $token,
            'Content-Type: application/json',
            'API-Version: ' . CP_MONDAY_API_VERSION,
        ],
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
    ]);
    $body = curl_exec($ch);
    $error = curl_error($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($body === false || $error !== '' || $status < 200 || $status >= 300) {
        error_log('[i-feel customer portal] monday_transport_failed status=' . $status);
        throw new RuntimeException('לא ניתן לאמת כרגע את הלקוח מול Monday.');
    }
    $decoded = json_decode($body, true);
    if (!is_array($decoded) || isset($decoded['errors'])) {
        error_log('[i-feel customer portal] monday_graphql_failed');
        throw new RuntimeException('Monday החזיר תשובה לא תקינה.');
    }
    return $decoded;
}

function cp_columns(array $item): array
{
    $out = [];
    foreach (($item['column_values'] ?? []) as $column) {
        if (is_array($column) && is_string($column['id'] ?? null)) $out[$column['id']] = $column;
    }
    return $out;
}

function cp_email_from_column(array $column): string
{
    $candidates = [(string) ($column['text'] ?? '')];
    $decoded = json_decode((string) ($column['value'] ?? ''), true);
    if (is_array($decoded)) {
        $candidates[] = (string) ($decoded['email'] ?? '');
        $candidates[] = (string) ($decoded['text'] ?? '');
    }
    foreach ($candidates as $candidate) {
        $candidate = strtolower(trim($candidate));
        if (filter_var($candidate, FILTER_VALIDATE_EMAIL)) return $candidate;
    }
    return '';
}

function cp_profile_from_item(array $item, string $email): array
{
    $columns = cp_columns($item);
    $serviceText = trim((string) ($columns['color_mm5271fc']['text'] ?? ''));
    $category = trim((string) ($columns['dropdown5']['text'] ?? ''));
    $basicSystem = trim((string) ($columns['long_text9']['text'] ?? ''));
    $accountingKey = trim((string) ($columns['______9']['text'] ?? ''));
    $phone = trim((string) ($columns['phone']['text'] ?? ''));
    $address = trim((string) ($columns['location7']['text'] ?? ''));

    return [
        'email' => $email,
        'name' => trim((string) ($item['name'] ?? '')),
        'monday_item_id' => preg_match('/\A\d{1,20}\z/D', (string) ($item['id'] ?? '')) === 1 ? (string) $item['id'] : '',
        'service_agreement' => $serviceText === 'כן',
        'service_agreement_label' => $serviceText !== '' ? $serviceText : 'לא הוגדר',
        'category' => $category,
        'basic_system' => $basicSystem,
        'accounting_key' => $accountingKey,
        'phone' => $phone,
        'address' => $address,
    ];
}

function cp_customer_profile(string $email): ?array
{
    $email = strtolower(trim($email));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return null;

    $query = <<<'GRAPHQL'
query CustomerPortalCustomerByEmail($boardId: ID!, $email: String!) {
  items_page_by_column_values(
    board_id: $boardId
    limit: 10
    columns: [{column_id: "_____3", column_values: [$email]}]
  ) {
    items {
      id
      name
      column_values(ids: ["_____3", "phone", "location7", "color_mm5271fc", "dropdown5", "long_text9", "______9"]) { id text value }
    }
  }
}
GRAPHQL;
    $response = cp_monday_request($query, ['boardId' => cp_monday_board_id(), 'email' => $email]);
    $page = $response['data']['items_page_by_column_values'] ?? null;
    if (!is_array($page)) return null;
    $items = is_array($page['items'] ?? null) ? $page['items'] : [];

    $matches = [];
    foreach ($items as $item) {
        if (!is_array($item)) continue;
        $columns = cp_columns($item);
        $itemEmail = cp_email_from_column(is_array($columns['_____3'] ?? null) ? $columns['_____3'] : []);
        if ($itemEmail === $email) $matches[] = $item;
    }

    if (count($matches) !== 1) {
        if (count($matches) > 1) {
            error_log('[i-feel customer portal] ambiguous_customer_email matches=' . count($matches));
        }
        return null;
    }

    return cp_profile_from_item($matches[0], $email);
}

function cp_valid_token(string $token): bool
{
    return preg_match('/\A[a-f0-9]{48}\z/D', $token) === 1;
}

function cp_ticket_path(string $kind, string $id): string
{
    if (!in_array($kind, ['otp', 'access'], true) || !cp_valid_token($id)) return '';
    return rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'ifeel-cp-' . $kind . '-' . $id . '.json';
}

function cp_write_ticket(string $kind, string $id, array $state): bool
{
    $path = cp_ticket_path($kind, $id);
    $json = $path === '' ? false : json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || @file_put_contents($path, $json, LOCK_EX) === false) return false;
    @chmod($path, 0600);
    return true;
}

function cp_read_ticket(string $kind, string $id): ?array
{
    $path = cp_ticket_path($kind, $id);
    if ($path === '' || !is_file($path)) return null;
    $raw = @file_get_contents($path);
    $state = $raw === false ? null : json_decode($raw, true);
    if (!is_array($state) || (int) ($state['expires'] ?? 0) < time()) {
        @unlink($path);
        return null;
    }
    return $state;
}

function cp_delete_ticket(string $kind, string $id): void
{
    $path = cp_ticket_path($kind, $id);
    if ($path !== '') @unlink($path);
}

function cp_set_cookie(string $name, string $value, int $expires = 0): void
{
    if (headers_sent()) return;
    $secure = cp_is_https() ? '; Secure' : '';
    $expiration = $expires > 0
        ? '; Expires=' . gmdate('D, d M Y H:i:s', $expires) . ' GMT; Max-Age=' . max(0, $expires - time())
        : ($expires < 0 ? '; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0' : '');
    header('Set-Cookie: ' . $name . '=' . rawurlencode($value) . $expiration . '; Path=' . CP_BASE_PATH . '; HttpOnly; SameSite=Strict' . $secure, false);
    if ($expires < 0) unset($_COOKIE[$name]); else $_COOKIE[$name] = $value;
}

function cp_csrf_token(): string
{
    $token = is_string($_SESSION['cp_csrf'] ?? null) ? (string) $_SESSION['cp_csrf'] : '';
    if (!cp_valid_token($token)) {
        $token = bin2hex(random_bytes(24));
        $_SESSION['cp_csrf'] = $token;
    }
    $cookie = is_string($_COOKIE[CP_CSRF_COOKIE] ?? null) ? (string) $_COOKIE[CP_CSRF_COOKIE] : '';
    if (!cp_valid_token($cookie) || !hash_equals($token, $cookie)) cp_set_cookie(CP_CSRF_COOKIE, $token);
    return $token;
}

function cp_verify_csrf(): void
{
    $posted = cp_post('csrf', 100);
    $session = (string) ($_SESSION['cp_csrf'] ?? '');
    $cookie = (string) ($_COOKIE[CP_CSRF_COOKIE] ?? '');
    if (!cp_valid_token($posted) || !((cp_valid_token($session) && hash_equals($session, $posted)) || (cp_valid_token($cookie) && hash_equals($cookie, $posted)))) {
        throw new RuntimeException('הטופס פג תוקף. יש לרענן ולנסות שוב.');
    }
}

function cp_ticket_from_cookie(string $kind, string $cookieName): ?array
{
    $id = is_string($_COOKIE[$cookieName] ?? null) ? (string) $_COOKIE[$cookieName] : '';
    if (!cp_valid_token($id)) return null;
    $state = cp_read_ticket($kind, $id);
    if ($state === null) {
        cp_set_cookie($cookieName, '', -1);
        return null;
    }
    return ['id' => $id, 'state' => $state];
}

function cp_clear_ticket(string $kind, string $cookieName): void
{
    $id = is_string($_COOKIE[$cookieName] ?? null) ? (string) $_COOKIE[$cookieName] : '';
    if (cp_valid_token($id)) cp_delete_ticket($kind, $id);
    cp_set_cookie($cookieName, '', -1);
}

function cp_rate_file(string $email): string
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    return rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'ifeel-cp-rate-' . hash('sha256', $ip . '|' . strtolower($email)) . '.json';
}

function cp_allow_code_send(string $email): bool
{
    $now = time();
    $last = (int) ($_SESSION['cp_otp_sent_at'] ?? 0);
    if ($last > 0 && ($now - $last) < CP_OTP_RESEND_SECONDS) return false;
    $path = cp_rate_file($email);
    $timestamps = [];
    if (is_file($path)) {
        $decoded = json_decode((string) @file_get_contents($path), true);
        foreach (is_array($decoded) ? $decoded : [] as $timestamp) {
            if ((int) $timestamp >= ($now - 3600)) $timestamps[] = (int) $timestamp;
        }
    }
    if (count($timestamps) >= CP_OTP_HOURLY_LIMIT) return false;
    $timestamps[] = $now;
    @file_put_contents($path, json_encode($timestamps), LOCK_EX);
    return true;
}

function cp_send_code(array $profile): bool
{
    $email = strtolower(trim((string) ($profile['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !cp_allow_code_send($email)) return false;

    $ticketId = bin2hex(random_bytes(24));
    $code = (string) random_int(100000, 999999);
    $now = time();
    $state = [
        'email' => $email,
        'profile' => $profile,
        'hash' => hash('sha256', $code . '|' . $ticketId),
        'attempts' => 0,
        'sent_at' => $now,
        'expires' => $now + CP_OTP_TTL,
    ];
    if (!cp_write_ticket('otp', $ticketId, $state)) throw new RuntimeException('לא ניתן ליצור קוד כניסה כרגע.');
    cp_set_cookie(CP_OTP_COOKIE, $ticketId, $state['expires']);
    $_SESSION['cp_otp_sent_at'] = $now;

    $subjectText = 'קוד כניסה לאזור הלקוחות של I Feel';
    $subject = '=?UTF-8?B?' . base64_encode($subjectText) . '?=';
    $body = "שלום,\n\nקוד הכניסה שלך לאזור הלקוחות של I Feel הוא: {$code}\n\nהקוד תקף ל-10 דקות ולשימוש חד פעמי.\nאם לא ביקשת את הקוד, אפשר להתעלם מהודעה זו.\n\nI Feel מערכות בע\"מ\n03-508-9553";
    $headers = [
        'From: I Feel Smart Home <no-reply@i-feel.co.il>',
        'Reply-To: support@i-feel.co.il',
        'Content-Type: text/plain; charset=UTF-8',
        'X-Auto-Response-Suppress: All',
    ];
    $sent = @mail($email, $subject, $body, implode("\r\n", $headers));
    if (!$sent) cp_clear_ticket('otp', CP_OTP_COOKIE);
    return $sent;
}


function cp_issue_decoy_code(string $email): bool
{
    $email = strtolower(trim($email));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !cp_allow_code_send($email)) return false;

    $ticketId = bin2hex(random_bytes(24));
    $now = time();
    $state = [
        'email' => $email,
        'profile' => [],
        'hash' => hash('sha256', bin2hex(random_bytes(32)) . '|' . $ticketId),
        'attempts' => 0,
        'sent_at' => $now,
        'expires' => $now + CP_OTP_TTL,
        'decoy' => true,
    ];
    if (!cp_write_ticket('otp', $ticketId, $state)) return false;
    cp_set_cookie(CP_OTP_COOKIE, $ticketId, $state['expires']);
    $_SESSION['cp_otp_sent_at'] = $now;
    return true;
}

function cp_pending_email(): string
{
    $ticket = cp_ticket_from_cookie('otp', CP_OTP_COOKIE);
    return $ticket === null ? '' : strtolower(trim((string) ($ticket['state']['email'] ?? '')));
}

function cp_verify_code(string $code): bool
{
    $ticket = cp_ticket_from_cookie('otp', CP_OTP_COOKIE);
    if ($ticket === null) return false;
    $code = preg_replace('/\D+/', '', $code) ?? '';
    $attempts = (int) ($ticket['state']['attempts'] ?? 0);
    if ($code === '' || $attempts >= 5) return false;
    $ticket['state']['attempts'] = $attempts + 1;
    cp_write_ticket('otp', $ticket['id'], $ticket['state']);
    if (!hash_equals((string) ($ticket['state']['hash'] ?? ''), hash('sha256', $code . '|' . $ticket['id']))) return false;

    $profile = is_array($ticket['state']['profile'] ?? null) ? $ticket['state']['profile'] : [];
    if (!filter_var((string) ($profile['email'] ?? ''), FILTER_VALIDATE_EMAIL)) return false;

    $accessId = bin2hex(random_bytes(24));
    $now = time();
    if (!cp_write_ticket('access', $accessId, [
        'profile' => $profile,
        'verified_at' => $now,
        'last_activity' => $now,
        'expires' => $now + CP_ACCESS_TTL,
    ])) return false;

    session_regenerate_id(true);
    $_SESSION['cp_access_id'] = $accessId;
    cp_set_cookie(CP_ACCESS_COOKIE, $accessId, $now + CP_ACCESS_TTL);
    cp_clear_ticket('otp', CP_OTP_COOKIE);
    return true;
}

function cp_current_user(): ?array
{
    $ticket = cp_ticket_from_cookie('access', CP_ACCESS_COOKIE);
    if ($ticket === null) return null;
    $state = $ticket['state'];
    $now = time();
    if ((int) ($state['last_activity'] ?? 0) > 0 && ($now - (int) $state['last_activity']) > CP_ACCESS_TTL) {
        cp_logout();
        return null;
    }
    $profile = is_array($state['profile'] ?? null) ? $state['profile'] : [];
    if (!filter_var((string) ($profile['email'] ?? ''), FILTER_VALIDATE_EMAIL)) {
        cp_logout();
        return null;
    }
    $state['last_activity'] = $now;
    $state['expires'] = $now + CP_ACCESS_TTL;
    if (cp_write_ticket('access', $ticket['id'], $state)) cp_set_cookie(CP_ACCESS_COOKIE, $ticket['id'], $state['expires']);
    return $profile;
}

function cp_logout(): void
{
    cp_clear_ticket('otp', CP_OTP_COOKIE);
    cp_clear_ticket('access', CP_ACCESS_COOKIE);
    foreach (array_keys($_SESSION) as $key) {
        if (str_starts_with((string) $key, 'cp_')) unset($_SESSION[$key]);
    }
    if (session_status() === PHP_SESSION_ACTIVE) session_regenerate_id(true);
}

function cp_eligible_products(array $profile): array
{
    if (empty($profile['service_agreement'])) {
        return [];
    }

    return [
        [
            'id' => 'initial-phone-support',
            'name' => 'תמיכה טלפונית ראשונית',
            'category' => 'שירות',
            'status' => 'included',
            'price' => 0,
            'currency' => 'ILS',
            'priceLabel' => 'כלול בהסכם',
            'notes' => 'כולל פתיחת קריאת שירות והכוונה ראשונית. אינו כולל עבודות תכנות, שינויי מערכת, שדרוגים או הדרכה מלאה.',
        ],
        [
            'id' => 'technician-hour',
            'name' => 'ביקור טכנאי',
            'category' => 'שירות',
            'status' => 'eligible',
            'price' => 250,
            'currency' => 'ILS',
            'unit' => 'hour',
            'priceLabel' => '250 ₪ לשעה',
            'notes' => 'הגעה לאחר ניסיון אבחון ראשוני מרחוק, ובהתאם לזמינות ולתנאי ההסכם.',
        ],
        [
            'id' => 'agreement-product-discount',
            'name' => 'רכישת מוצרים בהנחת הסכם',
            'category' => 'מוצרים',
            'status' => 'eligible',
            'discountPercent' => 50,
            'priceLabel' => '50% הנחה מהמחירון הרשמי',
            'notes' => 'ההנחה חלה על מוצרים מול המחירון הרשמי של החברה. שירותי ענן, מנויים, רישיונות ושירותי צד שלישי אינם כלולים.',
        ],
    ];
}

function cp_service_agreement_terms(array $profile): array
{
    if (empty($profile['service_agreement'])) {
        return [
            'active' => false,
            'agreementUrl' => 'https://i-feel.co.il/service-agreement-private/',
        ];
    }

    return [
        'active' => true,
        'monthlyPrice' => 50,
        'monthlyPriceCurrency' => 'ILS',
        'technicianHourlyPrice' => 250,
        'technicianHourlyPriceCurrency' => 'ILS',
        'productDiscountPercent' => 50,
        'commitmentMonths' => 36,
        'agreementUrl' => 'https://i-feel.co.il/service-agreement-private/',
        'exclusions' => [
            'cloud services',
            'subscriptions',
            'software licenses',
            'third-party services',
            'programming changes',
            'system upgrades',
            'items not supplied or connected by I Feel',
        ],
    ];
}
