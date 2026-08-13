<?php
declare(strict_types=1);

const IFEEL_HANDOVER_BOARD_ID = '2732725332';
const IFEEL_HANDOVER_API_VERSION = '2026-07';
const IFEEL_HANDOVER_STATUS_LABEL = 'העברה לפרויקטים - דיירים';

function portal_handover_config(string $constant, string $environment, string $fallback = ''): string
{
    $value = defined($constant) ? trim((string) constant($constant)) : '';
    if ($value === '') {
        $value = trim((string) getenv($environment));
    }
    return $value !== '' ? $value : $fallback;
}

function portal_handover_board_id(): string
{
    $boardId = portal_handover_config(
        'TENANT_HANDOVER_MONDAY_BOARD_ID',
        'TENANT_HANDOVER_MONDAY_BOARD_ID',
        IFEEL_HANDOVER_BOARD_ID
    );
    if (!preg_match('/^\d{1,20}$/', $boardId)) {
        throw new RuntimeException('מזהה לוח המסירות אינו תקין.');
    }
    return $boardId;
}

function portal_handover_monday_token(): string
{
    $token = portal_handover_config('TENANT_HANDOVER_MONDAY_TOKEN', 'TENANT_HANDOVER_MONDAY_TOKEN');
    if ($token === '') {
        $token = portal_handover_config('MONDAY_API_TOKEN', 'MONDAY_API_TOKEN');
    }
    return $token;
}

function portal_handover_api_version(): string
{
    $version = portal_handover_config(
        'TENANT_HANDOVER_MONDAY_API_VERSION',
        'TENANT_HANDOVER_MONDAY_API_VERSION',
        IFEEL_HANDOVER_API_VERSION
    );
    return preg_match('/^20\d{2}-(?:01|04|07|10)$/', $version) ? $version : IFEEL_HANDOVER_API_VERSION;
}

function portal_handover_status_label(): string
{
    return portal_handover_config(
        'TENANT_HANDOVER_MONDAY_STATUS_LABEL',
        'TENANT_HANDOVER_MONDAY_STATUS_LABEL',
        IFEEL_HANDOVER_STATUS_LABEL
    );
}

function portal_handover_test_monday_response(string $query, array $variables): array
{
    if (str_contains($query, 'HandoverProjects')) {
        return ['data' => ['boards' => [[
            'id' => IFEEL_HANDOVER_BOARD_ID,
            'groups' => [
                ['id' => 'test-project', 'title' => 'פרויקט בדיקה', 'archived' => false, 'deleted' => false],
                ['id' => 'archived-project', 'title' => 'פרויקט בארכיון', 'archived' => true, 'deleted' => false],
            ],
        ]]]];
    }
    if (str_contains($query, 'HandoverResidentsNext')) {
        return ['data' => ['next_items_page' => ['cursor' => null, 'items' => []]]];
    }
    $groupId = (string) (($variables['groupIds'][0] ?? ''));
    return ['data' => ['boards' => [[
        'groups' => [[
            'id' => $groupId,
            'title' => 'פרויקט בדיקה',
            'items_page' => [
                'cursor' => null,
                'items' => [[
                    'id' => '1001',
                    'name' => 'דייר בדיקה',
                    'column_values' => [
                        ['id' => 'numbers21', 'text' => '12'],
                        ['id' => 'text8', 'text' => '2'],
                        ['id' => 'phone', 'text' => '050-123-4567'],
                        ['id' => '_____3', 'text' => 'resident@example.com'],
                        ['id' => 'location7', 'text' => 'רחוב הבדיקה 1'],
                        ['id' => 'status', 'text' => IFEEL_HANDOVER_STATUS_LABEL],
                    ],
                ]],
            ],
        ]],
    ]]]];
}

function portal_handover_monday_request(string $query, array $variables): array
{
    if ((string) getenv('IFEEL_PORTAL_TEST_MODE') === '1') {
        return portal_handover_test_monday_response($query, $variables);
    }

    $token = portal_handover_monday_token();
    if ($token === '') {
        throw new RuntimeException('חיבור Monday למסירות טרם הוגדר בשרת.');
    }
    if (!function_exists('curl_init')) {
        throw new RuntimeException('שרת המסירות אינו כולל כרגע תמיכה בחיבור המאובטח ל-Monday.');
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
            'API-Version: ' . portal_handover_api_version(),
        ],
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_MAXREDIRS => 0,
    ]);
    $body = curl_exec($handle);
    $curlError = curl_error($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
    curl_close($handle);

    if (!is_string($body) || $body === '' || $curlError !== '' || $status < 200 || $status >= 300) {
        error_log('[i-feel tenant handovers] monday_transport_failed status=' . $status);
        throw new RuntimeException('לא ניתן לטעון כרגע נתונים מ-Monday. נסו שוב בעוד רגע.');
    }
    $decoded = json_decode($body, true);
    if (!is_array($decoded) || isset($decoded['errors']) || !isset($decoded['data'])) {
        error_log('[i-feel tenant handovers] monday_graphql_failed');
        throw new RuntimeException('Monday החזיר תשובה לא תקינה. לא בוצע שינוי בנתונים.');
    }
    return $decoded;
}

function portal_handover_session_cache(string $key, int $ttl, callable $loader, bool $fresh = false): array
{
    $cache = $_SESSION['portal_handover_cache'][$key] ?? null;
    if (!$fresh && is_array($cache) && (int) ($cache['expires_at'] ?? 0) >= time() && is_array($cache['value'] ?? null)) {
        return $cache['value'];
    }
    $value = $loader();
    $_SESSION['portal_handover_cache'][$key] = [
        'expires_at' => time() + $ttl,
        'value' => $value,
    ];
    return $value;
}

function portal_handover_projects(bool $fresh = false): array
{
    return portal_handover_session_cache('projects', 60, static function (): array {
        $response = portal_handover_monday_request(
            'query HandoverProjects($boardIds: [ID!]) { boards(ids: $boardIds) { id groups { id title archived deleted } } }',
            ['boardIds' => [portal_handover_board_id()]]
        );
        $boards = $response['data']['boards'] ?? [];
        if (!is_array($boards) || !isset($boards[0]) || !is_array($boards[0])) {
            throw new RuntimeException('לוח המכירות לא נמצא ב-Monday.');
        }
        $projects = [];
        foreach (($boards[0]['groups'] ?? []) as $group) {
            if (!is_array($group) || ($group['archived'] ?? false) || ($group['deleted'] ?? false)) {
                continue;
            }
            $id = trim((string) ($group['id'] ?? ''));
            $title = trim((string) ($group['title'] ?? ''));
            if ($id !== '' && $title !== '' && preg_match('/^[A-Za-z0-9_-]{1,128}$/', $id)) {
                $projects[$id] = ['id' => $id, 'title' => portal_substr($title, 0, 255)];
            }
        }
        uasort($projects, static fn(array $a, array $b): int => strnatcasecmp($a['title'], $b['title']));
        return $projects;
    }, $fresh);
}

function portal_handover_column_text(array $item, string $columnId): string
{
    foreach (($item['column_values'] ?? []) as $column) {
        if (is_array($column) && (string) ($column['id'] ?? '') === $columnId) {
            return trim((string) ($column['text'] ?? ''));
        }
    }
    return '';
}

function portal_handover_normalize_resident(array $item, string $projectId, string $projectTitle): ?array
{
    $itemId = trim((string) ($item['id'] ?? ''));
    $name = trim((string) ($item['name'] ?? ''));
    $apartment = portal_handover_column_text($item, 'numbers21');
    $status = portal_handover_column_text($item, 'status');
    if (!preg_match('/^\d{1,20}$/', $itemId) || $name === '' || $apartment === '') {
        return null;
    }
    if (portal_handover_status_label() !== '' && $status !== portal_handover_status_label()) {
        return null;
    }
    $phoneText = portal_handover_column_text($item, 'phone');
    $phoneDigits = preg_replace('/\D+/', '', $phoneText) ?? '';
    $emailText = strtolower(portal_handover_column_text($item, '_____3'));
    $email = filter_var($emailText, FILTER_VALIDATE_EMAIL) !== false ? $emailText : '';
    return [
        'item_id' => $itemId,
        'project_id' => $projectId,
        'project_title' => portal_substr($projectTitle, 0, 255),
        'name' => portal_substr($name, 0, 180),
        'apartment' => portal_substr($apartment, 0, 40),
        'building' => portal_substr(portal_handover_column_text($item, 'text8'), 0, 80),
        'phone' => portal_substr($phoneText, 0, 80),
        'phone_digits' => portal_substr($phoneDigits, 0, 30),
        'email' => portal_substr($email, 0, 160),
        'location' => portal_substr(portal_handover_column_text($item, 'location7'), 0, 300),
    ];
}

function portal_handover_parse_residents(array $items, string $projectId, string $projectTitle): array
{
    $residents = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $resident = portal_handover_normalize_resident($item, $projectId, $projectTitle);
        if ($resident !== null) {
            $residents[$resident['item_id']] = $resident;
        }
    }
    uasort($residents, static function (array $a, array $b): int {
        $building = strnatcasecmp((string) $a['building'], (string) $b['building']);
        return $building !== 0 ? $building : strnatcasecmp((string) $a['apartment'], (string) $b['apartment']);
    });
    return $residents;
}

function portal_handover_residents(string $groupId, bool $fresh = false): array
{
    if (!preg_match('/^[A-Za-z0-9_-]{1,128}$/', $groupId)) {
        throw new InvalidArgumentException('הפרויקט שנבחר אינו תקין.');
    }
    $projects = portal_handover_projects($fresh);
    if (!isset($projects[$groupId])) {
        throw new RuntimeException('הפרויקט שנבחר אינו קיים או אינו פעיל.');
    }
    return portal_handover_session_cache('residents-' . hash('sha256', $groupId), 30, static function () use ($groupId, $projects): array {
        $query = <<<'GRAPHQL'
query HandoverResidents($boardIds: [ID!], $groupIds: [String]) {
  boards(ids: $boardIds) {
    groups(ids: $groupIds) {
      id
      title
      items_page(limit: 500) {
        cursor
        items {
          id
          name
          column_values(ids: ["numbers21", "text8", "phone", "_____3", "location7", "status"]) { id text }
        }
      }
    }
  }
}
GRAPHQL;
        $response = portal_handover_monday_request($query, [
            'boardIds' => [portal_handover_board_id()],
            'groupIds' => [$groupId],
        ]);
        $group = $response['data']['boards'][0]['groups'][0] ?? null;
        if (!is_array($group) || (string) ($group['id'] ?? '') !== $groupId) {
            throw new RuntimeException('קבוצת הפרויקט לא נמצאה ב-Monday.');
        }
        $page = is_array($group['items_page'] ?? null) ? $group['items_page'] : [];
        $items = is_array($page['items'] ?? null) ? $page['items'] : [];
        $cursor = is_string($page['cursor'] ?? null) ? $page['cursor'] : null;
        $pages = 1;
        while ($cursor !== null && $cursor !== '' && $pages < 20) {
            $next = portal_handover_monday_request(
                'query HandoverResidentsNext($cursor: String!) { next_items_page(limit: 500, cursor: $cursor) { cursor items { id name column_values(ids: ["numbers21", "text8", "phone", "_____3", "location7", "status"]) { id text } } } }',
                ['cursor' => $cursor]
            );
            $nextPage = $next['data']['next_items_page'] ?? null;
            if (!is_array($nextPage)) {
                break;
            }
            $nextItems = is_array($nextPage['items'] ?? null) ? $nextPage['items'] : [];
            $items = array_merge($items, $nextItems);
            $cursor = is_string($nextPage['cursor'] ?? null) ? $nextPage['cursor'] : null;
            $pages++;
        }
        return portal_handover_parse_residents($items, $groupId, (string) $projects[$groupId]['title']);
    }, $fresh);
}

function portal_handover_resident(string $groupId, string $itemId, bool $fresh = false): array
{
    if (!preg_match('/^\d{1,20}$/', $itemId)) {
        throw new InvalidArgumentException('הדייר שנבחר אינו תקין.');
    }
    $residents = portal_handover_residents($groupId, $fresh);
    if (!isset($residents[$itemId])) {
        throw new RuntimeException('הדייר שנבחר אינו משויך לפרויקט או אינו מוכן להעברה.');
    }
    return $residents[$itemId];
}

function portal_handover_credentials(array $resident): array
{
    $email = trim((string) ($resident['email'] ?? ''));
    $password = preg_replace('/\D+/', '', (string) ($resident['phone'] ?? '')) ?? '';
    return [
        'username' => $email !== '' ? $email : 'support@i-feel.co.il',
        'password' => $password,
    ];
}

function portal_handover_internal_recipients(array $user): array
{
    $values = ['sagiv@i-feel.co.il', 'support@i-feel.co.il'];
    $configured = portal_handover_config('TENANT_HANDOVER_INTERNAL_RECIPIENTS', 'TENANT_HANDOVER_INTERNAL_RECIPIENTS');
    if ($configured !== '') {
        $values = array_merge($values, preg_split('/[\s,;]+/', $configured) ?: []);
    }
    $values[] = (string) ($user['email'] ?? '');
    $recipients = [];
    foreach ($values as $value) {
        $email = portal_normalize_company_email((string) $value);
        if ($email !== null) {
            $recipients[$email] = true;
        }
    }
    return array_keys($recipients);
}

function portal_new_handover_id(): string
{
    return 'THO-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(6));
}

function portal_handover_dir(string $handoverId): string
{
    if (!preg_match('/^THO-(\d{4})(\d{2})\d{2}-\d{6}-[a-f0-9]{12}$/', $handoverId, $match)) {
        throw new InvalidArgumentException('מספר המסירה אינו תקין.');
    }
    return portal_storage_root()
        . DIRECTORY_SEPARATOR . 'tenant-handovers'
        . DIRECTORY_SEPARATOR . $match[1]
        . DIRECTORY_SEPARATOR . $match[2]
        . DIRECTORY_SEPARATOR . $handoverId;
}

function portal_handover_file(string $handoverId): string
{
    return portal_handover_dir($handoverId) . DIRECTORY_SEPARATOR . 'metadata.json';
}

function portal_save_handover(array $handover): void
{
    portal_json_write(portal_handover_file((string) ($handover['id'] ?? '')), $handover);
}

function portal_load_handover(string $handoverId): ?array
{
    try {
        $record = portal_json_read(portal_handover_file($handoverId));
        return $record === [] ? null : $record;
    } catch (InvalidArgumentException $error) {
        return null;
    }
}

function portal_all_handovers(): array
{
    $pattern = portal_storage_root()
        . DIRECTORY_SEPARATOR . 'tenant-handovers'
        . DIRECTORY_SEPARATOR . '*'
        . DIRECTORY_SEPARATOR . '*'
        . DIRECTORY_SEPARATOR . '*'
        . DIRECTORY_SEPARATOR . 'metadata.json';
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

function portal_handovers_for_user(array $user): array
{
    if (($user['role'] ?? '') === 'admin') {
        return portal_all_handovers();
    }
    $email = portal_normalize_company_email((string) ($user['email'] ?? '')) ?? '';
    return array_values(array_filter(portal_all_handovers(), static function (array $handover) use ($email): bool {
        $technician = portal_normalize_company_email((string) ($handover['technician']['email'] ?? '')) ?? '';
        return $email !== '' && $technician !== '' && hash_equals($email, $technician);
    }));
}

function portal_handover_save_photo(string $recordDir, array $file, string $label): array
{
    $items = portal_normalize_files_array($file);
    if (count($items) !== 1 || (int) ($items[0]['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        throw new RuntimeException('חובה לצרף ' . $label . '.');
    }
    $saved = portal_save_uploads($recordDir, $file);
    if (count($saved) !== 1 || !str_starts_with((string) ($saved[0]['mime'] ?? ''), 'image/')) {
        throw new RuntimeException($label . ' חייב להיות קובץ תמונה.');
    }
    return $saved[0];
}

function portal_handover_submission_token(): string
{
    $token = $_SESSION['portal_handover_submission_token'] ?? '';
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) {
        $token = bin2hex(random_bytes(32));
        $_SESSION['portal_handover_submission_token'] = $token;
    }
    return $token;
}

function portal_handover_verify_submission_token(string $token): void
{
    $expected = (string) ($_SESSION['portal_handover_submission_token'] ?? '');
    if ($expected === '' || !preg_match('/^[a-f0-9]{64}$/', $token) || !hash_equals($expected, $token)) {
        throw new RuntimeException('טופס המסירה פג תוקף או כבר נשלח. יש לטעון אותו מחדש.');
    }
}

function portal_handover_attachment_path(array $handover, string $key): ?array
{
    $attachment = $handover['photos'][$key] ?? null;
    if (!is_array($attachment)) {
        return null;
    }
    $storageName = basename((string) ($attachment['storage_name'] ?? ''));
    if ($storageName === '' || $storageName !== (string) ($attachment['storage_name'] ?? '')) {
        return null;
    }
    $path = portal_handover_dir((string) ($handover['id'] ?? '')) . DIRECTORY_SEPARATOR . 'files' . DIRECTORY_SEPARATOR . $storageName;
    if (!is_file($path)) {
        return null;
    }
    return [
        'path' => $path,
        'name' => (string) ($attachment['original_name'] ?? 'handover-photo'),
        'mime' => (string) ($attachment['mime'] ?? 'application/octet-stream'),
        'size' => (int) ($attachment['size'] ?? filesize($path)),
    ];
}

function portal_handover_email_attachments(array $handover): array
{
    $attachments = [];
    foreach (['controller', 'switch'] as $key) {
        $attachment = portal_handover_attachment_path($handover, $key);
        if ($attachment !== null) {
            $attachments[] = $attachment;
        }
    }
    return $attachments;
}

function portal_handover_protected_url(array $handover, string $key): string
{
    return rtrim(portal_public_origin(), '/') . portal_url([
        'action' => 'handover_download',
        'handover_id' => (string) ($handover['id'] ?? ''),
        'file' => $key,
    ]);
}

function portal_handover_internal_email_body(array $handover): string
{
    $resident = is_array($handover['resident'] ?? null) ? $handover['resident'] : [];
    $technician = is_array($handover['technician'] ?? null) ? $handover['technician'] : [];
    $credentials = is_array($handover['credentials'] ?? null) ? $handover['credentials'] : [];
    $details = is_array($handover['details'] ?? null) ? $handover['details'] : [];
    return implode("\r\n", [
        'מסירת דייר הושלמה ונשמרה במערכת העובדים.',
        '',
        'מספר מסירה: ' . (string) ($handover['id'] ?? ''),
        'פרויקט: ' . (string) ($resident['project_title'] ?? ''),
        'בניין: ' . ((string) ($resident['building'] ?? '') ?: 'לא רלוונטי'),
        'דירה: ' . (string) ($resident['apartment'] ?? ''),
        'דייר: ' . (string) ($resident['name'] ?? ''),
        'טלפון: ' . (string) ($resident['phone'] ?? ''),
        'דוא״ל: ' . ((string) ($resident['email'] ?? '') ?: 'לא קיים'),
        'כתובת: ' . (string) ($resident['location'] ?? ''),
        '',
        'שם משתמש: ' . (string) ($credentials['username'] ?? ''),
        'סיסמה ראשונית: ' . (string) ($credentials['password'] ?? ''),
        '',
        'מוכן לפרוטוקול: ' . portal_handover_ready_label((string) ($details['ready'] ?? '')),
        'תאריך מסירה: ' . (string) ($details['date'] ?? ''),
        'מיקום קונטרולר: ' . (string) ($details['controller_location'] ?? ''),
        'קונטרולר: ' . portal_handover_controller_label((string) ($details['controller'] ?? '')),
        'אייקונים במפסק: ' . portal_handover_icons_label((string) ($details['icons'] ?? '')),
        'מפסק 9: ' . (string) ($details['switch_9'] ?? ''),
        'תריסים: ' . (string) ($details['blinds'] ?? ''),
        'דוד: ' . (string) ($details['boiler'] ?? ''),
        'הערות: ' . (string) ($details['notes'] ?? ''),
        '',
        'טכנאי: ' . (string) ($technician['name'] ?? ''),
        'דוא״ל טכנאי: ' . (string) ($technician['email'] ?? ''),
        '',
        'צילום קונטרולר (דורש כניסה לאזור העובדים):',
        portal_handover_protected_url($handover, 'controller'),
        'צילום מפסק 9:',
        portal_handover_protected_url($handover, 'switch'),
        '',
        'התמונות מצורפות גם להודעה זו.',
    ]);
}

function portal_handover_resident_email_body(array $handover): string
{
    $resident = is_array($handover['resident'] ?? null) ? $handover['resident'] : [];
    $credentials = is_array($handover['credentials'] ?? null) ? $handover['credentials'] : [];
    $building = trim((string) ($resident['building'] ?? ''));
    $location = $building !== '' ? ' (בניין ' . $building . ')' : '';
    return implode("\r\n", [
        'שלום ' . (string) ($resident['name'] ?? '') . ',',
        '',
        'צוות I Feel סיים את מסירת מערכת הבית החכם בדירה ' . (string) ($resident['apartment'] ?? '') . $location . ', בפרויקט ' . (string) ($resident['project_title'] ?? '') . '.',
        '',
        'פרטי הכניסה שלך לאפליקציה:',
        'שם משתמש: ' . (string) ($credentials['username'] ?? ''),
        'סיסמה ראשונית: ' . (string) ($credentials['password'] ?? ''),
        '',
        'מומלץ להחליף את הסיסמה לאחר הכניסה הראשונה, אם האפליקציה מאפשרת זאת.',
        '',
        'תודה שבחרתם ב-I Feel!',
        '03-508-9553',
    ]);
}

function portal_handover_send_internal(array $handover, array $user): array
{
    $recipients = portal_handover_internal_recipients($user);
    if ((string) getenv('IFEEL_PORTAL_TEST_MODE') === '1') {
        return ['recipients' => $recipients, 'sent' => $recipients, 'failed' => []];
    }
    $attachments = portal_handover_email_attachments($handover);
    $batches = portal_attachment_batches($attachments);
    $sent = [];
    $failed = [];
    foreach ($recipients as $recipient) {
        $recipientOk = true;
        foreach ($batches as $index => $batch) {
            $subject = 'מסירה הושלמה — ' . (string) ($handover['resident']['project_title'] ?? '')
                . ' · דירה ' . (string) ($handover['resident']['apartment'] ?? '')
                . (count($batches) > 1 ? ' · קבצים ' . ($index + 1) . '/' . count($batches) : '');
            if (!portal_send_mail_with_attachments($recipient, $subject, portal_handover_internal_email_body($handover), $batch)) {
                $recipientOk = false;
                break;
            }
        }
        if ($recipientOk) {
            $sent[] = $recipient;
        } else {
            $failed[] = $recipient;
        }
    }
    return ['recipients' => $recipients, 'sent' => $sent, 'failed' => $failed];
}

function portal_handover_send_resident(array $handover): array
{
    $email = strtolower(trim((string) ($handover['resident']['email'] ?? '')));
    if ($email === '' || $email === 'support@i-feel.co.il' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        return ['recipient' => '', 'status' => 'skipped'];
    }
    if ((string) getenv('IFEEL_PORTAL_TEST_MODE') === '1') {
        return ['recipient' => $email, 'status' => 'sent'];
    }
    $subject = 'סיום מסירה — מערכת בית חכם I Feel · דירה ' . (string) ($handover['resident']['apartment'] ?? '');
    $sent = portal_send_mail_with_attachments($email, $subject, portal_handover_resident_email_body($handover));
    return ['recipient' => $email, 'status' => $sent ? 'sent' : 'failed'];
}

function portal_handover_ready_label(string $value): string
{
    return ['ready' => 'מוכן', 'not_ready' => 'לא מוכן', 'delivered' => 'נמסר'][$value] ?? '-';
}

function portal_handover_controller_label(string $value): string
{
    return ['raspberry_pi' => 'רספברי פיי', 'ava_hab' => 'AVA-HAB'][$value] ?? '-';
}

function portal_handover_icons_label(string $value): string
{
    return ['done' => 'בוצע', 'not_done' => 'לא בוצע', 'partial' => 'חלקי'][$value] ?? '-';
}

function portal_handover_controller_location(string $value, string $other): string
{
    $labels = [
        'communications_cabinet' => 'ארון תקשורת',
        'developer_rep' => 'אחראי הפרויקט מטעם היזם',
        'ifeel' => 'בחברת I Feel',
    ];
    if (isset($labels[$value])) {
        return $labels[$value];
    }
    if ($value === 'other' && $other !== '') {
        return 'אחר: ' . portal_substr($other, 0, 300);
    }
    return '';
}

function portal_handle_tenant_handover_post(array $user): void
{
    portal_verify_csrf();
    portal_handover_verify_submission_token(portal_post('handover_submission_token', 64));
    $groupId = portal_post('handover_project_id', 128);
    $itemId = portal_post('handover_resident_id', 20);
    $resident = portal_handover_resident($groupId, $itemId, true);
    $credentials = portal_handover_credentials($resident);
    if ($credentials['password'] === '') {
        throw new RuntimeException('לדייר אין מספר טלפון תקין ב-Monday ולכן לא ניתן להפיק סיסמה.');
    }

    $ready = portal_post('handover_ready', 30);
    $date = portal_post('handover_date', 20);
    $controllerLocationKey = portal_post('handover_controller_location', 40);
    $controllerLocation = portal_handover_controller_location(
        $controllerLocationKey,
        portal_post('handover_controller_location_other', 300)
    );
    $controller = portal_post('handover_controller', 40);
    $icons = portal_post('handover_icons', 40);
    if ($ready !== '' && !in_array($ready, ['ready', 'not_ready', 'delivered'], true)) {
        throw new RuntimeException('סטטוס המוכנות אינו תקין.');
    }
    if (!portal_valid_date($date)) {
        throw new RuntimeException('תאריך המסירה אינו תקין.');
    }
    if ($controllerLocationKey !== '' && $controllerLocation === '') {
        throw new RuntimeException('יש לפרט את מיקום הקונטרולר.');
    }
    if ($controller !== '' && !in_array($controller, ['raspberry_pi', 'ava_hab'], true)) {
        throw new RuntimeException('סוג הקונטרולר אינו תקין.');
    }
    if ($icons !== '' && !in_array($icons, ['done', 'not_done', 'partial'], true)) {
        throw new RuntimeException('סטטוס האייקונים אינו תקין.');
    }

    $profile = portal_employee_profile($user);
    $technicianEmail = portal_normalize_company_email((string) ($user['email'] ?? ''));
    if ($technicianEmail === null) {
        throw new RuntimeException('לא ניתן לזהות את כתובת הדוא״ל הארגונית של הטכנאי.');
    }
    $technicianName = trim((string) ($profile['name'] ?? $user['display_name'] ?? ''));
    if ($technicianName === '') {
        $technicianName = $technicianEmail;
    }

    $handoverId = portal_new_handover_id();
    $recordDir = portal_handover_dir($handoverId);
    portal_ensure_directory($recordDir);
    try {
        $controllerPhoto = portal_handover_save_photo($recordDir, $_FILES['handover_controller_photo'] ?? [], 'צילום הקונטרולר');
        $switchPhoto = portal_handover_save_photo($recordDir, $_FILES['handover_switch_photo'] ?? [], 'צילום מפסק 9 עם האייקונים');
        $handover = [
            'id' => $handoverId,
            'created_at' => gmdate('c'),
            'updated_at' => gmdate('c'),
            'source' => [
                'system' => 'monday',
                'board_id' => portal_handover_board_id(),
                'group_id' => $groupId,
                'item_id' => $itemId,
            ],
            'resident' => $resident,
            'credentials' => $credentials,
            'details' => [
                'ready' => $ready,
                'date' => $date,
                'controller_location' => $controllerLocation,
                'controller' => $controller,
                'icons' => $icons,
                'switch_9' => portal_post('handover_switch_9', 500),
                'blinds' => portal_post('handover_blinds', 500),
                'boiler' => portal_post('handover_boiler', 500),
                'notes' => portal_post('handover_notes', 3000),
            ],
            'technician' => [
                'name' => portal_substr($technicianName, 0, 180),
                'email' => $technicianEmail,
            ],
            'photos' => [
                'controller' => $controllerPhoto,
                'switch' => $switchPhoto,
            ],
            'notifications' => [
                'internal' => ['recipients' => portal_handover_internal_recipients($user), 'sent' => [], 'failed' => []],
                'resident' => ['recipient' => (string) ($resident['email'] ?? ''), 'status' => 'pending'],
            ],
        ];
        portal_save_handover($handover);
        unset($_SESSION['portal_handover_submission_token']);

        try {
            $handover['notifications']['internal'] = portal_handover_send_internal($handover, $user);
        } catch (Throwable $error) {
            error_log('[i-feel tenant handovers] internal_email_failed handover=' . $handoverId);
            $handover['notifications']['internal']['failed'] = $handover['notifications']['internal']['recipients'];
        }
        try {
            $handover['notifications']['resident'] = portal_handover_send_resident($handover);
        } catch (Throwable $error) {
            error_log('[i-feel tenant handovers] resident_email_failed handover=' . $handoverId);
            $handover['notifications']['resident']['status'] = 'failed';
        }
        $handover['updated_at'] = gmdate('c');
        portal_save_handover($handover);

        $internalFailed = $handover['notifications']['internal']['failed'] ?? [];
        $residentStatus = (string) ($handover['notifications']['resident']['status'] ?? 'failed');
        $allSent = $internalFailed === [] && in_array($residentStatus, ['sent', 'skipped'], true);
        portal_audit('tenant_handover_submitted', [
            'handover_id' => $handoverId,
            'monday_item_hash' => hash('sha256', $itemId),
            'photos' => 2,
            'internal_email_ok' => $internalFailed === [],
            'resident_email_status' => $residentStatus,
        ]);
        portal_flash_set(
            $allSent ? 'success' : 'error',
            $allSent
                ? 'המסירה נשמרה, התמונות אובטחו וההודעות נשלחו. מספר מסירה: ' . $handoverId
                : 'המסירה והתמונות נשמרו, אך לפחות הודעת דוא״ל אחת דורשת טיפול ידני. מספר מסירה: ' . $handoverId
        );
        portal_redirect(['tab' => 'handovers', 'submitted' => $handoverId]);
    } catch (Throwable $error) {
        if (!is_file(portal_handover_file($handoverId))) {
            portal_remove_tree($recordDir);
        }
        throw $error;
    }
}

function portal_handle_handover_download(array $user): void
{
    portal_require_login();
    $handoverId = trim((string) ($_GET['handover_id'] ?? ''));
    $key = trim((string) ($_GET['file'] ?? ''));
    if (!in_array($key, ['controller', 'switch'], true)) {
        throw new RuntimeException('קובץ המסירה המבוקש אינו תקין.');
    }
    $handover = portal_load_handover($handoverId);
    if ($handover === null) {
        throw new RuntimeException('המסירה המבוקשת לא נמצאה.');
    }
    $attachment = portal_handover_attachment_path($handover, $key);
    if ($attachment === null) {
        throw new RuntimeException('צילום המסירה לא נמצא.');
    }
    portal_audit('tenant_handover_photo_downloaded', ['handover_id' => $handoverId, 'file' => $key]);
    header('Content-Type: ' . $attachment['mime']);
    header('Content-Length: ' . (string) filesize($attachment['path']));
    header('Content-Disposition: inline; filename="handover-' . $key . '.' . pathinfo($attachment['path'], PATHINFO_EXTENSION) . '"');
    readfile($attachment['path']);
    exit;
}

function portal_render_tenant_handover_form(array $user, array $projects, string $projectId, array $residents, string $building, ?array $resident): void
{
    $buildings = [];
    foreach ($residents as $candidate) {
        $candidateBuilding = trim((string) ($candidate['building'] ?? ''));
        if ($candidateBuilding !== '') {
            $buildings[$candidateBuilding] = true;
        }
    }
    $buildings = array_keys($buildings);
    usort($buildings, 'strnatcasecmp');
    $residentId = (string) ($resident['item_id'] ?? '');
    ?>
    <section class="page-heading page-heading--compact">
        <div>
            <p class="eyebrow">מסירה מהשטח</p>
            <h1>מסירת מערכת בית חכם לדייר</h1>
            <p>הדיירים נטענים בזמן אמת מ-Monday. פרטי לקוח ותמונות נשמרים רק באחסון הפרטי של אזור העובדים.</p>
        </div>
    </section>

    <form method="get" class="detail-card form-grid handover-selector" data-handover-selector>
        <input type="hidden" name="tab" value="handovers">
        <label class="field">
            <span>פרויקט <b>*</b></span>
            <select name="handover_project" data-handover-autosubmit required>
                <option value="">בחירת קבוצה מ-Monday</option>
                <?php foreach ($projects as $project): ?>
                    <option value="<?= portal_h($project['id']) ?>" <?= $projectId === $project['id'] ? 'selected' : '' ?>><?= portal_h($project['title']) ?></option>
                <?php endforeach; ?>
            </select>
        </label>
        <?php if ($projectId !== '' && $buildings !== []): ?>
            <label class="field">
                <span>בניין <b>*</b></span>
                <select name="handover_building" data-handover-autosubmit required>
                    <option value="">בחירת בניין</option>
                    <?php foreach ($buildings as $option): ?><option value="<?= portal_h($option) ?>" <?= $building === $option ? 'selected' : '' ?>>בניין <?= portal_h($option) ?></option><?php endforeach; ?>
                </select>
            </label>
        <?php endif; ?>
        <?php if ($projectId !== '' && ($buildings === [] || $building !== '')): ?>
            <label class="field">
                <span>דירה <b>*</b></span>
                <select name="handover_resident" required>
                    <option value="">בחירת דירה</option>
                    <?php foreach ($residents as $candidate): ?>
                        <?php if ($buildings !== [] && (string) $candidate['building'] !== $building) { continue; } ?>
                        <option value="<?= portal_h($candidate['item_id']) ?>" <?= $residentId === $candidate['item_id'] ? 'selected' : '' ?>>דירה <?= portal_h($candidate['apartment']) ?> · <?= portal_h($candidate['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </label>
            <div class="field field--actions"><button type="submit" class="button button--secondary">טעינת פרטי הדייר</button></div>
        <?php endif; ?>
    </form>

    <?php if ($projectId !== '' && $residents === []): ?>
        <div class="alert alert--info">לא נמצאו בקבוצה פריטים עם סטטוס “<?= portal_h(portal_handover_status_label()) ?>” ומספר דירה.</div>
    <?php endif; ?>

    <?php if ($resident === null) { return; } ?>
    <?php $credentials = portal_handover_credentials($resident); $profile = portal_employee_profile($user); ?>
    <section class="detail-card handover-resident-card">
        <h2>פרטי הדייר ופרטי הכניסה</h2>
        <div class="detail-grid">
            <div class="detail-item"><span>דייר</span><strong><?= portal_h($resident['name']) ?></strong></div>
            <div class="detail-item"><span>בניין ודירה</span><strong><?= portal_h($resident['building'] !== '' ? 'בניין ' . $resident['building'] . ' · דירה ' . $resident['apartment'] : 'דירה ' . $resident['apartment']) ?></strong></div>
            <div class="detail-item"><span>טלפון</span><strong dir="ltr"><?= portal_h($resident['phone'] ?: 'חסר ב-Monday') ?></strong></div>
            <div class="detail-item"><span>דוא״ל</span><strong dir="ltr"><?= portal_h($resident['email'] ?: 'חסר — פרטי הכניסה ינותבו לתמיכה') ?></strong></div>
            <div class="detail-item credential-item"><span>שם משתמש</span><strong dir="ltr"><?= portal_h($credentials['username']) ?></strong></div>
            <div class="detail-item credential-item"><span>סיסמה ראשונית</span><strong dir="ltr"><?= portal_h($credentials['password'] ?: 'חסר מספר טלפון') ?></strong></div>
        </div>
        <p class="form-note">הפרטים נשלפו בצד השרת ואינם נכתבים בכתובת העמוד. אין להעביר אותם לגורם שאינו הדייר.</p>
    </section>

    <form method="post" enctype="multipart/form-data" class="detail-card form-grid" id="tenant-handover-form" data-handover-form>
        <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
        <input type="hidden" name="action" value="submit_tenant_handover">
        <input type="hidden" name="handover_submission_token" value="<?= portal_h(portal_handover_submission_token()) ?>">
        <input type="hidden" name="handover_project_id" value="<?= portal_h($projectId) ?>">
        <input type="hidden" name="handover_resident_id" value="<?= portal_h($resident['item_id']) ?>">
        <label class="field">
            <span>מוכן לפרוטוקול</span>
            <select name="handover_ready"><option value="">בחירה</option><option value="ready">מוכן</option><option value="not_ready">לא מוכן</option><option value="delivered">נמסר</option></select>
        </label>
        <label class="field"><span>תאריך מסירה <b>*</b></span><input type="date" name="handover_date" value="<?= portal_h(date('Y-m-d')) ?>" required></label>
        <label class="field">
            <span>מיקום קונטרולר</span>
            <select name="handover_controller_location" data-handover-location>
                <option value="">בחירה</option><option value="communications_cabinet">ארון תקשורת</option><option value="developer_rep">אחראי הפרויקט מטעם היזם</option><option value="ifeel">בחברת I Feel</option><option value="other">אחר</option>
            </select>
        </label>
        <label class="field" data-handover-location-other hidden><span>מיקום אחר <b>*</b></span><input type="text" name="handover_controller_location_other" maxlength="300"></label>
        <label class="field"><span>קונטרולר</span><select name="handover_controller"><option value="">בחירה</option><option value="raspberry_pi">רספברי פיי</option><option value="ava_hab">AVA-HAB</option></select></label>
        <label class="field"><span>אייקונים במפסק</span><select name="handover_icons"><option value="">בחירה</option><option value="done">בוצע</option><option value="not_done">לא בוצע</option><option value="partial">חלקי</option></select></label>
        <label class="field"><span>מפסק 9</span><input type="text" name="handover_switch_9" maxlength="500"></label>
        <label class="field"><span>תריסים</span><input type="text" name="handover_blinds" maxlength="500"></label>
        <label class="field"><span>דוד</span><input type="text" name="handover_boiler" maxlength="500"></label>
        <label class="field field--full"><span>הערות</span><textarea name="handover_notes" rows="4" maxlength="3000"></textarea></label>
        <div class="field"><span>שם הטכנאי</span><input type="text" value="<?= portal_h($profile['name'] ?? $user['display_name'] ?? '') ?>" readonly></div>
        <div class="field"><span>דוא״ל הטכנאי</span><input type="email" value="<?= portal_h($user['email'] ?? '') ?>" readonly dir="ltr"></div>
        <div class="field field--full">
            <span>שני צילומי חובה <b>*</b></span>
            <div class="receipt-actions">
                <label class="receipt-action receipt-action--camera"><span class="receipt-action__icon" aria-hidden="true">📷</span><strong>צילום הקונטרולר</strong><input class="receipt-input" type="file" name="handover_controller_photo" accept="image/*" capture="environment" required></label>
                <label class="receipt-action receipt-action--camera"><span class="receipt-action__icon" aria-hidden="true">📷</span><strong>צילום מפסק 9 עם האייקונים</strong><input class="receipt-input" type="file" name="handover_switch_photo" accept="image/*" capture="environment" required></label>
            </div>
            <p class="form-note">התמונות נשמרות מחוץ ל-public_html ומצורפות רק למייל הפנימי.</p>
        </div>
        <div class="field--full submit-bar"><div><strong>פעולה אחת: שמירה ושליחה</strong><span>הנתונים ייטענו שוב מ-Monday לפני השמירה.</span></div><button type="submit" class="button button--primary" data-handover-submit <?= $credentials['password'] === '' ? 'disabled' : '' ?>>סיום ושליחה</button></div>
    </form>
    <?php
}

function portal_render_tenant_handovers(array $user, ?array $flash): void
{
    portal_render_flash($flash);
    $projectId = trim((string) ($_GET['handover_project'] ?? ''));
    $building = trim((string) ($_GET['handover_building'] ?? ''));
    $residentId = trim((string) ($_GET['handover_resident'] ?? ''));
    $projects = [];
    $residents = [];
    $resident = null;
    try {
        $projects = portal_handover_projects();
        if ($projectId !== '') {
            $residents = portal_handover_residents($projectId);
            if ($residentId !== '') {
                $resident = portal_handover_resident($projectId, $residentId);
                if ($building !== '' && (string) $resident['building'] !== $building) {
                    $resident = null;
                }
            }
        }
    } catch (Throwable $error) {
        error_log('[i-feel tenant handovers] render_failed');
        ?><div class="alert alert--error" role="alert"><?= portal_h($error->getMessage()) ?></div><?php
    }

    portal_render_tenant_handover_form($user, $projects, $projectId, $residents, $building, $resident);
    $history = portal_handovers_for_user($user);
    ?>
    <section class="detail-card">
        <h2><?= ($user['role'] ?? '') === 'admin' ? 'מסירות אחרונות' : 'המסירות שלי' ?></h2>
        <div class="table-wrap"><table class="records-table">
            <thead><tr><th>מספר</th><th>תאריך</th><th>פרויקט</th><th>דירה</th><th>טכנאי</th><th>דוא״ל</th></tr></thead>
            <tbody>
            <?php if ($history === []): ?><tr><td colspan="6" class="empty-cell">עדיין לא נשמרו מסירות.</td></tr><?php endif; ?>
            <?php foreach (array_slice($history, 0, 20) as $handover): ?>
                <tr>
                    <td><code><?= portal_h($handover['id'] ?? '') ?></code></td>
                    <td><?= portal_h($handover['details']['date'] ?? '') ?></td>
                    <td><?= portal_h($handover['resident']['project_title'] ?? '') ?></td>
                    <td><?= portal_h($handover['resident']['apartment'] ?? '') ?></td>
                    <td><?= portal_h($handover['technician']['name'] ?? '') ?></td>
                    <td><?= (($handover['notifications']['resident']['status'] ?? '') === 'sent') ? 'נשלח לדייר' : ((($handover['notifications']['resident']['status'] ?? '') === 'skipped') ? 'אין דוא״ל' : 'דורש טיפול') ?></td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table></div>
    </section>
    <?php
}
