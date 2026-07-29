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

const IFEEL_PORTAL_VERSION = '1.5.0';
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

function portal_h(mixed $value): string
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
            'password_hash' => '$2y$12$Xy3T6UxjpfhZeFMI6M6OweGrfpHNgfV2MNxtNqhr8sri0JH6����ТFƗfUW6W"�GW6W'5��7G&����GW6W%�wW6W&��u��rr������Т�b��5�'&��FƗfUW6W"���&��FƗfUW6W%�v7F�fRu��f�R���Т�F��v�B���Т&WGW&����Т��ТE�U54���w�F�W6W"uղv�7E�7F�f�G�u��F�����ТE�U54���w�F�W6W"uղvF�7����u���7G&���FƗfUW6W%�vF�7����uӰТE�U54���w�F�W6W"uղw&�Ru���7G&���FƗfUW6W%�w&�RuӰТ&WGW&�E�U54���w�F�W6W"uӰЧ��ЦgV�F���F�&WV�&U���ₓ�'&�Ч�ТGW6W"��F�7W'&V��6W"���Т�b�GW6W"������Т�F�&VF�&V7B���Т��&WGW&�GW6W#�Ч��ЦgV�F���F�&WV�&U�F֖ₓ�'&�Ч�ТGW6W"��F�&WV�&U���ₓ�Т�b��GW6W%�w&�Ru��rr��vF֖���Т�GG�W7�6U��R�C2��ТF�&��r'V���W�6WF���}yy�y�yMz�z�yyBy�y�zmy]z"yMzMz-y]y�B���Т��&WGW&�GW6W#�Ч��ЦgV�F���F�&W�E��U�&V7G&��GG�R��7G&��Ч�ТF�&V����wfV��6�r�}z�y�y�y�y�zMy]y�y}zy�yBy]zzy�z-y]z�r��wG&fV��}zzy�z-yBy�}y]{My���vvV�&��}yMy]zmyyBy�y���z�r��Ӱ�&WGW&�F�&V��GG�U��}y=y�y]y]yryMy]zmyyBs����ЦgV�F���F�7FGW5�&V7G&��G7FGW2��7G&��Ч�ТF�&V����v�rr�}y}y=z�r��w&Wf�Wrr�}yyy=y�z}yBr��v&�VBr�}yy]z�z�r��v֗76��r�}y}zz�y��y=z"r��w�Br�}z�y]y���yMy]y}ymz�r��Ӱ�&WGW&�F�&V��G7FGW5��}y}y=z�s����ЦgV�F���F�fƖE�FGW6W2���'&�Ч�Т&WGW&��v�rr�w&Wf�Wrr�v&�VBr�v֗76��r�w�BuӰЧ��ЦgV�F���F�7W'&V���&V7G&��F7W'&V����7G&��Ч�ТF�&V����t��r�~(*�r��uU4Br�rBr��tUU"r�~(*���tt%r�|*2r��Ӱ�&WGW&�F�&V��F7W'&V����F7W'&V������ЦgV�F���F�'6U��V��7G&��Gf�R����@Ч�ТGf�R�G&�҇7G%�W�6R��r��ru��rr�ru�Gf�R���Т�b�Gf�R��rr�&Vu�F6��r������G��ғ���Gf�R���Т&WGW&����Т��F�V���f�B�Gf�S�Т&WGW&�F�V��bbF�V���&���F�V��"�����Ч��ЦgV�F���F��u�V6�E����7G&��Ч�Т&WGW&�v�FR�u��Ԇ�2r��r��&���W��&����FW2�b���Ч��ЦgV�F���F�&V6�E��"�7G&��G&V6�D�B��7G&��Ч�Т�b�&Vu�F6��r����GҒ���'ҕ��'���g���ӕ׳'���G&V6�D�B�F�F6����ТF�&��r��ƖD&wV��W�6WF���}y�zMz�y=y�y]y]yryy�zyRz�z}y�y�r��Т��&WGW&��F�7F�vU��B��Т�D�$T5D���U$D��w&V6�G2pТ�D�$T5D���U$D��F�F6�����D�$T5D���U$D��F�F6��%���D�$T5D���U$D��G&V6�D�C�Ч��ЦgV�F���F�&V6�E����7G&��G&V6�D�B��7G&��Ч�Т&WGW&��F�&V6�E��"�G&V6�D�B��D�$T5D���U$D��v�FFF��s�Ч��ЦgV�F���F��E�V6�B�7G&��G&V6�D�B���'&�Ч�ТGF���F�&V6�E����G&V6�D�B��Т�b��5����GF����Т&WGW&����Т��G&V6�B��F��6��VB�GF���Т&WGW&�G&V6�B��������G&V6�C�Ч��ЦgV�F���F�6fU�V6�B�'&�G&V6�B��f�Ч�ТG&V6�D�B��7G&����G&V6�E�v�Bu��rr��Т�F��6��&�FR��F�&V6�E����G&V6�D�B��G&V6�B��Ч��ЦgV�F���F���V6�G2���'&�Ч�ТGGFW&���F�7F�vU��B���D�$T5D���U$D��w&V6�G2r�D�$T5D���U$D��r�r�D�$T5D���U$D��r�r�D�$T5D���U$D��r�r�D�$T5D���U$D��v�FFF��s�ТG&V6�G2��ӰТf�V6��v�"�GGFW&����2GF���ТG&V6�B��F��6��VB�GF���Т�b�G&V6�B���bb�76WB�G&V6�E�v�BuҒ��ТG&V6�G5���G&V6�C�Т����W6�B�G&V6�G2�7FF�2f�'&�F�'&�F"�����7G&6���7G&����F%�v7&VFVE�Bu��rr���7G&����F�v7&VFVE�Bu��rr����Т&WGW&�G&V6�G3�Ч��ЦgV�F���F�&V�fU�&VR�7G&��GF���f�Ч�Т�b��5��"�GF����Т&WGW&����F�FV��66��"�GF���Т�b�F�FV���f�R��Т&WGW&����f�V6��F�FV�2F�FVҒ�Т�b�F�FV���r��F�FV���r�r��Т6�F��S�Т��FgV��GF��D�$T5D���U$D��F�FVӰТ�b��5��"�FgV����Т�F�&V�fU�&VR�FgV���Т�V�R�ТV��沂FgV���Т����&��"�GF���Ч��ЦgV�F���F��5��2�7G&��GF���&����ТF����f�V�F��w&"r��Т�b�F�����f�R��Т&WGW&�f�S�Т��F�VB�g&VB�F����3"��Тf6�6R�F�����Т�b��5�G&���F�VB���Т&WGW&�f�S�Т��&WGW&��&�&Vu�F6��r�G����7ƆV��ƆWf7ƆWg���c�6c�f�b���F�VB��Ч��ЦgV�F���F��&�Ɨ�U���5�'&��'&�Ff��2��'&�Ч�Т�b��76WB�Ff��5�v��uҒ��Т&WGW&��ӰТ���b��5�'&��Ff��5�v��uҒ��Т&WGW&��Ff��5ӰТ��F�&�Ɨ�VB��ӰТf�V6��Ff��5�v��u�2F��W��F����ТF�&�Ɨ�VE����Тv��r�F����wG�Rr�Ff��5�wG�RuղF��W���rr��wF���r�Ff��5�wF���uղF��W���rr��vW'&�r�Ff��5�vW'&�uղF��W���U�E�%%��d����w6��Rr�Ff��5�w6��RuղF��W�����ӰТ��&WGW&�F�&�Ɨ�VC�Ч��ЦgV�F���F�6fU��G2�7G&��G&V6�DF�"�'&�Ff��2��'&�Ч�ТF�FV���F��&�Ɨ�U���5�'&��Ff��2��Т�b�6���F�FV����dTT��D������2��ТF�&��r'V���W�6WF���}zy�z�y�y�mz�z2z-y2r��dTT��D������2�rz}yzmy�y�yy�y�y=y�y]y]yr���Т��ТGW�G2��ӰТGF���FW2��ТFf��4F�"�G&V6�DF�"�D�$T5D���U$D��vf��2s�Т�F�V�W&U��&V7F���Ff��4F�"��ТFf�����rf��������Ԕ���R��РТF��VD'�֖���ТvƖ6F���Fbr�wFbr��v��vR�Vrr�v�rr��v��vR��r�w�r��v��vR�V'r�wvV'r��v��vR��2r�v�V�2r��v��vR��br�v�V�br��v��vR�f�br�vf�br��ӰРТf�V6��F�FV�2Ff����ТFW'&�������Ff���vW'&�u��U�E�%%��d����Т�b�FW'&���U�E�%%��d����Т6�F��S�Т���b�FW'&��U�E�%%����ТF�76vW2���U�E�%%�����R�}yy}y2yMz}yzmy�y�y-y=y]y�y�My�]z�z�yz�z�z��"U�E�%%���4��R�}yy}y2yMz}yzmy�y�y-y=y]y�y�My�]z�z�yz�z�z��"U�E�%%�%D���}yy}y2yMz}yzmy�y�yMy]z-y�Byyy]zMy�y}y�}y�yy�y2�"Ӱ�F�76vR�F�76vW5�FW'&���}yy�z�z-yBz�y-y�yyByyMz-y�z�yy}y2yMz}yzmy�y�s��F�&��r'V���W�6WF���F�76vR��Т��ТG6��R������Ff���w6��Ru����Т�b�G6��R��G6��R��dTT��D��������DU2��ТF�&��r'V���W�6WF���}y�y�z}y]yzRy}y�y�yy�My�y]z�z}y�y�y�$����Т��GF���FW2��G6��S�Т�b�GF���FW2��dTT��D������%�DU2��ТF�&��r'V���W�6WF���}yMy-y]y=y�yMy�y]y��z�y�yMz}yzmy�y�y}y�y�yy�My�y]z�z}y�y�y�c����Т��ТGF���7G&����Ff���wF���u��rr��Т�b�GF���rr��5��FVE����GF����ТF�&��r'V���W�6WF���}z}y]yzRyMyMz-y�yByy�zyRz�z}y�y�r��Т��ТF֖���7G&���Ff�������GF���ТF��v�����G&�҆&6V����7G&����Ff���v��u��vF�V��r����ТF��v����B�7G'F��W"�F������v�����D����U�DT������ТFW�FV����F��VD'�֖��F֖������РТ�b�FW�FV�������bb��'&��F��v����B��v�V�2r�v�V�br�vf�bu�G'VR�bb�F��5��2�GF����ТFW�FV����F��v����C�ТF֖��F��v����B��vf�br�v��vR�f�br�v��vR��F��v����C�Т���b�FW�FV���������ТF�&��r'V���W�6WF���}zy]y"z}y]yzRy�zz�y���zy�z�y�y�Mz-y�]z�Db��r���tT%��T�2yyRd�byy�y2���Т��ТG7F�vT���&���W��&����FW2�b���r��FW�FV����ТFFW7F��F���Ff��4F�"�D�$T5D���U$D��G7F�vT���Т�b��fU��FVE����GF��FFW7F��F�����ТF�&��r'V���W�6WF���}y�zy�z�y�y��y�]z�yz�yMz}y]yzRyz�z�z����Т��6��B�FFW7F��F���c��РТGW�G5����Тv��v�����r��F�7V'7G"�F��v�����rr�F��v�����vF�V����FW�FV�����#C���w7F�vU��r�G7F�vT����v֖�r�F֖���w6��Rr�G6��R��w6�#Sbr��6�����w6�#Sbr�FFW7F��F����rr��ӰТ��Т&WGW&�GW�G3�Ч��ЦgV�F���F�f��E����'&�G&V6�B��7G&��Ч�ТGF���G&V6�E�wF��u���ӰТ�b��5�'&��GF����GF�����Ғ�Т&WGW&�}y�zmy]y�y��Т��G'G2��ӰТf�V6��GF��2F7W'&V���F�V���ТG'G5�����W%���B��f�B�F�V��"��rr��F�7W'&V���&V�7G&���F7W'&V����Т��&WGW&����FR�r+rr�G'G2��Ч��ЦgV�F���F�VF�B�7G&��FWfV��'&�F6�FW�B��ғ�f�Ч�ТFV�'���ТvBr�v�FR�v2r���vWfV�r�FWfV���wW6W"r��7G&����E�U54���w�F�W6W"uղwW6W&��u��vwVW7Br���v��6�r��6��w6�#Sbr��F�6ƖV�������v6�FW�Br�F6�FW�B��ӰТGF���F�7F�vU��B���D�$T5D���U$D��w6V7W&�G�r�D�$T5D���U$D��vVF�B��v�FR�u��r��r��s�ТFƖ���6����R�FV�'���4���44TE���R��4���44TE��4�U2��%�#�Тf���WE��FV�2�GF��FƖ��d���T���4�����Т6��B�GF��c��Ч�
