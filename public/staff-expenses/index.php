<?php
declare(strict_types=1);

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
