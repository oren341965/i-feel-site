<?php
declare(strict_types=1);

// The main site already enforces HTTPS. JetServer may terminate TLS before
// the request reaches PHP, so production requests must not be redirected
// again by the portal bootstrap or they can enter a redirect loop.
$portalHost = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
$portalIsLocal = $portalHost === 'localhost'
    || strpos($portalHost, 'localhost:') === 0
    || strpos($portalHost, '127.0.0.1') === 0;
if (!$portalIsLocal && PHP_SAPI !== 'cli') {
    $_SERVER['HTTPS'] = 'on';
    $_SERVER['SERVER_PORT'] = 443;
    $_SERVER['HTTP_X_FORWARDED_PROTO'] = 'https';
}

// The portal support files use PHP 8.1 language features such as never.
// Fail safely before loading them instead of exposing a blank 500 response.
if (PHP_VERSION_ID < 80100) {
    http_response_code(503);
    header('Content-Type: text/html; charset=UTF-8');
    header('Cache-Control: no-store, private, max-age=0, must-revalidate');
    header('X-Robots-Tag: noindex, nofollow, noarchive');
    ?>
    <!doctype html>
    <html lang="he" dir="rtl">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>אזור העובדים | I Feel</title>
      <style>
        *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f7fb;color:#10233f;font-family:Arial,"Heebo",sans-serif;padding:24px}.card{width:min(560px,100%);background:#fff;border:1px solid #dbe4ef;border-radius:20px;padding:36px;box-shadow:0 18px 45px rgba(16,35,63,.12);text-align:center}.logo{width:86px;height:auto;margin-bottom:20px}h1{font-size:30px;margin:0 0 12px}p{font-size:17px;line-height:1.65;margin:0;color:#52657d}
      </style>
    </head>
    <body>
      <main class="card">
        <img class="logo" src="/assets/ifeel-logo.png" alt="I Feel">
        <h1>אזור העובדים אינו זמין כרגע</h1>
        <p>נדרשת PHP בגרסה 8.1 ומעלה להפעלת המערכת. יש לעדכן את גרסת PHP בשרת לפני פתיחת הפורטל.</p>
      </main>
    </body>
    </html>
    <?php
    exit;
}

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_ui.php';
require_once __DIR__ . '/_email_auth.php';
require_once __DIR__ . '/_records.php';
require_once __DIR__ . '/_labels.php';
require_once __DIR__ . '/_form.php';
require_once __DIR__ . '/_admin.php';

try {
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
    if (($user['role'] ?? '') !== 'admin' && $tab !== 'new') {
        $tab = 'new';
    }
    if (!in_array($tab, ['new', 'reports'], true)) {
        $tab = 'new';
    }

    $flash = portal_flash_take();
    portal_page_start($tab === 'new' ? 'דיווח חדש' : 'דיווחים', $user);
    portal_nav($tab, $user);

    if ($tab === 'new') {
        portal_render_new_form($user, $flash);
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
    error_log('[i-feel staff expenses] ' . $error->getMessage());
    $user = portal_current_user();
    if ($user === null) {
        if (portal_email_challenge() !== null) {
            portal_render_email_code($error->getMessage());
        }
        portal_render_email_entry($error->getMessage());
    }
    portal_page_start('שגיאה', $user);
    portal_nav('new', $user);
    ?><div class="alert alert--error" role="alert"><?= portal_h($error->getMessage()) ?></div><p><a class="button button--secondary" href="<?= portal_h(portal_url(['tab' => 'new'])) ?>">חזרה לטופס</a></p><?php
    portal_page_end();
}
