<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_ui.php';
require_once __DIR__ . '/_email_auth.php';
require_once __DIR__ . '/_employees.php';
require_once __DIR__ . '/_vehicles.php';
require_once __DIR__ . '/_labels.php';

function mcohome_options(): array
{
    return [
        'deviceTypes' => ['תאורה בודד', 'תאורה כפול', '3 לחצנים', 'תריס', 'מפסק 9'],
        'nineConfigs' => ['6 תאורה', '3 תריסים', '2 תריסים + 2 תאורה', 'תריס 1 + 2 תאורה', 'אחר'],
        'faultTypes' => [
            'ממסר נדבק',
            'תריס לא עובד',
            'תריס נשרף',
            'עומס על היחידה',
            'הפסקת פעולה ללא סיבה ברורה',
            'חוסר יכולת להתחבר / זיווג',
            'תקלה בערוץ תאורה',
            'תקלה בערוץ תריס',
            'התחממות חריגה',
            'נזק פיזי',
            'אחר',
        ],
        'statuses' => ['תקולה - לבדיקה', 'הוחלפה באתר', 'נשלחה לבדיקה', 'נשלחה ל-MCOHome', 'נסגרה'],
        'actions' => ['לא בוצעה פעולה', 'איפוס', 'זיווג מחדש', 'בדיקת עומס', 'החלפת היחידה', 'ניתוק העומס', 'נשלחה למעבדה', 'אחר'],
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

function mcohome_send_to_apps_script(array $payload): string
{
    if (!defined('MCOHOME_FAULT_APPS_SCRIPT_URL') || !defined('MCOHOME_FAULT_APPS_SCRIPT_SECRET')) {
        throw new RuntimeException('חיבור Google Script עדיין לא הוגדר בשרת.');
    }

    $url = trim((string) MCOHOME_FAULT_APPS_SCRIPT_URL);
    $secret = trim((string) MCOHOME_FAULT_APPS_SCRIPT_SECRET);
    if ($url === '' || $secret === '' || !str_starts_with($url, 'https://script.google.com/')) {
        throw new RuntimeException('הגדרת Google Script אינה תקינה.');
    }
    if (!function_exists('curl_init')) {
        throw new RuntimeException('cURL אינו זמין בשרת.');
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json; charset=utf-8'],
        CURLOPT_POSTFIELDS => json_encode([
            'secret' => $secret,
            'payload' => $payload,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
    ]);

    $raw = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($raw === false || $curlError !== '') {
        throw new RuntimeException('לא ניתן להתחבר ל-Google Script.');
    }
    if ($status < 200 || $status >= 300) {
        throw new RuntimeException('Google Script החזיר שגיאת תקשורת.');
    }

    $decoded = json_decode((string) $raw, true);
    if (!is_array($decoded) || !($decoded['ok'] ?? false)) {
        throw new RuntimeException('Google Script לא אישר את שמירת הדיווח.');
    }
    return trim((string) ($decoded['eventId'] ?? ''));
}

$user = portal_current_user();
if ($user === null) {
    header('Location: ' . portal_base_path(), true, 302);
    exit;
}

$options = mcohome_options();
$error = null;
$success = null;

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    try {
        portal_verify_csrf();
        if (mcohome_post_value('action', 60) !== 'submit_mcohome_fault') {
            throw new RuntimeException('הפעולה המבוקשת אינה מוכרת.');
        }

        $deviceType = mcohome_post_value('device_type', 80);
        $nineConfig = mcohome_post_value('nine_config', 100);
        $faultType = mcohome_post_value('fault_type', 120);
        if (!in_array($deviceType, $options['deviceTypes'], true)) {
            throw new RuntimeException('יש לבחור סוג מפסק.');
        }
        if ($deviceType === 'מפסק 9' && !in_array($nineConfig, $options['nineConfigs'], true)) {
            throw new RuntimeException('יש לבחור תצורה מדויקת של מפסק 9.');
        }
        if (!in_array($faultType, $options['faultTypes'], true)) {
            throw new RuntimeException('יש לבחור סוג תקלה.');
        }

        $verifiedEmail = portal_normalize_company_email((string) ($user['email'] ?? ''));
        $employeeName = trim((string) ($user['display_name'] ?? $user['username'] ?? ''));
        $inrush = $faultType === 'ממסר נדבק' || isset($_POST['inrush']);

        $payload = [
            'discoveryDate' => mcohome_post_value('discovery_date', 20),
            'technician' => $employeeName,
            'employeeEmail' => $verifiedEmail ?? '',
            'project' => mcohome_post_value('project', 200),
            'serialNumber' => mcohome_post_value('serial_number', 150),
            'model' => mcohome_post_value('model', 150),
            'deviceType' => $deviceType,
            'nineConfig' => $deviceType === 'מפסק 9' ? $nineConfig : '',
            'channel' => mcohome_post_value('channel', 100),
            'faultType' => $faultType,
            'description' => mcohome_post_value('description', 500),
            'loadContext' => mcohome_post_value('load_context', 300),
            'inrushSuspected' => $inrush,
            'unitStatus' => in_array(mcohome_post_value('unit_status', 100), $options['statuses'], true) ? mcohome_post_value('unit_status', 100) : 'תקולה - לבדיקה',
            'actionTaken' => in_array(mcohome_post_value('action_taken', 100), $options['actions'], true) ? mcohome_post_value('action_taken', 100) : '',
            'replaced' => isset($_POST['replaced']),
            'replacementDate' => isset($_POST['replaced']) ? date('Y-m-d') : '',
            'sentToMcohome' => isset($_POST['sent_to_mcohome']),
            'notes' => mcohome_post_value('notes', 800),
        ];

        $eventId = mcohome_send_to_apps_script($payload);
        $success = 'הדיווח נשמר בהצלחה' . ($eventId !== '' ? '. מספר אירוע: ' . $eventId : '.');
        $_POST = [];
    } catch (Throwable $submitError) {
        $error = $submitError->getMessage();
    }
}

portal_page_start('דיווח תקלה MCOHome', $user);
portal_nav('mcohome', $user);
?>
<section class="panel">
    <div class="section-heading">
        <div>
            <h1>דיווח יחידת MCOHome תקולה</h1>
            <p>בחר את סוג היחידה ואת התקלה. ממסר נדבק מסומן אוטומטית כחשד ל-Inrush Current.</p>
        </div>
    </div>

    <?php if ($error !== null): ?>
        <div class="alert alert--error" role="alert"><?= portal_h($error) ?></div>
    <?php endif; ?>
    <?php if ($success !== null): ?>
        <div class="alert alert--success" role="status"><?= portal_h($success) ?></div>
    <?php endif; ?>

    <form method="post" class="stack-form" id="mcohome-fault-form">
        <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
        <input type="hidden" name="action" value="submit_mcohome_fault">

        <div class="form-grid">
            <label><span>תאריך גילוי</span><input type="date" name="discovery_date" value="<?= portal_h(mcohome_post_value('discovery_date', 20) ?: date('Y-m-d')) ?>" required></label>
            <label><span>לקוח / פרויקט</span><input type="text" name="project" value="<?= portal_h(mcohome_post_value('project', 200)) ?>" maxlength="200"></label>
            <label><span>מספר סידורי</span><input type="text" name="serial_number" value="<?= portal_h(mcohome_post_value('serial_number', 150)) ?>" maxlength="150"></label>
            <label><span>דגם / מק״ט</span><input type="text" name="model" value="<?= portal_h(mcohome_post_value('model', 150)) ?>" maxlength="150"></label>

            <label><span>סוג מפסק</span><select name="device_type" id="mcohome-device-type" required><option value="">בחר</option><?php foreach ($options['deviceTypes'] as $item): ?><option value="<?= portal_h($item) ?>" <?= mcohome_post_value('device_type', 80) === $item ? 'selected' : '' ?>><?= portal_h($item) ?></option><?php endforeach; ?></select></label>
            <label id="mcohome-nine-wrap"><span>תצורת מפסק 9</span><select name="nine_config" id="mcohome-nine-config"><option value="">בחר</option><?php foreach ($options['nineConfigs'] as $item): ?><option value="<?= portal_h($item) ?>" <?= mcohome_post_value('nine_config', 100) === $item ? 'selected' : '' ?>><?= portal_h($item) ?></option><?php endforeach; ?></select></label>
            <label><span>ערוץ / יציאה</span><input type="text" name="channel" value="<?= portal_h(mcohome_post_value('channel', 100)) ?>" placeholder="למשל CH2 / תריס 1" maxlength="100"></label>
            <label><span>סוג התקלה</span><select name="fault_type" id="mcohome-fault-type" required><option value="">בחר</option><?php foreach ($options['faultTypes'] as $item): ?><option value="<?= portal_h($item) ?>" <?= mcohome_post_value('fault_type', 120) === $item ? 'selected' : '' ?>><?= portal_h($item) ?></option><?php endforeach; ?></select></label>
            <label><span>סטטוס היחידה</span><select name="unit_status"><?php foreach ($options['statuses'] as $item): ?><option value="<?= portal_h($item) ?>" <?= (mcohome_post_value('unit_status', 100) ?: 'תקולה - לבדיקה') === $item ? 'selected' : '' ?>><?= portal_h($item) ?></option><?php endforeach; ?></select></label>
            <label><span>פעולה שבוצעה</span><select name="action_taken"><?php foreach ($options['actions'] as $item): ?><option value="<?= portal_h($item) ?>" <?= mcohome_post_value('action_taken', 100) === $item ? 'selected' : '' ?>><?= portal_h($item) ?></option><?php endforeach; ?></select></label>
            <label class="form-grid__wide"><span>נסיבות / עומס מחובר</span><input type="text" name="load_context" value="<?= portal_h(mcohome_post_value('load_context', 300)) ?>" placeholder="לדוגמה: ספק LED, מנוע תריס, עומס משוער" maxlength="300"></label>
            <label class="form-grid__wide"><span>תיאור קצר</span><input type="text" name="description" value="<?= portal_h(mcohome_post_value('description', 500)) ?>" maxlength="500"></label>
        </div>

        <div class="checkbox-grid">
            <label><input type="checkbox" name="inrush" id="mcohome-inrush" <?= isset($_POST['inrush']) ? 'checked' : '' ?>> חשד ל-Inrush Current</label>
            <label><input type="checkbox" name="replaced" <?= isset($_POST['replaced']) ? 'checked' : '' ?>> הוחלפה יחידה באתר</label>
            <label><input type="checkbox" name="sent_to_mcohome" <?= isset($_POST['sent_to_mcohome']) ? 'checked' : '' ?>> נשלחה ל-MCOHome</label>
        </div>

        <label><span>הערות</span><textarea name="notes" rows="3" maxlength="800"><?= portal_h(mcohome_post_value('notes', 800)) ?></textarea></label>
        <button type="submit" class="button button--primary button--wide">שמור דיווח תקלה</button>
    </form>
</section>
<script>
(function(){
    const device = document.getElementById('mcohome-device-type');
    const nineWrap = document.getElementById('mcohome-nine-wrap');
    const nine = document.getElementById('mcohome-nine-config');
    const fault = document.getElementById('mcohome-fault-type');
    const inrush = document.getElementById('mcohome-inrush');
    function syncNine(){
        const show = device.value === 'מפסק 9';
        nineWrap.style.display = show ? '' : 'none';
        nine.required = show;
        if (!show) nine.value = '';
    }
    device.addEventListener('change', syncNine);
    fault.addEventListener('change', function(){ if (fault.value === 'ממסר נדבק') inrush.checked = true; });
    syncNine();
})();
</script>
<?php portal_page_end();
