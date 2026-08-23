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
        $original = portal_substr(trim((string) ($file['name'] ?? 'media')), 0, 160);
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

function mcohome_notification_recipients(): array
{
    return array_values(array_unique(array_merge(
        mcohome_internal_recipients(),
        mcohome_vendor_recipients()
    )));
}

function mcohome_translate_choice(string $value): string
{
    $map = [
        'תאורה בודד'=>'Single light switch','תאורה כפול'=>'Double light switch','3 לחצנים'=>'3-button switch','תריס'=>'Shutter switch','מפסק 9'=>'9-button switch','דימר Z-Wave 300W'=>'Z-Wave 300W dimmer','אחר'=>'Other',
        '6 תאורה'=>'6 lighting outputs','3 תריסים'=>'3 shutters','2 תריסים + 2 תאורה'=>'2 shutters + 2 lighting outputs','תריס 1 + 2 תאורה'=>'1 shutter + 2 lighting outputs',
        'ממסר נדבק'=>'Relay stuck','לא נדלק'=>'Does not turn on','לא נכבה'=>'Does not turn off','לא מגיב'=>'No response','תריס לא עובד'=>'Shutter not working','תריס עובד רק לכיוון אחד'=>'Shutter works in one direction only','יציאת תריס נשרפה'=>'Shutter output burned','קפיצת תאורה'=>'Light level jumps','הבהוב / Flickering'=>'Flickering','דימור לא חלק'=>'Non-smooth dimming','לא מגיע ל-100%'=>'Does not reach 100%','נכבה בעוצמה נמוכה'=>'Turns off at low dimming level','זמזום'=>'Buzzing','עומס יתר'=>'Overload','התחממות חריגה'=>'Abnormal heating','הפסקת פעולה לסירוגין'=>'Intermittent operation','הפסקת פעולה ללא סיבה ברורה'=>'Stopped operating without clear cause','לא ניתן לבצע Inclusion'=>'Cannot include device','Inclusion מתחיל ולא מסתיים'=>'Inclusion starts but does not finish','Dead / Failed Node'=>'Dead / Failed Node','תקשורת Z-Wave לסירוגין'=>'Intermittent Z-Wave communication','Status לא חוזר לקונטרולר'=>'Status is not reported back to controller','בעיית Range / Mesh'=>'Range / Mesh issue','נזק פיזי'=>'Physical damage',
        'אחר / לא ידוע'=>'Other / unknown','פתוח'=>'Open','בבדיקה'=>'Under review','תקלה אומתה'=>'Fault confirmed','הוחלף'=>'Replaced','ממתין ל-RMA'=>'Waiting for RMA','נשלח ל-MCOHome'=>'Sent to MCOHome','ממתין לתשובת יצרן'=>'Awaiting manufacturer response','נסגר'=>'Closed',
        'לא בוצעה פעולה'=>'No action taken','איפוס'=>'Reset','זיווג מחדש / Inclusion'=>'Re-pairing / Inclusion','בדיקת עומס'=>'Load test','בדיקה ליד הקונטרולר'=>'Test near controller','החלפת היחידה'=>'Unit replaced','ניתוק העומס'=>'Load disconnected',
    ];
    return $map[$value] ?? $value;
}

function mcohome_translate_choice_chinese(string $value): string
{
    $map = [
        'תאורה בודד'=>'单路灯光开关','תאורה כפול'=>'双路灯光开关','3 לחצנים'=>'三键开关','תריס'=>'卷帘开关','מפסק 9'=>'九键开关','דימר Z-Wave 300W'=>'Z-Wave 300W 调光器','אחר'=>'其他',
        '6 תאורה'=>'6 路照明输出','3 תריסים'=>'3 路卷帘','2 תריסים + 2 תאורה'=>'2 路卷帘 + 2 路照明','תריס 1 + 2 תאורה'=>'1 路卷帘 + 2 路照明',
        'ממסר נדבק'=>'继电器粘连','לא נדלק'=>'无法开启','לא נכבה'=>'无法关闭','לא מגיב'=>'无响应','תריס לא עובד'=>'卷帘不工作','תריס עובד רק לכיוון אחד'=>'卷帘只能单向运行','יציאת תריס נשרפה'=>'卷帘输出烧毁','קפיצת תאורה'=>'亮度跳变','הבהוב / Flickering'=>'闪烁','דימור לא חלק'=>'调光不平滑','לא מגיע ל-100%'=>'无法达到 100%','נכבה בעוצמה נמוכה'=>'低亮度时关闭','זמזום'=>'嗡鸣','עומס יתר'=>'过载','התחממות חריגה'=>'异常发热','הפסקת פעולה לסירוגין'=>'间歇性工作','הפסקת פעולה ללא סיבה ברורה'=>'无明显原因停止工作','לא ניתן לבצע Inclusion'=>'无法将设备加入网络','Inclusion מתחיל ולא מסתיים'=>'加网开始但无法完成','Dead / Failed Node'=>'失效 / 故障节点','תקשורת Z-Wave לסירוגין'=>'Z-Wave 通信不稳定','Status לא חוזר לקונטרולר'=>'状态未回传控制器','בעיית Range / Mesh'=>'覆盖范围 / 网状网络问题','נזק פיזי'=>'物理损坏',
        'אחר / לא ידוע'=>'其他 / 未知','פתוח'=>'待处理','בבדיקה'=>'检查中','תקלה אומתה'=>'故障已确认','הוחלף'=>'已更换','ממתין ל-RMA'=>'等待 RMA','נשלח ל-MCOHome'=>'已发送至 MCOHome','ממתין לתשובת יצרן'=>'等待制造商回复','נסגר'=>'已关闭',
        'לא בוצעה פעולה'=>'未采取措施','איפוס'=>'复位','זיווג מחדש / Inclusion'=>'重新配对 / 加网','Exclusion'=>'移除网络','Factory Reset'=>'恢复出厂设置','Heal / Re-interview'=>'网络修复 / 重新查询','בדיקת עומס'=>'负载检查','בדיקה ליד הקונטרולר'=>'在控制器附近测试','החלפת היחידה'=>'更换设备','ניתוק העומס'=>'断开负载',
    ];
    return $map[$value] ?? $value;
}

function mcohome_build_vendor_draft(array $record): array
{
    $notProvided = 'Not provided';
    $notProvidedChinese = '未提供';
    $subject = '[I Feel] MCOHome fault report / 故障报告 ' . $record['eventId'] . ' - ' . ($record['model'] ?: mcohome_translate_choice($record['deviceType']));
    $lines = [
        'Dear Kristin and MCOHome Technical Team,', '',
        'Please review the following field fault reported by our technical team in Israel.', '',
        'Event ID: ' . $record['eventId'],
        'Date: ' . $record['discoveryDate'],
        'Project / customer: ' . ($record['project'] ?: $notProvided),
        'Technician: ' . $record['technician'],
        'Model / SKU: ' . ($record['model'] ?: $notProvided),
        'Serial number: ' . ($record['serialNumber'] ?: $notProvided),
        'Device type: ' . mcohome_translate_choice($record['deviceType']),
        '9-button configuration: ' . ($record['nineConfig'] !== '' ? mcohome_translate_choice($record['nineConfig']) : 'N/A'),
        'Channel / output: ' . ($record['channel'] ?: $notProvided),
        'Fault: ' . mcohome_translate_choice($record['faultType']),
        'Inrush current suspected: ' . ($record['inrushSuspected'] ? 'YES' : 'No'),
        'Connected load: ' . ($record['loadContext'] ?: $notProvided),
        'Controller: ' . ($record['controller'] !== '' ? mcohome_translate_choice($record['controller']) : $notProvided),
        'Node ID: ' . ($record['nodeId'] ?: $notProvided),
        'Z-Wave check: ' . ($record['zwaveCheck'] ?: $notProvided),
        'Current status: ' . mcohome_translate_choice($record['unitStatus']),
        'Unit replaced on site: ' . ($record['replaced'] ? 'Yes' : 'No'),
        'Action already taken: ' . mcohome_translate_choice($record['actionTaken']), '',
        'Technician short explanation (original Hebrew):',
        $record['description'] ?: $notProvided, '',
        'Additional notes (original Hebrew):',
        $record['notes'] ?: 'None', '',
        'Photo / video evidence: ' . count($record['media'] ?? []) . ' file(s) are stored in the secure I Feel fault record. Original files are available on request.', '',
        'Best regards,', 'I Feel Technical Team', 'Israel',
        '', '------------------------------', '',
        '亲爱的 Kristin 和 MCOHome 技术团队：', '',
        '请查看以下由我们以色列技术团队提交的现场故障报告。', '',
        '事件编号：' . $record['eventId'],
        '日期：' . $record['discoveryDate'],
        '项目 / 客户：' . ($record['project'] ?: $notProvidedChinese),
        '技术员：' . $record['technician'],
        '型号 / 料号：' . ($record['model'] ?: $notProvidedChinese),
        '序列号：' . ($record['serialNumber'] ?: $notProvidedChinese),
        '设备类型：' . mcohome_translate_choice_chinese($record['deviceType']),
        '九键开关配置：' . ($record['nineConfig'] !== '' ? mcohome_translate_choice_chinese($record['nineConfig']) : '不适用'),
        '通道 / 输出：' . ($record['channel'] ?: $notProvidedChinese),
        '故障：' . mcohome_translate_choice_chinese($record['faultType']),
        '怀疑有浪涌电流：' . ($record['inrushSuspected'] ? '是' : '否'),
        '连接负载：' . ($record['loadContext'] ?: $notProvidedChinese),
        '控制器：' . ($record['controller'] !== '' ? mcohome_translate_choice_chinese($record['controller']) : $notProvidedChinese),
        '节点 ID：' . ($record['nodeId'] ?: $notProvidedChinese),
        'Z-Wave 检查：' . ($record['zwaveCheck'] ?: $notProvidedChinese),
        '当前状态：' . mcohome_translate_choice_chinese($record['unitStatus']),
        '现场是否已更换设备：' . ($record['replaced'] ? '是' : '否'),
        '已采取的措施：' . mcohome_translate_choice_chinese($record['actionTaken']), '',
        '技术员简要说明（希伯来语原文）：',
        $record['description'] ?: $notProvidedChinese, '',
        '其他备注（希伯来语原文）：',
        $record['notes'] ?: '无', '',
        '照片 / 视频证据：' . count($record['media'] ?? []) . ' 个文件已保存在 I Feel 安全故障记录中。如有需要，可提供原始文件。', '',
        '此致', 'I Feel 技术团队', '以色列',
    ];
    return ['to' => implode(',', mcohome_vendor_recipients()), 'subject' => $subject, 'body' => implode("\r\n", $lines)];
}

function mcohome_internal_media_appendix(array $record): string
{
    $mediaLines = [];
    foreach (($record['media'] ?? []) as $index => $media) {
        $mediaLines[] = ($index + 1) . '. ' . ($media['name'] ?? 'media') . ' - ' . mcohome_media_url($record['eventId'], $index);
    }
    return implode("\r\n", [
        '', 'Internal submitter: ' . $record['technician'] . ' (' . $record['employeeEmail'] . ')',
        '内部提交人：' . $record['technician'] . ' (' . $record['employeeEmail'] . ')', '',
        'Secure internal media links (employee login required):',
        '内部安全媒体链接（需要员工登录）：',
        $mediaLines === [] ? 'No media attached. / 未附加媒体。' : implode("\r\n", $mediaLines),
    ]);
}

function mcohome_send_notifications(array $record, ?callable $mailer = null): array
{
    $message = mcohome_build_vendor_draft($record);
    $internalRecipients = mcohome_internal_recipients();
    $mailer ??= static fn(string $email, string $subject, string $body): bool =>
        portal_send_mail_with_attachments($email, $subject, $body);
    $results = [];
    foreach (mcohome_notification_recipients() as $email) {
        $body = $message['body'];
        if (in_array($email, $internalRecipients, true)) {
            $body .= mcohome_internal_media_appendix($record);
        }
        try {
            $results[$email] = $mailer($email, $message['subject'], $body);
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
