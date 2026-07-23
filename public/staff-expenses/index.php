<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_ui.php';
require_once __DIR__ . '/_records.php';
require_once __DIR__ . '/_labels.php';
require_once __DIR__ . '/_form.php';
require_once __DIR__ . '/_admin.php';

try {
    $user = portal_current_user();

    if ($user === null) {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' && portal_post('action', 60) === 'login') {
            portal_verify_csrf();
            $username = portal_post('username', 40);
            $password = portal_post('password', 200);
            if (portal_login($username, $password)) {
                portal_audit('login_success');
                portal_redirect(['tab' => 'new']);
            }
            portal_audit('login_failure', ['username_hash' => hash('sha256', strtolower($username))]);
            portal_render_login('שם המשתמש או הסיסמה שגויים.');
        }
        portal_render_login();
    }

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
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
    if (!in_array($tab, ['new', 'reports', 'users'], true)) {
        $tab = 'new';
    }

    $flash = portal_flash_take();
    portal_page_start($tab === 'new' ? 'דיווח חדש' : ($tab === 'reports' ? 'דיווחים' : 'משתמשים'), $user);
    portal_nav($tab, $user);

    if ($tab === 'new') {
        portal_render_new_form($user, $flash);
    } elseif ($tab === 'reports') {
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
    } else {
        portal_render_users($flash);
    }
    portal_page_end();
} catch (Throwable $error) {
    error_log('[i-feel staff expenses] ' . $error->getMessage());
    $user = portal_current_user();
    if ($user === null) {
        portal_render_login($error->getMessage());
    }
    portal_page_start('שגיאה', $user);
    portal_nav('new', $user);
    ?><div class="alert alert--error" role="alert"><?= portal_h($error->getMessage()) ?></div><p><a class="button button--secondary" href="<?= portal_h(portal_url(['tab' => 'new'])) ?>">חזרה לטופס</a></p><?php
    portal_page_end();
}
