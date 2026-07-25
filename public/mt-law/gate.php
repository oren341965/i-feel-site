<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_gate_data.php';
require_once __DIR__ . '/_gate_view.php';

$view = trim((string) ($_GET['view'] ?? ''));
if ($view === 'mailing-csv') {
    $period = trim((string) ($_GET['period'] ?? 'month')) === 'all' ? 'all' : 'month';
    mtlaw_gate_stream_mailing_csv($period);
}

$error = '';
$user = mtlaw_current_user();
if ($user === null && (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST')) {
    try {
        mtlaw_verify_csrf();
        $action = mtlaw_post('action', 40);
        if ($action === 'request_code') {
            $email = strtolower(mtlaw_post('email', 180));
            if (!mtlaw_allowed_email($email)) {
                throw new InvalidArgumentException('הכניסה פתוחה רק לכתובות דואר של I Feel או של mt-law.co.il.');
            }

            $marketingOptIn = mtlaw_post('marketing_opt_in', 10) === 'yes';
            if (!$marketingOptIn) {
                throw new InvalidArgumentException('כדי לקבל קוד כניסה יש לאשר קבלת עדכונים והטבות מ-I Feel. ניתן לבטל את ההרשמה בכל עת.');
            }

            if (!mtlaw_send_code($email)) {
                throw new RuntimeException('לא ניתן לשלוח קוד כרגע. יש להמתין דקה ולנסות שוב.');
            }
            $_SESSION['mtlaw_gate_marketing_opt_in'] = true;
            mtlaw_redirect(['access' => 'code-sent']);
        }
        if ($action === 'verify_code') {
            $email = strtolower((string) ($_SESSION['mtlaw_otp_email'] ?? ''));
            $code = mtlaw_post('code', 20);
            if (!mtlaw_verify_code($email, $code)) {
                throw new InvalidArgumentException('הקוד שגוי או שפג תוקפו.');
            }
            mtlaw_redirect(['access' => 'verified']);
        }
        throw new InvalidArgumentException('הפעולה המבוקשת אינה זמינה לפני הכניסה.');
    } catch (Throwable $exception) {
        $error = $exception->getMessage();
    }
}

$user = mtlaw_current_user();
if ($user === null) {
    $csrf = mtlaw_csrf_token();
    $accessStatus = trim((string) ($_GET['access'] ?? ''));
    $pendingEmail = strtolower((string) ($_SESSION['mtlaw_otp_email'] ?? ''));
    mtlaw_gate_render_login($error, $accessStatus, $pendingEmail, $csrf);
}

mtlaw_gate_record_verified_access($user);
mtlaw_gate_capture_lead_profile($user);
$csrf = mtlaw_csrf_token();
ob_start(static function (string $html) use ($user, $csrf): string {
    return mtlaw_gate_enhance_verified_output($html, $user, $csrf);
});
require __DIR__ . '/index.php';
ob_end_flush();