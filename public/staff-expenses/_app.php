<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_ui.php';
require_once __DIR__ . '/_email_auth.php';
require_once __DIR__ . '/_records.php';
require_once __DIR__ . '/_labels.php';
require_once __DIR__ . '/_notifications.php';
require_once __DIR__ . '/_history.php';
require_once __DIR__ . '/_form.php';
require_once __DIR__ . '/_admin.php';
require_once __DIR__ . '/_readiness.php';

function portal_render_maintenance_page(?string $requestId = null): never
{
    http_response_code(503);
    header('Retry-After: 300');
    portal_send_security_headers();
    ?>
<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>אזור העובדים | I Feel</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f7fb;color:#10233f;font-family:Arial,"Heebo",sans-serif;padding:24px}.card{width:min(560px,100%);background:#fff;border:1px solid #dbe4ef;border-radius:20px;padding:36px;box-shadow:0 18px 45px rgba(16,35,63,.12);text-align:center}.logo{width:86px;height:auto;margin-bottom:20px}h1{font-size:30px;margin:0 0 12px}p{font-size:17px;line-height:1.65;margin:0 0 24px;color:#52657d}.button{display:inline-block;background:#1769aa;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px}.note{margin-top:22px;font-size:14px;color:#6b7b90}
  </style>
</head>
<body>
  <main class="card">
    <img class="logo" src="/assets/ifeel-logo.png" alt="I Feel">
    <h1>אזור העובדים נמצא כרגע בטיפול</h1>
    <p>הגישה לדיווח הוצאות הושבתה זמנית כדי למנוע תקלה. האתר הראשי ושירותי החברה ממשיכים לפעול כרגיל.</p>
    <a class="button" href="/">חזרה לאתר I Feel</a>
    <div class="note">המערכת תחזור לפעילות לאחר בדיקת השרת והשלמת בדיקות אבטחה.<?php if ($requestId !== null): ?> מספר בדיקה: <?= portal_h($requestId) ?>.<?php endif; ?></div>
  </main>
</body>
</html>
    <?php
    exit;
}

try {
    $readiness = portal_readiness_report();
    if (!($readiness['ready'] ?? false)) {
        $requestId = bin2hex(random_bytes(6));
        header('X-Ifeel-Portal-Status: readiness');
        header('X-Ifeel-Portal-Failed: ' . implode(',', $readiness['failed'] ?? []));
        error_log(
            '[i-feel staff expenses readiness] request='
            . $requestId
            . ' failed='
            . implode(',', $readiness['failed'] ?? [])
        );
        portal_render_maintenance_page($requestId);
    }

    $user = portal_current_user();

    if ($user === null) {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
            portal_verify_csrf();
            $loginAction = portal_post('action', 60);

            if ($loginAction === 'request_email_code') {
                $emailInput = portal_post('email', 160);
                try {
                    portal_request_email_code($emailInput);
                    portal_render_email_code();
                } catch (Throwable $loginError) {
                    portal_render_email_entry($loginError->getMessage(), $emailInput);
                }
            }

            if ($loginAction === 'verify_email_code') {
                try {
                    portal_verify_email_code(portal_post('code', 20));
                    portal_redirect(['tab' => 'new']);
                } catch (Throwable $loginError) {
                    if (portal_email_challenge() !== null) {
                        portal_render_email_code($loginError->getMessage());
                    }
                    portal_render_email_entry($loginError->getMessage());
                }
            }

            if ($loginAction === 'restart_email_login') {
                portal_clear_email_challenge();
                portal_redirect();
            }

            portal_render_email_entry('הפעולה המבוקשת אינה מוכרת.');
        }

        if (portal_email_challenge() !== null) {
            portal_render_email_code();
        }
        portal_render_email_entry();
    }

    $verifiedEmail = portal_normalize_company_email((string) ($user['email'] ?? ''));
    if ($verifiedEmail !== null && ($user['username'] ?? '') === 'employee') {
        $user['display_name'] = $verifiedEmail;
        $_SESSION['portal_user']['display_name'] = $verifiedEmail;
    }

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        if (portal_post('action', 60) === 'submit_report' && $verifiedEmail !== null) {
            $_POST['employee_email'] = $verifiedEmail;
        }
        portal_handle_post($user);
    }

    $action = trim((string) ($_GET['action'] ?? ''));
    if ($action === 'download') {
        portal_handle_download($user);
    }
    if ($action === 'export') {
        portal_handle_export($user);
    }

    $tab = trim((string) ($_GET['tab'] ?? 'new'));
    if (($user['role'] ?? '') !== 'admin' && !in_array($tab, ['new', 'history'], true)) {
        $tab = 'new';
    }
    if (!in_array($tab, ['new', 'history', 'reports'], true)) {
        $tab = 'new';
    }

    $flash = portal_flash_take();
    $pageTitle = match ($tab) {
        'history' => 'ההוצאות שלי',
        'reports' => 'דיווחים',
        default => 'דיווח חדש',
    };
    portal_page_start($pageTitle, $user);
    portal_nav($tab, $user);

    if ($tab === 'new') {
        portal_render_new_form($user, $flash);
    } elseif ($tab === 'history') {
        portal_render_employee_history($user, $flash);
    } else {
        $view = trim((string) ($_GET['view'] ?? ''));
        if ($view !== '') {
            $record = portal_load_record($view);
            if ($record === null) {
                throw new RuntimeException('הדיווח המבוקש לא נמצא.');
            }
            portal_render_record_detail($record, $flash);
        } else {
            portal_render_reports($flash);
        }
    }
    portal_page_end();
} catch (Throwable $error) {
    $requestId = bin2hex(random_bytes(6));
    header('X-Ifeel-Portal-Status: runtime-error');
    error_log('[i-feel staff expenses] request=' . $requestId . ' ' . $error->getMessage());

    $user = null;
    try {
        $user = portal_current_user();
    } catch (Throwable $ignored) {
        // The generic maintenance page below remains safe even if storage or
        // session state becomes unavailable after the readiness probe.
    }
    if ($user === null) {
        portal_render_maintenance_page($requestId);
    }

    portal_page_start('שגיאה', $user);
    portal_nav('new', $user);
    ?><div class="alert alert--error" role="alert"><?= portal_h($error->getMessage()) ?></div><p><a class="button button--secondary" href="<?= portal_h(portal_url(['tab' => 'new'])) ?>">חזרה לטופס</a></p><?php
    portal_page_end();
}
