<?php
declare(strict_types=1);

const MCOHOME_MAX_FILES = 5;
const MCOHOME_MAX_FILE_BYTES = 30 * 1024 * 1024;
const MCOHOME_MAX_TOTAL_BYTES = 60 * 1024 * 1024;

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
    return mb_substr(trim((string) $value), 0, $max);
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
            throw new RuntimeException('כל תמונה או סרטון חייבים להיות עד 30MB.');
        }
        $total += $size;
        if ($total > MCOHOME_MAX_TOTAL_BYTES) {
            throw new RuntimeException('סך המדיה בדיווח חייב להיות עד 60MB.');
        }
        $tmp = (string) ($file['tmp_name'] ?? '');
        if ($tmp === '' || !is_uploaded_file($tmp)) {
            throw new RuntimeException('קובץ ההעלאה אינו תקין.');
        }
        $mime = (string) $finfo->file($tmp);
        if (!isset($allowed[$mime])) {
            throw new RuntimeException('מותר לצרף תמונות JPG/PNG/WEBP/HEIC וסרטוני MP4/MOV/WEBM בלבד.');
        }
        $original = mb_substr(trim((string) ($file['name'] ?? 'media')), 0, 160);
        $stored = bin2hex(random_bytes(16)) . '.' . $allowed[$mime];
        $target = $dir . DIRECTORY_SEPARATOR . $stored;
        if (!move_uploaded_file($tmp, $target)) {
            throw new RuntimeException('לא ניתן היה לשמור את המדיה.');
        }
        @chmod($target, 0600);
        $saved[] = ['stored' => $stored, 'name' => $original, 'mime' => $mime, 'size' => $size];
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

function mcohome_media_url(string $eventId, int $index): string
{
    return portal_public_origin() . portal_base_path() . 'mcohome-media.php?id=' . rawurlencode($eventId) . '&f=' . $index;
}

function mcohome_internal_recipients(): array
{
    $defaults = ['oren@i-feel.co.il', 'support@i-feel.co.il', 'sagiv@i-feel.co.il', 'mohamad@i-feel.co.il', 'ovaide@i-feel.co.il'];
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

function mcohome_build_vendor_draft(array $record): array
{
    $subject = '[I Feel] MCOHome fault report ' . $record['eventId'] . ' - ' . ($record['model'] ?: mcohome_translate_choice($record['deviceType']));
    $lines = [
        'Dear Kristin and MCOHome Technical Team,', '',
        'Please review the following field fault reported by our technical team in Israel.', '',
        'Event ID: ' . $record['eventId'],
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
        'Action already taken: ' . ($record['actionTaken'] ?: 'None reported'), '',
        'Technician short explanation (original Hebrew):',
        $record['description'] ?: 'Not provided', '',
        'Additional notes (original Hebrew):',
        $record['notes'] ?: 'None', '',
        'Photo / video evidence is attached to the I Feel fault record. Please let us know if you need the original files sent by email.', '',
        'Best regards,', 'I Feel Technical Team', 'Israel',
    ];
    return ['to' => implode(',', mcohome_vendor_recipients()), 'subject' => $subject, 'body' => implode("\r\n", $lines)];
}

function mcohome_send_internal_notification(array $record): array
{
    $draft = mcohome_build_vendor_draft($record);
    $mediaLines = [];
    foreach (($record['media'] ?? []) as $index => $media) {
        $mediaLines[] = ($index + 1) . '. ' . ($media['name'] ?? 'media') . ' - ' . mcohome_media_url($record['eventId'], $index);
    }
    $body = implode("\r\n", [
        'דיווח תקלה חדש של MCOHome', '',
        'מספר אירוע: ' . $record['eventId'],
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
        'Node ID: ' . ($record['nodeId'] ?: 'לא צוין'), '',
        'מדיה מאובטחת (דורשת כניסה לאזור העובדים):',
        $mediaLines === [] ? 'לא צורפה מדיה' : implode("\r\n", $mediaLines), '',
        'טיוטה באנגלית ל-MCOHome, לא נשלחה ליצרן:',
        'To: ' . $draft['to'],
        'Subject: ' . $draft['subject'], '',
        $draft['body'],
    ]);
    $subject = 'MCOHome תקלה חדשה ' . $record['eventId'] . ' - ' . $record['faultType'];
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
        CURLOPT_MAXREDIRS => 3, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 12,
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
