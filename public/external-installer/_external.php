<?php
declare(strict_types=1);

const EXTERNAL_INSTALLER_SERVICE_BOARD_ID = '3011387201';
const EXTERNAL_INSTALLER_PROJECT_BOARD_ID = '3249720207';
const EXTERNAL_INSTALLER_OTP_TTL = 600;
const EXTERNAL_INSTALLER_OTP_MAX_ATTEMPTS = 5;
const EXTERNAL_INSTALLER_OTP_RESEND_SECONDS = 60;
const EXTERNAL_INSTALLER_REQUEST_TTL = 86400;
const EXTERNAL_INSTALLER_GRANT_TTL = 8 * 60 * 60;

function external_normalize_email(string $email): ?string
{
    $email = strtolower(trim($email));
    if ($email === '' || strlen($email) > 160 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        return null;
    }
    return $email;
}

function external_config_array(string $constantName, string $environmentName): array
{
    $value = defined($constantName) ? constant($constantName) : null;
    if (is_array($value)) {
        return $value;
    }
    $raw = trim((string) getenv($environmentName));
    if ($raw === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function external_installer_allowlist(): array
{
    $configured = external_config_array('EXTERNAL_INSTALLER_ALLOWLIST', 'EXTERNAL_INSTALLER_ALLOWLIST_JSON');
    $normalized = [];

    if ((string) getenv('IFEEL_PORTAL_TEST_MODE') === '1' && $configured === []) {
        $configured = [
            'external.one@example.test' => ['name' => 'מתקין חיצוני בדיקה', 'active' => true],
        ];
    }

    foreach ($configured as $key => $entry) {
        if (is_string($entry)) {
            $email = external_normalize_email($entry);
            $entry = ['name' => $email ?? '', 'active' => true];
        } elseif (is_array($entry)) {
            $email = is_string($key) ? external_normalize_email($key) : external_normalize_email((string) ($entry['email'] ?? ''));
        } else {
            continue;
        }
        if ($email === null || !(bool) ($entry['active'] ?? true)) {
            continue;
        }
        $normalized[$email] = [
            'email' => $email,
            'name' => trim((string) ($entry['name'] ?? $email)),
            'active' => true,
        ];
    }
    return $normalized;
}

function external_approver_emails(): array
{
    $values = external_config_array('EXTERNAL_INSTALLER_APPROVERS', 'EXTERNAL_INSTALLER_APPROVERS_JSON');
    if ($values === []) {
        $values = [
            'oren@' . portal_company_email_domain(),
            'cheyne@' . portal_company_email_domain(),
            'support@' . portal_company_email_domain(),
        ];
    }

    $emails = [];
    foreach ($values as $key => $value) {
        $candidate = is_string($key) && is_array($value) ? $key : (is_string($value) ? $value : (string) ($value['email'] ?? ''));
        $email = portal_normalize_company_email($candidate);
        if ($email !== null) {
            $emails[$email] = true;
        }
    }
    return array_keys($emails);
}

function external_report_recipients(): array
{
    $values = external_config_array('EXTERNAL_INSTALLER_REPORT_RECIPIENTS', 'EXTERNAL_INSTALLER_REPORT_RECIPIENTS_JSON');
    if ($values === []) {
        $values = [
            'oren@' . portal_company_email_domain(),
            'cheyne@' . portal_company_email_domain(),
            'kiril@' . portal_company_email_domain(),
        ];
    }

    $emails = [];
    foreach ($values as $key => $value) {
        $candidate = is_string($key) && is_array($value) ? $key : (is_string($value) ? $value : (string) ($value['email'] ?? ''));
        $email = portal_normalize_company_email($candidate);
        if ($email !== null) {
            $emails[$email] = true;
        }
    }
    return array_keys($emails);
}

function external_storage_root(): string
{
    $root = portal_storage_root() . DIRECTORY_SEPARATOR . 'external-installers';
    portal_ensure_directory($root);
    foreach (['profiles', 'requests', 'tokens', 'rate-limits'] as $dir) {
        portal_ensure_directory($root . DIRECTORY_SEPARATOR . $dir);
    }
    return $root;
}

function external_hash_key(string $value): string
{
    return hash('sha256', strtolower(trim($value)));
}

function external_profile_path(string $email): string
{
    return external_storage_root() . DIRECTORY_SEPARATOR . 'profiles' . DIRECTORY_SEPARATOR . external_hash_key($email) . '.json';
}

function external_profile(string $email): array
{
    $record = portal_json_read(external_profile_path($email));
    return [
        'email' => $email,
        'name' => trim((string) ($record['name'] ?? '')),
        'phone' => trim((string) ($record['phone'] ?? '')),
    ];
}

function external_save_profile(string $email, string $name, string $phone): array
{
    $name = trim($name);
    $phone = trim($phone);
    if ($name === '' || portal_strlen($name) > 120) {
        throw new RuntimeException('יש להזין שם מלא.');
    }
    if (!preg_match('/^(?:\+972|0)5\d(?:[\s-]?\d){7}$/', $phone)) {
        throw new RuntimeException('יש להזין מספר טלפון נייד ישראלי תקין.');
    }
    $profile = [
        'email' => $email,
        'name' => portal_substr($name, 0, 120),
        'phone' => portal_substr($phone, 0, 30),
        'updated_at' => gmdate('c'),
    ];
    portal_json_write(external_profile_path($email), $profile);
    return $profile;
}

function external_installer_user(): ?array
{
    $user = $_SESSION['external_installer_user'] ?? null;
    if (!is_array($user)) {
        return null;
    }
    $email = external_normalize_email((string) ($user['email'] ?? ''));
    if ($email === null || !isset(external_installer_allowlist()[$email])) {
        unset($_SESSION['external_installer_user'], $_SESSION['external_customer_grant']);
        return null;
    }
    if (time() - (int) ($user['last_activity'] ?? 0) > IFEEL_PORTAL_IDLE_TIMEOUT) {
        unset($_SESSION['external_installer_user'], $_SESSION['external_customer_grant']);
        return null;
    }
    $_SESSION['external_installer_user']['last_activity'] = time();
    return $_SESSION['external_installer_user'];
}

function external_logout_installer(): void
{
    unset(
        $_SESSION['external_installer_user'],
        $_SESSION['external_customer_grant'],
        $_SESSION['external_search_results'],
        $_SESSION['external_otp_challenge']
    );
    session_regenerate_id(true);
}

function external_otp_rate_path(string $email, string $purpose): string
{
    return external_storage_root()
        . DIRECTORY_SEPARATOR . 'rate-limits'
        . DIRECTORY_SEPARATOR . external_hash_key(portal_client_ip() . '|' . $purpose . '|' . $email)
        . '.json';
}

function external_otp_retry_after(string $email, string $purpose): int
{
    $data = portal_json_read(external_otp_rate_path($email, $purpose));
    $last = (int) ($data['last_sent'] ?? 0);
    $window = (int) ($data['window_start'] ?? 0);
    $count = (int) ($data['count'] ?? 0);
    $now = time();
    if ($window > 0 && $now - $window < 900 && $count >= 5) {
        return max(1, 900 - ($now - $window));
    }
    return max(0, EXTERNAL_INSTALLER_OTP_RESEND_SECONDS - ($now - $last));
}

function external_record_otp_send(string $email, string $purpose): void
{
    $path = external_otp_rate_path($email, $purpose);
    $data = portal_json_read($path);
    $now = time();
    $window = (int) ($data['window_start'] ?? 0);
    $count = (int) ($data['count'] ?? 0);
    if ($window <= 0 || $now - $window >= 900) {
        $window = $now;
        $count = 0;
    }
    portal_json_write($path, [
        'window_start' => $window,
        'count' => $count + 1,
        'last_sent' => $now,
    ]);
}

function external_request_otp(string $input, string $purpose, ?string $requestId = null): string
{
    $email = external_normalize_email($input);
    if ($email === null) {
        throw new RuntimeException('כתובת הדוא"ל אינה תקינה.');
    }

    if ($purpose === 'installer') {
        if (!isset(external_installer_allowlist()[$email])) {
            usleep(random_int(200000, 500000));
            throw new RuntimeException('כתובת הדוא"ל אינה מורשית באזור המתקינים החיצוניים.');
        }
    } elseif ($purpose === 'approver') {
        $companyEmail = portal_normalize_company_email($email);
        if ($companyEmail === null || !in_array($companyEmail, external_approver_emails(), true)) {
            usleep(random_int(200000, 500000));
            throw new RuntimeException('הכתובת אינה מורשית לאישור גישת מתקינים.');
        }
        $email = $companyEmail;
    } else {
        throw new RuntimeException('בקשת האימות אינה תקינה.');
    }

    $retry = external_otp_retry_after($email, $purpose);
    if ($retry > 0) {
        throw new RuntimeException('קוד כבר נשלח לאחרונה. ניתן לבקש קוד חדש בעוד כ-' . $retry . ' שניות.');
    }

    $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    external_record_otp_send($email, $purpose);
    $_SESSION['external_otp_challenge'] = [
        'email' => $email,
        'purpose' => $purpose,
        'request_id' => $requestId,
        'hash' => password_hash($code, PASSWORD_DEFAULT),
        'expires_at' => time() + EXTERNAL_INSTALLER_OTP_TTL,
        'attempts' => 0,
    ];

    $subject = $purpose === 'approver'
        ? 'קוד לאישור גישת מתקין חיצוני | I Feel'
        : 'קוד כניסה לאזור מתקין חיצוני | I Feel';
    $body = implode("\r\n", [
        'שלום,',
        '',
        $purpose === 'approver'
            ? 'התקבלה בקשה לאשר גישת מתקין חיצוני ללקוח. לצפייה ואישור יש להזין את הקוד הבא:'
            : 'לכניסה לאזור המתקינים החיצוניים של I Feel יש להזין את הקוד הבא:',
        '',
        $code,
        '',
        'הקוד תקף ל-10 דקות ולשימוש חד פעמי.',
        'אם לא ביקשת את הקוד, אין לבצע פעולה.',
        '',
        'I Feel',
    ]);
    if (!portal_send_mail_with_attachments($email, $subject, $body)) {
        unset($_SESSION['external_otp_challenge']);
        throw new RuntimeException('לא ניתן היה לשלוח את קוד הכניסה. יש לנסות שוב מאוחר יותר.');
    }

    portal_audit('external_installer_otp_sent', [
        'purpose' => $purpose,
        'email_hash' => external_hash_key($email),
    ]);
    return $email;
}

function external_verify_otp(string $code, string $purpose): array
{
    $challenge = $_SESSION['external_otp_challenge'] ?? null;
    if (!is_array($challenge) || (string) ($challenge['purpose'] ?? '') !== $purpose) {
        throw new RuntimeException('לא נמצאה בקשת אימות פעילה.');
    }
    if ((int) ($challenge['expires_at'] ?? 0) < time()) {
        unset($_SESSION['external_otp_challenge']);
        throw new RuntimeException('תוקף הקוד פג. יש לבקש קוד חדש.');
    }

    $digits = preg_replace('/\D+/', '', trim($code)) ?? '';
    if (strlen($digits) !== 6 || !password_verify($digits, (string) ($challenge['hash'] ?? ''))) {
        $challenge['attempts'] = (int) ($challenge['attempts'] ?? 0) + 1;
        $_SESSION['external_otp_challenge'] = $challenge;
        if ($challenge['attempts'] >= EXTERNAL_INSTALLER_OTP_MAX_ATTEMPTS) {
            unset($_SESSION['external_otp_challenge']);
            throw new RuntimeException('בוצעו יותר מדי ניסיונות. יש לבקש קוד חדש.');
        }
        throw new RuntimeException('קוד האימות שגוי.');
    }

    $email = (string) $challenge['email'];
    $requestId = (string) ($challenge['request_id'] ?? '');
    unset($_SESSION['external_otp_challenge']);
    session_regenerate_id(true);

    if ($purpose === 'installer') {
        $allow = external_installer_allowlist()[$email] ?? null;
        if (!is_array($allow)) {
            throw new RuntimeException('הגישה לכתובת זו אינה פעילה.');
        }
        $_SESSION['external_installer_user'] = [
            'email' => $email,
            'display_name' => (string) ($allow['name'] ?? $email),
            'logged_in_at' => time(),
            'last_activity' => time(),
        ];
        portal_audit('external_installer_login', ['email_hash' => external_hash_key($email)]);
        return $_SESSION['external_installer_user'];
    }

    if (!in_array($email, external_approver_emails(), true)) {
        throw new RuntimeException('הכתובת אינה מורשית לאישור.');
    }
    $_SESSION['external_approver_user'] = [
        'email' => $email,
        'request_id' => $requestId,
        'logged_in_at' => time(),
    ];
    portal_audit('external_installer_approver_login', ['email_hash' => external_hash_key($email)]);
    return $_SESSION['external_approver_user'];
}

function external_monday_token(): string
{
    foreach (['EXTERNAL_INSTALLER_MONDAY_TOKEN', 'MONDAY_API_TOKEN'] as $constantName) {
        if (defined($constantName)) {
            $value = trim((string) constant($constantName));
            if ($value !== '') {
                return $value;
            }
        }
        $value = trim((string) getenv($constantName));
        if ($value !== '') {
            return $value;
        }
    }
    return '';
}

function external_monday_request(string $query, array $variables = []): array
{
    if ((string) getenv('IFEEL_PORTAL_TEST_MODE') === '1') {
        return ['data' => []];
    }
    $token = external_monday_token();
    if ($token === '') {
        throw new RuntimeException('חיבור Monday לאזור המתקינים החיצוניים טרם הוגדר בשרת.');
    }
    if (!function_exists('curl_init')) {
        throw new RuntimeException('השרת אינו כולל כרגע חיבור מאובטח ל-Monday.');
    }

    $payload = json_encode(['query' => $query, 'variables' => $variables], JSON_UNESCAPED_UNICODE);
    if ($payload === false) {
        throw new RuntimeException('לא ניתן להכין את בקשת Monday.');
    }
    $handle = curl_init('https://api.monday.com/v2');
    curl_setopt_array($handle, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: ' . $token,
            'Content-Type: application/json',
            'API-Version: 2026-07',
        ],
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_MAXREDIRS => 0,
    ]);
    $body = curl_exec($handle);
    $error = curl_error($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
    curl_close($handle);

    if (!is_string($body) || $body === '' || $error !== '' || $status < 200 || $status >= 300) {
        error_log('[i-feel external installer] monday_transport_failed status=' . $status);
        throw new RuntimeException('לא ניתן לטעון כרגע לקוחות מ-Monday.');
    }
    $decoded = json_decode($body, true);
    if (!is_array($decoded) || isset($decoded['errors']) || !isset($decoded['data'])) {
        error_log('[i-feel external installer] monday_graphql_failed');
        throw new RuntimeException('Monday החזיר תשובה לא תקינה.');
    }
    return $decoded;
}

function external_search_customers(string $term): array
{
    $term = trim($term);
    if (portal_strlen($term) < 3 || portal_strlen($term) > 80) {
        throw new RuntimeException('יש להזין לפחות 3 תווים משם הלקוח או הפרויקט.');
    }
    $termLiteral = json_encode($term, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!is_string($termLiteral)) {
        throw new RuntimeException('מונח החיפוש אינו תקין.');
    }

    $query = 'query { boards(ids: [' . EXTERNAL_INSTALLER_SERVICE_BOARD_ID . ', ' . EXTERNAL_INSTALLER_PROJECT_BOARD_ID . ']) { id name items_page(limit: 10, query_params: { rules: [{ column_id: "name", compare_value: [' . $termLiteral . '], operator: contains_text }] }) { items { id name group { id title } } } } }';
    $response = external_monday_request($query);
    $boards = $response['data']['boards'] ?? [];
    $results = [];

    foreach (is_array($boards) ? $boards : [] as $board) {
        if (!is_array($board)) {
            continue;
        }
        $boardId = (string) ($board['id'] ?? '');
        $source = $boardId === EXTERNAL_INSTALLER_SERVICE_BOARD_ID ? 'service' : ($boardId === EXTERNAL_INSTALLER_PROJECT_BOARD_ID ? 'project' : '');
        if ($source === '') {
            continue;
        }
        foreach (($board['items_page']['items'] ?? []) as $item) {
            if (!is_array($item)) {
                continue;
            }
            $name = trim((string) ($item['name'] ?? ''));
            $itemId = trim((string) ($item['id'] ?? ''));
            if ($name === '' || !preg_match('/^\d+$/', $itemId)) {
                continue;
            }
            $results[] = [
                'board_id' => $boardId,
                'item_id' => $itemId,
                'name' => $name,
                'source' => $source,
            ];
        }
    }

    usort($results, static fn(array $a, array $b): int => strcmp((string) $a['name'], (string) $b['name']));
    $_SESSION['external_search_results'] = $results;
    return $results;
}

function external_column_text(array $item, string $id): string
{
    foreach (($item['column_values'] ?? []) as $column) {
        if (is_array($column) && (string) ($column['id'] ?? '') === $id) {
            return trim((string) ($column['text'] ?? ''));
        }
    }
    return '';
}

function external_fetch_customer(string $boardId, string $itemId): array
{
    if (!in_array($boardId, [EXTERNAL_INSTALLER_SERVICE_BOARD_ID, EXTERNAL_INSTALLER_PROJECT_BOARD_ID], true) || !preg_match('/^\d+$/', $itemId)) {
        throw new RuntimeException('הלקוח המבוקש אינו תקין.');
    }

    $columnIds = $boardId === EXTERNAL_INSTALLER_SERVICE_BOARD_ID
        ? ['date3', 'hour0', 'long_text', 'location5', 'numeric_mm0ebedq', 'location__1', 'text_mm0esa1y', 'phone', 'mirror1', 'mirror13', 'text_mkmkx6e9', 'text_mkmkqatq']
        : ['date_102', 'mirror3', 'mirror', 'phone2', 'email', 'dropdown'];

    $quotedIds = implode(',', array_map(static fn(string $id): string => '"' . $id . '"', $columnIds));
    $query = 'query ExternalCustomer($itemIds: [ID!]!) { items(ids: $itemIds) { id name board { id } group { id title } column_values(ids: [' . $quotedIds . ']) { id text } } }';
    $response = external_monday_request($query, ['itemIds' => [$itemId]]);
    $item = $response['data']['items'][0] ?? null;
    if (!is_array($item) || (string) ($item['board']['id'] ?? '') !== $boardId) {
        throw new RuntimeException('הלקוח לא נמצא במקור המאומת.');
    }

    $name = trim((string) ($item['name'] ?? ''));
    $source = $boardId === EXTERNAL_INSTALLER_SERVICE_BOARD_ID ? 'service' : 'project';

    if ($source === 'service') {
        $address = external_column_text($item, 'mirror13');
        if ($address === '') {
            $parts = array_filter([
                external_column_text($item, 'location5'),
                external_column_text($item, 'numeric_mm0ebedq'),
                external_column_text($item, 'location__1'),
                external_column_text($item, 'text_mm0esa1y') !== '' ? 'דירה ' . external_column_text($item, 'text_mm0esa1y') : '',
            ]);
            $address = implode(' ', $parts);
        }
        return [
            'board_id' => $boardId,
            'item_id' => $itemId,
            'name' => $name,
            'source' => $source,
            'work_type' => 'service',
            'date' => external_column_text($item, 'date3'),
            'time' => external_column_text($item, 'hour0'),
            'address' => $address,
            'phone' => external_column_text($item, 'phone') ?: external_column_text($item, 'mirror1'),
            'subject' => external_column_text($item, 'long_text'),
            'equipment' => trim(external_column_text($item, 'text_mkmkx6e9') . ' ' . external_column_text($item, 'text_mkmkqatq')),
        ];
    }

    return [
        'board_id' => $boardId,
        'item_id' => $itemId,
        'name' => $name,
        'source' => $source,
        'work_type' => 'installation',
        'date' => external_column_text($item, 'date_102'),
        'time' => '',
        'address' => external_column_text($item, 'mirror3'),
        'phone' => external_column_text($item, 'mirror') ?: external_column_text($item, 'phone2'),
        'subject' => 'התקנה בפרויקט',
        'equipment' => '',
    ];
}

function external_request_id(): string
{
    return 'EA-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(6));
}

function external_request_path(string $requestId): string
{
    if (!preg_match('/^EA-\d{8}-\d{6}-[a-f0-9]{12}$/', $requestId)) {
        throw new RuntimeException('מספר בקשת הגישה אינו תקין.');
    }
    return external_storage_root() . DIRECTORY_SEPARATOR . 'requests' . DIRECTORY_SEPARATOR . $requestId . '.json';
}

function external_load_request(string $requestId): array
{
    return portal_json_read(external_request_path($requestId));
}

function external_save_request(array $request): void
{
    portal_json_write(external_request_path((string) ($request['id'] ?? '')), $request);
}

function external_token_path(string $token, string $kind): string
{
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
        throw new RuntimeException('אסימון הגישה אינו תקין.');
    }
    if (!in_array($kind, ['approval', 'grant'], true)) {
        throw new RuntimeException('סוג אסימון אינו תקין.');
    }
    return external_storage_root()
        . DIRECTORY_SEPARATOR . 'tokens'
        . DIRECTORY_SEPARATOR . $kind . '-'
        . hash('sha256', $token)
        . '.json';
}

function external_public_url(array $params = []): string
{
    $base = 'https://i-feel.co.il/external-installer/';
    return $params === [] ? $base : $base . '?' . http_build_query($params);
}

function external_create_access_request(array $user, string $boardId, string $itemId): array
{
    $email = external_normalize_email((string) ($user['email'] ?? ''));
    if ($email === null || !isset(external_installer_allowlist()[$email])) {
        throw new RuntimeException('המתקין אינו מזוהה.');
    }

    $matched = false;
    foreach (($_SESSION['external_search_results'] ?? []) as $candidate) {
        if (is_array($candidate)
            && hash_equals((string) ($candidate['board_id'] ?? ''), $boardId)
            && hash_equals((string) ($candidate['item_id'] ?? ''), $itemId)) {
            $matched = true;
            break;
        }
    }
    if (!$matched) {
        throw new RuntimeException('יש לבחור לקוח מתוצאות חיפוש עדכניות.');
    }

    $customer = external_fetch_customer($boardId, $itemId);
    $profile = external_profile($email);
    if ($profile['name'] === '' || $profile['phone'] === '') {
        throw new RuntimeException('יש להשלים קודם את פרטי המתקין.');
    }

    $requestId = external_request_id();
    $request = [
        'id' => $requestId,
        'installer_email' => $email,
        'installer_name' => $profile['name'],
        'installer_phone' => $profile['phone'],
        'board_id' => $boardId,
        'item_id' => $itemId,
        'customer_name' => $customer['name'],
        'source' => $customer['source'],
        'status' => 'pending',
        'created_at' => gmdate('c'),
        'expires_at' => time() + EXTERNAL_INSTALLER_REQUEST_TTL,
    ];
    external_save_request($request);

    $token = bin2hex(random_bytes(32));
    portal_json_write(external_token_path($token, 'approval'), [
        'request_id' => $requestId,
        'expires_at' => time() + EXTERNAL_INSTALLER_REQUEST_TTL,
    ]);

    $approvalUrl = external_public_url(['approval' => $token]);
    $subject = 'אישור גישת מתקין חיצוני ללקוח: ' . $customer['name'];
    $body = implode("\r\n", [
        'התקבלה בקשת גישה חדשה באזור המתקינים החיצוניים של I Feel.',
        '',
        'מתקין: ' . $profile['name'],
        'לקוח / פרויקט: ' . $customer['name'],
        'סוג מקור: ' . ($customer['source'] === 'service' ? 'קריאת שירות' : 'פרויקט התקנה'),
        '',
        'לצפייה ולאישור:',
        $approvalUrl,
        '',
        'הקישור אינו מאשר גישה בפני עצמו. האישור דורש אימות בדוא"ל של גורם מורשה.',
        '',
        'I Feel',
    ]);

    $sent = 0;
    foreach (external_approver_emails() as $recipient) {
        if (portal_send_mail_with_attachments($recipient, $subject, $body)) {
            $sent++;
        }
    }
    if ($sent === 0) {
        $request['status'] = 'notification_failed';
        external_save_request($request);
        @unlink(external_token_path($token, 'approval'));
        throw new RuntimeException('בקשת הגישה נשמרה, אך לא ניתן היה לשלוח אותה לאישור.');
    }

    $_SESSION['external_last_request_id'] = $requestId;
    portal_audit('external_installer_access_requested', [
        'request_id' => $requestId,
        'installer_hash' => external_hash_key($email),
        'board_id' => $boardId,
        'item_id' => $itemId,
        'approver_notifications' => $sent,
    ]);
    return $request;
}

function external_request_from_approval_token(string $token): array
{
    $record = portal_json_read(external_token_path($token, 'approval'));
    if ($record === [] || (int) ($record['expires_at'] ?? 0) < time()) {
        throw new RuntimeException('בקשת האישור אינה תקפה או שפג תוקפה.');
    }
    $request = external_load_request((string) ($record['request_id'] ?? ''));
    if ($request === [] || (string) ($request['status'] ?? '') !== 'pending' || (int) ($request['expires_at'] ?? 0) < time()) {
        throw new RuntimeException('בקשת הגישה כבר טופלה או שפג תוקפה.');
    }
    return $request;
}

function external_approve_request(string $token, string $approverEmail, bool $approve): array
{
    $approverEmail = portal_normalize_company_email($approverEmail) ?? '';
    if (!in_array($approverEmail, external_approver_emails(), true)) {
        throw new RuntimeException('המשתמש אינו מורשה לאשר גישה.');
    }

    $tokenPath = external_token_path($token, 'approval');
    $request = external_request_from_approval_token($token);
    $request['status'] = $approve ? 'approved' : 'denied';
    $request['decision_at'] = gmdate('c');
    $request['decision_by'] = $approverEmail;

    if ($approve) {
        $grantToken = bin2hex(random_bytes(32));
        $request['grant_expires_at'] = time() + EXTERNAL_INSTALLER_GRANT_TTL;
        portal_json_write(external_token_path($grantToken, 'grant'), [
            'request_id' => $request['id'],
            'installer_email' => $request['installer_email'],
            'expires_at' => $request['grant_expires_at'],
        ]);
        $link = external_public_url(['grant' => $grantToken]);
        $subject = 'הגישה אושרה: ' . $request['customer_name'];
        $body = implode("\r\n", [
            'שלום ' . $request['installer_name'] . ',',
            '',
            'בקשת הגישה שלך ללקוח / פרויקט ' . $request['customer_name'] . ' אושרה.',
            'לפתיחת פרטי העבודה יש להיכנס בקישור הבא:',
            $link,
            '',
            'הקישור פותח רק את הלקוח שאושר, ורק לאחר אימות זהות המתקין.',
            'האישור תקף עד 8 שעות ואינו נותן גישה לאזור העובדים.',
            '',
            'I Feel',
        ]);
        portal_send_mail_with_attachments((string) $request['installer_email'], $subject, $body);
    } else {
        $request['grant_expires_at'] = 0;
        portal_send_mail_with_attachments(
            (string) $request['installer_email'],
            'בקשת הגישה לא אושרה: ' . $request['customer_name'],
            "בקשת הגישה ללקוח / פרויקט {$request['customer_name']} לא אושרה.\r\n\r\nI Feel"
        );
    }

    external_save_request($request);
    @unlink($tokenPath);
    portal_audit('external_installer_access_decided', [
        'request_id' => $request['id'],
        'decision' => $approve ? 'approved' : 'denied',
        'approver_hash' => external_hash_key($approverEmail),
    ]);
    return $request;
}

function external_consume_grant(string $token, array $installer): array
{
    $email = external_normalize_email((string) ($installer['email'] ?? ''));
    $path = external_token_path($token, 'grant');
    $record = portal_json_read($path);
    if ($email === null || $record === [] || (int) ($record['expires_at'] ?? 0) < time()) {
        throw new RuntimeException('קישור הגישה אינו תקף או שפג תוקפו.');
    }
    if (!hash_equals($email, external_normalize_email((string) ($record['installer_email'] ?? '')) ?? '')) {
        throw new RuntimeException('קישור הגישה שייך למתקין אחר.');
    }
    $request = external_load_request((string) ($record['request_id'] ?? ''));
    if ($request === [] || (string) ($request['status'] ?? '') !== 'approved') {
        throw new RuntimeException('בקשת הגישה אינה מאושרת.');
    }

    $_SESSION['external_customer_grant'] = [
        'request_id' => $request['id'],
        'installer_email' => $email,
        'board_id' => $request['board_id'],
        'item_id' => $request['item_id'],
        'expires_at' => min((int) ($record['expires_at'] ?? 0), time() + EXTERNAL_INSTALLER_GRANT_TTL),
    ];
    @unlink($path);
    portal_audit('external_installer_grant_consumed', [
        'request_id' => $request['id'],
        'installer_hash' => external_hash_key($email),
    ]);
    return $_SESSION['external_customer_grant'];
}

function external_active_grant(array $installer): ?array
{
    $grant = $_SESSION['external_customer_grant'] ?? null;
    $email = external_normalize_email((string) ($installer['email'] ?? ''));
    if (!is_array($grant) || $email === null || (int) ($grant['expires_at'] ?? 0) < time()) {
        unset($_SESSION['external_customer_grant']);
        return null;
    }
    if (!hash_equals($email, (string) ($grant['installer_email'] ?? ''))) {
        unset($_SESSION['external_customer_grant']);
        return null;
    }
    $request = external_load_request((string) ($grant['request_id'] ?? ''));
    if ($request === [] || (string) ($request['status'] ?? '') !== 'approved') {
        unset($_SESSION['external_customer_grant']);
        return null;
    }
    return $grant;
}

function external_report_body(array $report): string
{
    $employee = is_array($report['employee'] ?? null) ? $report['employee'] : [];
    return implode("\r\n", [
        'נשמר דיווח עבודה ממתקין חיצוני מאושר.',
        '',
        'מספר דיווח: ' . (string) ($report['id'] ?? ''),
        'מתקין: ' . (string) ($employee['name'] ?? ''),
        'דוא"ל מאומת: ' . (string) ($employee['email'] ?? ''),
        'טלפון: ' . (string) ($employee['phone'] ?? ''),
        'לקוח / פרויקט: ' . (string) ($report['customer_project'] ?? ''),
        'מקור Monday: ' . (string) ($report['approved_customer']['board_id'] ?? '') . '/' . (string) ($report['approved_customer']['item_id'] ?? ''),
        'תאריך עבודה: ' . (string) ($report['work_date'] ?? ''),
        'כתובת: ' . (string) ($report['site_address'] ?? ''),
        'תוצאה: ' . portal_work_report_outcome_label((string) ($report['outcome'] ?? 'completed')),
        '',
        'סיכום:',
        (string) ($report['summary'] ?? ''),
        '',
        'המשך טיפול:',
        (string) ($report['follow_up'] ?? ''),
        '',
        'מספר תמונות ומסמכים: ' . count($report['attachments'] ?? []),
        '',
        'I Feel',
    ]);
}

function external_submit_work_report(array $installer, array $grant): array
{
    $request = external_load_request((string) ($grant['request_id'] ?? ''));
    if ($request === [] || (string) ($request['status'] ?? '') !== 'approved') {
        throw new RuntimeException('אין אישור פעיל ללקוח זה.');
    }
    $customer = external_fetch_customer((string) $grant['board_id'], (string) $grant['item_id']);
    $profile = external_profile((string) $installer['email']);

    $type = portal_post('work_type', 40);
    $outcome = portal_post('work_outcome', 40);
    $workDate = portal_post('work_date', 20);
    $summary = portal_post('work_summary', 3000);
    $followUp = portal_post('work_follow_up', 2000);

    if (!in_array($type, ['installation', 'service'], true)) {
        throw new RuntimeException('יש לבחור סוג עבודה תקין.');
    }
    if (!in_array($outcome, ['completed', 'follow_up'], true)) {
        throw new RuntimeException('יש לבחור תוצאת עבודה.');
    }
    if (!portal_valid_date($workDate) || $summary === '') {
        throw new RuntimeException('חובה להזין תאריך וסיכום עבודה.');
    }
    if ($outcome === 'follow_up' && $followUp === '') {
        throw new RuntimeException('כאשר נדרש המשך טיפול, חובה לפרט מה נותר לבצע.');
    }

    $reportId = portal_new_work_report_id();
    $reportDir = portal_work_report_dir($reportId);
    portal_ensure_directory($reportDir);
    try {
        $attachments = portal_save_uploads($reportDir, $_FILES['work_attachments'] ?? []);
        if ($attachments === []) {
            throw new RuntimeException('חובה לצרף לפחות תמונה או מסמך אחד מסיום העבודה.');
        }
        $report = [
            'id' => $reportId,
            'type' => $type,
            'outcome' => $outcome,
            'work_date' => $workDate,
            'customer_project' => $customer['name'],
            'site_address' => $customer['address'],
            'summary' => portal_substr($summary, 0, 3000),
            'follow_up' => portal_substr($followUp, 0, 2000),
            'employee' => [
                'kind' => 'external_installer',
                'name' => $profile['name'],
                'email' => (string) $installer['email'],
                'phone' => $profile['phone'],
            ],
            'approved_customer' => [
                'request_id' => $request['id'],
                'board_id' => $customer['board_id'],
                'item_id' => $customer['item_id'],
            ],
            'attachments' => $attachments,
            'created_at' => gmdate('c'),
            'email_sent' => false,
        ];
        portal_save_work_report($report);

        $allSent = true;
        $attachmentsForEmail = portal_work_report_email_attachments($report);
        $batches = portal_attachment_batches($attachmentsForEmail);
        foreach (external_report_recipients() as $recipient) {
            foreach ($batches as $index => $batch) {
                $subject = 'דיווח מתקין חיצוני: ' . $customer['name']
                    . (count($batches) > 1 ? ' - קבצים ' . ($index + 1) . '/' . count($batches) : '');
                if (!portal_send_mail_with_attachments($recipient, $subject, external_report_body($report), $batch)) {
                    $allSent = false;
                }
            }
        }
        $report['email_sent'] = $allSent;
        $report['email_attempted_at'] = gmdate('c');
        portal_save_work_report($report);

        portal_audit('external_installer_work_report_submitted', [
            'report_id' => $reportId,
            'request_id' => $request['id'],
            'board_id' => $customer['board_id'],
            'item_id' => $customer['item_id'],
            'attachments' => count($attachments),
            'email_sent' => $allSent,
        ]);
        unset($_SESSION['external_customer_grant']);
        return $report;
    } catch (Throwable $error) {
        portal_remove_tree($reportDir);
        throw $error;
    }
}

function external_page_start(string $title): void
{
    portal_send_security_headers();
    ?>
<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title><?= portal_h($title) ?> | I Feel</title>
  <link rel="icon" type="image/png" href="/assets/favicon.png">
  <link rel="stylesheet" href="/staff-expenses/portal.css?v=<?= portal_h(IFEEL_PORTAL_VERSION) ?>">
</head>
<body>
<main class="portal-shell">
<?php
}

function external_page_end(): void
{
    ?>
</main>
</body>
</html>
<?php
}

function external_render_installer_login(?string $error = null): void
{
    external_page_start('אזור מתקין חיצוני');
    ?>
<section class="login-card">
    <img src="/assets/ifeel-logo.png" alt="I Feel" class="login-logo">
    <p class="eyebrow">גישה מוגבלת למתקינים חיצוניים</p>
    <h1>אזור מתקין חיצוני</h1>
    <p>הכניסה מותרת רק למתקינים שאושרו מראש. קוד חד פעמי יישלח לכתובת הדוא"ל הרשומה.</p>
    <?php if ($error !== null): ?><div class="alert alert--error"><?= portal_h($error) ?></div><?php endif; ?>
    <form method="post" class="stack-form">
        <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
        <input type="hidden" name="action" value="request_installer_code">
        <label><span>דוא"ל מאושר</span><input type="email" name="email" required maxlength="160" dir="ltr" autocomplete="email"></label>
        <button class="button button--primary button--wide" type="submit">שליחת קוד כניסה</button>
    </form>
    <p class="login-note">הכניסה אינה מאפשרת גישה לאזור העובדים. גם לאחר הזדהות נדרש אישור נפרד לכל לקוח.</p>
</section>
<?php
    external_page_end();
    exit;
}

function external_render_code(string $purpose, ?string $error = null): void
{
    external_page_start($purpose === 'approver' ? 'אישור גישת מתקין' : 'אימות מתקין');
    ?>
<section class="login-card">
    <img src="/assets/ifeel-logo.png" alt="I Feel" class="login-logo">
    <h1><?= $purpose === 'approver' ? 'אימות גורם מאשר' : 'אימות כתובת הדוא"ל' ?></h1>
    <p>קוד בן 6 ספרות נשלח לכתובת שאושרה. הקוד תקף ל-10 דקות.</p>
    <?php if ($error !== null): ?><div class="alert alert--error"><?= portal_h($error) ?></div><?php endif; ?>
    <form method="post" class="stack-form">
        <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
        <input type="hidden" name="action" value="<?= $purpose === 'approver' ? 'verify_approver_code' : 'verify_installer_code' ?>">
        <label><span>קוד</span><input type="text" name="code" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" required dir="ltr" autofocus></label>
        <button class="button button--primary button--wide" type="submit">אימות</button>
    </form>
</section>
<?php
    external_page_end();
    exit;
}

function external_render_profile(array $installer, ?string $error = null): void
{
    $profile = external_profile((string) $installer['email']);
    external_page_start('פרטי מתקין');
    ?>
<section class="detail-card">
    <p class="eyebrow">שלב 1</p><h1>פרטי המתקין</h1>
    <p>יש להשלים שם וטלפון. כתובת הדוא"ל אומתה ואינה ניתנת לשינוי מתוך הטופס.</p>
    <?php if ($error !== null): ?><div class="alert alert--error"><?= portal_h($error) ?></div><?php endif; ?>
    <form method="post" class="form-grid">
        <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
        <input type="hidden" name="action" value="save_external_profile">
        <label class="field"><span>שם מלא</span><input type="text" name="profile_name" required maxlength="120" value="<?= portal_h($profile['name']) ?>"></label>
        <label class="field"><span>טלפון</span><input type="tel" name="profile_phone" required maxlength="30" value="<?= portal_h($profile['phone']) ?>"></label>
        <label class="field field--full"><span>דוא"ל מאומת</span><input type="email" readonly dir="ltr" value="<?= portal_h((string) $installer['email']) ?>"></label>
        <div class="field--full"><button class="button button--primary" type="submit">שמירה והמשך</button></div>
    </form>
</section>
<?php
    external_page_end();
    exit;
}

function external_render_customer_search(array $installer, ?string $error = null, array $results = []): void
{
    $profile = external_profile((string) $installer['email']);
    $lastRequest = isset($_SESSION['external_last_request_id']) ? external_load_request((string) $_SESSION['external_last_request_id']) : [];
    external_page_start('בחירת לקוח');
    ?>
<section class="page-heading page-heading--compact">
    <div><p class="eyebrow">אזור מתקין חיצוני</p><h1>בחירת לקוח או פרויקט</h1><p>מחפשים לפי שם. לפני אישור מוצג שם בלבד, ללא כתובת, טלפון או פרטי תקלה.</p></div>
    <form method="post"><input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>"><input type="hidden" name="action" value="logout_external"><button class="button button--ghost" type="submit">יציאה</button></form>
</section>
<div class="detail-card"><strong><?= portal_h($profile['name']) ?></strong><span dir="ltr"><?= portal_h((string) $installer['email']) ?></span></div>
<?php if ($error !== null): ?><div class="alert alert--error"><?= portal_h($error) ?></div><?php endif; ?>
<?php if ($lastRequest !== [] && ($lastRequest['status'] ?? '') === 'pending'): ?><div class="alert alert--info">בקשת הגישה ל-<?= portal_h($lastRequest['customer_name'] ?? '') ?> ממתינה לאישור.</div><?php endif; ?>
<section class="detail-card">
    <form method="post" class="stack-form">
        <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
        <input type="hidden" name="action" value="search_external_customer">
        <label><span>שם לקוח / פרויקט</span><input type="search" name="customer_search" minlength="3" maxlength="80" required autocomplete="off"></label>
        <button class="button button--primary" type="submit">חיפוש</button>
    </form>
</section>
<?php if ($results !== []): ?>
<section class="detail-card">
    <h2>תוצאות</h2>
    <div class="table-wrap"><table class="records-table"><thead><tr><th>לקוח / פרויקט</th><th>סוג</th><th></th></tr></thead><tbody>
    <?php foreach ($results as $row): ?>
        <tr>
            <td><strong><?= portal_h($row['name']) ?></strong></td>
            <td><?= $row['source'] === 'service' ? 'שירות' : 'פרויקט' ?></td>
            <td>
                <form method="post">
                    <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
                    <input type="hidden" name="action" value="request_external_access">
                    <input type="hidden" name="board_id" value="<?= portal_h($row['board_id']) ?>">
                    <input type="hidden" name="item_id" value="<?= portal_h($row['item_id']) ?>">
                    <button class="button button--secondary button--small" type="submit">בקשת גישה</button>
                </form>
            </td>
        </tr>
    <?php endforeach; ?>
    </tbody></table></div>
</section>
<?php endif; ?>
<?php
    external_page_end();
    exit;
}

function external_render_approved_customer(array $installer, array $grant, ?string $error = null): void
{
    $customer = external_fetch_customer((string) $grant['board_id'], (string) $grant['item_id']);
    $profile = external_profile((string) $installer['email']);
    external_page_start('לקוח מאושר');
    ?>
<section class="page-heading page-heading--compact"><div><p class="eyebrow">גישה שאושרה</p><h1><?= portal_h($customer['name']) ?></h1><p>הגישה מוגבלת ללקוח זה ולמשך חלון האישור בלבד.</p></div></section>
<?php if ($error !== null): ?><div class="alert alert--error"><?= portal_h($error) ?></div><?php endif; ?>
<section class="detail-card">
    <h2>פרטי עבודה</h2>
    <div class="detail-grid">
        <div><span>מתקין</span><strong><?= portal_h($profile['name']) ?></strong></div>
        <div><span>טלפון לקוח</span><strong dir="ltr"><?= portal_h($customer['phone']) ?></strong></div>
        <div><span>כתובת</span><strong><?= portal_h($customer['address']) ?></strong></div>
        <div><span>תאריך מתוכנן</span><strong><?= portal_h($customer['date']) ?></strong></div>
        <?php if ($customer['time'] !== ''): ?><div><span>שעה</span><strong><?= portal_h($customer['time']) ?></strong></div><?php endif; ?>
        <div><span>נושא העבודה</span><strong><?= portal_h($customer['subject']) ?></strong></div>
        <?php if ($customer['equipment'] !== ''): ?><div><span>ציוד</span><strong><?= portal_h($customer['equipment']) ?></strong></div><?php endif; ?>
    </div>
</section>
<form method="post" enctype="multipart/form-data" class="detail-card form-grid">
    <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
    <input type="hidden" name="action" value="submit_external_work_report">
    <label class="field"><span>סוג העבודה</span><select name="work_type" required><option value="installation" <?= $customer['work_type'] === 'installation' ? 'selected' : '' ?>>סיום התקנה</option><option value="service" <?= $customer['work_type'] === 'service' ? 'selected' : '' ?>>קריאת שירות</option></select></label>
    <label class="field"><span>תאריך העבודה</span><input type="date" name="work_date" value="<?= portal_h(date('Y-m-d')) ?>" required></label>
    <label class="field field--full"><span>סיכום העבודה</span><textarea name="work_summary" rows="5" maxlength="3000" required placeholder="מה בוצע, מה נבדק ומה נשאר פתוח"></textarea></label>
    <label class="field"><span>תוצאה</span><select name="work_outcome" required><option value="completed">העבודה הושלמה</option><option value="follow_up">נדרש המשך טיפול</option></select></label>
    <label class="field field--full"><span>המשך טיפול</span><textarea name="work_follow_up" rows="3" maxlength="2000"></textarea></label>
    <div class="field field--full">
        <span>תמונות ומסמכים</span>
        <input type="file" name="work_attachments[]" multiple required accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.avif,application/pdf,image/*">
        <p class="form-note">חובה לצרף לפחות תמונה או מסמך אחד. הקבצים נשמרים באחסון פרטי.</p>
    </div>
    <div class="field--full"><button class="button button--primary" type="submit">שמירת סיכום העבודה</button></div>
</form>
<?php
    external_page_end();
    exit;
}

function external_render_approval_login(string $token, ?string $error = null): void
{
    $request = external_request_from_approval_token($token);
    external_page_start('אישור גישת מתקין');
    ?>
<section class="login-card">
    <img src="/assets/ifeel-logo.png" alt="I Feel" class="login-logo">
    <h1>אישור גישת מתקין</h1>
    <p>מתקין: <strong><?= portal_h($request['installer_name']) ?></strong><br>לקוח / פרויקט: <strong><?= portal_h($request['customer_name']) ?></strong></p>
    <p>האישור אפשרי רק לאורן, שיין או מחלקת השירות לאחר קוד שנשלח לדוא"ל הארגוני.</p>
    <?php if ($error !== null): ?><div class="alert alert--error"><?= portal_h($error) ?></div><?php endif; ?>
    <form method="post" class="stack-form">
        <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
        <input type="hidden" name="action" value="request_approver_code">
        <input type="hidden" name="approval_token" value="<?= portal_h($token) ?>">
        <label><span>דוא"ל I Feel מורשה</span><input type="email" name="approver_email" required dir="ltr" autocomplete="email"></label>
        <button class="button button--primary button--wide" type="submit">שליחת קוד לאישור</button>
    </form>
</section>
<?php
    external_page_end();
    exit;
}

function external_render_approval_decision(string $token, string $approverEmail, ?string $error = null): void
{
    $request = external_request_from_approval_token($token);
    external_page_start('החלטה על גישת מתקין');
    ?>
<section class="detail-card">
    <p class="eyebrow">בקשת גישה</p><h1><?= portal_h($request['customer_name']) ?></h1>
    <div class="detail-grid">
        <div><span>מתקין</span><strong><?= portal_h($request['installer_name']) ?></strong></div>
        <div><span>דוא"ל מתקין</span><strong dir="ltr"><?= portal_h($request['installer_email']) ?></strong></div>
        <div><span>סוג</span><strong><?= ($request['source'] ?? '') === 'service' ? 'שירות' : 'פרויקט התקנה' ?></strong></div>
        <div><span>מאשר מזוהה</span><strong dir="ltr"><?= portal_h($approverEmail) ?></strong></div>
    </div>
    <?php if ($error !== null): ?><div class="alert alert--error"><?= portal_h($error) ?></div><?php endif; ?>
    <form method="post" class="inline-form">
        <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
        <input type="hidden" name="approval_token" value="<?= portal_h($token) ?>">
        <button class="button button--primary" type="submit" name="action" value="approve_external_access">אישור גישה</button>
        <button class="button button--secondary" type="submit" name="action" value="deny_external_access">דחיית בקשה</button>
    </form>
    <p class="form-note">אישור פותח רק לקוח זה ולמשך עד 8 שעות. כניסה חדשה דורשת זיהוי ובקשת גישה חדשה.</p>
</section>
<?php
    external_page_end();
    exit;
}
