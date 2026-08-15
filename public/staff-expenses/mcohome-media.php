<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_email_auth.php';
require_once __DIR__ . '/_mcohome_faults.php';

$user = portal_current_user();
if ($user === null) {
    header('Location: ' . portal_base_path(), true, 302);
    exit;
}

$eventId = trim((string) ($_GET['id'] ?? ''));
$indexRaw = $_GET['f'] ?? '';
if (!preg_match('/^MCO-\d{8}-\d{6}-[A-F0-9]{6}$/', $eventId) || !is_scalar($indexRaw) || !preg_match('/^\d+$/', (string) $indexRaw)) {
    http_response_code(400);
    exit('Invalid media request.');
}
$index = (int) $indexRaw;
$record = mcohome_load_record($eventId);
$media = is_array($record['media'] ?? null) ? $record['media'] : [];
$item = $media[$index] ?? null;
if (!is_array($item)) {
    http_response_code(404);
    exit('Media not found.');
}
$stored = (string) ($item['stored'] ?? '');
if (!preg_match('/^[a-f0-9]{32}\.(?:jpg|png|webp|heic|heif|avif|mp4|mov|webm)$/', $stored)) {
    http_response_code(404);
    exit('Media not found.');
}
$path = mcohome_event_dir($eventId) . DIRECTORY_SEPARATOR . 'media' . DIRECTORY_SEPARATOR . $stored;
if (!is_file($path)) {
    http_response_code(404);
    exit('Media not found.');
}
$mime = (string) ($item['mime'] ?? 'application/octet-stream');
$name = str_replace(["\r", "\n", '"'], '', (string) ($item['name'] ?? 'mcohome-media'));
if ($name === '') {
    $name = 'mcohome-media';
}
portal_audit('mcohome_media_download', [
    'event_id' => $eventId,
    'file_index' => $index,
    'employee_hash' => hash('sha256', (string) ($user['email'] ?? $user['username'] ?? '')),
]);
header('Cache-Control: private, no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header('Content-Type: ' . $mime);
header('Content-Length: ' . (string) filesize($path));
header('Content-Disposition: inline; filename="' . preg_replace('/[^A-Za-z0-9._-]/', '_', $name) . '"; filename*=UTF-8\'\'' . rawurlencode($name));
readfile($path);
exit;
