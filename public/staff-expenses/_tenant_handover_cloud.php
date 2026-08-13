<?php
declare(strict_types=1);

/**
 * Server-side Google Drive lookup for tenant-specific Home Assistant links.
 *
 * Spreadsheet IDs, service-account credentials and the complete resident list
 * never reach the browser. The caller receives only the selected resident's
 * validated HTTPS link, or a non-sensitive status explaining why none was
 * found.
 */

function portal_handover_cloud_sheet_map(): array
{
    $configured = defined('TENANT_HANDOVER_CLOUD_SHEETS')
        ? constant('TENANT_HANDOVER_CLOUD_SHEETS')
        : null;
    if ($configured === null) {
        $json = trim((string) getenv('TENANT_HANDOVER_CLOUD_SHEETS_JSON'));
        if ($json !== '') {
            $configured = json_decode($json, true);
        }
    }
    if (!is_array($configured)) {
        return [];
    }

    $map = [];
    foreach ($configured as $key => $entry) {
        if (!is_string($key) || (!is_string($entry) && !is_array($entry))) {
            continue;
        }
        if (is_string($entry)) {
            $entry = ['spreadsheet_id' => $entry];
        }
        $spreadsheetId = trim((string) ($entry['spreadsheet_id'] ?? $entry['id'] ?? ''));
        $sheet = trim((string) ($entry['sheet'] ?? ''));
        $range = strtoupper(trim((string) ($entry['range'] ?? 'A1:AZ2000')));
        if (
            preg_match('/^[A-Za-z0-9_-]{20,160}$/', $spreadsheetId) !== 1
            || ($sheet !== '' && portal_strlen($sheet) > 180)
            || preg_match('/^[A-Z]{1,3}[1-9]\d*:[A-Z]{1,3}[1-9]\d*$/', $range) !== 1
        ) {
            continue;
        }
        $map[trim($key)] = [
            'spreadsheet_id' => $spreadsheetId,
            'sheet' => $sheet,
            'range' => $range,
        ];
    }
    return $map;
}

function portal_handover_google_credentials(): array
{
    static $credentials = null;
    if (is_array($credentials)) {
        return $credentials;
    }

    $path = portal_handover_config(
        'TENANT_HANDOVER_GOOGLE_SERVICE_ACCOUNT_FILE',
        'TENANT_HANDOVER_GOOGLE_SERVICE_ACCOUNT_FILE'
    );
    if ($path === '') {
        $credentials = [];
        return $credentials;
    }
    $resolved = realpath($path);
    if ($resolved === false || !is_file($resolved) || !is_readable($resolved)) {
        throw new RuntimeException('קובץ ההרשאות של Google Drive אינו זמין לשרת.');
    }
    portal_assert_private_storage($resolved);
    $size = filesize($resolved);
    if ($size === false || $size < 100 || $size > 65536) {
        throw new RuntimeException('קובץ ההרשאות של Google Drive אינו תקין.');
    }
    $decoded = json_decode((string) file_get_contents($resolved), true);
    if (
        !is_array($decoded)
        || ($decoded['type'] ?? '') !== 'service_account'
        || filter_var((string) ($decoded['client_email'] ?? ''), FILTER_VALIDATE_EMAIL) === false
        || !str_contains((string) ($decoded['private_key'] ?? ''), 'BEGIN PRIVATE KEY')
    ) {
        throw new RuntimeException('קובץ ההרשאות של Google Drive אינו תקין.');
    }
    $tokenUri = trim((string) ($decoded['token_uri'] ?? 'https://oauth2.googleapis.com/token'));
    if ($tokenUri !== 'https://oauth2.googleapis.com/token') {
        throw new RuntimeException('כתובת האימות של Google Drive אינה מורשית.');
    }
    $credentials = [
        'client_email' => (string) $decoded['client_email'],
        'private_key' => (string) $decoded['private_key'],
        'token_uri' => $tokenUri,
    ];
    return $credentials;
}

function portal_handover_google_base64url(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function portal_handover_google_access_token(): string
{
    static $cached = null;
    if (is_array($cached) && (int) ($cached['expires_at'] ?? 0) > time() + 120) {
        return (string) $cached['token'];
    }
    $credentials = portal_handover_google_credentials();
    if ($credentials === []) {
        return '';
    }
    if (!function_exists('openssl_sign') || !function_exists('curl_init')) {
        throw new RuntimeException('שרת המסירות אינו כולל תמיכה בחיבור המאובטח ל-Google Drive.');
    }

    $now = time();
    $header = portal_handover_google_base64url((string) json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
    $claims = portal_handover_google_base64url((string) json_encode([
        'iss' => $credentials['client_email'],
        'scope' => 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets',
        'aud' => $credentials['token_uri'],
        'iat' => $now - 30,
        'exp' => $now + 3300,
    ], JSON_UNESCAPED_SLASHES));
    $unsigned = $header . '.' . $claims;
    $signature = '';
    if (!openssl_sign($unsigned, $signature, $credentials['private_key'], OPENSSL_ALGO_SHA256)) {
        throw new RuntimeException('לא ניתן לאמת את החיבור ל-Google Drive.');
    }
    $assertion = $unsigned . '.' . portal_handover_google_base64url($signature);

    $handle = curl_init($credentials['token_uri']);
    curl_setopt_array($handle, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_POSTFIELDS => http_build_query([
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion' => $assertion,
        ]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_MAXREDIRS => 0,
    ]);
    $body = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
    $curlError = curl_error($handle);
    curl_close($handle);
    $decoded = is_string($body) ? json_decode($body, true) : null;
    if (
        $curlError !== ''
        || $status < 200
        || $status >= 300
        || !is_array($decoded)
        || !is_string($decoded['access_token'] ?? null)
        || trim((string) $decoded['access_token']) === ''
    ) {
        error_log('[i-feel tenant handovers] google_auth_failed status=' . $status);
        throw new RuntimeException('לא ניתן להתחבר כרגע ל-Google Drive.');
    }
    $expiresIn = max(300, min(3600, (int) ($decoded['expires_in'] ?? 3600)));
    $cached = ['token' => trim((string) $decoded['access_token']), 'expires_at' => time() + $expiresIn];
    return (string) $cached['token'];
}

function portal_handover_google_get_json(string $url): array
{
    $host = strtolower((string) parse_url($url, PHP_URL_HOST));
    if (!in_array($host, ['www.googleapis.com', 'sheets.googleapis.com'], true)) {
        throw new RuntimeException('כתובת Google Drive אינה מורשית.');
    }
    $token = portal_handover_google_access_token();
    if ($token === '') {
        throw new RuntimeException('חיבור Google Drive למסירות טרם הוגדר בשרת.');
    }
    if (!function_exists('curl_init')) {
        throw new RuntimeException('שרת המסירות אינו כולל תמיכה בחיבור המאובטח ל-Google Drive.');
    }
    $handle = curl_init($url);
    curl_setopt_array($handle, [
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token, 'Accept: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_MAXREDIRS => 0,
    ]);
    $body = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
    $curlError = curl_error($handle);
    curl_close($handle);
    $decoded = is_string($body) ? json_decode($body, true) : null;
    if ($curlError !== '' || $status < 200 || $status >= 300 || !is_array($decoded)) {
        error_log('[i-feel tenant handovers] google_request_failed status=' . $status);
        throw new RuntimeException('לא ניתן לקרוא כרגע את קובץ הענן ב-Google Drive.');
    }
    return $decoded;
}

function portal_handover_google_post_json(string $url, array $payload): array
{
    $host = strtolower((string) parse_url($url, PHP_URL_HOST));
    if ($host !== 'sheets.googleapis.com') {
        throw new RuntimeException('כתובת Google Sheets אינה מורשית.');
    }
    $token = portal_handover_google_access_token();
    if ($token === '' || !function_exists('curl_init')) {
        throw new RuntimeException('חיבור הכתיבה ל-Google Sheets טרם הוגדר בשרת.');
    }
    $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!is_string($body)) {
        throw new RuntimeException('לא ניתן להכין את עדכון קובץ כתובות הענן.');
    }
    $handle = curl_init($url);
    curl_setopt_array($handle, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $token,
            'Accept: application/json',
            'Content-Type: application/json; charset=utf-8',
        ],
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_MAXREDIRS => 0,
    ]);
    $responseBody = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
    $curlError = curl_error($handle);
    curl_close($handle);
    $decoded = is_string($responseBody) ? json_decode($responseBody, true) : null;
    if ($curlError !== '' || $status < 200 || $status >= 300 || !is_array($decoded)) {
        error_log('[i-feel tenant handovers] google_write_failed status=' . $status);
        throw new RuntimeException('לא ניתן לסמן כרגע את כתובת הענן בקובץ Google Sheets.');
    }
    return $decoded;
}

function portal_handover_google_drive_query_value(string $value): string
{
    return str_replace(['\\', "'"], ['\\\\', "\\'"], $value);
}

function portal_handover_cloud_sheet_for_resident(array $resident, bool $fresh = false): array
{
    $projectId = trim((string) ($resident['project_id'] ?? ''));
    $sourceGroupId = trim((string) ($resident['source_group_id'] ?? ''));
    $projectTitle = trim((string) ($resident['project_title'] ?? ''));
    $titleKey = portal_handover_project_title_key($projectTitle);
    $map = portal_handover_cloud_sheet_map();
    foreach ([$projectId, $sourceGroupId, $titleKey, $projectTitle] as $key) {
        if ($key !== '' && isset($map[$key])) {
            return $map[$key];
        }
    }

    if (portal_handover_google_credentials() === []) {
        return [];
    }
    if ($projectTitle === '') {
        return [];
    }
    $cacheKey = 'cloud-sheet-' . hash('sha256', $projectTitle);
    return portal_handover_session_cache($cacheKey, 300, static function () use ($projectTitle, $titleKey): array {
        $folderId = portal_handover_config(
            'TENANT_HANDOVER_GOOGLE_DRIVE_FOLDER_ID',
            'TENANT_HANDOVER_GOOGLE_DRIVE_FOLDER_ID'
        );
        if ($folderId !== '' && preg_match('/^[A-Za-z0-9_-]{10,160}$/', $folderId) !== 1) {
            throw new RuntimeException('מזהה תיקיית Google Drive אינו תקין.');
        }
        $query = "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false and name = '"
            . portal_handover_google_drive_query_value($projectTitle) . "'";
        if ($folderId !== '') {
            $query .= " and '" . portal_handover_google_drive_query_value($folderId) . "' in parents";
        }
        $url = 'https://www.googleapis.com/drive/v3/files?'
            . http_build_query([
                'q' => $query,
                'pageSize' => 20,
                'orderBy' => 'modifiedTime desc',
                'fields' => 'files(id,name,modifiedTime)',
                'supportsAllDrives' => 'true',
                'includeItemsFromAllDrives' => 'true',
            ]);
        $response = portal_handover_google_get_json($url);
        $matches = [];
        foreach (($response['files'] ?? []) as $file) {
            if (!is_array($file)) {
                continue;
            }
            $id = trim((string) ($file['id'] ?? ''));
            $name = trim((string) ($file['name'] ?? ''));
            if (
                preg_match('/^[A-Za-z0-9_-]{20,160}$/', $id) === 1
                && portal_handover_project_title_key($name) === $titleKey
            ) {
                $matches[$id] = true;
            }
        }
        if (count($matches) !== 1) {
            return [];
        }
        return [
            'spreadsheet_id' => (string) array_key_first($matches),
            'sheet' => '',
            'range' => 'A1:AZ2000',
        ];
    }, $fresh);
}

function portal_handover_google_sheet_values(array $sheet, bool $fresh = false): array
{
    $spreadsheetId = (string) ($sheet['spreadsheet_id'] ?? '');
    $sheetName = trim((string) ($sheet['sheet'] ?? ''));
    $range = strtoupper(trim((string) ($sheet['range'] ?? 'A1:AZ2000')));
    if (
        preg_match('/^[A-Za-z0-9_-]{20,160}$/', $spreadsheetId) !== 1
        || preg_match('/^[A-Z]{1,3}[1-9]\d*:[A-Z]{1,3}[1-9]\d*$/', $range) !== 1
    ) {
        throw new RuntimeException('הגדרת קובץ הענן של הפרויקט אינה תקינה.');
    }
    $cacheKey = 'cloud-values-' . hash('sha256', $spreadsheetId . "\n" . $sheetName . "\n" . $range);
    return portal_handover_session_cache($cacheKey, 300, static function () use ($spreadsheetId, $sheetName, $range): array {
        $a1 = $range;
        if ($sheetName !== '') {
            $a1 = "'" . str_replace("'", "''", $sheetName) . "'!" . $range;
        }
        $url = 'https://sheets.googleapis.com/v4/spreadsheets/' . rawurlencode($spreadsheetId)
            . '/values/' . rawurlencode($a1)
            . '?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE';
        $response = portal_handover_google_get_json($url);
        $values = $response['values'] ?? null;
        if (!is_array($values)) {
            return [];
        }
        return array_slice(array_values(array_filter($values, 'is_array')), 0, 2000);
    }, $fresh);
}

function portal_handover_cloud_cell_key(string $value): string
{
    $value = portal_lower(trim(str_replace(["\xC2\xA0", '״', '׳'], [' ', '"', "'"], $value)));
    return (string) (preg_replace('/[^\p{L}\p{N}]+/u', '', $value) ?? '');
}

function portal_handover_cloud_column(array $row, array $aliases): ?int
{
    $keys = [];
    foreach ($aliases as $alias) {
        $keys[portal_handover_cloud_cell_key($alias)] = true;
    }
    foreach ($row as $index => $value) {
        if (isset($keys[portal_handover_cloud_cell_key((string) $value)])) {
            return (int) $index;
        }
    }
    return null;
}

function portal_handover_cloud_columns(array $values): array
{
    foreach (array_slice($values, 0, 15, true) as $rowIndex => $row) {
        if (!is_array($row)) {
            continue;
        }
        $columns = [
            'name' => portal_handover_cloud_column($row, ['שם רוכש', 'שם דייר', 'שם לקוח', 'שם הלקוח']),
            'building' => portal_handover_cloud_column($row, ['בניין', 'בנין']),
            'apartment' => portal_handover_cloud_column($row, ['דירה', 'מספר דירה']),
            'phone' => portal_handover_cloud_column($row, ['טלפון נייד', 'טלפון', 'phone']),
            'email' => portal_handover_cloud_column($row, ['כתובת דוא"ל', 'דוא"ל', 'אימייל', 'email', 'e-mail']),
            'link' => portal_handover_cloud_column($row, ['לינק', 'לינק HA', 'קישור', 'קישור HA', 'לינק ענן', 'קישור ענן', 'כתובת ענן']),
        ];
        if (
            $columns['link'] !== null
            && $columns['name'] !== null
            && ($columns['email'] !== null || $columns['phone'] !== null)
            && ($columns['apartment'] !== null || $columns['building'] !== null)
        ) {
            $columns['header_row'] = (int) $rowIndex;
            return $columns;
        }
    }
    return [];
}

function portal_handover_cloud_row_value(array $row, ?int $column): string
{
    return $column === null ? '' : trim((string) ($row[$column] ?? ''));
}

function portal_handover_cloud_unit_key(string $value, bool $building = false): string
{
    $value = portal_lower(trim($value));
    $prefix = $building ? '/^(?:בניין|בנין)\s*/u' : '/^(?:מספר\s*)?דירה\s*/u';
    $value = (string) (preg_replace($prefix, '', $value) ?? $value);
    $value = str_replace(['‐', '‑', '‒', '–', '—', '−'], '-', $value);
    $value = (string) (preg_replace('/\s+/u', '', $value) ?? $value);
    if (preg_match('/^0*\d+$/', $value) === 1) {
        return (string) ((int) $value);
    }
    return (string) (preg_replace('/[^\p{L}\p{N}-]+/u', '', $value) ?? '');
}

function portal_handover_cloud_emails(string $value): array
{
    preg_match_all('/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/iu', $value, $matches);
    return array_values(array_unique(array_map('strtolower', $matches[0] ?? [])));
}

function portal_handover_cloud_phone_keys(string $value): array
{
    $keys = [];
    foreach (preg_split('/[\r\n,;\/]+/u', $value) ?: [] as $part) {
        $digits = preg_replace('/\D+/', '', $part) ?? '';
        if (str_starts_with($digits, '972')) {
            $digits = '0' . substr($digits, 3);
        }
        if (strlen($digits) === 9 && $digits[0] === '5') {
            $digits = '0' . $digits;
        }
        if (strlen($digits) >= 9 && strlen($digits) <= 12) {
            $keys[substr($digits, -9)] = true;
        }
    }
    return array_keys($keys);
}

function portal_handover_cloud_name_key(string $value): string
{
    return (string) (preg_replace('/[^\p{L}\p{N}]+/u', '', portal_lower($value)) ?? '');
}

function portal_handover_cloud_match(array $resident, array $values): array
{
    $columns = portal_handover_cloud_columns($values);
    if ($columns === []) {
        return ['status' => 'invalid_sheet', 'link' => ''];
    }
    $residentEmail = strtolower(trim((string) ($resident['email'] ?? '')));
    $residentPhone = trim((string) ($resident['phone_digits'] ?? ''));
    $residentPhoneKey = strlen($residentPhone) >= 9 ? substr($residentPhone, -9) : '';
    $residentApartment = portal_handover_cloud_unit_key((string) ($resident['apartment'] ?? ''));
    $residentBuilding = portal_handover_cloud_unit_key((string) ($resident['building'] ?? ''), true);
    $residentName = portal_handover_cloud_name_key((string) ($resident['name'] ?? ''));
    $matches = [];

    foreach (array_slice($values, (int) $columns['header_row'] + 1) as $row) {
        if (!is_array($row)) {
            continue;
        }
        $link = portal_handover_cloud_link(portal_handover_cloud_row_value($row, $columns['link']));
        if ($link === '') {
            continue;
        }
        $rowApartment = portal_handover_cloud_unit_key(portal_handover_cloud_row_value($row, $columns['apartment']));
        $rowBuilding = portal_handover_cloud_unit_key(portal_handover_cloud_row_value($row, $columns['building']), true);
        if ($residentApartment !== '' && ($rowApartment === '' || $residentApartment !== $rowApartment)) {
            continue;
        }
        if ($residentBuilding !== '' && $columns['building'] !== null && ($rowBuilding === '' || $residentBuilding !== $rowBuilding)) {
            continue;
        }

        $emails = portal_handover_cloud_emails(portal_handover_cloud_row_value($row, $columns['email']));
        $phoneKeys = portal_handover_cloud_phone_keys(portal_handover_cloud_row_value($row, $columns['phone']));
        $emailMatch = $residentEmail !== '' && in_array($residentEmail, $emails, true);
        $phoneMatch = $residentPhoneKey !== '' && in_array($residentPhoneKey, $phoneKeys, true);
        if (!$emailMatch && !$phoneMatch) {
            continue;
        }
        $score = ($emailMatch ? 100 : 0) + ($phoneMatch ? 80 : 0);
        if ($residentApartment !== '' && $rowApartment === $residentApartment) {
            $score += 30;
        }
        if ($residentBuilding !== '' && $rowBuilding === $residentBuilding) {
            $score += 20;
        }
        $rowName = portal_handover_cloud_name_key(portal_handover_cloud_row_value($row, $columns['name']));
        if ($residentName !== '' && $rowName === $residentName) {
            $score += 15;
        }
        $matches[$link] = max($score, (int) ($matches[$link] ?? 0));
    }
    if ($matches === []) {
        return ['status' => 'not_found', 'link' => ''];
    }
    arsort($matches, SORT_NUMERIC);
    $bestScore = (int) reset($matches);
    $bestLinks = array_keys(array_filter($matches, static fn(int $score): bool => $score === $bestScore));
    if (count($bestLinks) !== 1) {
        return ['status' => 'ambiguous', 'link' => ''];
    }
    return ['status' => 'found', 'link' => (string) $bestLinks[0]];
}

function portal_handover_cloud_pool_sheet(): array
{
    return [
        'spreadsheet_id' => portal_handover_config(
            'TENANT_HANDOVER_CLOUD_POOL_SPREADSHEET_ID',
            'TENANT_HANDOVER_CLOUD_POOL_SPREADSHEET_ID',
            '1X5KFYRBez0n3oSvjhAxMnKbbbvydL3B4-i0u34aaexY'
        ),
        'sheet' => portal_handover_config(
            'TENANT_HANDOVER_CLOUD_POOL_SHEET',
            'TENANT_HANDOVER_CLOUD_POOL_SHEET',
            'homeassistant-tunnels.csv'
        ),
        'range' => 'A1:F1000',
    ];
}

function portal_handover_cloud_pool_test_entries(array $resident): array
{
    $entries = [];
    for ($index = 1; $index <= 10; $index++) {
        $entries[] = [
            'row' => $index + 1,
            'name' => 'test-pool-' . $index,
            'link' => 'https://cloud.example.com/pool/' . str_pad((string) $index, 3, '0', STR_PAD_LEFT),
            'sheet_status' => '',
        ];
    }
    return $entries;
}

function portal_handover_cloud_pool_entries(array $values): array
{
    if ($values === []) {
        return [];
    }
    $headerRow = null;
    $columns = [];
    foreach (array_slice($values, 0, 10, true) as $rowIndex => $row) {
        if (!is_array($row)) {
            continue;
        }
        $linkColumn = portal_handover_cloud_column($row, ['الموقع', 'site', 'url', 'link', 'קישור', 'כתובת ענן']);
        $nameColumn = portal_handover_cloud_column($row, ['الاسم', 'name', 'שם']);
        if ($linkColumn !== null && $nameColumn !== null) {
            $headerRow = (int) $rowIndex;
            $columns = [
                'name' => $nameColumn,
                'link' => $linkColumn,
                'status' => portal_handover_cloud_column($row, ['סטטוס', 'status', 'الحالة']),
            ];
            break;
        }
    }
    if ($headerRow === null) {
        return [];
    }
    $entries = [];
    foreach (array_slice($values, $headerRow + 1, null, true) as $rowIndex => $row) {
        if (!is_array($row)) {
            continue;
        }
        $link = portal_handover_cloud_link(portal_handover_cloud_row_value($row, $columns['link']));
        if ($link === '') {
            continue;
        }
        $status = portal_handover_cloud_cell_key(portal_handover_cloud_row_value($row, $columns['status']));
        $entries[] = [
            'row' => (int) $rowIndex + 1,
            'name' => portal_substr(portal_handover_cloud_row_value($row, $columns['name']), 0, 180),
            'link' => $link,
            'sheet_status' => $status,
        ];
    }
    return $entries;
}

function portal_handover_cloud_pool_values(bool $fresh = false): array
{
    $sheet = portal_handover_cloud_pool_sheet();
    if (
        preg_match('/^[A-Za-z0-9_-]{20,160}$/', (string) $sheet['spreadsheet_id']) !== 1
        || trim((string) $sheet['sheet']) === ''
    ) {
        throw new RuntimeException('הגדרת מאגר כתובות הענן אינה תקינה.');
    }
    return portal_handover_google_sheet_values($sheet, $fresh);
}

function portal_handover_cloud_allocation_key(array $resident): string
{
    $board = portal_handover_board_id();
    $itemId = trim((string) ($resident['item_id'] ?? ''));
    if ($itemId === '') {
        throw new RuntimeException('לא ניתן לזהות את הדייר לצורך הקצאת כתובת ענן.');
    }
    return hash('sha256', $board . "\n" . $itemId);
}

function portal_handover_cloud_allocations_file(): string
{
    return portal_storage_root() . DIRECTORY_SEPARATOR . 'tenant-cloud-allocations.json';
}

function portal_handover_cloud_with_allocation_lock(callable $callback)
{
    $lockPath = portal_storage_root() . DIRECTORY_SEPARATOR . 'tenant-cloud-allocations.lock';
    $handle = fopen($lockPath, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        if (is_resource($handle)) {
            fclose($handle);
        }
        throw new RuntimeException('לא ניתן לנעול את מאגר כתובות הענן להקצאה בטוחה.');
    }
    @chmod($lockPath, 0600);
    try {
        return $callback();
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function portal_handover_cloud_allocate(array $resident, array $entries): array
{
    $allocationKey = portal_handover_cloud_allocation_key($resident);
    return portal_handover_cloud_with_allocation_lock(static function () use ($resident, $entries, $allocationKey): array {
        $file = portal_handover_cloud_allocations_file();
        $ledger = portal_json_read($file, ['version' => 1, 'allocations' => []]);
        $allocations = is_array($ledger['allocations'] ?? null) ? $ledger['allocations'] : [];
        $existing = $allocations[$allocationKey] ?? null;
        if (is_array($existing) && portal_handover_cloud_link((string) ($existing['link'] ?? '')) !== '') {
            return $existing;
        }

        $unavailable = [];
        foreach ($allocations as $allocation) {
            if (!is_array($allocation)) {
                continue;
            }
            $link = portal_handover_cloud_link((string) ($allocation['link'] ?? ''));
            if ($link !== '') {
                $unavailable[$link] = true;
            }
        }
        $usedStatuses = ['assigned', 'allocated', 'used', 'reserved', 'הוקצה', 'שמור', 'مخصص', 'محجوز'];
        $selected = null;
        foreach ($entries as $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $link = portal_handover_cloud_link((string) ($entry['link'] ?? ''));
            $status = (string) ($entry['sheet_status'] ?? '');
            if ($link !== '' && !isset($unavailable[$link]) && !in_array($status, $usedStatuses, true)) {
                $selected = $entry;
                break;
            }
        }
        if (!is_array($selected)) {
            throw new RuntimeException('לא נותרה כתובת ענן פנויה במאגר של אריק.');
        }
        $allocation = [
            'key' => $allocationKey,
            'state' => 'reserved',
            'link' => (string) $selected['link'],
            'pool_name' => (string) ($selected['name'] ?? ''),
            'pool_row' => (int) ($selected['row'] ?? 0),
            'pool_spreadsheet_id' => (string) portal_handover_cloud_pool_sheet()['spreadsheet_id'],
            'pool_sheet' => (string) portal_handover_cloud_pool_sheet()['sheet'],
            'resident_ref' => hash('sha256', (string) ($resident['item_id'] ?? '')),
            'reserved_at' => gmdate('c'),
            'assigned_at' => null,
            'handover_id' => null,
            'sheet_sync' => 'pending',
        ];
        $allocations[$allocationKey] = $allocation;
        $ledger['version'] = 1;
        $ledger['allocations'] = $allocations;
        portal_json_write($file, $ledger);
        return $allocation;
    });
}

function portal_handover_cloud_mark_pool_row(array $allocation, string $handoverId): void
{
    $configuredSheet = portal_handover_cloud_pool_sheet();
    $sheet = [
        'spreadsheet_id' => (string) ($allocation['pool_spreadsheet_id'] ?? $configuredSheet['spreadsheet_id']),
        'sheet' => (string) ($allocation['pool_sheet'] ?? $configuredSheet['sheet']),
    ];
    $row = (int) ($allocation['pool_row'] ?? 0);
    if ($row < 2) {
        throw new RuntimeException('שורת כתובת הענן שהוקצתה אינה תקינה.');
    }
    $sheetName = (string) $sheet['sheet'];
    $currentValues = portal_handover_google_sheet_values([
        'spreadsheet_id' => (string) $sheet['spreadsheet_id'],
        'sheet' => $sheetName,
        'range' => 'A' . $row . ':F' . $row,
    ], true);
    $currentLink = portal_handover_cloud_link((string) ($currentValues[0][1] ?? ''));
    if ($currentLink === '' || !hash_equals((string) ($allocation['link'] ?? ''), $currentLink)) {
        throw new RuntimeException('שורת כתובת הענן השתנתה מאז ההקצאה ולא תסומן אוטומטית.');
    }
    $quotedSheet = "'" . str_replace("'", "''", $sheetName) . "'";
    $url = 'https://sheets.googleapis.com/v4/spreadsheets/'
        . rawurlencode((string) $sheet['spreadsheet_id'])
        . '/values:batchUpdate';
    portal_handover_google_post_json($url, [
        'valueInputOption' => 'RAW',
        'data' => [
            [
                'range' => $quotedSheet . '!C1:F1',
                'values' => [['סטטוס', 'הוקצה בתאריך', 'מזהה הקצאה', 'מספר מסירה']],
            ],
            [
                'range' => $quotedSheet . '!C' . $row . ':F' . $row,
                'values' => [[
                    'הוקצה',
                    gmdate('c'),
                    substr((string) ($allocation['key'] ?? ''), 0, 20),
                    $handoverId,
                ]],
            ],
        ],
    ]);
}

function portal_handover_cloud_finalize(array $resident, string $handoverId): array
{
    $allocationKey = portal_handover_cloud_allocation_key($resident);
    $allocation = portal_handover_cloud_with_allocation_lock(static function () use ($allocationKey, $handoverId): array {
        $file = portal_handover_cloud_allocations_file();
        $ledger = portal_json_read($file, ['version' => 1, 'allocations' => []]);
        $allocations = is_array($ledger['allocations'] ?? null) ? $ledger['allocations'] : [];
        $allocation = $allocations[$allocationKey] ?? null;
        if (!is_array($allocation)) {
            throw new RuntimeException('לא נמצאה כתובת הענן שנשמרה לדייר.');
        }
        $allocation['state'] = 'assigned';
        $allocation['assigned_at'] = gmdate('c');
        $allocation['handover_id'] = $handoverId;
        $allocation['sheet_sync'] = 'pending';
        $allocations[$allocationKey] = $allocation;
        $ledger['allocations'] = $allocations;
        portal_json_write($file, $ledger);
        return $allocation;
    });

    $synced = false;
    if ((string) getenv('IFEEL_PORTAL_TEST_MODE') === '1') {
        $synced = true;
    } else {
        try {
            portal_handover_cloud_mark_pool_row($allocation, $handoverId);
            $synced = true;
        } catch (Throwable $error) {
            error_log('[i-feel tenant handovers] cloud_pool_mark_pending handover=' . $handoverId);
        }
    }
    if ($synced) {
        $allocation['sheet_sync'] = 'synced';
        portal_handover_cloud_with_allocation_lock(static function () use ($allocationKey, $allocation): void {
            $file = portal_handover_cloud_allocations_file();
            $ledger = portal_json_read($file, ['version' => 1, 'allocations' => []]);
            $allocations = is_array($ledger['allocations'] ?? null) ? $ledger['allocations'] : [];
            $allocations[$allocationKey] = $allocation;
            $ledger['allocations'] = $allocations;
            portal_json_write($file, $ledger);
        });
    }
    return $allocation;
}

function portal_handover_cloud_lookup(array $resident, bool $fresh = false): array
{
    try {
        $entries = (string) getenv('IFEEL_PORTAL_TEST_MODE') === '1'
            ? portal_handover_cloud_pool_test_entries($resident)
            : portal_handover_cloud_pool_entries(portal_handover_cloud_pool_values($fresh));
        if ($entries === []) {
            return ['status' => 'invalid_pool', 'link' => '', 'source' => 'google_drive_pool'];
        }
        $allocation = portal_handover_cloud_allocate($resident, $entries);
        return [
            'status' => 'found',
            'link' => (string) ($allocation['link'] ?? ''),
            'source' => 'google_drive_pool',
            'allocation_state' => (string) ($allocation['state'] ?? 'reserved'),
        ];
    } catch (Throwable $error) {
        error_log('[i-feel tenant handovers] cloud_pool_allocation_failed');
        return ['status' => 'unavailable', 'link' => '', 'source' => 'google_drive_pool'];
    }
}

function portal_handover_cloud_lookup_message(array $lookup): string
{
    $messages = [
        'found' => 'כתובת ענן ייחודית נשמרה זמנית לדייר זה ממאגר הכתובות של אריק. בסיום המסירה היא תסומן כמוקצית ולא תוכל לשמש דייר אחר.',
        'invalid_pool' => 'מבנה מאגר כתובות הענן אינו תקין או שאינו מכיל כתובות.',
        'unavailable' => 'לא ניתן להקצות כרגע כתובת ענן פנויה. נסו שוב כשיש חיבור.',
    ];
    $status = (string) ($lookup['status'] ?? '');
    return $messages[$status] ?? 'לא ניתן לטעון כרגע את קישור הענן מ-Google Drive. נסו שוב כשיש חיבור.';
}
