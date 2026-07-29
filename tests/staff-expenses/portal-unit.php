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
        && ($sourceVehicle#T�2�BvV�&FVB6fVǒ�Т��Т�F�FW7E��V7B�Т�F�6�7V��v�5��沂F�v�5F����wv��W$��VV�6�����ufƖB�v�2Ɩ�v2�B66WFVB�Т��ТG'��Т�F�6�7V��v�5��沂F�v�5F�⓰ТF�&��r'V���W�6WF���t�v�2Ɩ�v266WFVBGv�6R���Т�6F6��'V���W�6WF��FW'&���Т�F�FW7E��V7B�FW'&��vWD�76vR���t�v�2Ɩ�v266WFVBGv�6R��FW'&��vWD�76vR����Т��ТFW��&VD�v�4Ɩ���F�7&VFU�v�5��沂wv��W$��VV�6�����Т'6U�G"��7G&���'6U�&�7G&���FW��&VD�v�4Ɩ浲wW&����$�TU%���FW��&VD�v�5VW'���ТFW��&VD�v�5F����7G&����FW��&VD�v�5VW'��v�v��F����rr��Т�F��6��&�FR��7G&���FW��&VD�v�4Ɩ浲wF�u��ТvV����wv��W$��VV�6�����v7&VFVE�Br�F�����s��vW��&W5�Br�F�������ғ�ТG'��Т�F�6�7V��v�5��沂FW��&VD�v�5F�⓰ТF�&��r'V���W�6WF���t�W��&VB�v�2Ɩ�v266WFVB���Т�6F6��'V���W�6WF��FW'&���Т�F�FW7E��V7B�FW'&��vWD�76vR���t�W��&VB�v�2Ɩ�v266WFVB��FW'&��vWD�76vR����Т��Т�F�7&VFU�V��W&VE����v��W$��VV�6�����ТFf�'7E&V��W%F����7G&����E����U��dTT��D�$T��U%����U��rr��Т�F�FW7E��V7B�Т7G&��f�'7E&V��W%F����cBbb�5�����F�&V��W%����Ff�'7E&V��W%F�⒒��u&V��W&VB�Wf�6R7&VFV���v2�B7F�VB�Т��ТV�WB�E�U54���w�F�W6W"uғ�ТG&V��W&VEW6W"��F�&W7F�U�V��W&VE���ₓ�ТG&�FVE&V��W%F����7G&����E����U��dTT��D�$T��U%����U��rr��Т�F�FW7E��V7B�Т�G&V��W&VEW6W%�vV�����rr���wv��W$��VV�6���ТbbG&�FVE&V��W%F���Ff�'7E&V��W%F���bb�5�����F�&V��W%����Ff�'7E&V��W%F�⒐Тbb�5�����F�&V��W%����G&�FVE&V��W%F�⒒��u&V��W&VB�Wf�6R6W76��v2�B&W7F�VB�&�FVB�Т��Т�F��v�B���Т�F�FW7E��V7B�Т�76WB�E����U��dTT��D�$T��U%����UҐТbb�5�����F�&V��W%����G&�FVE&V��W%F�⒒��t�v�BF�B�B&Wf�F�R&V��W&VB�Wf�6R7&VFV���pТ��Т�b�6W76���FGW2�����U54���5D�dR��Т6W76���F'B���Т��ТF��v��R�s#3CSbs�ТE�U54���w�F�V���6��V�Ru���ТvV����wv��W$��VV�6�����v6�U�6�r�77v�E�6��F��v��R�55t�E�TdT����v7&VFVE�Br�F������w6V��Br�F������vW��&W5�Br�F�����c��vGFV�G2r���ӰТf��FGFV�B��FGFV�B��dTT��D�T���4�U���EDT�E3�FGFV�B����ТG'��Т�F�fW&�g�����6�R�sr��ТF�&��r'V���W�6WF���uw&�rV���6�Rv266WFVB���Т�6F6��'V���W�6WF��FW'&���Т�F�FW7E��V7B�FW'&��vWD�76vR���uw&�rV���6�Rv266WFVB��FW'&��vWD�76vR����Т�����F�FW7E��V7B��F�V���6��V�R�������t6��V�R7W'f�fVBf�fRw&�rGFV�G2���Т�F�6�%����f��&W2���РТE�U54���w�F�V���6��V�Ru���ТvV����wv��W$��VV�6�����v6�U�6�r�77v�E�6��F��v��R�55t�E�TdT����v7&VFVE�Br�F������w6V��Br�F������vW��&W5�Br�F�����c��vGFV�G2r���ӰТFV���VR��F�fW&�g�����6�R�F��v��R��Т�F�FW7E��V7B��FV���VU�w&�Ru��rr���vV���VRr�tV���VR&�Rv2�B76�v�B���Т�F�FW7E��V7B��FV���VU�vV�����rr���wv��W$��VV�6����ufW&�f�VBV���v2�B&�����РТF��V6�D�B��F��u�V6�E����Т�F�V�W&U��&V7F����F�&V6�E��"�F��V6�D�B���Т�F�6fU�V6�B��Тv�Br�F��V6�D�B��vV���VRr��v��r�uv��W"��r�vV����wv��W$��VV�6����w��Rr�sS�u�Тv7&VFVE�Br�s##b�r�EC���r��ғ�ТF��W%&V6�D�B��F��u�V6�E����Т�F�V�W&U��&V7F����F�&V6�E��"�F��W%&V6�D�B���Т�F�6fU�V6�B��Тv�Br�F��W%&V6�D�B��vV���VRr��v��r�t��W"v��W"r�vV����v��W$��VV�6����w��Rr�sS�u�Тv7&VFVE�Br�s##b�r�EC����r��ғ�ТFV���VU&V6�G2��F�&V6�G5������VR�FV���VR��Т�F�FW7E��V7B�6���FV���VU&V6�G2����tV���VR��7F��W��VB�F�W"V���VR&V6�B���Т�F�FW7E��V7B��FV���VU&V6�G5�ղv�Bu��rr���F��V6�D�B�tV���VR��7F����GFVBF�RV���VR&V6�B���Т�F�FW7E��V7B�Т�F�W6W%��F���E�V6�B�FV���VR�FV���VU&V6�G5�Ғ��tV���VR6���B66W72�GF6���g&�F�V�"��&V6�B�Т��Т�F�FW7E��V7B�Т�F�W6W%��F���E�V6�B�FV���VR��F��E�V6�B�F��W%&V6�D�B����tV���VR6��66W72�F�W"V���VR&V6�B�Т��Т�F�FW7E��V7B�Т�F�W6W%��F���E�V6�B�Т�w&�Rr�vF֖��vV����v�V���VV�6����Т�F��E�V6�B�F��W%&V6�D�B�Т���tF֖�6���B66W72�V���VR&V6�B�Т��ТFV���VU&�����F�V���VU�&����FV���VR��Т�F�FW7E��V7B��FV���VU&����v��u��rr���uWFFVBv��W"r�uW&���V���VR&�����F�B�BF�R&V6VFV�R���Т�F�FW7E��V7B��FV���VU&����w��Ru��rr���sSB�srӃ���r�uW&���V���VR&�����RF�B�BF�R&V6VFV�R���РТV�WB�E�U54���w�F�W6W"uғ�ТE�U54���w�F�V���6��V�Ru���ТvV����v�V���VV�6�����v6�U�6�r�77v�E�6��F��v��R�55t�E�TdT����v7&VFVE�Br�F������w6V��Br�F������vW��&W5�Br�F�����c��vGFV�G2r���ӰТFF֖���F�fW&�g�����6�R�F��v��R��Т�F�FW7E��V7B��FF֖�&�Ru��rr���vF֖��tF֖�&�Rv2�B76�v�B���РТ�F�&V6�E����6V��GFV�B�wv��W$��VV�6�����Т�F�FW7E��V7B�Т�F�V���6V��WG'��gFW"�wv��W$��VV�6�������t7&�2�W76��V���&W6V�F�&�FƖ�f��B�Т��РТ�F�FW7E��V7B��F�77e��R�s��"r���"s��""�t55bf���v2�B�WG&Ɨ�VB���Т�F�FW7E��V7B��F�77e��R�r5T҄�r���"r5T҄�"�t55bf���v�F�v��FW76Rv2�B�WG&Ɨ�VB���Т�F�FW7E��V7B��F�77e��R�v�F��'�FW�Br���v�F��'�FW�Br�u6fR55bFW�Bv2�F�f�VB���ТF�F�f�6F��&V6��V�2��F�W�V�U���f�6F���V6��V�2���Т�F�FW7E��V7B�Т��'&��v66����VV�6����F�F�f�6F��&V6��V�2�G'VR�Тbb��'&��v�V���VV�6����F�F�f�6F��&V6��V�2�G'VR���tW�V�R�F�f�6F��&V6��V�2&R����FR�Т��Т�F�FW7E��V7B�Т�F�v���W�E�V6��V�����vז��T��VV�6�����uv��&W�B&V6��V��2�Bה��R�Т��ТGv��7FG2��F�v���W�E�FG2��Т�wG�Rr�v��F�F��r�v�F6�Rr�v6��FVBr�vV���VRr��v��r�uFW7Bv��W"r�vV����wv��W$��VV�6����vGF6���2r�������Т�wG�Rr�w6W'f�6Rr�v�F6�Rr�vf��u�r�vV���VRr��v��r�uFW7Bv��W"r�vV����wv��W$��VV�6����vGF6���2r�����Тғ�Т�F�FW7E��V7B�Т�Gv��7FG5�wv��W$��VV�6���ղwF������� Тbb�Gv��7FG5�wv��W$��VV�6���ղv��F�F��2u�����Тbb�Gv��7FG5�wv��W$��VV�6���ղw6W'f�6Ru�����Тbb�Gv��7FG5�wv��W$��VV�6���ղvf��u�u�����Тbb�Gv��7FG5�wv��W$��VV�6���ղvGF6���2u�����2��uv��&W�B7FF�7F�72&Rw&�r�Т��ТF֖���B��F������B�u&V6V�BGF6�VBr���ТwF�r�G&W��F��&�B�r�W7G2�Ffb��V�W2���GW&W2�V6V�B�Fbr��v��r�w&V6V�B�Fbr��v֖�r�vƖ6F���Fbr��w6��Rr������Т�F�FW7E��V7B�Т7G%��F������FR�%�"�F֖���E�v�VFW'2uҒ�v���'B���VBr�Тbb7G%��F���F֖���E�v&��u�t6�FV���S�Ɩ6F���Fbr�Тbb7G%��F���F֖���E�v&��u�vf�����&V6V�B�Fb"r���uDbGF6���Ԕ���Bv2�BvV�&FVB�Т��ТF�v������B��F������B�Тt�V��GG3����VV�6���7Ffb��V�W2��v��F��FW7Br����Тs���&Vc��GG3����VV�6���7Ffb��V�W2��v��F��FW7B#��������Т��Т�F�FW7E��V7B�Т7G%��F������FR�%�"�F�v������E�v�VFW'2uҒ�v���'B��W&�F�fRr�Тbb7G%��F���F�v������E�v&��u�t6�FV���S�FW�B��r�Тbb7G%��F���F�v������E�v&��u�v�v��F��FW7Br���t�v�2���V���F�B�B���FR�D�����FW�B�W&�F�fW2�Т��Т�F�FW7E��V7B�Т6����F�GF6����F6�W2��Т�w6��Rr�"�#B�#E�Т�w6��Rr�"�#B�#E�ТҒ���"��t�&vRV���GF6���2vW&R�B7ƗB���6fR&F6�W2�Т��РТG&VF��72��F�&VF��75�W�B���Т�F�FW7E��V7B�Т�&��G&VF��75�w&VG�u��f�R���u&VF��72f��C�r����FR�r��G&VF��75�vf��Bu���ҐТ��РТ�F�&V�fU�&VR�G7F�vUF���Тgw&�FR�5DD�B�%7FfbW�V�W2V�6�V6�276VB����Ч�6F6��F�&�&�FW'&���Т�F�&V�fU�&VR�G7F�vUF���Тgw&�FR�5DDU%"�%7FfbW�V�W2V�6�V6�2f��C�"�FW'&��vWD�76vR���%�"��ТW��B���Ч���
