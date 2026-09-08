<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_ui.php';
require_once __DIR__ . '/_email_auth.php';
require_once __DIR__ . '/_employees.php';
require_once __DIR__ . '/_vehicles.php';
require_once __DIR__ . '/_work_reports.php';
require_once __DIR__ . '/_labels.php';
require_once __DIR__ . '/_mcohome_faults.php';

$user = portal_current_user();
if ($user === null) {
    header('Location: ' . portal_base_path(), true, 302);
    exit;
}

$options = mcohome_options();
$error = null;
$success = null;
$createdRecord = null;

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    try {
        portal_verify_csrf();
        if (mcohome_post_value('action', 60) !== 'submit_mcohome_fault') {
            throw new RuntimeException('הפעולה המבוקשת אינה מוכרת.');
        }

        $deviceType = mcohome_post_value('device_type', 80);
        $nineConfig = mcohome_post_value('nine_config', 100);
        $faultType = mcohome_post_value('fault_type', 120);
        $controller = mcohome_post_value('controller', 100);
        if (!in_array($deviceType, $options['deviceTypes'], true)) {
            throw new RuntimeException('יש לבחור סוג יחידה.');
        }
        if ($deviceType === 'מפסק 9' && !in_array($nineConfig, $options['nineConfigs'], true)) {
            throw new RuntimeException('יש לבחור תצורה מדויקת של מפסק 9.');
        }
        if (!in_array($faultType, $options['faultTypes'], true)) {
            throw new RuntimeException('יש לבחור סוג תקלה.');
        }
        if ($controller !== '' && !in_array($controller, $options['controllers'], true)) {
            throw new RuntimeException('יש לבחור קונטרולר מהרשימה.');
        }

        $verifiedEmail = portal_normalize_company_email((string) ($user['email'] ?? ''));
        if ($verifiedEmail === null) {
            throw new RuntimeException('לא ניתן לזהות את כתובת העובד המחובר. יש לצאת ולהיכנס מחדש.');
        }
        $employeeName = trim((string) ($user['display_name'] ?? $verifiedEmail));
        $eventId = mcohome_new_event_id();
        $media = mcohome_save_media($eventId, $_FILES['media'] ?? []);
        $inrush = $faultType === 'ממסר נדבק' || isset($_POST['inrush']);
        $statusValue = mcohome_post_value('unit_status', 100);
        $actionValue = mcohome_post_value('action_taken', 100);

        $record = [
            'eventId' => $eventId,
            'createdAt' => date(DATE_ATOM),
            'discoveryDate' => mcohome_post_value('discovery_date', 20) ?: date('Y-m-d'),
            'technician' => $employeeName,
            'employeeEmail' => $verifiedEmail,
            'project' => mcohome_post_value('project', 200),
            'serialNumber' => mcohome_post_value('serial_number', 150),
            'model' => mcohome_post_value('model', 150),
            'deviceType' => $deviceType,
            'nineConfig' => $deviceType === 'מפסק 9' ? $nineConfig : '',
            'channel' => mcohome_post_value('channel', 100),
            'faultType' => $faultType,
            'description' => mcohome_post_value('description', 600),
            'loadContext' => mcohome_post_value('load_context', 400),
            'inrushSuspected' => $inrush,
            'controller' => $controller,
            'nodeId' => mcohome_post_value('node_id', 80),
            'zwaveCheck' => mcohome_post_value('zwave_check', 300),
            'unitStatus' => in_array($statusValue, $options['statuses'], true) ? $statusValue : 'פתוח',
            'actionTaken' => in_array($actionValue, $options['actions'], true) ? $actionValue : 'לא בוצעה פעולה',
            'replaced' => isset($_POST['replaced']),
            'sentToMcohome' => false,
            'notes' => mcohome_post_value('notes', 1000),
            'media' => $media,
            'sheetSync' => ['ok' => false, 'status' => 'pending'],
            'notificationResults' => [],
        ];
        $record['vendorDraft'] = mcohome_build_vendor_draft($record);
        mcohome_save_record($record);

        $sheetPayload = [
            'eventId' => $record['eventId'], 'discoveryDate' => $record['discoveryDate'],
            'technician' => $record['technician'], 'employeeEmail' => $record['employeeEmail'],
            'project' => $record['project'], 'serialNumber' => $record['serialNumber'], 'model' => $record['model'],
            'deviceType' => $record['deviceType'], 'nineConfig' => $record['nineConfig'], 'channel' => $record['channel'],
            'faultType' => $record['faultType'], 'description' => $record['description'], 'loadContext' => $record['loadContext'],
            'inrushSuspected' => $record['inrushSuspected'], 'unitStatus' => $record['unitStatus'], 'actionTaken' => $record['actionTaken'],
            'replaced' => $record['replaced'], 'controller' => $record['controller'], 'nodeId' => $record['nodeId'],
            'notes' => $record['notes'], 'mediaLinks' => array_map(static fn($i): string => mcohome_media_url($record['eventId'], $i), array_keys($media)),
        ];
        $record['sheetSync'] = mcohome_try_apps_script($sheetPayload);
        $record['notificationResults'] = mcohome_send_internal_notification($record);
        mcohome_save_record($record);
        portal_audit('mcohome_fault_submitted', [
            'event_id' => $record['eventId'],
            'employee_hash' => hash('sha256', $verifiedEmail),
            'device_type' => $record['deviceType'],
            'fault_type' => $record['faultType'],
            'media_count' => count($record['media']),
        ]);

        $createdRecord = $record;
        $sentCount = count(array_filter($record['notificationResults']));
        $success = 'הדיווח נשמר. מספר אירוע: ' . $eventId . '. הודעה נשלחה ל-' . $sentCount . ' אנשי צוות.';
        $_POST = [];
    } catch (Throwable $submitError) {
        $error = $submitError->getMessage();
    }
}

portal_page_start('דיווח תקלה MCOHome', $user);
portal_nav('mcohome', $user);
?>
<section class="panel mcohome-panel">
    <div class="section-heading">
        <div>
            <h1>דיווח תקלה MCOHome</h1>
            <p>מסמנים את התקלה, מוסיפים הסבר קצר ותמונה או סרטון. הדיווח נשמר ונשלח מיד לצוות.</p>
        </div>
    </div>

    <?php if ($error !== null): ?>
        <div class="alert alert--error" role="alert"><?= portal_h($error) ?></div>
    <?php endif; ?>
    <?php if ($success !== null): ?>
        <div class="alert alert--success" role="status"><?= portal_h($success) ?></div>
    <?php endif; ?>
    <?php if ($createdRecord !== null): ?>
        <div class="mcohome-result-card">
            <strong><?= portal_h($createdRecord['eventId']) ?></strong>
            <span><?= count($createdRecord['media']) ?> קבצי מדיה צורפו</span>
            <?php if (!($createdRecord['sheetSync']['ok'] ?? false)): ?>
                <span class="form-note">הדיווח נשמר באתר. סנכרון Google Sheet עדיין ממתין להגדרת Web App.</span>
            <?php endif; ?>
            <?php $draft = $createdRecord['vendorDraft']; $mailto = 'mailto:' . rawurlencode(str_replace(',', ',', $draft['to'])) . '?subject=' . rawurlencode($draft['subject']) . '&body=' . rawurlencode($draft['body']); ?>
            <a class="button button--secondary" href="<?= portal_h($mailto) ?>">פתיחת טיוטה באנגלית ל-MCOHome</a>
        </div>
    <?php endif; ?>

    <form method="post" enctype="multipart/form-data" class="stack-form" id="mcohome-fault-form">
        <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
        <input type="hidden" name="action" value="submit_mcohome_fault">

        <div class="mcohome-quick-grid">
            <label><span>לקוח / פרויקט</span><input type="text" name="project" value="<?= portal_h(mcohome_post_value('project', 200)) ?>" maxlength="200" placeholder="שם הלקוח או הפרויקט"></label>
            <label><span>מספר סידורי</span><input type="text" name="serial_number" value="<?= portal_h(mcohome_post_value('serial_number', 150)) ?>" maxlength="150" inputmode="text"></label>
            <label><span>דגם / מק״ט</span><input type="text" name="model" value="<?= portal_h(mcohome_post_value('model', 150)) ?>" maxlength="150"></label>
            <label><span>תאריך</span><input type="date" name="discovery_date" value="<?= portal_h(mcohome_post_value('discovery_date', 20) ?: date('Y-m-d')) ?>" required></label>
        </div>

        <fieldset class="mcohome-fieldset">
            <legend>1. מה התקלקל?</legend>
            <div class="mcohome-chip-grid"><?php foreach ($options['deviceTypes'] as $index => $item): ?><label class="mcohome-chip"><input type="radio" name="device_type" value="<?= portal_h($item) ?>" <?= mcohome_post_value('device_type', 80) === $item ? 'checked' : '' ?> required><span><?= portal_h($item) ?></span></label><?php endforeach; ?></div>
        </fieldset>

        <label id="mcohome-nine-wrap"><span>תצורת מפסק 9</span><select name="nine_config" id="mcohome-nine-config"><option value="">בחר תצורה</option><?php foreach ($options['nineConfigs'] as $item): ?><option value="<?= portal_h($item) ?>" <?= mcohome_post_value('nine_config', 100) === $item ? 'selected' : '' ?>><?= portal_h($item) ?></option><?php endforeach; ?></select></label>

        <fieldset class="mcohome-fieldset">
            <legend>2. מה התקלה?</legend>
            <div class="mcohome-fault-grid"><?php foreach ($options['faultTypes'] as $item): ?><label class="mcohome-chip mcohome-chip--fault"><input type="radio" name="fault_type" value="<?= portal_h($item) ?>" <?= mcohome_post_value('fault_type', 120) === $item ? 'checked' : '' ?> required><span><?= portal_h($item) ?></span></label><?php endforeach; ?></div>
        </fieldset>

        <label><span>3. הסבר קצר</span><textarea name="description" rows="3" maxlength="600" required placeholder="מה בדיוק קורה? מה ניסיתם ומה התוצאה?"><?= portal_h(mcohome_post_value('description', 600)) ?></textarea></label>

        <label class="mcohome-media-box">
            <span>4. תמונה או סרטון של התקלה</span>
            <input type="file" name="media[]" id="mcohome-media" accept="image/*,video/mp4,video/quicktime,video/webm" capture="environment" multiple>
            <small>עד 5 קבצים, עד 30MB לקובץ. מומלץ סרטון קצר וברור.</small>
            <div id="mcohome-media-list" class="form-note"></div>
        </label>

        <details class="mcohome-details">
            <summary>פרטים טכניים נוספים</summary>
            <div class="form-grid">
                <label><span>ערוץ / יציאה</span><input type="text" name="channel" value="<?= portal_h(mcohome_post_value('channel', 100)) ?>" maxlength="100" placeholder="CH2 / תריס 1"></label>
                <label><span>קונטרולר</span><select name="controller"><option value="">לא צוין</option><?php foreach ($options['controllers'] as $item): ?><option value="<?= portal_h($item) ?>" <?= mcohome_post_value('controller', 100) === $item ? 'selected' : '' ?>><?= portal_h($item) ?></option><?php endforeach; ?></select></label>
                <label><span>Node ID</span><input type="text" name="node_id" value="<?= portal_h(mcohome_post_value('node_id', 80)) ?>" maxlength="80"></label>
                <label><span>בדיקת Z-Wave</span><input type="text" name="zwave_check" value="<?= portal_h(mcohome_post_value('zwave_check', 300)) ?>" maxlength="300" placeholder="Inclusion / Exclusion / ליד הקונטרולר"></label>
                <label class="form-grid__wide"><span>עומס / דרייבר / מנוע</span><input type="text" name="load_context" value="<?= portal_h(mcohome_post_value('load_context', 400)) ?>" maxlength="400" placeholder="לדוגמה: 6 גופי LED, 72W, דרייבר X"></label>
                <label><span>סטטוס</span><select name="unit_status"><?php foreach ($options['statuses'] as $item): ?><option value="<?= portal_h($item) ?>" <?= (mcohome_post_value('unit_status', 100) ?: 'פתוח') === $item ? 'selected' : '' ?>><?= portal_h($item) ?></option><?php endforeach; ?></select></label>
                <label><span>פעולה שבוצעה</span><select name="action_taken"><?php foreach ($options['actions'] as $item): ?><option value="<?= portal_h($item) ?>" <?= (mcohome_post_value('action_taken', 100) ?: 'לא בוצעה פעולה') === $item ? 'selected' : '' ?>><?= portal_h($item) ?></option><?php endforeach; ?></select></label>
            </div>
            <div class="checkbox-grid">
                <label><input type="checkbox" name="inrush" id="mcohome-inrush" <?= isset($_POST['inrush']) ? 'checked' : '' ?>> חשד ל-Inrush Current</label>
                <label><input type="checkbox" name="replaced" <?= isset($_POST['replaced']) ? 'checked' : '' ?>> הוחלפה יחידה באתר</label>
            </div>
            <label><span>הערות נוספות</span><textarea name="notes" rows="2" maxlength="1000"><?= portal_h(mcohome_post_value('notes', 1000)) ?></textarea></label>
        </details>

        <button type="submit" class="button button--primary button--wide mcohome-submit" id="mcohome-submit">שליחת דיווח לצוות</button>
        <p class="form-note">הדיווח נשלח לאורן, אריק, שגיב, מוחמד ועוביידה. בנוסף נוצרת טיוטת פנייה באנגלית ל-MCOHome.</p>
    </form>
</section>
<style>
.mcohome-panel{max-width:920px;margin-inline:auto;color:#10233f}.mcohome-panel .section-heading p,.mcohome-panel .form-note,.mcohome-panel small{color:#334e68;font-weight:600}.mcohome-panel .stack-form label>span,.mcohome-panel legend,.mcohome-panel summary{color:#10233f;font-weight:800}.mcohome-quick-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.mcohome-fieldset{border:1px solid #a9bdd2;border-radius:16px;padding:14px;margin:0}.mcohome-fieldset legend{font-weight:800;padding:0 8px}.mcohome-chip-grid,.mcohome-fault-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.mcohome-chip{position:relative}.mcohome-chip input{position:absolute;opacity:0;pointer-events:none}.mcohome-chip span{display:flex;min-height:50px;align-items:center;justify-content:center;text-align:center;border:2px solid #9fb3c8;border-radius:12px;padding:8px;background:#fff;color:#10233f;font-weight:800;cursor:pointer}.mcohome-chip input:checked+span{background:#075a9c;color:#fff;border-color:#075a9c}.mcohome-chip--fault span{font-size:14px}.mcohome-media-box{border:2px dashed #829ab1;border-radius:16px;padding:18px;background:#f1f7fc}.mcohome-media-box input{margin-top:8px}.mcohome-details{border:1px solid #a9bdd2;border-radius:14px;padding:14px}.mcohome-details summary{font-weight:800;cursor:pointer}.mcohome-details[open] summary{margin-bottom:14px}.mcohome-submit{font-size:18px;min-height:54px}.mcohome-result-card{display:grid;gap:8px;border:1px solid #79c292;background:#eefaf2;border-radius:14px;padding:16px;margin-bottom:18px}@media(max-width:720px){.mcohome-quick-grid{grid-template-columns:1fr}.mcohome-chip-grid,.mcohome-fault-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.mcohome-panel{padding:14px}.mcohome-chip span{min-height:56px}}
</style>
<script>
(function(){
    const form=document.getElementById('mcohome-fault-form');
    const nineWrap=document.getElementById('mcohome-nine-wrap');
    const nine=document.getElementById('mcohome-nine-config');
    const inrush=document.getElementById('mcohome-inrush');
    const media=document.getElementById('mcohome-media');
    const mediaList=document.getElementById('mcohome-media-list');
    const submit=document.getElementById('mcohome-submit');
    function selected(name){const el=form.querySelector('input[name="'+name+'"]:checked');return el?el.value:'';}
    function sync(){const isNine=selected('device_type')==='מפסק 9';nineWrap.style.display=isNine?'block':'none';nine.required=isNine;if(!isNine)nine.value='';if(selected('fault_type')==='ממסר נדבק'){inrush.checked=true;}}
    form.addEventListener('change',sync);sync();
    media.addEventListener('change',function(){let names=[];let total=0;for(const f of media.files){names.push(f.name+' ('+Math.round(f.size/1024/1024*10)/10+'MB)');total+=f.size;}mediaList.textContent=names.length?names.join(' | ')+' | סה״כ '+Math.round(total/1024/1024*10)/10+'MB':'';});
    form.addEventListener('submit',function(){submit.disabled=true;submit.textContent='שולח ושומר...';});
})();
</script>
<?php portal_page_end();
