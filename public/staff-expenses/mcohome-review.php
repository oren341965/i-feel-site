<?php
declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_email_auth.php';
require_once __DIR__ . '/_mcohome_faults.php';
header('Cache-Control: private, no-store');
header('X-Robots-Tag: noindex, nofollow, noarchive');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
$user = portal_current_user();
$email = strtolower(trim((string) ($user['email'] ?? '')));
if (!in_array($email, ['oren@i-feel.co.il', 'arik@i-feel.co.il'], true)) {
    http_response_code(403); exit('גישה מותרת לאורן ולאריק בלבד.');
}
$day = is_string($_GET['date'] ?? null) ? $_GET['date'] : date('Y-m-d');
if (!preg_match('/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/', $day)) { http_response_code(400); exit('Invalid date'); }
$compact = str_replace('-', '', $day);
$pattern = mcohome_storage_root() . '/' . substr($compact, 0, 4) . '/' . substr($compact, 4, 2) . '/MCO-' . $compact . '-*/metadata.json';
$records = [];
$videoCount = 0;
$unique = [];
foreach (array_slice(glob($pattern) ?: [], 0, 100) as $metadata) {
    $record = portal_json_read($metadata);
    foreach (($record['media'] ?? []) as $index => $media) {
        if (strpos((string) ($media['mime'] ?? ''), 'video/') !== 0) { continue; }
        if (!preg_match('/^[a-f0-9]{32}\.(mp4|mov|webm)$/', (string) ($media['stored'] ?? ''))) { continue; }
        $path = mcohome_media_path((string) $record['eventId'], $media);
        $hash = is_file($path) ? hash_file('sha256', $path) : '';
        $record['media'][$index]['sha256'] = $hash;
        if ($hash !== '' && $hash !== false) { $unique[$hash] = true; }
        $videoCount++;
    }
    $records[] = $record;
}
header('Content-Type: text/html; charset=utf-8');
?>
<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>בדיקת מסירת סרטוני MCOHome</title><style>body{font:17px Arial,sans-serif;margin:24px;color:#17233b}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd5e0;padding:12px;text-align:right}a{color:#165fa5}small{display:block;word-break:break-all}</style>
<h1>בדיקת מסירת סרטוני MCOHome</h1>
<form><label>תאריך <input type="date" name="date" value="<?= portal_h($day) ?>"></label><button>בדיקה</button></form>
<p><?= count($records) ?> דיווחים; <?= $videoCount ?> קובצי וידאו; <?= count($unique) ?> סרטונים ייחודיים לפי תוכן. מוצגים עד 100 דיווחים ביום.</p>
<p>אישור שירות הדואר אינו אישור קבלה או צפייה אצל היצרן. דיווח ישן המסומן ״נשלח״ ללא אישור מפורט אינו הוכחה למסירת הסרטון.</p>
<table><tr><th>אירוע / לקוח</th><th>וידאו ותוכן</th><th>Drive</th><th>שליחה מתועדת</th><th>מעקב</th></tr>
<?php foreach ($records as $record): ?><tr>
<td><?= portal_h((string) $record['eventId']) ?><br><?= portal_h((string) ($record['project'] ?? '')) ?></td>
<td><?php foreach (($record['media'] ?? []) as $index => $media): ?>
<a href="<?= portal_h(mcohome_media_url($record['eventId'], $index)) ?>"><?= portal_h((string) ($media['name'] ?? 'media')) ?></a>
<small><?= portal_h((string) ($media['sha256'] ?? '')) ?></small>
<?php endforeach; ?></td>
<td><?= portal_h((string) ($record['driveSync']['status'] ?? 'לא אומת')) ?></td>
<td><?= portal_h((string) ($record['manufacturerDelivery']['status'] ?? 'אין אישור מפורט')) ?><br>
<?= portal_h(implode(', ', $record['manufacturerDelivery']['to'] ?? [])) ?><br>
<?= portal_h(implode(', ', $record['manufacturerDelivery']['attachmentNames'] ?? [])) ?></td>
<td><?= portal_h((string) ($record['owner'] ?? 'לא צוין')) ?><br><?= portal_h((string) ($record['followUpDue'] ?? 'לא נקבע')) ?></td>
</tr><?php endforeach; ?></table></html>
