<?php
declare(strict_types=1);

/**
 * Keep the public entry point deliberately small and dependency-free.
 *
 * A syntax error, missing include, or server-only configuration problem in the
 * application must fail closed with a useful 503 response instead of exposing
 * an empty HTTP 500 page. The detailed error remains in the server log.
 */
function portal_bootstrap_maintenance(string $status, ?string $requestId = null): void
{
    http_response_code(503);
    header('Retry-After: 300');
    header('Cache-Control: no-store, private, max-age=0, must-revalidate');
    header('Pragma: no-cache');
    header('Expires: 0');
    header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    header("Content-Security-Policy: default-src 'none'; img-src 'self' data:; style-src 'self'; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'");
    header('X-Ifeel-Portal-Status: ' . $status);
    ?>
<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>אזור העובדים | I Feel</title>
  <link rel="stylesheet" href="/staff-expenses/portal.css">
</head>
<body>
  <main class="login-shell">
    <section class="login-card">
      <img class="login-logo" src="/assets/ifeel-logo.png" alt="I Feel">
      <h1>אזור העובדים נמצא כרגע בטיפול</h1>
      <p>הגישה לדיווח הוצאות הושבתה זמנית כדי למנוע תקלה. האתר הראשי ושירותי החברה ממשיכים לפעול כרגיל.</p>
      <p><a class="button button--primary" href="/">חזרה לאתר I Feel</a></p>
      <?php if ($requestId !== null): ?>
        <p class="form-note">מספר בדיקה: <?= htmlspecialchars($requestId, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></p>
      <?php endif; ?>
    </section>
  </main>
</body>
</html>
    <?php
}

if (PHP_VERSION_ID < 80100) {
    $requestId = bin2hex(random_bytes(6));
    error_log('[i-feel staff expenses bootstrap] request=' . $requestId . ' unsupported PHP ' . PHP_VERSION);
    portal_bootstrap_maintenance('php-version', $requestId);
    exit;
}

try {
    require __DIR__ . '/_app.php';
} catch (Throwable $error) {
    $requestId = bin2hex(random_bytes(6));
    error_log('[i-feel staff expenses bootstrap] request=' . $requestId . ' ' . $error->getMessage());
    portal_bootstrap_maintenance('bootstrap-error', $requestId);
}
