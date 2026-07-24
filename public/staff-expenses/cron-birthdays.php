<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit('Not found');
}

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_email_auth.php';
require_once __DIR__ . '/_employees.php';

try {
    $lockPath = portal_storage_root() . DIRECTORY_SEPARATOR . 'security' . DIRECTORY_SEPARATOR . 'birthday-cron.lock';
    portal_ensure_directory(dirname($lockPath));
    $lock = fopen($lockPath, 'c');
    if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
        fwrite(STDOUT, "Birthday notifications are already running.\n");
        exit(0);
    }
    $result = portal_process_birthday_notifications(
        new DateTimeImmutable('now', new DateTimeZone('Asia/Jerusalem'))
    );
    fwrite(STDOUT, json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL);
    flock($lock, LOCK_UN);
    fclose($lock);
    exit(($result['failed'] ?? 0) > 0 ? 1 : 0);
} catch (Throwable $error) {
    error_log('[i-feel birthday cron] ' . $error->getMessage());
    fwrite(STDERR, "Birthday notifications failed.\n");
    exit(1);
}
