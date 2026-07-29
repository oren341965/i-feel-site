<?php
declare(strict_types=1);

function portal_vehicle_directory_file(): string
{
    return portal_storage_root() . DIRECTORY_SEPARATOR . 'security' . DIRECTORY_SEPARATOR . 'vehicles.json';
}

function portal_normalize_vehicle_plate(string $input): ?string
{
    $digits = preg_replace('/\D+/', '', trim($input)) ?? '';
    return preg_match('/^\d{7,8}$/', $digits) ? $digits : null;
}

function portal_format_vehicle_plate(string $plate): string
{
    $plate = portal_normalize_vehicle_plate($plate) ?? '';
    if (strlen($plate) === 8) {
        return substr($plate, 0, 3) . '-' . substr($plate, 3, 2) . '-' . substr($plate, 5, 3);
    }
    if (strlen($plate) === 7) {
        return substr($plate, 0, 2) . '-' . substr($plate, 2, 3) . '-' . substr($plate, 5, 2);
    }
    return $plate;
}

function portal_normalize_vehicle_date(string $value, int $row): string
{
    $value = trim($value);
    if ($value === '') {
        return '';
    }
    if (preg_match('/^(\d{1,2})([\/.])(\d{1,2})\2(\d{2})$/', $value, $shortYear)) {
        $value = $shortYear[1] . $shortYear[2] . $shortYear[3] . $shortYear[2] . '20' . $shortYear[4];
    }

    foreach (['Y-m-d', 'd/m/Y', 'd.m.Y'] as $format) {
        $date = DateTimeImmutable::createFromFormat('!' . $format, $value, new DateTimeZone('Asia/Jerusalem'));
        $errors = DateTimeImmutable::getLastErrors();
        if ($date !== false && ($errors === false || ((int) $errors['warning_count'] === 0 && (int) $errors['error_count'] === 0))) {
            return $date->format('Y-m-d');
        }
    }
    throw new RuntimeException('שורה ' . $row . ': תאריך הטסט או הביטוח אינו תקין. יש להשתמש בפורמט DD/MM/YYYY או YYYY-MM-DD.');
}

function portal_vehicle_source_date(string $value): string
{
    try {
        return portal_normalize_vehicle_date($value, 0);
    } catch (Throwable $error) {
        return '';
    }
}

function portal_vehicle_directory(): array
{
    $stored = portal_json_read(portal_vehicle_directory_file());
    $vehicles = [];
    foreach ($stored as $key => $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $plate = portal_normalize_vehicle_plate((string) ($entry['plate'] ?? $key));
        $email = portal_normalize_company_email((string) ($entry['employee_email'] ?? ''));
        if ($plate === null || $email === null) {
            continue;
        }
        $vehicles[$plate] = [
            'plate' => $plate,
            'employee_email' => $email,
            'make_model' => trim((string) ($entry['make_model'] ?? '')),
            'year' => (int) ($entry['year'] ?? 0),
            'license_due_date' => trim((string) ($entry['license_due_date'] ?? '')),
            'license_due_label' => trim((string) ($entry['license_due_label'] ?? '')),
            'license_status' => trim((string) ($entry['license_status'] ?? '')),
            'test_due_date' => trim((string) ($entry['test_due_date'] ?? '')),
            'test_due_label' => trim((string) ($entry['test_due_label'] ?? '')),
            'test_status' => trim((string) ($entry['test_status'] ?? '')),
            'insurance_due_date' => trim((string) ($entry['insurance_due_date'] ?? '')),
            'compulsory_insurance_due_date' => trim((string) ($entry['compulsory_insurance_due_date'] ?? $entry['insurance_due_date'] ?? '')),
            'compulsory_insurance_due_label' => trim((string) ($entry['compulsory_insurance_due_label'] ?? '')),
            'compulsory_insurance_status' => trim((string) ($entry['compulsory_insurance_status'] ?? '')),
            'comprehensive_insurance_due_date' => trim((string) ($entry['comprehensive_insurance_due_date'] ?? '')),
            'comprehensive_insurance_due_label' => trim((string) ($entry['comprehensive_insurance_due_label'] ?? '')),
            'comprehensive_insurance_status' => trim((string) ($entry['comprehensive_insurance_status'] ?? '')),
            'third_party_insurance_due_date' => trim((string) ($entry['third_party_insurance_due_date'] ?? '')),
            'insurance_company' => trim((string) ($entry['insurance_company'] ?? '')),
            'policy_number' => trim((string) ($entry['policy_number'] ?? '')),
            'current_km' => trim((string) ($entry['current_km'] ?? '')),
            'last_update' => trim((string) ($entry['last_update'] ?? '')),
            'notes' => trim((string) ($entry['notes'] ?? '')),
            'updated_at' => (string) ($entry['updated_at'] ?? ''),
        ];
    }
    ksort($vehicles);
    return $vehicles;
}

function portal_parse_vehicle_directory_text(string $text): array
{
    $text = trim(str_replace("\xEF\xBB\xBF", '', $text));
    if ($text === '') {
        throw new RuntimeException('יש להדביק לפחות שורת רכב אחת.');
    }

    $employees = portal_employee_directory();
    $entries = [];
    $lines = preg_split('/\R/u', $text) ?: [];
    $sourceFormat = false;
    foreach ($lines as $lineNumber => $line) {
        if (trim($line) === '') {
            continue;
        }
        $delimiter = str_contains($line, "\t") ? "\t" : ',';
        $columns = array_map('trim', str_getcsv($line, $delimiter, '"', ''));
        $first = portal_lower((string) ($columns[0] ?? ''));
        $second = portal_lower((string) ($columns[1] ?? ''));
        if ($lineNumber === 0 && trim($first) === 'שם' && trim($second) === 'אימייל') {
            $sourceFormat = true;
            continue;
        }
        if ($lineNumber === 0 && (
            str_contains($first, 'email')
            || str_contains($first, 'דוא')
            || str_contains($first, 'מייל')
            || str_contains($second, 'plate')
            || str_contains($second, 'מספר רכב')
        )) {
            continue;
        }

        $row = $lineNumber + 1;
        if ($sourceFormat) {
            $email = portal_normalize_company_email((string) ($columns[1] ?? ''));
            $plate = portal_normalize_vehicle_plate((string) ($columns[3] ?? ''));
            $makeModel = trim((string) ($columns[2] ?? ''));
            $year = preg_match('/\b(19|20)\d{2}\b/', $makeModel, $yearMatch) ? (int) $yearMatch[0] : 0;
            $licenseDueLabel = trim((string) ($columns[5] ?? ''));
            $testDueLabel = trim((string) ($columns[8] ?? ''));
            $compulsoryDueLabel = trim((string) ($columns[10] ?? ''));
            $comprehensiveDueLabel = trim((string) ($columns[12] ?? ''));
            $licenseDueDate = portal_vehicle_source_date($licenseDueLabel);
            $testDueDate = portal_vehicle_source_date($testDueLabel);
            $compulsoryDueDate = portal_vehicle_source_date($compulsoryDueLabel);
            $comprehensiveDueDate = portal_vehicle_source_date($comprehensiveDueLabel);
            $insuranceDueDate = $compulsoryDueDate;
        } else {
            $email = portal_normalize_company_email((string) ($columns[0] ?? ''));
            $plate = portal_normalize_vehicle_plate((string) ($columns[1] ?? ''));
            $makeModel = trim((string) ($columns[2] ?? ''));
            $yearRaw = trim((string) ($columns[3] ?? ''));
            $year = $yearRaw === '' ? 0 : (int) $yearRaw;
            $licenseDueLabel = '';
            $testDueLabel = trim((string) ($columns[4] ?? ''));
            $compulsoryDueLabel = trim((string) ($columns[5] ?? ''));
            $comprehensiveDueLabel = '';
            $licenseDueDate = '';
            $testDueDate = portal_normalize_vehicle_date($testDueLabel, $row);
            $compulsoryDueDate = portal_normalize_vehicle_date($compulsoryDueLabel, $row);
            $comprehensiveDueDate = '';
            $insuranceDueDate = $compulsoryDueDate;
        }

        if ($email === null || !isset($employees[$email])) {
            throw new RuntimeException('שורה ' . $row . ': דוא"ל העובד אינו קיים בספר העובדים.');
        }
        if ($plate === null) {
            throw new RuntimeException('שורה ' . $row . ': מספר הרכב חייב להכיל 7 או 8 ספרות.');
        }
        if ($year !== 0 && ($year < 1980 || $year > (int) date('Y') + 1)) {
            throw new RuntimeException('שורה ' . $row . ': שנת הרכב אינה תקינה.');
        }

        $entries[$plate] = [
            'plate' => $plate,
            'employee_email' => $email,
            'make_model' => portal_substr($makeModel, 0, 160),
            'year' => $year,
            'license_due_date' => $licenseDueDate,
            'license_due_label' => $licenseDueLabel,
            'license_status' => $sourceFormat ? portal_substr((string) ($columns[4] ?? ''), 0, 60) : '',
            'test_due_date' => $testDueDate,
            'test_due_label' => $testDueLabel,
            'test_status' => $sourceFormat ? portal_substr((string) ($columns[7] ?? ''), 0, 60) : '',
            'insurance_due_date' => $insuranceDueDate,
            'compulsory_insurance_due_date' => $compulsoryDueDate,
            'compulsory_insurance_due_label' => $compulsoryDueLabel,
            'compulsory_insurance_status' => $sourceFormat ? portal_substr((string) ($columns[9] ?? ''), 0, 60) : '',
            'comprehensive_insurance_due_date' => $comprehensiveDueDate,
            'comprehensive_insurance_due_label' => $comprehensiveDueLabel,
            'comprehensive_insurance_status' => $sourceFormat ? portal_substr((string) ($columns[11] ?? ''), 0, 60) : '',
            'insurance_company' => $sourceFormat ? '' : portal_substr((string) ($columns[6] ?? ''), 0, 160),
            'policy_number' => $sourceFormat ? '' : portal_substr((string) ($columns[7] ?? ''), 0, 160),
            'current_km' => $sourceFormat ? portal_substr((string) ($columns[17] ?? ''), 0, 30) : '',
            'last_update' => $sourceFormat ? portal_ey���6��v7W'&V��u��rr����6�73�fV��6��&E��F#�}y�y�]y��z�yybryz-y=y�y]y�yMyy}z�y]y�����F�����W%���B��f�B�&Vu�W�6R�r�����rr�GfV��6��v7W'&V��uҒ����#�����V��c��Т���b�GfV��6��v�7E�FFRu��rr����6�73�fV��6��&E��F#�-y=y�y]y�yy}z�y]y����F���GfV��6��v�7E�FFRuҒ�����V��c��Т���b�GfV��6��v��W&�U�����rr�GfV��6��w��7��V�W"u��rr���Т�6�73�fV��6��&E��F#�y�y�y]ys����F���G&�҂GfV��6��v��W&�U������GfV��6��w��7��V�W"u��rr�r+rzMy]y��zyBr�GfV��6��w��7��V�W"u��rr���������V��c��Т���b�GfV��6��v�FW2u��rr����6�73�fV��6��&E��F#���F���GfV��6��v�FW2uҒ�����V��c��Т�'F�6�����V�f�V6���Т�F�c���6V7F������ Ч��ЦgV�F���F�&V�W%�V��6��F֖�'&�Ff�6���f���Т�F�&V�W%��6��Ff�6���ТGfV��6�2��F�fV��6���&V7F�����ТFV���VW2��F�V���VU��&V7F�����Т�Т�V7F��6�73�vRֆVF��vRֆVF���6�7B#����c���6�73�W�V'&�#�my�z�y�yzMz�y�y����ƃ��y�yy�z-y]yy=y�y�y]z�ymy�y]z�y]z��������y�z�y�yy��y]y�y�y�-y]yy2y�My�yMy=y]y-y�yMyz�y-y]zy��yMy��y=z"zz�y��y�}y]zRy�z�z�yMzmy�yy]z�y��y]y�y�yy]yy}y]ymz�y�-y=y�y�y]y�]zy�z2yy��y��}y]zrz�y�yy�y�yy}z�y�y�����F�c����b6�73�F��6&B#�7�z�y�yy�y�z�zz�y��yS�7��G&�s��6���GfV��6�2���7G&�s���c���6V7F����Т�V7F��6�73�FWF��6&B#��ƃ#��y�yy�y�yy�-z�y�z���#����b6�73�F&��&#���&�6�73�&V6�G2�&�#����VC�G#�F��-y]yy3�F��F���y�y�F��F���zMz��F��F���y�z�y�y]y����F���zy��F��F��y�y�y]yry}y]yyC�F��F��y�y�y]yry�}y�z3�F��F��y�y�y]yrzmy2y-{3�F��F��r-y��z-y=y�y]y�����#���VC��&�������b�GfV��6�2���ғ��Т�#�FB6�7�#�"6�73�V�G��V�#�-y=y�y�y�y�zz�y��yRz�y�yy�y��FC��#���V�S��Т��f�V6��GfV��6�22GfV��6����Т��FV���VR�FV���VW5�GfV��6��vV���VU�������v��r�rr�vV����GfV��6��vV���VU�������Т�#���C�7G&�s���F���FV���VU�v��uҒ��7G&�s�6�����F���FV���VU�vV���Ғ��6����C���C���F���GfV��6��v��U��V�Ғ�������GfV��6��w�V"u���r+rr�����GfV��6��w�V"u��rr��FC���BF�#��"#���F����F�f��E�V��6���FR�GfV��6��w�FRuҒ���FC���C����F�&V�W%�V��6��VFƖ��}z�y�z�y�y]y��GfV��6��vƖ6V�U�VU�FRu�GfV��6��vƖ6V�U�VU�&V��GfV��6��vƖ6V�U�FGW2uғ���FC���C����F�&V�W%�V��6��VFƖ��}y�zy�r�GfV��6��wFW7E�VU�FRu�GfV��6��wFW7E�VU�&V��GfV��6��wFW7E�FGW2uғ���FC���C����F�&V�W%�V��6��VFƖ��}y}y]yyBr�GfV��6��v6�V����7W&�U�VU�FRu�GfV��6��v6�V����7W&�U�VU�&V��GfV��6��v6�V����7W&�U�FGW2uғ���FC���C����F�&V�W%�F���fV��6��VFƖ��}y�}y�z2r�GfV��6��v6�&V�V��fU�7W&�U�VU�FRuғ���FC��C����F�&V�W%�F���fV��6��VFƖ��}zmy2y-{2r�GfV��6��wF��&E�'G��7W&�U�VU�FRuғ���FC��C��GfV��6��v7W'&V��u��rr��F���GfV��6��v7W'&V��uҒ�rzr-y��~(	Br���GfV��6��v�7E�FFRu��rr�s�#�6�����F���GfV��6��v�7E�FFRuҒ�s�6����rr��FC���G#����V�f�V6���Т��V��c��Т�F&�����F&����F�c���6V7F����Т�V7F��6�73�FWF��6&B#�ƃ#��y�yy]yyyRz-y=y�y]y�z�y�yy�y�����zMz�z�y�My=yy�zry�z�y�z�y]z�yz�z-y�]y=y]z�(	5by�My-y�y��y]y�-z�z}y�zy]z�z�y�yy�y��yyRy�Mz�z�y��yz�yzy�z�yMy�my]y�my���y�Mzy�yMy�y�yy]y�yMz-y]yy2y}y�y�yy�My]zMy�z"yy�y�-z-y]yy=y�y�y]y�y��yMy]y�=z�"�y��y�y]y�z�yz�y]zy�y�zMy�z}y�y�y=y]y-y�yMz-y]yy2y]y�zMz�yMz�y�y�yz�yMy=y-y�yMy�zy�y]yMyy�y�y]yryMz-y]yy2y�y�y]y�y�Mz�y��y�y�y}z�yMy�zy�zyB��������F����B"6�73�f��w&�B#��Ɩ�WBG�S���FFV����77&b"f�S����F����F�77&e��ₒ��#��Ɩ�WBG�S���FFV����7F��"f�S����E�V��6���&V7F��#���&V�6�73�f�V�f�V��gV�#����zz�y]zy�z�y�yy�y���Т�W�F&V���fV��6���&V7F���W�B"&�3��"����F��c"&WV�&VB�6V��FW#�y=y]y{My�z-y]yy0�y�zMz�z�y�y�y�zmz�y�y]y=y-yНz�zz�y]y��y]z}z2y�zy��z�y]z}z2yy�y�y]yp�y}yz�z�yy�y�y]yp�y�zMz�zMy]y��zy@�yMz-z�y]z�#��W�F&V����&V�Т�6�73�f���FRf�V��gV�#�My�-z�y�z�y�myMyByy]y�y]y��y�z�yz�y�zyByMy-y�y��y]y�yMz}y�y�y�yz�yzy�z�yMy�my]y�my��z�zry=y]y-y�yMz-y]yy2y]y�zMz�yMz�y�yyMy�y}y]yyB�y�z�z�yMz-y�]y=y]z�yMy�y�zmz�y�y]y=y-y�z�zz�y]y�z�y]z}z2y�zy��z�y]z}z2yy�y�y]yr�y}yz�z�yy�y�y]yr�y�zMz�zMy]y��zyBy]yMz-z�y]z�������b6�73�f�V��gV�#�'WGF�G�S�7V&֗B"6�73�'WGF�'WGF��&��'�#��y��z�z�yMz�y�yy�y��WGF����c���f��Т�6V7F��ࠢ�V7F��6�73�FWF��6&BfV��6���V���F֖��ƃ#�Mz-y�z�y�y��z�y�yy]z-y=y�y]y�z�y]z}z3��#���My�y��zz�y��yyy}zy]y�yMzMz�y�y�y]yy�zyRzy-y�z�yz}y�z�y]z�zmy�yy]z�y��yMz-y]yy2yMy��y]y�y�y]yMy�yMy�yy�y2y�y�y]y��y�y�My]z�y�y2yy]z�yR�������F����B"V�G�S����'B���FF"6�73�f�V��&�Bf�V��&�B�"#�Ɩ�WBG�S���FFV����77&b"f�S����F����F�77&e��ₒ��#�Ɩ�WBG�S���FFV����7F��"f�S�6fU�V��6���V��#�Ɩ�WBG�S���FFV������������R"f�S����dTT��D��������DU2�#��&V�6�73�f�V�#�7�z�y�y�������V�7B���fV��6���V����FR"&WV�&VC��F��f�S�#�y}y�z�yC��F�����f�V6��GfV��6�22GfV��6���FV���VR�FV���VW5�GfV��6��vV���VU�������Ӳ��F��f�S����F���GfV��6��w�FRuҒ�#���F����F�f��E�V��6���FR�GfV��6��w�FRuҒ�r(	Br��FV���VU�v��u��GfV��6��vV���VU����Ғ����F�����V�f�V6����6V�7C��&V���&V�6�73�f�V�#�7�zy]y"y�y���������V�7B���fV��6���V����R"&WV�&VC��F��f�S�#�y}y�z�yC��F�����f�V6���F�fV��6���V����U�&V���2Gf�R�F�&V���F��f�S����F���Gf�R��#���F���F�&V���F�����V�f�V6����6V�7C��&V���&V�6�73�f�V�#�7�z�y]z}z2yMy�y���7�Ɩ�WBG�S�FFR"���fV��6���V�����&W5����&V���&V�6�73�f�V�#�7�y�zMz�zMy]y��zyB�yzy��z�yC�7�Ɩ�WBG�S�FW�B"���fV��6���V�����7��V�W""����F��c#��&V���&V�6�73�f�V�f�V��gV�#�7�z}y]yzRDbyyRz�y�]zyB������Ɩ�WBG�S�f��"���fV��6���V�����"&WV�&VB66WC��FbƖ�vR�VrƖ�vR��Ɩ�vR�V'Ɩ�vR��2Ɩ�vR��bƖ�vR�f�b#��&V���6�73�f���FRf�V��gV�#���y�z�y�y]y�y�zy�y]yy�y�y]yry�z�y�Mymy�y�z�yz�y�y�z�y]z}z2�yy�y�y]yrzmy2y-{2zz�y��yzzMz�y2y]yy�zyRy�y]y��y�yy�y�y]yry�}y�z2�����b6�73�f�V��gV�#�'WGF�G�S�7V&֗B"6�73�'WGF�'WGF��&��'�#��y��z�z�yMy�y��y]z-y=y�y]y�yMz�y]z}z3�'WGF����c��f�����b6�73�fV��6���V���&�2#���f�V6��GfV��6�22GfV��6���FF�V��2��F�fV��6���V��2��7G&���GfV��6��w�FRuғ��b�FF�V��2���Ғ6�F��S�����b6�73�fV��6���V���&�#��3���F����F�f��E�V��6���FR�GfV��6��w�FRuҒ����3�F�b6�73�F�V����7B#���f�V6��FF�V��22FF�V�������c�7G&�s���F���FF�V���wG�U�&V���}y�y��r���7G&�s�7��6�73�FW�B����&Vc����F����F�W&�v7F��r�wfV��6���V������Br�w�FRr�GfV��6��w�FRu�vF�V��r�FF�V���v�Bu��ruҒ��#���F���FF�V���v��u��rr�������b��FF�V���w��7��V�W"u��rr��rr�������My]y��zyB�yzy��z�yC����F���FF�V���w��7��V�W"uҒ��6�����V��c���7������F����FF�V���vW��&W5����rr��rr�}z�y]z}z2r�FF�V���vW��&W5����}y��z�y]z}z2r���7��F�c���V�f�V6�����F�c���c���V�f�V6�����F�c��6V7F�����V7F��6�73�FWF��6&B#��ƃ#��]z-y=y�z�ymy�y]z�z�yy]y�y]y��y�y�y������Mz-y]yy2y]yy]z�y�y�z}yy�Ry=y]y-y�z-y�z�y�z�y�y]y�y�zy��yy�y�y]yry}y]yyB�yy�y�y]yry�}y�z2yyRyy�y�y]yrzmy2y-{2(	B3�B�ry]y�y]y�yy}y2y�Mzy�yMy�]z-y2�yy�y]y�yMy�]z-y2�y]y�y�y�y]y�z�yy]z"y]y}y]y=z�y�y}z�y�]z-y2z�y}y�2�z�ymy�y]z�z�zz�y�}z�z�zry�yz�z�z}y�y�y�z�yz�y�y�y��y]y�=y]y�zr����6V7F������ Ч�
