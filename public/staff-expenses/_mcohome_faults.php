<?php
declare(strict_types=1);

const MCOHOME_MAX_FILES = 6;
const MCOHOME_MAX_FILE_BYTES = 140 * 1024 * 1024;
const MCOHOME_MAX_TOTAL_BYTES = 220 * 1024 * 1024;
const MCOHOME_EMAIL_ATTACHMENT_MAX_BYTES = 12 * 1024 * 1024;

function mcohome_options(): array
{
    return [
        'deviceTypes' => [
            'תאורה בודד', 'תאורה כפול', '3 לחצנים', 'תריס', 'מפסק 9',
            'דימר Z-Wave 300W', 'אחר',
        ],
        'nineConfigs' => ['6 תאורה', '3 תריסים', '2 תריסים + 2 תאורה', 'תריס 1 + 2 תאורה', 'אחר'],
        'faultTypes' => [
            'ממסר נדבק', 'לא נדלק', 'לא נכבה', 'לא מגיב',
            'תריס לא עובד', 'תריס עובד רק לכיוון אחד', 'יציאת תריס נשרפה',
            'קפיצת תאורה', 'הבהוב / Flickering', 'דימור לא חלק',
            'לא מגיע ל-100%', 'נכבה בעוצמה נמוכה', 'זמזום',
            'עומס יתר', 'התחממות חריגה', 'הפסקת פעולה לסירוגין',
            'הפסקת פעולה ללא סיבה ברורה', 'לא ניתן לבצע Inclusion',
            'Inclusion מתחיל ולא מסתיים', 'Dead / Failed Node',
            'תקשורת Z-Wave לסירוגין', 'Status לא חוזר לקונטרולר',
            'בעיית Range / Mesh', 'נזק פיזי', 'אחר',
        ],
        'controllers' => ['Home Assistant', 'Touchwand', 'Fibaro', 'Vera', 'SmartThings', 'אחר / לא ידוע'],
        'statuses' => ['פתוח', 'בבדיקה', 'תקלה אומתה', 'הוחלף', 'ממתין ל-RMA', 'נשלח ל-MCOHome', 'ממתין לתשובת יצרן', 'נסגר'],
        'actions' => ['לא בוצעה פעולה', 'איפוס', 'זיווג מחדש / Inclusion', 'Exclusion', 'Factory Reset', 'Heal / Re-interview', 'בדיקת עומס', 'בדיקה ליד הקונטרולר', 'החלפת היחידה', 'ניתוק העומס', 'אחר'],
    ];
}

function mcohome_post_value(string $key, int $max = 500): string
{
    $value = $_POST[$key] ?? '';
    if (is_array($value)) {
        return '';
    }
    return portal_substr(trim((string) $value), 0, $max);
}

function mcohome_storage_root(): string
{
    $root = portal_storage_root() . DIRECTORY_SEPARATOR . 'mcohome-faults';
    portal_ensure_directory($root);
    return $root;
}

function mcohome_new_event_id(): string
{
    return 'MCO-' . date('Ymd-His') . '-' . strtoupper(bin2hex(random_bytes(3)));
}

function mcohome_resolve_event_id(string $candidate): string
{
    $candidate = strtoupper(trim($candidate));
    if ($candidate !== '' && preg_match('/^MCO-\d{8}-\d{6}-[A-F0-9]{6}$/', $candidate)) {
        return $candidate;
    }
    return mcohome_new_event_id();
}

function mcohome_event_dir(string $eventId): string
{
    if (!preg_match('/^MCO-\d{8}-\d{6}-[A-F0-9]{6}$/', $eventId)) {
        throw new InvalidArgumentException('מספר אירוע אינו תקין.');
    }
    $year = substr($eventId, 4, 4);
    $month = substr($eventId, 8, 2);
    return mcohome_storage_root() . DIRECTORY_SEPARATOR . $year . DIRECTORY_SEPARATOR . $month . DIRECTORY_SEPARATOR . $eventId;
}

function mcohome_save_media(string $eventId, array $files): array
{
    $items = portal_normalize_files_array($files);
    if (count($items) > MCOHOME_MAX_FILES) {
        throw new RuntimeException('ניתן לצרף עד ' . MCOHOME_MAX_FILES . ' תמונות או סרטונים.');
    }
    $allowed = [
        'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp',
        'image/heic' => 'heic', 'image/heif' => 'heif', 'image/avif' => 'avif',
        'video/mp4' => 'mp4', 'video/quicktime' => 'mov', 'video/webm' => 'webm',
    ];
    $dir = mcohome_event_dir($eventId) . DIRECTORY_SEPARATOR . 'media';
    portal_ensure_directory($dir);
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $saved = [];
    $total = 0;
    foreach ($items as $file) {
        $error = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($error === UPLOAD_ERR_NO_FILE) {
            continue;
        }
        if ($error !== UPLOAD_ERR_OK) {
            throw new RuntimeException($error === UPLOAD_ERR_INI_SIZE ? 'הקובץ גדול מהמותר בשרת.' : 'אירעה שגיאה בהעלאת המדיה.');
        }
        $size = (int) ($file['size'] ?? 0);
        if ($size <= 0 || $size > MCOHOME_MAX_FILE_BYTES) {
            throw new RuntimeException('כל תמונה או סרטון חייבים להיות עד 140MB.');
        }
        $total += $size;
        if ($total > MCOHOME_MAX_TOTAL_BYTES) {
            throw new RuntimeException('סך המדיה בדיווח חייב להיות עד 220MB.');
        }
        $tmp = (string) ($file['tmp_name'] ?? '');
        if ($tmp === '' || !is_uploaded_file($tmp)) {
            throw new RuntimeException('קובץ ההעלאה אינו תקין.');
        }
        $mime = (string) $finfo->file($tmp);
        if (!isset($allowed[$mime])) {
            throw new RuntimeException('מותר לצרף תמונות JPG/PNG/WEBP/HEIC וסרטוני MP4/MOV/WEBM בלבד.');
        }
        $original = portal_substr(trim((string) ($file['name'] ?? 'media')), 0, 160);
        $stored = bin2hex(random_bytes(16)) . '.' . $allowed[$mime];
        $target = $dir . DIRECTORY_SEPARATOR . $stored;
        if (!move_uploaded_file($tmp, $target)) {
            throw new RuntimeException('לא ניתן היה לשמור את המדיה.');
        }
        @chmod($target, 0600);
        $saved[] = [
            'stored' => $stored,
            'name' => $original,
            'mime' => $mime,
            'size' => $size,
            'dropboxStatus' => 'pending',
            'dropboxPath' => '',
            'dropboxUrl' => '',
        ];
    }
    return $saved;
}

function mcohome_record_file(string $eventId): string
{
    return mcohome_event_dir($eventId) . DIRECTORY_SEPARATOR . 'metadata.json';
}

function mcohome_save_record(array $record): void
{
    portal_ensure_directory(mcohome_event_dir((string) $record['eventId']));
    portal_json_write(mcohome_record_file((string) $record['eventId']), $record);
}

function mcohome_load_record(string $eventId): ?array
{
    $path = mcohome_record_file($eventId);
    if (!is_file($path)) {
        return null;
    }
    $record = portal_json_read($path);
    return $record === [] ? null : $record;
}

function mcohome_media_path(string $eventId, array $media): string
{
    return mcohome_event_dir($eventId) . DIRECTORY_SEPARATOR . 'media' . DIRECTORY_SEPARATOR . (string) ($media['stored'] ?? '');
}

function mcohome_media_url(string $eventId, int $index): string
{
    return portal_public_origin() . portal_base_path() . 'mcohome-media.php?id=' . rawurlencode($eventId) . '&f=' . $index;
}

function mcohome_internal_recipients(): array
{
    $defaults = [
        'oren@i-feel.co.il', 'support@i-feel.co.il', 'sagiv@i-feel.co.il',
        'mohamad@i-feel.co.il', 'ovaide@i-feel.co.il', 'arik@i-feel.co.il',
    ];
    if (defined('MCOHOME_FAULT_INTERNAL_RECIPIENTS')) {
        $configured = constant('MCOHOME_FAULT_INTERNAL_RECIPIENTS');
        if (is_string($configured)) {
            $defaults = preg_split('/[\s,;]+/', $configured) ?: $defaults;
        } elseif (is_array($configured)) {
            $defaults = $configured;
        }
    }
    return array_values(array_unique(array_filter($defaults, static fn($email): bool => is_string($email) && filter_var($email, FILTER_VALIDATE_EMAIL) !== false)));
}

function mcohome_vendor_recipients(): array
{
    return ['kristin@mcohome.com', 'dzsh@mcohome.com'];
}

function mcohome_translate_choice(string $value): string
{
    $map = [
        'תאורה בודד'=>'Single light switch','תאורה כפול'=>'Double light switch','3 לחצנים'=>'3-button switch','תריס'=>'Shutter switch','מפסק 9'=>'9-button switch','דימר Z-Wave 300W'=>'Z-Wave 300W dimmer','אחר'=>'Other',
        '6 תאורה'=>'6 lighting outputs','3 תריסים'=>'3 shutters','2 תריסים + 2 תאורה'=>'2 shutters + 2 lighting outputs','תריס 1 + 2 תאורה'=>'1 shutter + 2 lighting outputs',
        'ממסר נדבק'=>'Relay stuck','לא נדלק'=>'Does not turn on','לא נכבה'=>'Does not turn off','לא מגיב'=>'No response','תריס לא עובד'=>'Shutter not working','תריס עובד רק לכיוון אחד'=>'Shutter works in one direction only','יציאת תריס נשרפה'=>'Shutter output burned','קפיצת תאורה'=>'Light level jumps','הבהוב / Flickering'=>'Flickering','דימור לא חלק'=>'Non-smooth dimming','לא מגיע ל-100%'=>'Does not reach 100%','נכבה בעוצמה נמוכה'=>'Turns off at low dimming level','זמזום'=>'Buzzing','עומס יתר'=>'Overload','התחממות חריגה'=>'Abnormal heating','הפסקת פעולה לסירוגין'=>'Intermittent operation','הפסקת פעולה ללא סיבה ברורה'=>'Stopped operating without clear cause','לא ניתן לבצע Inclusion'=>'Cannot include device','Inclusion מתחיל ולא מסתיים'=>'Inclusion starts but does not finish','Dead / Failed Node'=>'Dead / Failed Node','תקשורת Z-Wave לסירוגין'=>'Intermittent Z-Wave communication','Status לא חוזר לקונטרולר'=>'Status is not reported back to controller','בעיית Range / Mesh'=>'Range / Mesh issue','נזק פיזי'=>'Physical damage',
    ];
    return $map[$value] ?? $value;
}

function mcohome_translate_choice_cn(string $value): string
{
    $map = [
        'תאורה בודד'=>'单路灯光开关','תאורה כפול'=>'双路灯光开关','3 לחצנים'=>'三键开关','תריס'=>'卷帘开关','מפסק 9'=>'九键开关','דימר Z-Wave 300W'=>'Z-Wave 300W 调光器','אחר'=>'其他',
        '6 תאורה'=>'6路照明输出','3 תריסים'=>'3路卷帘','2 תריסים + 2 תאורה'=>'2路卷帘 + 2路照明','תריס 1 + 2 תאורה'=>'1路卷帘 + 2路照明',
        'ממסר נדבק'=>'继电器粘连','לא נדלק'=>'无法开启','לא נכבה'=>'无法关闭','לא מגיב'=>'无响应','תריס לא עובד'=>'卷帘无法工作','תריס עובד רק לכיוון אחד'=>'卷帘只能单向运行','יציאת תריס נשרפה'=>'卷帘输出烧毁','קפיצת תאורה'=>'灯光亮度跳变','הבהוב / Flickering'=>'闪烁','דימור לא חלק'=>'调光不平滑','לא מגיע ל-100%'=>'无法达到100%','נכבה בעוצמה נמוכה'=>'低亮度时关闭','זמזום'=>'异响/嗡鸣','עומס יתר'=>'过载','התחממות חריגה'=>'异常发热','הפסקת פעולה לסירוגין'=>'间歇性停止工作','הפסקת פעולה ללא סיבה ברורה'=>'无明确原因停止工作','לא ניתן לבצע Inclusion'=>'无法加入网络','Inclusion מתחיל ולא מסתיים'=>'加入网络开始但无法完成','Dead / Failed Node'=>'失效节点','תקשורת Z-Wave לסירוגין'=>'Z-Wave 通信间歇异常','Status לא חוזר לקונטרולר'=>'状态未回传控制器','בעיית Range / Mesh'=>'距离/网状网络问题','נזק פיזי'=>'物理损坏',
    ];
    return $map[$value] ?? $value;
}

function mcohome_normalize_key(string $value): string
{
    return strtoupper(preg_replace('/\s+/', '', trim($value)) ?? trim($value));
}

function mcohome_existing_records(): array
{
    $pattern = mcohome_storage_root()
        . DIRECTORY_SEPARATOR . '*'
        . DIRECTORY_SEPARATOR . '*'
        . DIRECTORY_SEPARATOR . 'MCO-*'
        . DIRECTORY_SEPARATOR . 'metadata.json';
    $files = glob($pattern) ?: [];
    $records = [];
    foreach ($files as $file) {
        $record = portal_json_read($file);
        if ($record !== []) {
            $records[] = $record;
        }
    }
    return $records;
}

function mcohome_apply_recurrence(array $record): array
{
    $model = mcohome_normalize_key((string) ($record['model'] ?? ''));
    $fault = trim((string) ($record['faultType'] ?? ''));
    $device = trim((string) ($record['deviceType'] ?? ''));
    $serial = mcohome_normalize_key((string) ($record['serialNumber'] ?? ''));
    $prior = 0;
    $sameSerial = false;
    foreach (mcohome_existing_records() as $existing) {
        if (($existing['eventId'] ?? '') === ($record['eventId'] ?? '')) {
            continue;
        }
        $existingModel = mcohome_normalize_key((string) ($existing['model'] ?? ''));
        $sameModel = $model !== '' && $existingModel !== '' && $model === $existingModel;
        $sameFallback = $model === '' && $existingModel === '' && (string) ($existing['deviceType'] ?? '') === $device;
        if (($sameModel || $sameFallback) && (string) ($existing['faultType'] ?? '') === $fault) {
            $prior++;
            $existingSerial = mcohome_normalize_key((string) ($existing['serialNumber'] ?? ''));
            if ($serial !== '' && $existingSerial !== '' && $serial === $existingSerial) {
                $sameSerial = true;
            }
        }
    }
    $repeatCount = $prior + 1;
    $record['repeatCount'] = $repeatCount;
    $record['recurring'] = $repeatCount >= 2;
    $record['severity'] = ($sameSerial || $repeatCount >= 3) ? 'CRITICAL' : ($repeatCount >= 2 ? 'HIGH' : 'NORMAL');
    return $record;
}

function mcohome_gdrive_config(): ?array
{
    $clientId = defined('MCOHOME_GDRIVE_CLIENT_ID') ? trim((string) constant('MCOHOME_GDRIVE_CLIENT_ID')) : trim((string) getenv('MCOHOME_GDRIVE_CLIENT_ID'));
    $clientSecret = defined('MCOHOME_GDRIVE_CLIENT_SECRET') ? trim((string) constant('MCOHOME_GDRIVE_CLIENT_SECRET')) : trim((string) getenv('MCOHOME_GDRIVE_CLIENT_SECRET'));
    $refreshToken = defined('MCOHOME_GDRIVE_REFRESH_TOKEN') ? trim((string) constant('MCOHOME_GDRIVE_REFRESH_TOKEN')) : trim((string) getenv('MCOHOME_GDRIVE_REFRESH_TOKEN'));
    $rootFolderId = defined('MCOHOME_GDRIVE_ROOT_FOLDER_ID') ? trim((string) constant('MCOHOME_GDRIVE_ROOT_FOLDER_ID')) : trim((string) getenv('MCOHOME_GDRIVE_ROOT_FOLDER_ID'));
    if ($rootFolderId === '') {
        $rootFolderId = '1xEElpkLxeCgXrYBJ-920IAPuqiN-tWxw';
    }
    if ($clientId === '' || $clientSecret === '' || $refreshToken === '' || $rootFolderId === '') {
        return null;
    }
    return ['clientId' => $clientId, 'clientSecret' => $clientSecret, 'refreshToken' => $refreshToken, 'rootFolderId' => $rootFolderId];
}

function mcohome_gdrive_json_request(string $url, string $accessToken, string $method = 'GET', ?array $payload = null): array
{
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'status' => 0, 'body' => null];
    }
    $ch = curl_init($url);
    $headers = ['Authorization: Bearer ' . $accessToken, 'Accept: application/json'];
    $opts = [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_TIMEOUT => 60, CURLOPT_HTTPHEADER => $headers];
    if ($method !== 'GET') {
        $opts[CURLOPT_CUSTOMREQUEST] = $method;
    }
    if ($payload !== null) {
        $headers[] = 'Content-Type: application/json; charset=utf-8';
        $opts[CURLOPT_HTTPHEADER] = $headers;
        $opts[CURLOPT_POSTFIELDS] = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    curl_setopt_array($ch, $opts);
    $raw = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    $decoded = is_string($raw) ? json_decode($raw, true) : null;
    return ['ok' => $raw !== false && $error === '' && $status >= 200 && $status < 300, 'status' => $status, 'body' => $decoded];
}

function mcohome_gdrive_access_token(array $config): string
{
    if (!function_exists('curl_init')) {
        return '';
    }
    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 25,
        CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_POSTFIELDS => http_build_query([
            'client_id' => $config['clientId'],
            'client_secret' => $config['clientSecret'],
            'refresh_token' => $config['refreshToken'],
            'grant_type' => 'refresh_token',
        ]),
    ]);
    $raw = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    $decoded = is_string($raw) ? json_decode($raw, true) : null;
    return ($status >= 200 && $status < 300 && is_array($decoded)) ? trim((string) ($decoded['access_token'] ?? '')) : '';
}

function mcohome_gdrive_find_folder(string $accessToken, string $parentId, string $name): string
{
    $q = "mimeType='application/vnd.google-apps.folder' and trashed=false and '" . str_replace("'", "\\'", $parentId) . "' in parents and name='" . str_replace("'", "\\'", $name) . "'";
    $url = 'https://www.googleapis.com/drive/v3/files?q=' . rawurlencode($q) . '&fields=files(id,name)&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true';
    $result = mcohome_gdrive_json_request($url, $accessToken);
    if (!$result['ok'] || !is_array($result['body'])) return '';
    $files = $result['body']['files'] ?? [];
    return is_array($files) && isset($files[0]['id']) ? (string) $files[0]['id'] : '';
}

function mcohome_gdrive_ensure_folder(string $accessToken, string $parentId, string $name): string
{
    $existing = mcohome_gdrive_find_folder($accessToken, $parentId, $name);
    if ($existing !== '') return $existing;
    $result = mcohome_gdrive_json_request(
        'https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true',
        $accessToken,
        'POST',
        ['name' => $name, 'mimeType' => 'application/vnd.google-apps.folder', 'parents' => [$parentId]]
    );
    if (!$result['ok'] || !is_array($result['body']) || empty($result['body']['id'])) {
        throw new RuntimeException('Google Drive folder creation failed.');
    }
    return (string) $result['body']['id'];
}

function mcohome_gdrive_upload(string $accessToken, string $parentId, string $name, string $mime, string $localPath): array
{
    if (!function_exists('curl_init') || !is_file($localPath)) return ['ok' => false, 'status' => 0, 'body' => null];
    $contents = file_get_contents($localPath);
    if ($contents === false) return ['ok' => false, 'status' => 0, 'body' => null];
    $boundary = 'mcohome_' . bin2hex(random_bytes(12));
    $metadata = json_encode(['name' => $name, 'parents' => [$parentId]], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $body = "--{$boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{$metadata}\r\n"
        . "--{$boundary}\r\nContent-Type: {$mime}\r\n\r\n" . $contents . "\r\n--{$boundary}--\r\n";
    $ch = curl_init('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size&supportsAllDrives=true');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 180,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $accessToken,
            'Content-Type: multipart/related; boundary=' . $boundary,
            'Content-Length: ' . strlen($body),
        ],
        CURLOPT_POSTFIELDS => $body,
    ]);
    $raw = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    $decoded = is_string($raw) ? json_decode($raw, true) : null;
    return ['ok' => $status >= 200 && $status < 300, 'status' => $status, 'body' => $decoded];
}

function mcohome_gdrive_share_reader(string $accessToken, string $fileId, string $email): bool
{
    $url = 'https://www.googleapis.com/drive/v3/files/' . rawurlencode($fileId) . '/permissions?sendNotificationEmail=false&supportsAllDrives=true';
    $result = mcohome_gdrive_json_request($url, $accessToken, 'POST', ['type' => 'user', 'role' => 'reader', 'emailAddress' => $email]);
    return (bool) $result['ok'];
}

function mcohome_sync_media_to_gdrive(array $record): array
{
    $config = mcohome_gdrive_config();
    if ($config === null) {
        $record['googleDriveSync'] = ['ok' => false, 'status' => 'not_configured'];
        return $record;
    }
    $accessToken = mcohome_gdrive_access_token($config);
    if ($accessToken === '') {
        $record['googleDriveSync'] = ['ok' => false, 'status' => 'auth_failed'];
        return $record;
    }
    $date = preg_replace('/[^0-9]/', '', (string) ($record['discoveryDate'] ?? '')) ?: date('Ymd');
    $year = substr($date, 0, 4) ?: date('Y');
    $month = substr($date, 4, 2) ?: date('m');
    try {
        $yearId = mcohome_gdrive_ensure_folder($accessToken, $config['rootFolderId'], $year);
        $monthId = mcohome_gdrive_ensure_folder($accessToken, $yearId, $month);
        $eventFolderId = mcohome_gdrive_ensure_folder($accessToken, $monthId, (string) $record['eventId']);
        $okCount = 0;
        foreach (($record['media'] ?? []) as $index => $media) {
            $name = preg_replace('/[^A-Za-z0-9._ -]/u', '_', (string) ($media['name'] ?? 'media')) ?: ('media-' . ($index + 1));
            $name = sprintf('%02d-', $index + 1) . $name;
            $result = mcohome_gdrive_upload($accessToken, $eventFolderId, $name, (string) ($media['mime'] ?? 'application/octet-stream'), mcohome_media_path((string) $record['eventId'], $media));
            if ($result['ok'] && is_array($result['body']) && !empty($result['body']['id'])) {
                $fileId = (string) $result['body']['id'];
                $shared = true;
                foreach (mcohome_vendor_recipients() as $email) {
                    $shared = mcohome_gdrive_share_reader($accessToken, $fileId, $email) && $shared;
                }
                $record['media'][$index]['googleDriveStatus'] = $shared ? 'uploaded_shared' : 'uploaded_share_failed';
                $record['media'][$index]['googleDriveFileId'] = $fileId;
                $record['media'][$index]['googleDriveUrl'] = 'https://drive.google.com/file/d/' . rawurlencode($fileId) . '/view?usp=sharing';
                if ($shared) $okCount++;
            } else {
                $record['media'][$index]['googleDriveStatus'] = 'failed';
            }
        }
        $total = count($record['media'] ?? []);
        $record['googleDriveSync'] = [
            'ok' => $okCount === $total,
            'status' => $okCount === $total ? 'completed' : 'partial',
            'folderId' => $eventFolderId,
            'folderUrl' => 'https://drive.google.com/drive/folders/' . rawurlencode($eventFolderId),
            'uploaded' => $okCount,
            'total' => $total,
        ];
    } catch (Throwable $error) {
        error_log('[mcohome gdrive] ' . $error->getMessage());
        $record['googleDriveSync'] = ['ok' => false, 'status' => 'error'];
    }
    return $record;
}

function mcohome_gdrive_lines(array $record): array
{
    $lines = [];
    foreach (($record['media'] ?? []) as $index => $media) {
        $url = trim((string) ($media['googleDriveUrl'] ?? ''));
        if ($url !== '') $lines[] = ($index + 1) . '. ' . $url;
    }
    return $lines;
}

function mcohome_email_attachments(array $record): array
{
    $attachments = [];
    $total = 0;
    foreach (($record['media'] ?? []) as $media) {
        $mime = (string) ($media['mime'] ?? '');
        $size = (int) ($media['size'] ?? 0);
        if (strpos($mime, 'image/') !== 0 || $size <= 0 || $total + $size > MCOHOME_EMAIL_ATTACHMENT_MAX_BYTES) {
            continue;
        }
        $path = mcohome_media_path((string) $record['eventId'], $media);
        if (is_file($path)) {
            $attachments[] = ['path' => $path, 'name' => (string) ($media['name'] ?? 'image'), 'mime' => $mime];
            $total += $size;
        }
    }
    return $attachments;
}

function mcohome_build_vendor_draft(array $record): array
{
    $recurring = (bool) ($record['recurring'] ?? false);
    $severity = (string) ($record['severity'] ?? 'NORMAL');
    $prefix = $recurring ? '[RECURRING ' . $severity . '] ' : '';
    $subject = $prefix . '[I Feel] MCOHome fault ' . $record['eventId'] . ' - ' . ($record['model'] ?: mcohome_translate_choice($record['deviceType']));
    $driveLines = mcohome_gdrive_lines($record);
    $evidenceEn = $driveLines === [] ? 'Evidence: stored in the secured I Feel fault record. Google Drive sync may still be pending.' : "Evidence / Google Drive:\r\n" . implode("\r\n", $driveLines);
    $evidenceCn = $driveLines === [] ? '证据资料：已保存在 I Feel 安全故障记录中，Google Drive 同步可能仍在等待。' : "证据 / Google Drive：\r\n" . implode("\r\n", $driveLines);
    $recurringEn = $recurring
        ? 'IMPORTANT: This fault has now been recorded ' . (int) ($record['repeatCount'] ?? 2) . ' times. We require Root Cause Analysis, corrective action and confirmation that the permanent solution is implemented.'
        : 'Please investigate this field fault and provide the recommended corrective action.';
    $recurringCn = $recurring
        ? '重要：该故障现已记录 ' . (int) ($record['repeatCount'] ?? 2) . ' 次。请提供根本原因分析、纠正措施，并确认永久解决方案。'
        : '请调查该现场故障并提供建议的纠正措施。';

    $lines = [
        'Dear Kristin and MCOHome Technical Team,', '',
        $recurringEn, '',
        'ENGLISH',
        'Event ID: ' . $record['eventId'],
        'Severity: ' . $severity,
        'Date: ' . $record['discoveryDate'],
        'Project / customer: ' . ($record['project'] ?: 'Not provided'),
        'Technician: ' . $record['technician'],
        'Model / SKU: ' . ($record['model'] ?: 'Not provided'),
        'Serial number: ' . ($record['serialNumber'] ?: 'Not provided'),
        'Device type: ' . mcohome_translate_choice($record['deviceType']),
        '9-button configuration: ' . ($record['nineConfig'] !== '' ? mcohome_translate_choice($record['nineConfig']) : 'N/A'),
        'Channel / output: ' . ($record['channel'] ?: 'Not provided'),
        'Fault: ' . mcohome_translate_choice($record['faultType']),
        'Inrush current suspected: ' . ($record['inrushSuspected'] ? 'YES' : 'No'),
        'Connected load: ' . ($record['loadContext'] ?: 'Not provided'),
        'Controller: ' . ($record['controller'] ?: 'Not provided'),
        'Node ID: ' . ($record['nodeId'] ?: 'Not provided'),
        'Action already taken: ' . ($record['actionTaken'] ?: 'None reported'),
        'Technician note - Hebrew original: ' . ($record['description'] ?: 'Not provided'),
        'Additional notes - Hebrew original: ' . ($record['notes'] ?: 'None'),
        $evidenceEn, '',
        '中文',
        $recurringCn,
        '事件编号: ' . $record['eventId'],
        '严重级别: ' . $severity,
        '日期: ' . $record['discoveryDate'],
        '项目 / 客户: ' . ($record['project'] ?: '未提供'),
        '技术人员: ' . $record['technician'],
        '型号 / SKU: ' . ($record['model'] ?: '未提供'),
        '序列号: ' . ($record['serialNumber'] ?: '未提供'),
        '设备类型: ' . mcohome_translate_choice_cn($record['deviceType']),
        '九键配置: ' . ($record['nineConfig'] !== '' ? mcohome_translate_choice_cn($record['nineConfig']) : '不适用'),
        '通道 / 输出: ' . ($record['channel'] ?: '未提供'),
        '故障: ' . mcohome_translate_choice_cn($record['faultType']),
        '怀疑浪涌电流: ' . ($record['inrushSuspected'] ? '是' : '否'),
        '连接负载: ' . ($record['loadContext'] ?: '未提供'),
        '控制器: ' . ($record['controller'] ?: '未提供'),
        'Node ID: ' . ($record['nodeId'] ?: '未提供'),
        '已执行操作: ' . ($record['actionTaken'] ?: '未报告'),
        '技术人员说明 - 希伯来语原文: ' . ($record['description'] ?: '未提供'),
        '附加说明 - 希伯来语原文: ' . ($record['notes'] ?: '无'),
        $evidenceCn, '',
        'Please keep the Event ID in every reply so we can track this issue until final closure.',
        '请在每次回复中保留事件编号，以便我们持续跟踪直到问题最终关闭。', '',
        'Best regards,', 'I Feel Technical Team', 'Israel',
    ];
    return ['to' => implode(',', mcohome_vendor_recipients()), 'subject' => $subject, 'body' => implode("\r\n", $lines)];
}

function mcohome_send_vendor_notification(array $record): array
{
    $draft = mcohome_build_vendor_draft($record);
    $attachments = mcohome_email_attachments($record);
    $results = [];
    foreach (mcohome_vendor_recipients() as $email) {
        try {
            $results[$email] = portal_send_mail_with_attachments($email, $draft['subject'], $draft['body'], $attachments);
        } catch (Throwable $error) {
            error_log('[mcohome vendor notification] ' . $email . ' ' . $error->getMessage());
            $results[$email] = false;
        }
    }
    return $results;
}

function mcohome_send_internal_notification(array $record): array
{
    $mediaLines = [];
    foreach (($record['media'] ?? []) as $index => $media) {
        $line = ($index + 1) . '. ' . ($media['name'] ?? 'media') . ' - ' . mcohome_media_url($record['eventId'], $index);
        if (($media['googleDriveUrl'] ?? '') !== '') {
            $line .= ' | Google Drive: ' . $media['googleDriveUrl'];
        }
        $mediaLines[] = $line;
    }
    $vendorResults = $record['vendorNotificationResults'] ?? [];
    $vendorOk = count(array_filter(is_array($vendorResults) ? $vendorResults : []));
    $body = implode("\r\n", [
        'דיווח תקלה חדש של MCOHome', '',
        'מספר אירוע: ' . $record['eventId'],
        'חומרה: ' . ($record['severity'] ?? 'NORMAL'),
        'תקלה חוזרת: ' . (($record['recurring'] ?? false) ? 'כן - מופע מספר ' . ($record['repeatCount'] ?? 2) : 'לא'),
        'טכנאי: ' . $record['technician'] . ' (' . $record['employeeEmail'] . ')',
        'לקוח / פרויקט: ' . ($record['project'] ?: 'לא צוין'),
        'דגם / מק״ט: ' . ($record['model'] ?: 'לא צוין'),
        'מספר סידורי: ' . ($record['serialNumber'] ?: 'לא צוין'),
        'סוג יחידה: ' . $record['deviceType'] . ($record['nineConfig'] !== '' ? ' - ' . $record['nineConfig'] : ''),
        'תקלה: ' . $record['faultType'],
        'תיאור קצר: ' . ($record['description'] ?: 'לא צוין'),
        'עומס / נסיבות: ' . ($record['loadContext'] ?: 'לא צוין'),
        'חשד Inrush: ' . ($record['inrushSuspected'] ? 'כן' : 'לא'),
        'קונטרולר: ' . ($record['controller'] ?: 'לא צוין'),
        'Node ID: ' . ($record['nodeId'] ?: 'לא צוין'),
        'סטטוס: ' . ($record['unitStatus'] ?? 'פתוח'),
        'נשלח ל-MCOHome: ' . (($record['sentToMcohome'] ?? false) ? 'כן' : 'לא') . ' (' . $vendorOk . '/' . count(mcohome_vendor_recipients()) . ')',
        'Google Drive: ' . (($record['googleDriveSync']['status'] ?? '') ?: 'לא הוגדר'), '',
        'מדיה מאובטחת:',
        $mediaLines === [] ? 'לא צורפה מדיה' : implode("\r\n", $mediaLines), '',
        ($record['recurring'] ?? false)
            ? 'שימו לב: זו תקלה חוזרת. יש לנהל אותה כתקלה חמורה עד לקבלת Root Cause ופתרון קבוע מהיצרן.'
            : 'התקלה נשארת פתוחה במעקב עד לקבלת פתרון וסגירה מתועדת מול היצרן.',
    ]);
    $subjectPrefix = ($record['recurring'] ?? false) ? '[חוזרת ' . ($record['severity'] ?? 'HIGH') . '] ' : '';
    $subject = $subjectPrefix . 'MCOHome תקלה ' . $record['eventId'] . ' - ' . $record['faultType'];
    $results = [];
    foreach (mcohome_internal_recipients() as $email) {
        try {
            $results[$email] = portal_send_mail_with_attachments($email, $subject, $body);
        } catch (Throwable $error) {
            error_log('[mcohome notification] ' . $email . ' ' . $error->getMessage());
            $results[$email] = false;
        }
    }
    return $results;
}

function mcohome_sheet_payload(array $record): array
{
    $googleDriveLinks = [];
    foreach (($record['media'] ?? []) as $media) {
        if (($media['dropboxUrl'] ?? '') !== '') {
            $dropboxLinks[] = $media['dropboxUrl'];
        } elseif (($media['dropboxPath'] ?? '') !== '') {
            $dropboxLinks[] = $media['dropboxPath'];
        }
    }
    return [
        'eventId' => $record['eventId'],
        'discoveryDate' => $record['discoveryDate'],
        'technician' => $record['technician'],
        'employeeEmail' => $record['employeeEmail'],
        'project' => $record['project'],
        'serialNumber' => $record['serialNumber'],
        'model' => $record['model'],
        'deviceType' => $record['deviceType'],
        'nineConfig' => $record['nineConfig'],
        'channel' => $record['channel'],
        'faultType' => $record['faultType'],
        'description' => $record['description'],
        'loadContext' => $record['loadContext'],
        'inrushSuspected' => $record['inrushSuspected'],
        'unitStatus' => $record['unitStatus'],
        'actionTaken' => $record['actionTaken'],
        'replaced' => $record['replaced'],
        'replacementDate' => $record['replacementDate'] ?? '',
        'sentToMcohome' => $record['sentToMcohome'],
        'rma' => $record['rma'] ?? '',
        'manufacturerConclusion' => $record['manufacturerConclusion'] ?? '',
        'manufacturerCredit' => $record['manufacturerCredit'] ?? '',
        'notes' => $record['notes'],
        'mediaLinks' => array_map(static fn($i): string => mcohome_media_url($record['eventId'], $i), array_keys($record['media'] ?? [])),
        'controller' => $record['controller'],
        'nodeId' => $record['nodeId'],
        'repeatCount' => $record['repeatCount'] ?? 1,
        'recurring' => $record['recurring'] ?? false,
        'severity' => $record['severity'] ?? 'NORMAL',
        'updatedAt' => $record['updatedAt'] ?? date(DATE_ATOM),
        'googleDriveLinks' => $googleDriveLinks,\n        'dropboxLinks' => $googleDriveLinks,
        'rootCause' => $record['rootCause'] ?? '',
        'resolution' => $record['resolution'] ?? '',
        'owner' => $record['owner'] ?? 'שירות I Feel / MCOHome',
    ];
}

function mcohome_finalize_record(array $record): array
{
    $record = mcohome_apply_recurrence($record);
    $record['updatedAt'] = date(DATE_ATOM);
    $record['sheetSync'] = ['ok' => false, 'status' => 'pending'];
    $record['notificationResults'] = [];
    $record['vendorNotificationResults'] = [];
    $record['googleDriveSync'] = ['ok' => false, 'status' => 'pending'];
    mcohome_save_record($record);

    $record = mcohome_sync_media_to_gdrive($record);
    $record['vendorDraft'] = mcohome_build_vendor_draft($record);
    $record['vendorNotificationResults'] = mcohome_send_vendor_notification($record);
    $record['sentToMcohome'] = count($record['vendorNotificationResults']) === count(mcohome_vendor_recipients()) && count(array_filter($record['vendorNotificationResults'])) === count(mcohome_vendor_recipients());
    if ($record['sentToMcohome'] && ($record['unitStatus'] ?? '') !== 'נסגר') {
        $record['unitStatus'] = 'ממתין לתשובת יצרן';
    }
    $record['updatedAt'] = date(DATE_ATOM);
    $record['sheetSync'] = mcohome_try_apps_script(mcohome_sheet_payload($record));
    $record['notificationResults'] = mcohome_send_internal_notification($record);
    mcohome_save_record($record);
    return $record;
}

function mcohome_try_apps_script(array $payload): array
{
    $urlName = defined('MCOHOME_FAULT_APPS_SCRIPT_URL') ? 'MCOHOME_FAULT_APPS_SCRIPT_URL' : (defined('MCOHOME_FAULTS_WEB_APP_URL') ? 'MCOHOME_FAULTS_WEB_APP_URL' : '');
    $secretName = defined('MCOHOME_FAULT_APPS_SCRIPT_SECRET') ? 'MCOHOME_FAULT_APPS_SCRIPT_SECRET' : (defined('MCOHOME_FAULTS_SHARED_SECRET') ? 'MCOHOME_FAULTS_SHARED_SECRET' : '');
    if ($urlName === '' || $secretName === '') {
        return ['ok' => false, 'status' => 'not_configured'];
    }
    $url = trim((string) constant($urlName));
    $secret = trim((string) constant($secretName));
    if ($url === '' || $secret === '' || strpos($url, 'https://script.google.com/') !== 0 || !function_exists('curl_init')) {
        return ['ok' => false, 'status' => 'invalid_config'];
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json; charset=utf-8'],
        CURLOPT_POSTFIELDS => json_encode(['secret' => $secret, 'payload' => $payload], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    ]);
    $raw = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    if ($raw === false || $error !== '' || $status < 200 || $status >= 300) {
        return ['ok' => false, 'status' => 'communication_error'];
    }
    $decoded = json_decode((string) $raw, true);
    return ['ok' => is_array($decoded) && (($decoded['ok'] ?? false) || ($decoded['success'] ?? false)), 'status' => 'completed', 'response' => $decoded];
}
