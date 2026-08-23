<?php
declare(strict_types=1);

if (!function_exists('str_starts_with')) {
    function str_starts_with(string $haystack, string $needle): bool
    {
        return $needle === '' || substr($haystack, 0, strlen($needle)) === $needle;
    }
}

if (!function_exists('str_contains')) {
    function str_contains(string $haystack, string $needle): bool
    {
        return $needle === '' || strpos($haystack, $needle) !== false;
    }
}

const IFEEL_PORTAL_VERSION = '1.7.0';
const IFEEL_PORTAL_SESSION = 'ifeel_staff_expenses';
const IFEEL_PORTAL_IDLE_TIMEOUT = 3600;
const IFEEL_PORTAL_MAX_FILES = 20;
const IFEEL_PORTAL_MAX_FILE_BYTES = 12 * 1024 * 1024;
const IFEEL_PORTAL_MAX_TOTAL_BYTES = 60 * 1024 * 1024;

// Load the existing server-only configuration file when it exists.
// This file is intentionally not committed to GitHub.
$serverConfig = dirname(__DIR__) . '/api/config.php';
if (is_file($serverConfig)) {
    require_once $serverConfig;
}

function portal_is_https(): bool
{
    $https = strtolower((string) ($_SERVER['HTTPS'] ?? ''));
    $forwarded = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    return ($https !== '' && $https !== 'off') || $forwarded === 'https' || (int) ($_SERVER['SERVER_PORT'] ?? 0) === 443;
}

function portal_is_localhost(): bool
{
    $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
    return $host === 'localhost' || str_starts_with($host, 'localhost:') || str_starts_with($host, '127.0.0.1');
}

function portal_cookie_secure(): bool
{
    if (portal_is_localhost()) {
        return false;
    }
    if (defined('EXPENSE_PORTAL_SECURE_COOKIES')) {
        return (bool) constant('EXPENSE_PORTAL_SECURE_COOKIES');
    }

    // The main site owns the canonical HTTP-to-HTTPS redirect. Do not repeat
    // that redirect in this sub-application: TLS can terminate before PHP and
    // make an application-level redirect loop. Production cookies remain
    // Secure even when the hosting proxy does not expose its TLS state to PHP.
    return true;
}

function portal_nonce(): string
{
    static $nonce = null;
    if ($nonce === null) {
        $nonce = base64_encode(random_bytes(18));
    }
    return $nonce;
}

function portal_send_security_headers(): void
{
    $nonce = portal_nonce();
    header('Cache-Control: no-store, private, max-age=0, must-revalidate');
    header('Pragma: no-cache');
    header('Expires: 0');
    header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    header("Content-Security-Policy: default-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'");
}

portal_send_security_headers();

ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_samesite', 'Strict');
session_name(IFEEL_PORTAL_SESSION);
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/staff-expenses/',
    'secure' => portal_cookie_secure(),
    'httponly' => true,
    'samesite' => 'Strict',
]);
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function portal_base_path(): string
{
    $script = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? '/staff-expenses/index.php'));
    $dir = rtrim(dirname($script), '/.');
    return ($dir === '' ? '' : $dir) . '/';
}

function portal_url(array $params = []): string
{
    $base = portal_base_path();
    return $params === [] ? $base : $base . '?' . http_build_query($params);
}

function portal_redirect(array $params = []): never
{
    header('Location: ' . portal_url($params), true, 303);
    exit;
}

function portal_h($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function portal_strlen(string $value): int
{
    if (function_exists('mb_strlen')) {
        return mb_strlen($value, 'UTF-8');
    }
    if (function_exists('iconv_strlen')) {
        $length = iconv_strlen($value, 'UTF-8');
        if ($length !== false) {
            return $length;
        }
    }
    return strlen($value);
}

function portal_substr(string $value, int $start, int $length): string
{
    if (function_exists('mb_substr')) {
        return mb_substr($value, $start, $length, 'UTF-8');
    }
    if (function_exists('iconv_substr')) {
        $part = iconv_substr($value, $start, $length, 'UTF-8');
        if ($part !== false) {
            return $part;
        }
    }
    return substr($value, $start, $length);
}

function portal_lower(string $value): string
{
    return function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
}

function portal_post(string $key, int $max = 4000): string
{
    $value = $_POST[$key] ?? '';
    if (is_array($value)) {
        return '';
    }
    $value = trim((string) $value);
    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value) ?? '';
    if (portal_strlen($value) > $max) {
        $value = portal_substr($value, 0, $max);
    }
    return $value;
}

function portal_storage_path(): string
{
    $configured = '';
    if (defined('EXPENSE_PORTAL_STORAGE_PATH')) {
        $configured = trim((string) constant('EXPENSE_PORTAL_STORAGE_PATH'));
    }
    if ($configured === '') {
        $configured = trim((string) getenv('EXPENSE_PORTAL_STORAGE_PATH'));
    }
    if ($configured !== '') {
        return rtrim($configured, DIRECTORY_SEPARATOR);
    }

    // Live default: /home/<cpanel-user>/private_expenses, outside public_html.
    return dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'private_expenses';
}

function portal_comparable_path(string $path): string
{
    $resolved = realpath($path);
    if ($resolved === false) {
        $parent = realpath(dirname($path));
        $resolved = $parent === false
            ? $path
            : $parent . DIRECTORY_SEPARATOR . basename($path);
    }
    $resolved = rtrim(str_replace('\\', '/', $resolved), '/');
    return DIRECTORY_SEPARATOR === '\\' ? strtolower($resolved) : $resolved;
}

function portal_path_is_within(string $path, string $parent): bool
{
    $path = portal_comparable_path($path);
    $parent = portal_comparable_path($parent);
    return $path === $parent || str_starts_with($path, $parent . '/');
}

function portal_assert_private_storage(string $path): void
{
    $webRoots = [dirname(__DIR__)];
    $documentRoot = trim((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''));
    if ($documentRoot !== '') {
        $webRoots[] = $documentRoot;
    }

    foreach (array_unique($webRoots) as $webRoot) {
        if ($webRoot !== '' && portal_path_is_within($path, $webRoot)) {
            throw new RuntimeException('תיקיית אחסון הדיווחים חייבת להיות מחוץ לתיקייה הציבורית של האתר.');
        }
    }
}

function portal_ensure_directory(string $path, int $mode = 0700): void
{
    if (is_dir($path)) {
        return;
    }
    if (!mkdir($path, $mode, true) && !is_dir($path)) {
        throw new RuntimeException('לא ניתן ליצור את תיקיית האחסון המאובטחת.');
    }
    @chmod($path, $mode);
}

function portal_storage_root(): string
{
    static $root = null;
    if ($root !== null) {
        return $root;
    }

    $root = portal_storage_path();
    portal_assert_private_storage($root);
    portal_ensure_directory($root);
    portal_assert_private_storage($root);
    foreach (['records', 'security'] as $subdir) {
        portal_ensure_directory($root . DIRECTORY_SEPARATOR . $subdir);
    }

    // Defense in depth if hosting configuration ever places this folder under webroot.
    $denyFile = $root . DIRECTORY_SEPARATOR . '.htaccess';
    if (!is_file($denyFile)) {
        @file_put_contents($denyFile, "Require all denied\nDeny from all\n", LOCK_EX);
        @chmod($denyFile, 0600);
    }
    $indexFile = $root . DIRECTORY_SEPARATOR . 'index.html';
    if (!is_file($indexFile)) {
        @file_put_contents($indexFile, '', LOCK_EX);
        @chmod($indexFile, 0600);
    }

    return $root;
}

function portal_json_read(string $path, array $fallback = []): array
{
    if (!is_file($path)) {
        return $fallback;
    }
    $raw = file_get_contents($path);
    if ($raw === false || $raw === '') {
        return $fallback;
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : $fallback;
}

function portal_json_write(string $path, array $data): void
{
    portal_ensure_directory(dirname($path));
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw new RuntimeException('שגיאה בשמירת הנתונים.');
    }
    $tmp = $path . '.tmp-' . bin2hex(random_bytes(6));
    if (file_put_contents($tmp, $json, LOCK_EX) === false) {
        throw new RuntimeException('שגיאה בכתיבת הנתונים.');
    }
    @chmod($tmp, 0600);
    if (!rename($tmp, $path)) {
        @unlink($tmp);
        throw new RuntimeException('שגיאה בהשלמת שמירת הנתונים.');
    }
    @chmod($path, 0600);
}

function portal_builtin_users(): array
{
    return [
        'oren' => [
            'display_name' => 'אורן לוי',
            'role' => 'admin',
            'active' => true,
            'password_hash' => '$2y$12$Xy3T6UxjpfhZeFMI6M6OweGrfpHNgfV2MNxtNqhr8sri0JHwA4WQC',
            'source' => 'bootstrap',
        ],
        'employee' => [
            'display_name' => 'עובדי I Feel',
            'role' => 'employee',
            'active' => true,
            'password_hash' => '$2y$12$o4H4lh740XV2VXSAM9bKjOrEWykYylV88/ZJqaWPBZYDxFgRu.V9K',
            'source' => 'bootstrap',
        ],
    ];
}

function portal_users_file(): string
{
    return portal_storage_root() . DIRECTORY_SEPARATOR . 'security' . DIRECTORY_SEPARATOR . 'users.json';
}

function portal_users(): array
{
    $users = portal_builtin_users();

    if (defined('EXPENSE_PORTAL_USERS') && is_array(constant('EXPENSE_PORTAL_USERS'))) {
        foreach (constant('EXPENSE_PORTAL_USERS') as $username => $user) {
            if (is_string($username) && is_array($user)) {
                $users[strtolower($username)] = $user + ['source' => 'server-config'];
            }
        }
    }

    $json = trim((string) getenv('EXPENSE_PORTAL_USERS_JSON'));
    if ($json !== '') {
        $decoded = json_decode($json, true);
        if (is_array($decoded)) {
            foreach ($decoded as $username => $user) {
                if (is_string($username) && is_array($user)) {
                    $users[strtolower($username)] = $user + ['source' => 'environment'];
                }
            }
        }
    }

    $stored = portal_json_read(portal_users_file());
    foreach ($stored as $username => $user) {
        if (is_string($username) && is_array($user)) {
            $users[strtolower($username)] = $user + ['source' => 'private-storage'];
        }
    }

    foreach ($users as $username => &$user) {
        $user['username'] = $username;
        $user['display_name'] = trim((string) ($user['display_name'] ?? $username));
        $user['role'] = ($user['role'] ?? 'employee') === 'admin' ? 'admin' : 'employee';
        $user['active'] = (bool) ($user['active'] ?? true);
        $user['password_hash'] = (string) ($user['password_hash'] ?? '');
    }
    unset($user);

    return $users;
}

function portal_saved_user_overrides(): array
{
    return portal_json_read(portal_users_file());
}

function portal_save_user(string $username, array $user): void
{
    $username = strtolower(trim($username));
    if (!preg_match('/^[a-z0-9._-]{3,40}$/', $username)) {
        throw new InvalidArgumentException('שם המשתמש חייב להכיל 3 עד 40 תווים באנגלית, מספרים, נקודה, מקף או קו תחתון.');
    }

    $stored = portal_saved_user_overrides();
    $existing = portal_users()[$username] ?? [];
    $stored[$username] = [
        'display_name' => trim((string) ($user['display_name'] ?? $existing['display_name'] ?? $username)),
        'role' => ($user['role'] ?? $existing['role'] ?? 'employee') === 'admin' ? 'admin' : 'employee',
        'active' => (bool) ($user['active'] ?? $existing['active'] ?? true),
        'password_hash' => (string) ($user['password_hash'] ?? $existing['password_hash'] ?? ''),
        'updated_at' => gmdate('c'),
        'updated_by' => (string) ($_SESSION['portal_user']['username'] ?? 'system'),
    ];
    portal_json_write(portal_users_file(), $stored);
}

function portal_csrf_token(): string
{
    if (!isset($_SESSION['portal_csrf']) || !is_string($_SESSION['portal_csrf']) || strlen($_SESSION['portal_csrf']) < 32) {
        $_SESSION['portal_csrf'] = bin2hex(random_bytes(24));
    }
    return $_SESSION['portal_csrf'];
}

function portal_verify_csrf(): void
{
    $sent = portal_post('csrf', 200);
    $known = $_SESSION['portal_csrf'] ?? '';
    if (!is_string($known) || $known === '' || !hash_equals($known, $sent)) {
        throw new RuntimeException('פג תוקף הטופס. יש לרענן את הדף ולנסות שוב.');
    }
}

function portal_client_ip(): string
{
    // Do not trust arbitrary forwarded headers. The hosting proxy can be added in server config if required.
    return (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

function portal_login_attempt_file(): string
{
    return portal_storage_root() . DIRECTORY_SEPARATOR . 'security' . DIRECTORY_SEPARATOR . 'login-' . hash('sha256', portal_client_ip()) . '.json';
}

function portal_login_is_blocked(): int
{
    $data = portal_json_read(portal_login_attempt_file());
    $until = (int) ($data['blocked_until'] ?? 0);
    return max(0, $until - time());
}

function portal_record_login_failure(): void
{
    $path = portal_login_attempt_file();
    $data = portal_json_read($path);
    $now = time();
    $windowStart = (int) ($data['window_start'] ?? $now);
    $count = (int) ($data['count'] ?? 0);
    if ($now - $windowStart > 900) {
        $windowStart = $now;
        $count = 0;
    }
    $count++;
    $blockedUntil = $count >= 5 ? $now + 900 : 0;
    portal_json_write($path, [
        'window_start' => $windowStart,
        'count' => $count,
        'blocked_until' => $blockedUntil,
        'last_attempt' => $now,
    ]);
}

function portal_clear_login_failures(): void
{
    @unlink(portal_login_attempt_file());
}

function portal_login(string $username, string $password): bool
{
    $username = strtolower(trim($username));
    if (portal_login_is_blocked() > 0) {
        return false;
    }

    $users = portal_users();
    $user = $users[$username] ?? null;
    $valid = is_array($user)
        && (bool) ($user['active'] ?? false)
        && is_string($user['password_hash'] ?? null)
        && ($user['password_hash'] ?? '') !== ''
        && password_verify($password, (string) $user['password_hash']);

    if (!$valid) {
        portal_record_login_failure();
        usleep(random_int(250000, 650000));
        return false;
    }

    portal_clear_login_failures();
    session_regenerate_id(true);
    $_SESSION['portal_user'] = [
        'username' => $username,
        'display_name' => (string) $user['display_name'],
        'role' => (string) $user['role'],
        'logged_in_at' => time(),
        'last_activity' => time(),
    ];
    unset($_SESSION['portal_csrf']);
    portal_csrf_token();
    return true;
}

function portal_logout(): void
{
    if (function_exists('portal_revoke_remembered_login')) {
        portal_revoke_remembered_login();
    }
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $params['path'],
            'domain' => $params['domain'] ?? '',
            'secure' => (bool) $params['secure'],
            'httponly' => (bool) $params['httponly'],
            'samesite' => 'Strict',
        ]);
    }
    session_destroy();
}

function portal_current_user(): ?array
{
    $user = $_SESSION['portal_user'] ?? null;
    if (!is_array($user)) {
        return null;
    }

    $last = (int) ($user['last_activity'] ?? 0);
    if ($last <= 0 || time() - $last > IFEEL_PORTAL_IDLE_TIMEOUT) {
        portal_logout();
        return null;
    }

    $users = portal_users();
    $liveUser = $users[(string) ($user['username'] ?? '')] ?? null;
    if (!is_array($liveUser) || !(bool) ($liveUser['active'] ?? false)) {
        portal_logout();
        return null;
    }

    $_SESSION['portal_user']['last_activity'] = time();
    $_SESSION['portal_user']['display_name'] = (string) $liveUser['display_name'];
    $_SESSION['portal_user']['role'] = (string) $liveUser['role'];
    return $_SESSION['portal_user'];
}

function portal_require_login(): array
{
    $user = portal_current_user();
    if ($user === null) {
        portal_redirect();
    }
    return $user;
}

function portal_require_admin(): array
{
    $user = portal_require_login();
    if (($user['role'] ?? '') !== 'admin') {
        http_response_code(403);
        throw new RuntimeException('אין הרשאה לביצוע הפעולה.');
    }
    return $user;
}

function portal_report_type_label(string $type): string
{
    $labels = [
        'vehicle' => 'רכב, טיפול, חניה ונסיעות',
        'travel' => 'נסיעה לחו״ל',
        'general' => 'הוצאה כללית',
    ];
    return $labels[$type] ?? 'דיווח הוצאה';
}

function portal_status_label(string $status): string
{
    $labels = [
        'new' => 'חדש',
        'review' => 'בבדיקה',
        'approved' => 'אושר',
        'missing' => 'חסר מידע',
        'paid' => 'שולם / הוחזר',
    ];
    return $labels[$status] ?? 'חדש';
}

function portal_valid_statuses(): array
{
    return ['new', 'review', 'approved', 'missing', 'paid'];
}

function portal_currency_label(string $currency): string
{
    $labels = [
        'ILS' => '₪',
        'USD' => '$',
        'EUR' => '€',
        'GBP' => '£',
    ];
    return $labels[$currency] ?? $currency;
}

function portal_parse_amount(string $value): ?float
{
    $value = trim(str_replace([',', ' '], ['', ''], $value));
    if ($value === '' || !preg_match('/^\d+(?:\.\d{1,2})?$/', $value)) {
        return null;
    }
    $amount = (float) $value;
    return $amount > 0 && $amount <= 100000000 ? round($amount, 2) : null;
}

function portal_new_record_id(): string
{
    return gmdate('Ymd-His') . '-' . bin2hex(random_bytes(6));
}

function portal_record_dir(string $recordId): string
{
    if (!preg_match('/^(\d{4})(\d{2})\d{2}-\d{6}-[a-f0-9]{12}$/', $recordId, $match)) {
        throw new InvalidArgumentException('מספר דיווח אינו תקין.');
    }
    return portal_storage_root()
        . DIRECTORY_SEPARATOR . 'records'
        . DIRECTORY_SEPARATOR . $match[1]
        . DIRECTORY_SEPARATOR . $match[2]
        . DIRECTORY_SEPARATOR . $recordId;
}

function portal_record_file(string $recordId): string
{
    return portal_record_dir($recordId) . DIRECTORY_SEPARATOR . 'metadata.json';
}

function portal_load_record(string $recordId): ?array
{
    $path = portal_record_file($recordId);
    if (!is_file($path)) {
        return null;
    }
    $record = portal_json_read($path);
    return $record === [] ? null : $record;
}

function portal_save_record(array $record): void
{
    $recordId = (string) ($record['id'] ?? '');
    portal_json_write(portal_record_file($recordId), $record);
}

function portal_all_records(): array
{
    $pattern = portal_storage_root() . DIRECTORY_SEPARATOR . 'records' . DIRECTORY_SEPARATOR . '*' . DIRECTORY_SEPARATOR . '*' . DIRECTORY_SEPARATOR . '*' . DIRECTORY_SEPARATOR . 'metadata.json';
    $records = [];
    foreach (glob($pattern) ?: [] as $path) {
        $record = portal_json_read($path);
        if ($record !== [] && isset($record['id'])) {
            $records[] = $record;
        }
    }
    usort($records, static fn(array $a, array $b): int => strcmp((string) ($b['created_at'] ?? ''), (string) ($a['created_at'] ?? '')));
    return $records;
}

function portal_remove_tree(string $path): void
{
    if (!is_dir($path)) {
        return;
    }
    $items = scandir($path);
    if ($items === false) {
        return;
    }
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        $full = $path . DIRECTORY_SEPARATOR . $item;
        if (is_dir($full)) {
            portal_remove_tree($full);
        } else {
            @unlink($full);
        }
    }
    @rmdir($path);
}

function portal_is_heic(string $path): bool
{
    $handle = @fopen($path, 'rb');
    if ($handle === false) {
        return false;
    }
    $head = fread($handle, 32);
    fclose($handle);
    if (!is_string($head)) {
        return false;
    }
    return (bool) preg_match('/ftyp(?:heic|heix|hevc|hevx|mif1|msf1|avif)/', $head);
}

function portal_normalize_files_array(array $files): array
{
    if (!isset($files['name'])) {
        return [];
    }
    if (!is_array($files['name'])) {
        return [$files];
    }
    $normalized = [];
    foreach ($files['name'] as $index => $name) {
        $normalized[] = [
            'name' => $name,
            'type' => $files['type'][$index] ?? '',
            'tmp_name' => $files['tmp_name'][$index] ?? '',
            'error' => $files['error'][$index] ?? UPLOAD_ERR_NO_FILE,
            'size' => $files['size'][$index] ?? 0,
        ];
    }
    return $normalized;
}

function portal_save_uploads(string $recordDir, array $files): array
{
    $items = portal_normalize_files_array($files);
    if (count($items) > IFEEL_PORTAL_MAX_FILES) {
        throw new RuntimeException('ניתן לצרף עד ' . IFEEL_PORTAL_MAX_FILES . ' קבצים בכל דיווח.');
    }

    $uploads = [];
    $totalBytes = 0;
    $filesDir = $recordDir . DIRECTORY_SEPARATOR . 'files';
    portal_ensure_directory($filesDir);
    $finfo = new finfo(FILEINFO_MIME_TYPE);

    $allowedByMime = [
        'application/pdf' => 'pdf',
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/heic' => 'heic',
        'image/heif' => 'heif',
        'image/avif' => 'avif',
    ];

    foreach ($items as $file) {
        $error = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($error === UPLOAD_ERR_NO_FILE) {
            continue;
        }
        if ($error !== UPLOAD_ERR_OK) {
            $messages = [
                UPLOAD_ERR_INI_SIZE => 'אחד הקבצים גדול מהמותר בשרת.',
                UPLOAD_ERR_FORM_SIZE => 'אחד הקבצים גדול מהמותר בשרת.',
                UPLOAD_ERR_PARTIAL => 'אחד הקבצים הועלה באופן חלקי בלבד.',
            ];
            $message = $messages[$error] ?? 'אירעה שגיאה בהעלאת אחד הקבצים.';
            throw new RuntimeException($message);
        }

        $size = (int) ($file['size'] ?? 0);
        if ($size <= 0 || $size > IFEEL_PORTAL_MAX_FILE_BYTES) {
            throw new RuntimeException('כל קובץ חייב להיות קטן מ-12MB.');
        }
        $totalBytes += $size;
        if ($totalBytes > IFEEL_PORTAL_MAX_TOTAL_BYTES) {
            throw new RuntimeException('הגודל הכולל של הקבצים חייב להיות קטן מ-60MB.');
        }

        $tmp = (string) ($file['tmp_name'] ?? '');
        if ($tmp === '' || !is_uploaded_file($tmp)) {
            throw new RuntimeException('קובץ ההעלאה אינו תקין.');
        }

        $mime = (string) $finfo->file($tmp);
        $originalName = trim(basename((string) ($file['name'] ?? 'document')));
        $originalExt = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        $extension = $allowedByMime[$mime] ?? null;

        if ($extension === null && in_array($originalExt, ['heic', 'heif', 'avif'], true) && portal_is_heic($tmp)) {
            $extension = $originalExt;
            $mime = $originalExt === 'avif' ? 'image/avif' : 'image/' . $originalExt;
        }
        if ($extension === null) {
            throw new RuntimeException('סוג קובץ לא נתמך. ניתן להעלות PDF, JPG, PNG, WEBP, HEIC או AVIF בלבד.');
        }

        $storageName = bin2hex(random_bytes(16)) . '.' . $extension;
        $destination = $filesDir . DIRECTORY_SEPARATOR . $storageName;
        if (!move_uploaded_file($tmp, $destination)) {
            throw new RuntimeException('לא ניתן לשמור את הקובץ בשרת.');
        }
        @chmod($destination, 0600);

        $uploads[] = [
            'original_name' => portal_substr($originalName !== '' ? $originalName : 'document.' . $extension, 0, 240),
            'storage_name' => $storageName,
            'mime' => $mime,
            'size' => $size,
            'sha256' => hash_file('sha256', $destination) ?: '',
        ];
    }

    return $uploads;
}

function portal_format_totals(array $record): string
{
    $totals = $record['totals'] ?? [];
    if (!is_array($totals) || $totals === []) {
        return 'לא צוין';
    }
    $parts = [];
    foreach ($totals as $currency => $amount) {
        $parts[] = number_format((float) $amount, 2) . ' ' . portal_currency_label((string) $currency);
    }
    return implode(' · ', $parts);
}

function portal_audit(string $event, array $context = []): void
{
    $entry = [
        'at' => gmdate('c'),
        'event' => $event,
        'user' => (string) ($_SESSION['portal_user']['username'] ?? 'guest'),
        'ip_hash' => hash('sha256', portal_client_ip()),
        'context' => $context,
    ];
    $path = portal_storage_root() . DIRECTORY_SEPARATOR . 'security' . DIRECTORY_SEPARATOR . 'audit-' . gmdate('Y-m') . '.log';
    $line = json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
    @file_put_contents($path, $line, FILE_APPEND | LOCK_EX);
    @chmod($path, 0600);
}
