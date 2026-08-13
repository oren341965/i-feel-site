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
require_once $repositoryRoot . '/public/staff-expenses/_vehicle_portal.php';
require_once $repositoryRoot . '/public/staff-expenses/_labels.php';
require_once $repositoryRoot . '/public/staff-expenses/_records.php';
require_once $repositoryRoot . '/public/staff-expenses/_notifications.php';
require_once $repositoryRoot . '/public/staff-expenses/_work_reports.php';
require_once $repositoryRoot . '/public/staff-expenses/_tenant_handovers.php';
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
    $savedEmployeeProfile = portal_save_employee_profile(
        ['email' => 'worker@i-feel.co.il'],
        'Updated Worker',
        '+972 54-777-8899'
    );
    portal_test_expect(
        ($savedEmployeeProfile['phone'] ?? '') === '054-777-8899'
        && ($savedEmployeeProfile['birth_day'] ?? 0) === 15
        && ($savedEmployeeProfile['birth_month'] ?? 0) === 7,
        'Permanent employee profile did not normalize the phone or preserve the birthday.'
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
    $vehicleDocument = portal_register_vehicle_document(
        '123-45-678',
        'third_party',
        '2027-05-31',
        'TEST-THIRD-PARTY',
        [
            'original_name' => 'third-party.pdf',
            'storage_name' => 'test-document.pdf',
            'mime' => 'application/pdf',
            'size' => 128,
            'sha256' => str_repeat('a', 64),
        ],
        'abcdefabcdefabcdefabcdef'
    );
    $vehicleAfterDocument = portal_vehicle_directory()['12345678'] ?? [];
    portal_test_expect(
        ($vehicleDocument['type_label'] ?? '') === 'ביטוח צד ג׳'
        && ($vehicleAfterDocument['third_party_insurance_due_date'] ?? '') === '2027-05-31'
        && ($vehicleAfterDocument['comprehensive_insurance_due_date'] ?? '') === '',
        'Third-party policy was not stored separately from comprehensive insurance.'
    );
    portal_test_expect(
        count(portal_vehicle_documents_for_user(['email' => 'worker@i-feel.co.il', 'role' => 'employee'], '12345678')) === 1
        && count(portal_vehicle_documents_for_user(['email' => 'oren@i-feel.co.il', 'role' => 'admin'], '12345678')) === 1
        && portal_vehicle_documents_for_user(['email' => 'other@i-feel.co.il', 'role' => 'employee'], '12345678') === [],
        'Vehicle document access control is incorrect.'
    );
    $minimalVehicleRows = implode("\n", [
        "דוא״ל עובד\tמספר רכב",
        "worker@i-feel.co.il\t876-54-321",
    ]);
    $minimalVehicleAssignment = portal_parse_vehicle_directory_text($minimalVehicleRows);
    portal_test_expect(
        count($minimalVehicleAssignment) === 1
        && ($minimalVehicleAssignment['87654321']['employee_email'] ?? '') === 'worker@i-feel.co.il',
        'Email and plate should be sufficient for an initial vehicle assignment.'
    );
    portal_test_expect(
        portal_installation_form_url() === 'https://www.superform.spot-nik.com/form/63cd90e88ff7b62b2d669d62',
        'Monday installation form URL is incorrect.'
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
    $sourceVehicleRows = implode("\n", [
        "שם\tאימייל\tרכב\tמספר רכב\tרישיון תקף\tתוקף רישיון\tמספר רישיון\tטסט תקף\tתוקף טסט\tביטוח חובה תקף\tתוקף ביטוח חובה\tביטוח מקיף תקף\tתוקף ביטוח מקיף\tחשבוניות הוגשו\tחודש חשבוניות\tסכום חשבוניות\tפירוט חשבוניות\tק\"מ נוכחי\tהערות\tעדכון אחרון\tחודש מילוי\tתזכורת נשלחה",
        "Test Worker\tworker@i-feel.co.il\tTest Car 2024\t123-45-678\tתקף\t15.08.2031\t1234567\tתקף\t26/05/27\tלא תקף\t30.06.26\tתקף\t20.6.27\tכן\t\t\t\t141174\tTest note\t13/07/2026\t7/2026\t",
    ]);
    portal_test_expect(portal_import_vehicle_directory($sourceVehicleRows) === 1, 'Google Sheet vehicle format was not imported.');
    $sourceVehicle = portal_vehicles_for_employee($directoryEmployee)[0] ?? [];
    portal_test_expect(
        ($sourceVehicle['license_due_date'] ?? '') === '2031-08-15'
        && ($sourceVehicle['test_due_date'] ?? '') === '2027-05-26'
        && ($sourceVehicle['compulsory_insurance_due_date'] ?? '') === '2026-06-30'
        && ($sourceVehicle['comprehensive_insurance_due_date'] ?? '') === '2027-06-20'
        && ($sourceVehicle['current_km'] ?? '') === '141174',
        'Google Sheet vehicle fields were not mapped correctly: ' . json_encode($sourceVehicle, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
    );
    $selfUpdatedVehicle = portal_save_employee_vehicle(
        ['email' => 'worker@i-feel.co.il'],
        [
            'existing_plate' => '12345678',
            'plate' => '123-45-678',
            'make_model' => 'Test Car Updated',
            'year' => '2025',
            'test_due_date' => '2028-05-26',
            'insurance_due_date' => '2028-06-30',
            'insurance_company' => 'Updated Insurance',
            'policy_number' => 'UPDATED-1',
            'notes' => 'Annual self-service update',
        ]
    );
    portal_test_expect(
        ($selfUpdatedVehicle['test_due_date'] ?? '') === '2028-05-26'
        && ($selfUpdatedVehicle['compulsory_insurance_due_date'] ?? '') === '2028-06-30'
        && ($selfUpdatedVehicle['employee_email'] ?? '') === 'worker@i-feel.co.il',
        'Employee annual vehicle update was not saved.'
    );
    $monthlyReminderEmails = [];
    $monthlyMailer = static function (string $recipient, string $subject, string $body, array $attachments) use (&$monthlyReminderEmails): bool {
        $monthlyReminderEmails[] = compact('recipient', 'subject', 'body', 'attachments');
        return true;
    };
    $monthlyReminder = portal_process_vehicle_monthly_reminders(
        new DateTimeImmutable('2026-07-02 08:00:00', new DateTimeZone('Asia/Jerusalem')),
        $monthlyMailer
    );
    portal_test_expect(
        ($monthlyReminder['sent'] ?? 0) === 1
        && ($monthlyReminderEmails[0]['recipient'] ?? '') === 'worker@i-feel.co.il',
        'Monthly vehicle reminder was not sent to the assigned employee.'
    );
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

    $magicLink = portal_create_magic_link('worker@i-feel.co.il');
    parse_str((string) parse_url((string) $magicLink['url'], PHP_URL_QUERY), $magicQuery);
    $magicToken = (string) ($magicQuery['login_token'] ?? '');
    portal_test_expect(
        strlen($magicToken) === 64 && str_starts_with((string) $magicLink['url'], 'http://localhost:8080/staff-expenses/'),
        'Magic-link URL was not generated safely.'
    );
    portal_test_expect(
        portal_consume_magic_link($magicToken) === 'worker@i-feel.co.il',
        'Valid magic link was not accepted.'
    );
    try {
        portal_consume_magic_link($magicToken);
        throw new RuntimeException('A magic link was accepted twice.');
    } catch (RuntimeException $error) {
        portal_test_expect($error->getMessage() !== 'A magic link was accepted twice.', $error->getMessage());
    }

    $expiredMagicLink = portal_create_magic_link('worker@i-feel.co.il');
    parse_str((string) parse_url((string) $expiredMagicLink['url'], PHP_URL_QUERY), $expiredMagicQuery);
    $expiredMagicToken = (string) ($expiredMagicQuery['login_token'] ?? '');
    portal_json_write((string) $expiredMagicLink['path'], [
        'email' => 'worker@i-feel.co.il',
        'created_at' => time() - 700,
        'expires_at' => time() - 1,
    ]);
    try {
        portal_consume_magic_link($expiredMagicToken);
        throw new RuntimeException('An expired magic link was accepted.');
    } catch (RuntimeException $error) {
        portal_test_expect($error->getMessage() !== 'An expired magic link was accepted.', $error->getMessage());
    }

    portal_create_remembered_login('worker@i-feel.co.il');
    $firstRememberToken = (string) ($_COOKIE[IFEEL_PORTAL_REMEMBER_COOKIE] ?? '');
    portal_test_expect(
        strlen($firstRememberToken) === 64 && is_file(portal_remember_file($firstRememberToken)),
        'Remembered-device credential was not stored.'
    );
    unset($_SESSION['portal_user']);
    $rememberedUser = portal_restore_remembered_login();
    $rotatedRememberToken = (string) ($_COOKIE[IFEEL_PORTAL_REMEMBER_COOKIE] ?? '');
    portal_test_expect(
        ($rememberedUser['email'] ?? '') === 'worker@i-feel.co.il'
        && $rotatedRememberToken !== $firstRememberToken
        && !is_file(portal_remember_file($firstRememberToken))
        && is_file(portal_remember_file($rotatedRememberToken)),
        'Remembered-device session was not restored and rotated.'
    );
    portal_logout();
    portal_test_expect(
        !isset($_COOKIE[IFEEL_PORTAL_REMEMBER_COOKIE])
        && !is_file(portal_remember_file($rotatedRememberToken)),
        'Logout did not revoke the remembered-device credential.'
    );
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

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
    portal_test_expect(
        portal_user_can_download_record($employee, $employeeRecords[0]),
        'Employee could not access an attachment from their own record.'
    );
    portal_test_expect(
        !portal_user_can_download_record($employee, portal_load_record($otherRecordId)),
        'Employee could access another employee record.'
    );
    portal_test_expect(
        portal_user_can_download_record(
            ['role' => 'admin', 'email' => 'oren@i-feel.co.il'],
            portal_load_record($otherRecordId)
        ),
        'Admin could not access an employee record.'
    );
    $employeeProfile = portal_employee_profile($employee);
    portal_test_expect(($employeeProfile['name'] ?? '') === 'Updated Worker', 'Permanent employee profile name did not take precedence.');
    portal_test_expect(($employeeProfile['phone'] ?? '') === '054-777-8899', 'Permanent employee profile phone did not take precedence.');

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
    portal_test_expect(
        portal_work_report_recipient() === 'myhome@i-feel.co.il',
        'Work report recipient is not MyHome.'
    );
    portal_test_expect(
        IFEEL_HANDOVER_BOARD_ID === '18399467324'
        && IFEEL_HANDOVER_SALES_BOARD_ID === '2732725332',
        'Tenant handovers are not mapped to the dedicated residents board and its linked sales board.'
    );
    $handoverResident = portal_handover_normalize_resident([
        'id' => '12345',
        'name' => 'Test Resident',
        'column_values' => [
            ['id' => 'lookup_mm0m2n3j', 'text' => ''],
            ['id' => 'text_mm0w7c0j', 'text' => '2'],
            ['id' => 'phone2', 'text' => '050-123-4567'],
            ['id' => 'email', 'text' => 'Resident@Example.com'],
            ['id' => 'status', 'text' => 'נא לבחור'],
        ],
        'linked_items' => [[
            'id' => '54321',
            'column_values' => [
                ['id' => 'numbers21', 'text' => '7'],
                ['id' => 'text8', 'text' => ''],
                ['id' => 'phone', 'text' => ''],
                ['id' => '_____3', 'text' => ''],
                ['id' => 'location7', 'text' => 'Test address'],
            ],
        ]],
    ], 'test-project', 'Test Project');
    portal_test_expect(
        $handoverResident !== null
        && ($handoverResident['email'] ?? '') === 'resident@example.com'
        && ($handoverResident['phone_digits'] ?? '') === '0501234567',
        'Dedicated Monday resident normalization failed.'
    );
    portal_test_expect(
        portal_handover_credentials($handoverResident)['password'] === '0501234567',
        'Tenant handover credentials were not derived from the resident phone.'
    );
    $lifecycleStatusSource = [
        'id' => '54321',
        'name' => 'Lifecycle Resident',
        'column_values' => [
            ['id' => 'lookup_mm0m2n3j', 'text' => '9'],
            ['id' => 'status', 'text' => 'התקנה הסתיימה'],
        ],
    ];
    portal_test_expect(
        portal_handover_normalize_resident($lifecycleStatusSource, 'test-project', 'Test Project') !== null,
        'A resident on the dedicated board was incorrectly filtered by lifecycle status.'
    );
    $mergedHandoverProjects = portal_handover_merge_project_groups([
        ['id' => 'project-a', 'title' => 'אביטל 13 מאנדיי.xlsx', 'archived' => false, 'deleted' => false],
        ['id' => 'project-b', 'title' => '  אביטל   13 ', 'archived' => false, 'deleted' => false],
        ['id' => 'project-c', 'title' => 'אביטל 13', 'archived' => true, 'deleted' => false],
        ['id' => 'topics', 'title' => 'דיירים - בהתקנה', 'archived' => false, 'deleted' => false],
    ]);
    $mergedHandoverProject = $mergedHandoverProjects['project-b'] ?? [];
    portal_test_expect(
        count($mergedHandoverProjects) === 1
        && ($mergedHandoverProject['title'] ?? '') === 'אביטל 13'
        && ($mergedHandoverProject['group_ids'] ?? []) === ['project-b'],
        'Non-project and import groups were not excluded from the dedicated board.'
    );
    portal_test_expect(
        portal_handover_search_term('  Search   Resident ') === 'Search Resident'
        && portal_handover_text_contains('Search Resident', 'resident'),
        'Tenant handover search terms were not normalized or matched case-insensitively.'
    );
    $handoverSearchProjects = portal_handover_search_projects([
        'search-project' => ['id' => 'search-project', 'title' => 'Search Project'],
        'other-project' => ['id' => 'other-project', 'title' => 'Other Project'],
    ], 'search');
    $handoverSearchResidents = portal_handover_search_resident_matches([
        '1003' => ['item_id' => '1003', 'project_id' => 'search-project', 'name' => 'Search Resident'],
        '1004' => ['item_id' => '1004', 'project_id' => 'search-project', 'name' => 'Other Resident'],
    ], 'Search Resident');
    portal_test_expect(
        array_keys($handoverSearchProjects) === ['search-project']
        && array_keys($handoverSearchResidents) === [1003],
        'Tenant handover project and resident filters failed.'
    );
    $handoverRecipients = portal_handover_internal_recipients(['email' => 'worker@i-feel.co.il']);
    portal_test_expect(
        in_array('sagiv@i-feel.co.il', $handoverRecipients, true)
        && in_array('support@i-feel.co.il', $handoverRecipients, true)
        && in_array('worker@i-feel.co.il', $handoverRecipients, true),
        'Tenant handover recipients are incomplete.'
    );
    portal_test_expect(
        portal_handover_controller_location('other', 'חדר שירות') === 'אחר: חדר שירות',
        'Custom controller location was not normalized.'
    );
    portal_test_expect(
        portal_handover_switch_9_label('shutter_2_light_2') === '2 תריסים ו-2 תאורות'
        && portal_handover_captive_shutter_24v_label('installed_activated') === 'יש והופעל'
        && portal_handover_captive_shutter_24v_label('not_in_project') === 'אין בפרויקט',
        'Structured handover switch labels are wrong.'
    );
    $workStats = portal_work_report_stats([
        ['type' => 'installation', 'outcome' => 'completed', 'employee' => ['name' => 'Test Worker', 'email' => 'worker@i-feel.co.il'], 'attachments' => [[], []]],
        ['type' => 'service', 'outcome' => 'follow_up', 'employee' => ['name' => 'Test Worker', 'email' => 'worker@i-feel.co.il'], 'attachments' => [[]]],
    ]);
    portal_test_expect(
        ($workStats['worker@i-feel.co.il']['total'] ?? 0) === 2
        && ($workStats['worker@i-feel.co.il']['installations'] ?? 0) === 1
        && ($workStats['worker@i-feel.co.il']['service'] ?? 0) === 1
        && ($workStats['worker@i-feel.co.il']['follow_up'] ?? 0) === 1
        && ($workStats['worker@i-feel.co.il']['attachments'] ?? 0) === 3,
        'Work report statistics are wrong.'
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
    $loginMailPayload = portal_mail_payload(
        'Open https://i-feel.co.il/staff-expenses/?login_token=test',
        [],
        '<p><a href="https://i-feel.co.il/staff-expenses/?login_token=test">Login</a></p>'
    );
    portal_test_expect(
        str_contains(implode("\n", $loginMailPayload['headers']), 'multipart/alternative')
        && str_contains($loginMailPayload['body'], 'Content-Type: text/html')
        && str_contains($loginMailPayload['body'], 'login_token=test'),
        'Magic-link email did not include HTML and plain-text alternatives.'
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

