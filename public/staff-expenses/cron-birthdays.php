<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit('Not found');
}

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_email_auth.php';
require_once __DIR__ . '/_employees.php';
require_once __DIR__ . '/_vehicles.php';

try {
    $lockPath = portal_storage_root() . DIRECTORY_SEPARATOR . 'security' . DIRECTORY_SEPARATOR . 'notification-cron.lock';
    portal_ensure_directory(dirname($lockPath));
    $lock = fopen($lockPath, 'c');
    if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
        fwrite(STDOUT, "Portal notifications are already running.\n");
        exit(0);
    }
    $now = new DateTimeImmutable('now', new DateTimeZone('Asia/Jerusalem'));
    $result = [
        'birthdays' => portal_process_birthday_notifications($now),
        'vehicles' => portal_process_vehicle_notifications($now),
    ];
    fwrite(STDOUT, json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL);
    flock($lock, LOCK_UN);
    fclose($lock);
    exit((($result['birthdays']['failed'] ?? 0) + ($result['vehicles']['failed'] ?? 0)) > 0 ? 1 : 0);
} catch (Throwable $error) {
    error_log('[i-feel portal notification cron] ' . $error->getMessage());
    fwrite(STDERR, "Portal notifications failed.\n");
    exit(1);
}
