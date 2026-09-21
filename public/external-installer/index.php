<?php
declare(strict_types=1);

define('IFEEL_PORTAL_SESSION', 'ifeel_external_installer');
define('IFEEL_PORTAL_SESSION_COOKIE_PATH', '/external-installer/');
define('IFEEL_PORTAL_IDLE_TIMEOUT', 3600);

require_once dirname(__DIR__) . '/staff-expenses/_bootstrap.php';
require_once dirname(__DIR__) . '/staff-expenses/_ui.php';
require_once dirname(__DIR__) . '/staff-expenses/_email_auth.php';
require_once dirname(__DIR__) . '/staff-expenses/_notifications.php';
require_once dirname(__DIR__) . '/staff-expenses/_work_reports.php';
require_once __DIR__ . '/_external.php';

function external_render_message(string $title, string $message, bool $success = true): void
{
    external_page_start($title);
    ?>
    <section class="login-card">
        <img src="/assets/ifeel-logo.png" alt="I Feel" class="login-logo">
        <h1><?= portal_h($title) ?></h1>
        <div class="alert <?= $success ? 'alert--success' : 'alert--error' ?>"><?= portal_h($message) ?></div>
        <p><a class="button button--secondary" href="<?= portal_h(external_public_url()) ?>">חזרה</a></p>
    </section>
    <?php
    external_page_end();
    exit;
}

try {
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

    if ($method === 'POST') {
        portal_verify_csrf();
        $action = portal_post('action', 80);

        if ($action === 'request_installer_code') {
            try {
                external_request_otp(portal_post('email', 160), 'installer');
                external_render_code('installer');
            } catch (Throwable $error) {
                external_render_installer_login($error->getMessage());
            }
        }

        if ($action === 'verify_installer_code') {
            try {
                $installer = external_verify_otp(portal_post('code', 20), 'installer');
                $pendingGrant = trim((string) ($_SESSION['pending_external_grant'] ?? ''));
                if ($pendingGrant !== '') {
                    unset($_SESSION['pending_external_grant']);
                    $grant = external_consume_grant($pendingGrant, $installer);
                    external_render_approved_customer($installer, $grant);
                }
                $profile = external_profile((string) $installer['email']);
                if ($profile['name'] === '' || $profile['phone'] === '') {
                    external_render_profile($installer);
                }
                external_render_customer_search($installer);
            } catch (Throwable $error) {
                external_render_code('installer', $error->getMessage());
            }
        }

        if ($action === 'logout_external') {
            external_logout_installer();
            portal_redirect();
        }

        if ($action === 'save_external_profile') {
            $installer = external_installer_user();
            if ($installer === null) {
                external_render_installer_login('יש להתחבר מחדש.');
            }
            try {
                external_save_profile(
                    (string) $installer['email'],
                    portal_post('profile_name', 120),
                    portal_post('profile_phone', 30)
                );
                external_render_customer_search($installer);
            } catch (Throwable $error) {
                external_render_profile($installer, $error->getMessage());
            }
        }

        if ($action === 'search_external_customer') {
            $installer = external_installer_user();
            if ($installer === null) {
                external_render_installer_login('יש להתחבר מחדש.');
            }
            try {
                $results = external_search_customers(portal_post('customer_search', 80));
                external_render_customer_search($installer, null, $results);
            } catch (Throwable $error) {
                external_render_customer_search($installer, $error->getMessage());
            }
        }

        if ($action === 'open_external_assignment') {
            $installer = external_installer_user();
            if ($installer === null) {
                external_render_installer_login('יש להתחבר מחדש.');
            }
            try {
                $grant = external_open_assignment($installer, portal_post('assignment_id', 30));
                external_render_approved_customer($installer, $grant);
            } catch (Throwable $error) {
                external_render_customer_search($installer, $error->getMessage());
            }
        }

        if ($action === 'request_external_access') {
            $installer = external_installer_user();
            if ($installer === null) {
                external_render_installer_login('יש להתחבר מחדש.');
            }
            try {
                $request = external_create_access_request(
                    $installer,
                    portal_post('board_id', 30),
                    portal_post('item_id', 30)
                );
                external_render_customer_search(
                    $installer,
                    'בקשת הגישה ל-' . (string) $request['customer_name'] . ' נשלחה לאישור.'
                );
            } catch (Throwable $error) {
                external_render_customer_search($installer, $error->getMessage());
            }
        }

        if ($action === 'request_approver_code') {
            $token = portal_post('approval_token', 80);
            try {
                $request = external_request_from_approval_token($token);
                $_SESSION['pending_external_approval_token'] = $token;
                external_request_otp(
                    portal_post('approver_email', 160),
                    'approver',
                    (string) $request['id']
                );
                external_render_code('approver');
            } catch (Throwable $error) {
                external_render_approval_login($token, $error->getMessage());
            }
        }

        if ($action === 'verify_approver_code') {
            $token = trim((string) ($_SESSION['pending_external_approval_token'] ?? ''));
            if ($token === '') {
                external_render_message('בקשת אישור', 'בקשת האישור אינה פעילה.', false);
            }
            try {
                $approver = external_verify_otp(portal_post('code', 20), 'approver');
                external_render_approval_decision($token, (string) $approver['email']);
            } catch (Throwable $error) {
                external_render_code('approver', $error->getMessage());
            }
        }

        if ($action === 'approve_external_access' || $action === 'deny_external_access') {
            $token = portal_post('approval_token', 80);
            $approver = $_SESSION['external_approver_user'] ?? null;
            if (!is_array($approver)) {
                external_render_approval_login($token, 'נדרש אימות של גורם מאשר.');
            }
            try {
                $request = external_request_from_approval_token($token);
                if (!hash_equals((string) ($approver['request_id'] ?? ''), (string) ($request['id'] ?? ''))) {
                    throw new RuntimeException('האימות אינו שייך לבקשת גישה זו.');
                }
                external_approve_request(
                    $token,
                    (string) ($approver['email'] ?? ''),
                    $action === 'approve_external_access'
                );
                unset($_SESSION['external_approver_user'], $_SESSION['pending_external_approval_token']);
                external_render_message(
                    'בקשת הגישה טופלה',
                    $action === 'approve_external_access'
                        ? 'הגישה אושרה. למתקין נשלח קישור מוגבל ללקוח שנבחר.'
                        : 'בקשת הגישה נדחתה והמתקין עודכן.'
                );
            } catch (Throwable $error) {
                external_render_approval_decision($token, (string) ($approver['email'] ?? ''), $error->getMessage());
            }
        }

        if ($action === 'request_reviewer_code') {
            try {
                external_request_otp(portal_post('reviewer_email', 160), 'approver', 'review');
                $_SESSION['pending_external_review'] = true;
                external_render_code('approver');
            } catch (Throwable $error) {
                external_render_reviewer_login($error->getMessage());
            }
        }

        if ($action === 'verify_reviewer_code') {
            try {
                $reviewer = external_verify_otp(portal_post('code', 20), 'approver');
                if (($reviewer['request_id'] ?? '') !== 'review') {
                    throw new RuntimeException('קוד הסקירה אינו תקין.');
                }
                unset($_SESSION['pending_external_review']);
                external_render_review_dashboard($reviewer);
            } catch (Throwable $error) {
                external_render_code('approver', $error->getMessage());
            }
        }

        if ($action === 'save_external_subtask') {
            $installer = external_installer_user();
            if ($installer === null) {
                external_render_installer_login('יש להתחבר מחדש.');
            }
            $grant = external_active_grant($installer);
            if ($grant === null) {
                external_render_customer_search($installer, 'אישור הגישה ללקוח פג. יש לבקש אישור חדש.');
            }
            try {
                external_update_subtask(
                    $installer,
                    $grant,
                    portal_post('subtask_key', 40),
                    portal_post('subtask_status', 40),
                    portal_post('actual_quantity', 80),
                    portal_post('subtask_notes', 1500),
                    external_post_string_array('line_actual', 80),
                    external_post_string_array('line_note', 500)
                );
                external_render_approved_customer($installer, $grant, 'ההתקדמות נשמרה.');
            } catch (Throwable $error) {
                external_render_approved_customer($installer, $grant, $error->getMessage());
            }
        }

        if ($action === 'submit_external_work_report') {
            $installer = external_installer_user();
            if ($installer === null) {
                external_render_installer_login('יש להתחבר מחדש.');
            }
            $grant = external_active_grant($installer);
            if ($grant === null) {
                external_render_customer_search($installer, 'אישור הגישה ללקוח פג. יש לבקש אישור חדש.');
            }
            try {
                $report = external_submit_work_report($installer, $grant);
                external_render_message(
                    'סיכום העבודה נשמר',
                    ($report['email_sent'] ?? false)
                        ? 'הדיווח נשמר ונשלח לגורמים הפנימיים.'
                        : 'הדיווח נשמר, אך חלק מהודעות הדוא"ל לא נמסרו. הדיווח נשמר לטיפול.'
                );
            } catch (Throwable $error) {
                external_render_approved_customer($installer, $grant, $error->getMessage());
            }
        }

        external_render_message('פעולה לא מוכרת', 'הפעולה המבוקשת אינה מוכרת.', false);
    }

    $reviewMode = trim((string) ($_GET['review'] ?? ''));
    if ($reviewMode === '1') {
        $reviewer = $_SESSION['external_approver_user'] ?? null;
        if (!is_array($reviewer) || !in_array((string) ($reviewer['email'] ?? ''), external_approver_emails(), true)) {
            external_render_reviewer_login();
        }
        $assignmentId = trim((string) ($_GET['assignment'] ?? ''));
        if ($assignmentId !== '') {
            external_render_assignment_preview($reviewer, $assignmentId);
        }
        external_render_review_dashboard($reviewer);
    }

    $approvalToken = trim((string) ($_GET['approval'] ?? ''));
    if ($approvalToken !== '') {
        if (!preg_match('/^[a-f0-9]{64}$/', $approvalToken)) {
            external_render_message('בקשת אישור', 'קישור האישור אינו תקין.', false);
        }
        $_SESSION['pending_external_approval_token'] = $approvalToken;
        $approver = $_SESSION['external_approver_user'] ?? null;
        if (is_array($approver)) {
            try {
                $request = external_request_from_approval_token($approvalToken);
                if (hash_equals((string) ($approver['request_id'] ?? ''), (string) ($request['id'] ?? ''))) {
                    external_render_approval_decision($approvalToken, (string) ($approver['email'] ?? ''));
                }
            } catch (Throwable $ignored) {
                unset($_SESSION['external_approver_user']);
            }
        }
        external_render_approval_login($approvalToken);
    }

    $grantToken = trim((string) ($_GET['grant'] ?? ''));
    if ($grantToken !== '') {
        if (!preg_match('/^[a-f0-9]{64}$/', $grantToken)) {
            external_render_message('גישה ללקוח', 'קישור הגישה אינו תקין.', false);
        }
        $installer = external_installer_user();
        if ($installer === null) {
            $_SESSION['pending_external_grant'] = $grantToken;
            external_render_installer_login();
        }
        try {
            $grant = external_consume_grant($grantToken, $installer);
            external_render_approved_customer($installer, $grant);
        } catch (Throwable $error) {
            external_render_customer_search($installer, $error->getMessage());
        }
    }

    $installer = external_installer_user();
    if ($installer === null) {
        external_render_installer_login();
    }

    $profile = external_profile((string) $installer['email']);
    if ($profile['name'] === '' || $profile['phone'] === '') {
        external_render_profile($installer);
    }

    $grant = external_active_grant($installer);
    if ($grant !== null) {
        external_render_approved_customer($installer, $grant);
    }

    external_render_customer_search($installer);
} catch (Throwable $error) {
    error_log('[i-feel external installer] ' . $error->getMessage());
    external_render_message('אזור מתקין חיצוני', 'אירעה שגיאה. לא בוצעה פתיחת גישה ללקוח.', false);
}
