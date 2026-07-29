<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_ui.php';
require_once __DIR__ . '/_email_auth.php';
require_once __DIR__ . '/_employees.php';
require_once __DIR__ . '/_vehicles.php';
require_once __DIR__ . '/_vehicle_portal.php';
require_once __DIR__ . '/_records.php';
require_once __DIR__ . '/_labels.php';
require_once __DIR__ . '/_notifications.php';
require_once __DIR__ . '/_work_reports.php';
require_once __DIR__ . '/_history.php';
require_once __DIR__ . '/_profile.php';
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
  <title>׳׳–׳•׳¨ ׳”׳¢׳•׳‘׳“׳™׳ | I Feel</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f7fb;color:#10233f;font-family:Arial,"Heebo",sans-serif;padding:24px}.card{width:min(560px,100%);background:#fff;border:1px solid #dbe4ef;border-radius:20px;padding:36px;box-shadow:0 18px 45px rgba(16,35,63,.12);text-align:center}.logo{width:86px;height:auto;margin-bottom:20px}h1{font-size:30px;margin:0 0 12px}p{font-size:17px;line-height:1.65;margin:0 0 24px;color:#52657d}.button{display:inline-block;background:#1769aa;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px}.note{margin-top:22px;font-size:14px;color:#6b7b90}
  </style>
</head>
<body>
  <main class="card">
    <img class="logo" src="/assets/ifeel-logo.png" alt="I Feel">
    <h1>׳׳–׳•׳¨ ׳”׳¢׳•׳‘׳“׳™׳ ׳ ׳׳¦׳ ׳›׳¨׳’׳¢ ׳‘׳˜׳™׳₪׳•׳</h1>
    <p>׳”׳’׳™׳©׳” ׳׳“׳™׳•׳•׳— ׳”׳•׳¦׳׳•׳× ׳”׳•׳©׳‘׳×׳” ׳–׳׳ ׳™׳× ׳›׳“׳™ ׳׳׳ ׳•׳¢ ׳×׳§׳׳”. ׳”׳׳×׳¨ ׳”׳¨׳׳©׳™ ׳•׳©׳™׳¨׳•׳×׳™ ׳”׳—׳‘׳¨׳” ׳׳׳©׳™׳›׳™׳ ׳׳₪׳¢׳•׳ ׳›׳¨׳’׳™׳.</p>
    <a class="button" href="/">׳—׳–׳¨׳” ׳׳׳×׳¨ I Feel</a>
    <div class="note">׳”׳׳¢׳¨׳›׳× ׳×׳—׳–׳•׳¨ ׳׳₪׳¢׳™׳׳•׳× ׳׳׳—׳¨ ׳‘׳“׳™׳§׳× ׳”׳©׳¨׳× ׳•׳”׳©׳׳׳× ׳‘׳“׳™׳§׳•׳× ׳׳‘׳˜׳—׳”.<?php if ($requestId !== null): ?> ׳׳¡׳₪׳¨ ׳‘׳“׳™׳§׳”: <?= portal_h($requestId) ?>.<?php endif; ?></div>
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

    $loginToken = $_GET['login_token'] ?? '';
    if (!is_array($loginToken) && trim((string) $loginToken) !== '') {
        try {
            $magicEmail = portal_consume_magic_link((string) $loginToken);
            portal_complete_email_login($magicEmail, 'company_email_magic_link');
            portal_redirect(['tab' => 'new']);
        } catch (Throwable $magicLinkError) {
            portal_render_email_entry($magicLinkError->getMessage());
        }
    }

    $user = portal_current_user();
    if ($user === null) {
        try {
            $user = portal_restore_remembered_login();
        } catch (Throwable $rememberError) {
            error_log('[i-feel staff expenses remember] restore_failed');
            portal_revoke_remembered_login();
            $user = null;
        }
    }

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

            portal_render_email_entry('׳”׳₪׳¢׳•׳׳” ׳”׳׳‘׳•׳§׳©׳× ׳׳™׳ ׳” ׳׳•׳›׳¨׳×.');
        }

        if (portal_email_challenge() !== null) {
            portal_render_email_code();
        }
        portal_render_email_entry();
    }

    $verifiedEmail = portal_normalize_company_email((string) ($user['email'] ?? ''));
    if ($verifiedEmail !== null) {
        $directoryEntry = portal_employee_directory_entry($user);
        $displayName = trim((string) ($directoryEntry['name'] ?? ''));
        if ($displayName === '' && ($user['username'] ?? '') === 'employee') {
            $displayName = $verifiedEmail;
        }
        if ($displayName !== '') {
            $user['display_name'] = $displayName;
            $_SESSION['portal_user']['display_name'] = $displayName;
        }
    }

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        if (portal_post('action', 60) === 'submit_report' && $verifiedEmail !== null) {
            $_POST['employee_email'] = $verifiedEmail;
        }
        if (portal_post('action', 60) === 'submit_work_report') {
            portal_handle_work_report_post($user);
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
    if ($action === 'gift_download') {
        portal_handle_birthday_gift_download($user);
    }
    if ($action === 'vehicle_document_download') {
        portal_handle_vehicle_document_download($user);
    }

    $tab = trim((string) ($_GET['tab'] ?? 'new'));
    if (($user['role'] ?? '') !== 'admin' && !in_array($tab, ['new', 'history', 'work', 'profile', 'my_vehicle'], true)) {
        $tab = 'new';
    }
    if (!in_array($tab, ['new', 'history', 'work', 'profile', 'my_vehicle', 'work_stats', 'reports', 'employees', 'vehicles'], true)) {
        $tab = 'new';
    }
    if ($tab === 'my_vehicle' && portal_vehicles_for_employee($user) === []) {
        $tab = 'profile';
    }

    $flash = portal_flash_take();
    $pageTitle = match ($tab) {
        'history' => '׳”׳”׳•׳¦׳׳•׳× ׳©׳׳™',
        'reports' => '׳“׳™׳•׳•׳—׳™׳',
        'employees' => '׳₪׳¨׳˜׳™ ׳¢׳•׳‘׳“׳™׳ ׳•׳™׳׳™ ׳”׳•׳׳“׳×',
        'vehicles' => '׳¨׳›׳‘׳™ ׳¢׳•׳‘׳“׳™׳',
        'profile' => '׳”׳₪׳¨׳˜׳™׳ ׳•׳”׳¨׳›׳‘ ׳©׳׳™',
        'my_vehicle' => '׳”׳¨׳›׳‘ ׳©׳׳™',
        'work' => '׳¡׳™׳•׳ ׳”׳×׳§׳ ׳” ׳׳• ׳©׳™׳¨׳•׳×',
        'work_stats' => '׳¡׳˜׳˜׳™׳¡׳˜׳™׳§׳× ׳¢׳‘׳•׳“׳•׳×',
        default => '׳“׳™׳•׳•׳— ׳—׳“׳©',
    };
    portal_page_start($pageTitle, $user);
    portal_nav($tab, $user);
    portal_render_birthday_banner($user);
    portal_render_profile_completion_notice($user, $tab);

    if ($tab === 'new') {
        portal_render_new_form($user, $flash);
    } elseif ($tab === 'history') {
        portal_render_employee_history($user, $flash);
    } elseif ($tab === 'employees') {
        portal_render_employee_directory_admin($flash);
    } elseif ($tab === 'vehicles') {
        portal_render_vehicle_admin($flash);
    } elseif ($tab === 'profile') {
        portal_render_employee_profile_page($user, $flash);
    } elseif ($tab === 'my_vehicle') {
        portal_render_my_vehicle_page($user, $flash);
    } elseif ($tab === 'work') {
        portal_render_work_report_form($user, $flash);
    } elseif ($tab === 'work_stats') {
        portal_render_work_report_stats($flash);
    } else {
        $view = trim((string) ($_GET['view'] ?? ''));
        if ($view !== '') {
            $record = portal_load_record($view);
            if ($record === null) {
                throw new RuntimeException('׳”׳“׳™׳•׳•׳— ׳”׳׳‘׳•׳§׳© ׳׳ ׳ ׳׳¦׳.');
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

    portal_page_start('׳©׳’׳™׳׳”', $user);
    portal_nav('new', $user);
    ?><div class="alert alert--error" role="alert"><?= portal_h($error->getMessage()) ?></div><p><a class="button button--secondary" href="<?= portal_h(portal_url(['tab' => 'new'])) ?>">׳—׳–׳¨׳” ׳׳˜׳•׳₪׳¡</a></p><?php
    portal_page_end();
}

