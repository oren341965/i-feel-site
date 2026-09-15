<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_email_auth.php';
require_once __DIR__ . '/_mcohome_faults.php';

header('Content-Type: application/json; charset=UTF-8');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'");

function mcohome_api_reply(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    mcohome_api_reply(405, ['ok' => false, 'error' => 'POST required']);
}

if (trim((string) ($_SERVER['HTTP_X_I_FEEL_MCOHOME_APP'] ?? '')) !== '1') {
    mcohome_api_reply(403, ['ok' => false, 'error' => 'Invalid app request']);
}

$user = portal_current_user();
if ($user === null) {
    mcohome_api_reply(401, ['ok' => false, 'error' => 'Authentication required']);
}

try {
    $options = mcohome_options();
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
        throw new RuntimeException('לא ניתן לזהות את כתובת העובד המחובר.');
    }

    $clientEventId = mcohome_post_value('client_event_id', 80);
    $eventId = mcohome_resolve_event_id($clientEventId);
    $existing = mcohome_load_record($eventId);
    if ($existing !== null) {
        mcohome_api_reply(200, [
            'ok' => true,
            'duplicate' => true,
            'eventId' => $eventId,
            'recurring' => (bool) ($existing['recurring'] ?? false),
            'severity' => (string) ($existing['severity'] ?? 'NORMAL'),
        ]);
    }

    $media = mcohome_save_media($eventId, $_FILES['media'] ?? []);
    $statusValue = mcohome_post_value('unit_status', 100);
    $actionValue = mcohome_post_value('action_taken', 100);
    $record = [
        'eventId' => $eventId,
        'createdAt' => date(DATE_ATOM),
        'updatedAt' => date(DATE_ATOM),
        'discoveryDate' => mcohome_post_value('discovery_date', 20) ?: date('Y-m-d'),
        'technician' => trim((string) ($user['display_name'] ?? $verifiedEmail)),
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
        'inrushSuspected' => $faultType === 'ממסר נדבק' || isset($_POST['inrush']),
        'controller' => $controller,
        'nodeId' => mcohome_post_value('node_id', 80),
        'zwaveCheck' => mcohome_post_value('zwave_check', 300),
        'unitStatus' => in_array($statusValue, $options['statuses'], true) ? $statusValue : 'פתוח',
        'actionTaken' => in_array($actionValue, $options['actions'], true) ? $actionValue : 'לא בוצעה פעולה',
        'replaced' => isset($_POST['replaced']),
        'replacementDate' => '',
        'sentToMcohome' => false,
        'rma' => '',
        'manufacturerConclusion' => '',
        'manufacturerCredit' => '',
        'rootCause' => '',
        'resolution' => '',
        'owner' => 'שירות I Feel / MCOHome',
        'notes' => mcohome_post_value('notes', 1000),
        'media' => $media,
    ];

    $record = mcohome_finalize_record($record);
    portal_audit('mcohome_fault_submitted_app', [
        'event_id' => $record['eventId'],
        'employee_hash' => hash('sha256', $verifiedEmail),
        'device_type' => $record['deviceType'],
        'fault_type' => $record['faultType'],
        'media_count' => count($record['media']),
        'recurring' => (bool) ($record['recurring'] ?? false),
    ]);

    mcohome_api_reply(200, [
        'ok' => true,
        'eventId' => $record['eventId'],
        'recurring' => (bool) ($record['recurring'] ?? false),
        'repeatCount' => (int) ($record['repeatCount'] ?? 1),
        'severity' => (string) ($record['severity'] ?? 'NORMAL'),
        'vendorSent' => (bool) ($record['sentToMcohome'] ?? false),
        'sheetSync' => $record['sheetSync'] ?? [],
        'dropboxSync' => $record['dropboxSync'] ?? [],
    ]);
} catch (Throwable $error) {
    error_log('[mcohome app submit] ' . $error->getMessage());
    mcohome_api_reply(400, ['ok' => false, 'error' => $error->getMessage()]);
}
