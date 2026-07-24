<?php
declare(strict_types=1);

function portal_test_expect(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$repositoryRoot = dirname(__DIR__, 2);
$storagePath = trim((string) getenv('PORTAL_TEST_STORAGE'));
if ($storagePath === '') {
    $storagePath = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'ifeel-portal-unit-' . bin2hex(random_bytes(6));
}

define('EXPENSE_PORTAL_STORAGE_PATH', $storagePath);
define('EXPENSE_PORTAL_MAIL_TRANSPORT', 'mail');

$_SERVER['HTTP_HOST'] = 'localhost:8080';
$_SERVER['DOCUMENT_ROOT'] = $repositoryRoot . DIRECTORY_SEPARATOR . 'public';
$_SERVER['REQUEST_URI'] = '/staff-expenses/';
$_SERVER['SCRIPT_NAME'] = '/staff-expenses/index.php';
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';

require_once $repositoryRoot . '/public/staff-expenses/_bootstrap.php';
require_once $repositoryRoot . '/public/staff-expenses/_ui.php';
require_once $repositoryRoot . '/public/staff-expenses/_email_auth.php';
require_once $repositoryRoot . '/public/staff-expenses/_employees.php';
require_once $repositoryRoot . '/public/staff-expenses/_vehicles.php';
require_once $repositoryRoot . '/public/staff-expenses/_labels.php';
require_once $repositoryRoot . '/public/staff-expenses/_records.php';
require_once $repositoryRoot . '/public/staff-expenses/_notifications.php';
require_once $repositoryRoot . '/public/staff-expenses/_history.php';
require_once $repositoryRoot . '/public/staff-expenses/_readiness.php';

try {
    portal_test_expect(
        portal_normalize_company_email('Worker@I-FEEL.CO.IL') === 'worker@i-feel.co.il',
        'Company email normalization failed.'
    );
    portal_test_expect(
        portal_normalize_company_email('worker@gmail.com') === null,
        'External email was accepted.'
    );
    portal_test_expect(
        portal_normalize_company_email('worker@sub.i-feel.co.il') === null,
        'Subdomain email was accepted.'
    );
    portal_test_expect(
        in_array('oren@i-feel.co.il', portal_email_admins(), true),
        'Default admin email is missing.'
    );
    portal_test_expect(
        portal_normalize_israeli_mobile('+972 54-565-1060') === '054-565-1060',
        'International Israeli mobile normalization failed.'
    );
    portal_test_expect(
        portal_normalize_israeli_mobile('542292103') === '054-229-2103',
        'Nine digit Israeli mobile normalization failed.'
    );
    portal_test_expect(
        portal_normalize_israeli_mobile('03-508-9553') === null,
        'A landline was accepted as an employee mobile.'
    );

    $directoryRows = implode("\n", [
        "שם מלא\tדואר אלקטרוני\tטלפון\tיום לידה\tחודש לידה",
        "Test Worker\tworker@i-feel.co.il\t+972 54-111-2233\t15\t7",
        "No Birthday\tother@i-feel.co.il\t0523334455\t\t",
    ]);
    portal_test_expect(portal_import_employee_directory($directoryRows) === 2, 'Employee directory import count is wrong.');
    $directoryEmployee = ['email' => 'worker@i-feel.co.il', 'display_name' => 'worker@i-feel.co.il'];
    portal_test_expect(
        portal_employee_directory_entry($directoryEmployee)['phone'] === '054-111-2233',
        'Employee phone was not loaded from private directory.'
    );
    portal_test_expect(
        portal_employee_has_birthday_this_month($directoryEmployee, 7),
        'Birthday month was not detected.'
    );
    portal_test_expect(
        !portal_employee_has_birthday_this_month($directoryEmployee, 8),
        'Birthday banner would display in the wrong month.'
    );
    $giftYear = (int) date('Y');
    portal_test_expect(
        portal_normalize_vehicle_plate('123-45-678') === '12345678'
        && portal_format_vehicle_plate('12345678') === '123-45-678',
        'Vehicle plate normalization failed.'
    );
    $vehicleRows = implode("\n", [
        "דוא״ל עובד\tמספר רכב\tיצרן ודגם\tשנתון\tתוקף טסט\tתוקף ביטוח\tחברת ביטוח\tמספר פוליסה\tהערות",
        "worker@i-feel.co.il\t123-45-678\tTest Car\t2024\t13/08/{$giftYear}\t{$giftYear}-08-13\tTest Insurance\tPOLICY-1\tTest only",
    ]);
    portal_test_expect(portal_import_vehicle_directory($vehicleRows) === 1, 'Vehicle directory import count is wrong.');
    $employeeVehicles = portal_vehicles_for_employee($directoryEmployee);
    portal_test_expect(
        count($employeeVehicles) === 1
        && ($employeeVehicles[0]['plate'] ?? '') === '12345678',
        'Employee vehicle assignment failed.'
    );
    portal_test_expect(
        portal_vehicles_for_employee(['email' => 'other@i-feel.co.il']) === [],
        'Employee vehicle lookup exposed another employee vehicle.'
    );
    $sentVehicleEmails = [];
    $vehicleMailer = static function (
        string $recipient,
        string $subject,
        string $body,
        array $attachments
    ) use (&$sentVehicleEmails): bool {
        $sentVehicleEmails[] = compact('recipient', 'subject', 'body', 'attachments');
        return true;
    };
    $vehicleReminder = portal_process_vehicle_notifications(
        new DateTimeImmutable($giftYear . '-07-14 08:00:00', new DateTimeZone('Asia/Jerusalem')),
        $vehicleMailer
    );
    portal_test_expect(
        ($vehicleReminder['reminders_sent'] ?? 0) === 2
        && ($vehicleReminder['emails_sent'] ?? 0) === 4
        && ($sentVehicleEmails[0]['recipient'] ?? '') === 'worker@i-feel.co.il'
        && ($sentVehicleEmails[1]['recipient'] ?? '') === 'oren@i-feel.co.il',
        'Vehicle reminders were not sent to the employee and Oren.'
    );
    portal_process_vehicle_notifications(
        new DateTimeImmutable($giftYear . '-07-14 10:00:00', new DateTimeZone('Asia/Jerusalem')),
        $vehicleMailer
    );
    portal_test_expect(count($sentVehicleEmails) === 4, 'Vehicle reminders were sent more than once.');
    portal_save_birthday_gift(
        'worker@i-feel.co.il',
        $giftYear,
        'Test Gift',
        'A personal birthday message',
        'TEST-COUPON',
        'https://example.com/redeem',
        []
    );
    $savedGift = portal_birthday_gift('worker@i-feel.co.il', $giftYear);
    portal_test_expect(
        ($savedGift['coupon_code'] ?? '') === 'TEST-COUPON',
        'Birthday gift coupon was not stored.'
    );
    $sentBirthdayEmails = [];
    $testBirthdayMailer = static function (
        string $recipient,
        string $subject,
        string $body,
        array $attachments
    ) use (&$sentBirthdayEmails): bool {
        $sentBirthdayEmails[] = compact('recipient', 'subject', 'body', 'attachments');
        return true;
    };
    $reminderResult = portal_process_birthday_notifications(
        new DateTimeImmutable($giftYear . '-07-14 08:00:00', new DateTimeZone('Asia/Jerusalem')),
        $testBirthdayMailer
    );
    portal_test_expect(
        ($reminderResult['reminders_sent'] ?? 0) === 1
        && ($sentBirthdayEmails[0]['recipient'] ?? '') === 'oren@i-feel.co.il'
        && str_contains((string) ($sentBirthdayEmails[0]['body'] ?? ''), 'TEST-COUPON'),
        'The day-before birthday reminder was not sent to Oren.'
    );
    portal_process_birthday_notifications(
        new DateTimeImmutable($giftYear . '-07-14 10:00:00', new DateTimeZone('Asia/Jerusalem')),
        $testBirthdayMailer
    );
    portal_test_expect(count($sentBirthdayEmails) === 1, 'Birthday reminder was sent more than once.');
    $greetingResult = portal_process_birthday_notifications(
        new DateTimeImmutable($giftYear . '-07-15 08:00:00', new DateTimeZone('Asia/Jerusalem')),
        $testBirthdayMailer
    );
    portal_test_expect(
        ($greetingResult['greetings_sent'] ?? 0) === 1
        && ($sentBirthdayEmails[1]['recipient'] ?? '') === 'worker@i-feel.co.il'
        && str_contains((string) ($sentBirthdayEmails[1]['body'] ?? ''), 'TEST-COUPON'),
        'Birthday greeting and gift were not sent to the employee.'
    );

    portal_test_expect(portal_ini_bytes('12M') === 12 * 1024 * 1024, '12M parsing failed.');
    portal_test_expect(portal_ini_bytes('1G') === 1024 * 1024 * 1024, '1G parsing failed.');
    portal_test_expect(
        !portal_path_is_within($storagePath, $_SERVER['DOCUMENT_ROOT']),
        'Test storage unexpectedly resolves inside the public document root.'
    );

    $knownCode = '123456';
    $_SESSION['portal_email_challenge'] = [
        'email' => 'worker@i-feel.co.il',
        'code_hash' => password_hash($knownCode, PASSWORD_DEFAULT),
        'created_at' => time(),
        'sent_at' => time(),
        'expires_at' => time() + 600,
        'attempts' => 0,
    ];
    for ($attempt = 1; $attempt <= IFEEL_PORTAL_EMAIL_CODE_MAX_ATTEMPTS; $attempt++) {
        try {
            portal_verify_email_code('000000');
            throw new RuntimeException('Wrong email code was accepted.');
        } catch (RuntimeException $error) {
            portal_test_expect($error->getMessage() !== 'Wrong email code was accepted.', $error->getMessage());
        }
    }
    portal_test_expect(portal_email_challenge() === null, 'Challenge survived five wrong attempts.');
    portal_clear_login_failures();

    $_SESSION['portal_email_challenge'] = [
        'email' => 'worker@i-feel.co.il',
        'code_hash' => password_hash($knownCode, PASSWORD_DEFAULT),
        'created_at' => time(),
        'sent_at' => time(),
        'expires_at' => time() + 600,
        'attempts' => 0,
    ];
    $employee = portal_verify_email_code($knownCode);
    portal_test_expect(($employee['role'] ?? '') === 'employee', 'Employee role was not assigned.');
    portal_test_expect(($employee['email'] ?? '') === 'worker@i-feel.co.il', 'Verified email was not bound.');

    $ownRecordId = portal_new_record_id();
    portal_ensure_directory(portal_record_dir($ownRecordId));
    portal_save_record([
        'id' => $ownRecordId,
        'employee' => ['name' => 'Worker Name', 'email' => 'worker@i-feel.co.il', 'phone' => '050-0000000'],
        'created_at' => '2026-07-24T10:00:00Z',
    ]);
    $otherRecordId = portal_new_record_id();
    portal_ensure_directory(portal_record_dir($otherRecordId));
    portal_save_record([
        'id' => $otherRecordId,
        'employee' => ['name' => 'Other Worker', 'email' => 'other@i-feel.co.il', 'phone' => '050-1111111'],
        'created_at' => '2026-07-24T09:00:00Z',
    ]);
    $employeeRecords = portal_records_for_employee($employee);
    portal_test_expect(count($employeeRecords) === 1, 'Employee history exposed another employee record.');
    portal_test_expect(($employeeRecords[0]['id'] ?? '') === $ownRecordId, 'Employee history omitted the employee record.');
    $employeeProfile = portal_employee_profile($employee);
    portal_test_expect(($employeeProfile['name'] ?? '') === 'Test Worker', 'Employee directory name did not take precedence.');
    portal_test_expect(($employeeProfile['phone'] ?? '') === '054-111-2233', 'Employee directory phone did not take precedence.');

    unset($_SESSION['portal_user']);
    $_SESSION['portal_email_challenge'] = [
        'email' => 'oren@i-feel.co.il',
        'code_hash' => password_hash($knownCode, PASSWORD_DEFAULT),
        'created_at' => time(),
        'sent_at' => time(),
        'expires_at' => time() + 600,
        'attempts' => 0,
    ];
    $admin = portal_verify_email_code($knownCode);
    portal_test_expect(($admin['role'] ?? '') === 'admin', 'Admin role was not assigned.');

    portal_record_email_send_attempt('worker@i-feel.co.il');
    portal_test_expect(
        portal_email_send_retry_after('worker@i-feel.co.il') > 0,
        'Cross-session email resend throttling failed.'
    );

    portal_test_expect(portal_csv_value('=2+2') === "'=2+2", 'CSV formula was not neutralized.');
    portal_test_expect(portal_csv_value('  @SUM(A1)') === "'  @SUM(A1)", 'CSV formula with whitespace was not neutralized.');
    portal_test_expect(portal_csv_value('ordinary text') === 'ordinary text', 'Safe CSV text was modified.');
    $notificationRecipients = portal_expense_notification_recipients();
    portal_test_expect(
        in_array('account@i-feel.co.il', $notificationRecipients, true)
        && in_array('oren@i-feel.co.il', $notificationRecipients, true),
        'Expense notification recipients are incomplete.'
    );
    $mimePayload = portal_mail_payload('Receipt attached', [[
        'path' => $repositoryRoot . '/tests/staff-expenses/fixtures/receipt.pdf',
        'name' => 'receipt.pdf',
        'mime' => 'application/pdf',
        'size' => 100,
    ]]);
    portal_test_expect(
        str_contains(implode("\n", $mimePayload['headers']), 'multipart/mixed')
        && str_contains($mimePayload['body'], 'Content-Type: application/pdf')
        && str_contains($mimePayload['body'], 'filename="receipt.pdf"'),
        'PDF attachment MIME payload was not generated.'
    );
    portal_test_expect(
        count(portal_attachment_batches([
            ['size' => 12 * 1024 * 1024],
            ['size' => 12 * 1024 * 1024],
        ])) === 2,
        'Large email attachments were not split into safe batches.'
    );

    $readiness = portal_readiness_report();
    portal_test_expect(
        (bool) ($readiness['ready'] ?? false),
        'Readiness failed: ' . implode(',', $readiness['failed'] ?? [])
    );

    portal_remove_tree($storagePath);
    fwrite(STDOUT, "Staff expenses unit checks passed.\n");
} catch (Throwable $error) {
    portal_remove_tree($storagePath);
    fwrite(STDERR, "Staff expenses unit checks failed: " . $error->getMessage() . "\n");
    exit(1);
}

