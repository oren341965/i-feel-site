<?php
declare(strict_types=1);
require_once __DIR__ . '/_portal.php';

header('Cache-Control: private, no-store, max-age=0');
header('X-Content-Type-Options: nosniff');

if (cp_current_user() === null) {
    http_response_code(401);
    exit;
}

$file = trim((string)($_GET['file'] ?? ''));
if (preg_match('/\A[a-z0-9][a-z0-9-]{0,79}\.(?:png|jpe?g|webp)\z/D', $file) !== 1) {
    http_response_code(404);
    exit;
}

$imageDir = __DIR__ . '/catalog/images';
$base = realpath($imageDir);
$path = realpath($imageDir . DIRECTORY_SEPARATOR . $file);
if ($base === false || $path === false || !str_starts_with($path, $base . DIRECTORY_SEPARATOR) || !is_file($path)) {
    http_response_code(404);
    exit;
}

$extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
$contentTypes = [
    'png' => 'image/png',
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'webp' => 'image/webp',
];
if (!isset($contentTypes[$extension])) {
    http_response_code(415);
    exit;
}

header('Content-Type: ' . $contentTypes[$extension]);
header('Content-Length: ' . (string)filesize($path));
readfile($path);
