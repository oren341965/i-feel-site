<?php
declare(strict_types=1);

const MTLAW_TURNTABLE_IMAGE_URL = 'https://tres.co.il/cdn/shop/files/ARGTTMK2EAGR_O_04.webp?v=1768313097&width=1200';
const MTLAW_TURNTABLE_CACHE_SECONDS = 2592000;
const MTLAW_TURNTABLE_MAX_BYTES = 8388608;

header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('Cache-Control: public, max-age=86400, stale-if-error=604800');

function mtlaw_product_image_output(string $body, string $contentType): never
{
    $etag = '"' . hash('sha256', $body) . '"';
    if (trim((string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
        http_response_code(304);
        header('ETag: ' . $etag);
        exit;
    }

    header('Content-Type: ' . $contentType);
    header('Content-Length: ' . strlen($body));
    header('ETag: ' . $etag);
    echo $body;
    exit;
}

function mtlaw_product_image_fallback(): never
{
    $svg = <<<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800" role="img" aria-label="תמונת המוצר אינה זמינה כרגע">
  <rect width="1200" height="800" fill="#f1f3f5"/>
  <rect x="250" y="245" width="700" height="310" rx="36" fill="#cfd5da"/>
  <circle cx="680" cy="400" r="128" fill="#2a3036"/>
  <circle cx="680" cy="400" r="22" fill="#c89b55"/>
  <path d="M430 300 L470 505" stroke="#505860" stroke-width="22" stroke-linecap="round"/>
  <text x="600" y="690" text-anchor="middle" font-family="Arial,sans-serif" font-size="38" fill="#4d5968">תמונת המוצר תיטען מחדש בקרוב</text>
</svg>
SVG;
    mtlaw_product_image_output($svg, 'image/svg+xml; charset=UTF-8');
}

$cachePath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR)
    . DIRECTORY_SEPARATOR
    . 'ifeel-argon-tt-mk2-earth-grey.webp';

if (
    is_file($cachePath)
    && filesize($cachePath) !== false
    && (int) filesize($cachePath) > 1024
    && filemtime($cachePath) !== false
    && (int) filemtime($cachePath) >= time() - MTLAW_TURNTABLE_CACHE_SECONDS
) {
    $cached = file_get_contents($cachePath);
    if (is_string($cached) && $cached !== '') {
        mtlaw_product_image_output($cached, 'image/webp');
    }
}

if (!function_exists('curl_init')) {
    mtlaw_product_image_fallback();
}

$curl = curl_init(MTLAW_TURNTABLE_IMAGE_URL);
if ($curl === false) {
    mtlaw_product_image_fallback();
}

$options = [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS => 3,
    CURLOPT_CONNECTTIMEOUT => 6,
    CURLOPT_TIMEOUT => 18,
    CURLOPT_USERAGENT => 'I Feel Smart Home product image cache/1.0',
    CURLOPT_HTTPHEADER => [
        'Accept: image/avif,image/webp,image/*,*/*;q=0.8',
        'Accept-Language: he-IL,he;q=0.9,en;q=0.7',
    ],
];
if (defined('CURLOPT_PROTOCOLS') && defined('CURLPROTO_HTTPS')) {
    $options[CURLOPT_PROTOCOLS] = CURLPROTO_HTTPS;
}
if (defined('CURLOPT_REDIR_PROTOCOLS') && defined('CURLPROTO_HTTPS')) {
    $options[CURLOPT_REDIR_PROTOCOLS] = CURLPROTO_HTTPS;
}
curl_setopt_array($curl, $options);

$body = curl_exec($curl);
$status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
$contentType = strtolower((string) curl_getinfo($curl, CURLINFO_CONTENT_TYPE));
$error = curl_error($curl);
curl_close($curl);

if (
    $body === false
    || !is_string($body)
    || $error !== ''
    || $status < 200
    || $status >= 300
    || !str_starts_with($contentType, 'image/')
    || strlen($body) < 1024
    || strlen($body) > MTLAW_TURNTABLE_MAX_BYTES
) {
    error_log('[i-feel mt-law product image] Could not refresh TRES image: HTTP ' . $status . ' ' . $error);
    if (is_file($cachePath)) {
        $stale = file_get_contents($cachePath);
        if (is_string($stale) && $stale !== '') {
            mtlaw_product_image_output($stale, 'image/webp');
        }
    }
    mtlaw_product_image_fallback();
}

@file_put_contents($cachePath, $body, LOCK_EX);
mtlaw_product_image_output($body, str_contains($contentType, 'webp') ? 'image/webp' : $contentType);
