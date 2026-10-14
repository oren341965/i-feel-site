<?php
declare(strict_types=1);
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_mcohome_faults.php';

header('Cache-Control: private, no-store, max-age=0');
header('X-Robots-Tag: noindex, nofollow, noarchive');
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'; media-src 'self'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD'], true)) {
    http_response_code(405); header('Allow: GET, HEAD'); exit;
}
$id = is_string($_GET['id'] ?? null) ? $_GET['id'] : '';
$token = is_string($_GET['token'] ?? null) ? $_GET['token'] : '';
$index = is_string($_GET['f'] ?? null) && preg_match('/^\d{1,2}$/', $_GET['f']) ? (int) $_GET['f'] : -1;
$record = preg_match('/^MCO-\d{8}-\d{6}-[A-F0-9]{6}$/', $id) ? mcohome_load_record($id) : null;
$item = $record['media'][$index] ?? null;
if (!is_array($record) || !mcohome_evidence_token_valid($record, $token, time()) || !is_array($item)
    || !preg_match('/^[a-f0-9]{32}\.(?:jpg|png|webp|heic|heif|avif|mp4|mov|webm)$/', (string) ($item['stored'] ?? ''))) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    exit('Evidence link unavailable or expired. Please contact I Feel. / 链接不可用或已过期，请联系 I Feel。');
}
$path = mcohome_media_path($id, $item);
if (!is_file($path)) { http_response_code(404); exit('Evidence unavailable / 文件不可用'); }
$mode = is_string($_GET['mode'] ?? null) ? $_GET['mode'] : '';
if ($mode === 'download' || $mode === 'stream') {
    $mime = (string) ($item['mime'] ?? 'application/octet-stream');
    if (!preg_match('~^(video/(mp4|quicktime|webm)|image/(jpeg|png|webp|heic|heif|avif))$~', $mime)) {
        $mime = 'application/octet-stream';
    }
    header('Content-Type: ' . $mime);
    $size = (int) filesize($path);
    $rangeHeader = (string) ($_SERVER['HTTP_RANGE'] ?? '');
    $range = mcohome_evidence_range($rangeHeader, $size);
    header('Accept-Ranges: bytes');
    if ($range === null) { http_response_code(416); header('Content-Range: bytes */' . $size); exit; }
    [$start, $end] = $range;
    if ($rangeHeader !== '') { http_response_code(206); header('Content-Range: bytes ' . $start . '-' . $end . '/' . $size); }
    header('Content-Length: ' . ($end - $start + 1));
    $name = 'mcohome-' . $id . '-' . ($index + 1) . '.' . pathinfo($path, PATHINFO_EXTENSION);
    header('Content-Disposition: ' . ($mode === 'download' ? 'attachment' : 'inline') . '; filename="' . $name . '"');
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') {
        // Audit the capability use without storing its secret token.
        portal_audit('mcohome_vendor_evidence_download', ['event_id' => $id, 'file_index' => $index, 'mode' => $mode]);
        $stream = fopen($path, 'rb');
        if ($stream === false) { http_response_code(404); exit; }
        fseek($stream, $start);
        $remaining = $end - $start + 1;
        while ($remaining > 0 && !feof($stream)) {
            $chunk = fread($stream, min(65536, $remaining));
            if ($chunk === false || $chunk === '') { break; }
            echo $chunk;
            $remaining -= strlen($chunk);
        }
        fclose($stream);
    }
    exit;
}
header('Content-Type: text/html; charset=utf-8');
$url = mcohome_vendor_media_url($id, $index, $token);
$stream = portal_h($url . '&mode=stream');
$download = portal_h($url . '&mode=download');
?>
<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MCOHome fault evidence / 故障视频</title>
<style>body{font:18px Arial,sans-serif;margin:32px auto;padding:0 20px;max-width:800px;background:#f7f9fc;color:#14233b}a{display:inline-block;padding:14px 20px;background:#1769aa;color:white;border-radius:8px;text-decoration:none}video,img{display:block;max-width:100%;margin:24px 0}</style>
<h1>MCOHome fault evidence / 故障资料</h1>
<p>Event / 事件: <?= portal_h($id) ?></p>
<p>No employee account required. Download the file if playback fails.<br>无需员工账号。如果无法播放，请下载文件。</p>
<?php if (strpos((string) $item['mime'], 'video/') === 0): ?>
<video controls preload="metadata" src="<?= $stream ?>"></video>
<?php else: ?><img src="<?= $stream ?>" alt="Fault evidence / 故障资料"><?php endif; ?>
<p><a href="<?= $download ?>">Download original / 下载原文件</a></p>
<p>This private link expires after 30 days. Do not forward it.<br>此私密链接30天后过期，请勿转发。</p>
</html>
