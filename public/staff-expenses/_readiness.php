<?php
declare(strict_types=1);

const IFEEL_PORTAL_MIN_PHP_VERSION_ID = 80100;

function portal_ini_bytes(string $value): int
{
    $value = trim($value);
    if ($value === '' || $value === '-1') {
        return $value === '-1' ? PHP_INT_MAX : 0;
    }

    $unit = strtolower(substr($value, -1));
    $number = (float) $value;
    return match ($unit) {
        'g' => (int) round($number * 1024 * 1024 * 1024),
        'm' => (int) round($number * 1024 * 1024),
        'k' => (int) round($number * 1024),
        default => (int) round($number),
    };
}

function portal_probe_private_storage(): void
{
    $root = portal_storage_root();
    portal_assert_private_storage($root);

    $probe = $root
        . DIRECTORY_SEPARATOR
        . 'security'
        . DIRECTORY_SEPARATOR
        . 'readiness-'
        . bin2hex(random_bytes(8))
        . '.tmp';
    $expected = bin2hex(random_bytes(16));

    try {
        if (file_put_contents($probe, $expected, LOCK_EX) === false) {
            throw new RuntimeException('Private storage is not writable.');
        }
        @chmod($probe, 0600);
        $actual = file_get_contents($probe);
        if (!is_string($actual) || !hash_equals($expected, $actual)) {
            throw new RuntimeException('Private storage read-back failed.');
        }
    } finally {
        if (is_file($probe) && !@unlink($probe)) {
            throw new RuntimeException('Private storage cleanup failed.');
        }
    }
}

function portal_readiness_report(): array
{
    $checks = [
        'php_version' => static fn(): bool => PHP_VERSION_ID >= IFEEL_PORTAL_MIN_PHP_VERSION_ID,
        'session' => static fn(): bool => session_status() === PHP_SESSION_ACTIVE,
        'secure_cookie' => static fn(): bool => portal_is_localhost() || portal_cookie_secure(),
        'fileinfo' => static fn(): bool => extension_loaded('fileinfo') && class_exists('finfo'),
        'upload_max_filesize' => static fn(): bool => portal_ini_bytes((string) ini_get('upload_max_filesize')) >= IFEEL_PORTAL_MAX_FILE_BYTES,
        'post_max_size' => static fn(): bool => portal_ini_bytes((string) ini_get('post_max_size')) >= IFEEL_PORTAL_MAX_TOTAL_BYTES,
        'max_file_uploads' => static fn(): bool => (int) ini_get('max_file_uploads') >= IFEEL_PORTAL_MAX_FILES,
        'private_storage' => static function (): bool {
            portal_probe_private_storage();
            return true;
        },
        'mail_transport' => static fn(): bool => function_exists('portal_mail_transport_available')
            && portal_mail_transport_available(),
    ];

    $results = [];
    foreach ($checks as $name => $check) {
        try {
            $results[$name] = (bool) $check();
        } catch (Throwable $error) {
            $results[$name] = false;
            error_log('[i-feel staff expenses readiness] ' . $name . ': ' . $error->getMessage());
        }
    }

    return [
        'ready' => !in_array(false, $results, true),
        'failed' => array_keys(array_filter($results, static fn(bool $passed): bool => !$passed)),
        'checks' => $results,
    ];
}

