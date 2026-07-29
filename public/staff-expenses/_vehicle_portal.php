<?php
declare(strict_types=1);

function portal_vehicle_monthly_file(): string
{
    return portal_storage_root() . DIRECTORY_SEPARATOR . 'security' . DIRECTORY_SEPARATOR . 'vehicle-monthly.json';
}

function portal_vehicle_monthly_reports(): array
{
    return portal_json_read(portal_vehicle_monthly_file());
}

function portal_vehicle_month_key(?DateTimeImmutable $date = null): string
{
    $date ??= new DateTimeImmutable('now', new DateTimeZone('Asia/Jerusalem'));
    return $date->setTimezone(new DateTimeZone('Asia/Jerusalem'))->format('Y-m');
}

function portal_vehicle_reports_for_plate(string $plate): array
{
    $plate = portal_normalize_vehicle_plate($plate) ?? '';
    $reports = portal_vehicle_monthly_reports()[$plate] ?? [];
    return is_array($reports) ? $reports : [];
}

function portal_vehicle_latest_monthly(string $plate): ?array
{
    $months = portal_vehicle_reports_for_plate($plate);
    if ($months === []) {
        return null;
    }
    krsort($months);
    $versions = reset($months);
    if (!is_array($versions) || $versions === []) {
        return null;
    }
    return end($versions) ?: null;
}

function portal_vehicle_document_manifest_file(): string
{
    return portal_storage_root() . DIRECTORY_SEPARATOR . 'security' . DIRECTORY_SEPARATOR . 'vehicle-documents.json';
}

function portal_vehicle_document_type_labels(): array
{
    return [
        'license' => 'רישיון רכב',
        'test' => 'אישור טסט',
        'compulsory' => 'ביטוח חובה',
        'comprehensive' => 'ביטוח מקיף',
        'third_party' => 'ביטוח צד ג׳',
        'other' => 'מסמך רכב אחר',
    ];
}

function portal_vehicle_document_expiry_field(string $type): ?string
{
    $fields = [
        'license' => 'license_due_date',
        'test' => 'test_due_date',
        'compulsory' => 'compulsory_insurance_due_date',
        'comprehensive' => 'comprehensive_insurance_due_date',
        'third_party' => 'third_party_insurance_due_date',
    ];

    return $fields[$type] ?? null;
}

function portal_vehicle_document_directory(string $plate, string $documentId): string
{
    $plate = portal_normalize_vehicle_plate($plate) ?? '';
    if ($plate === '' || !preg_match('/^[a-f0-9]{24}$/', $documentId)) {
        throw new RuntimeException('מסמך הרכב המבוקש אינו תקין.');
    }
    return portal_storage_root() . DIRECTORY_SEPARATOR . 'vehicle-documents'
        . DIRECTORY_SEPARATOR . $plate . DIRECTORY_SEPARATOR . $documentId;
}

function portal_vehicle_documents(string $plate): array
{
    $plate = portal_normalize_vehicle_plate($plate) ?? '';
    if ($plate === '') {
        return [];
    }
    $manifest = portal_json_read(portal_vehicle_document_manifest_file());
    $documents = $manifest[$plate] ?? [];
    if (!is_array($documents)) {
        return [];
    }
    $documents = array_values(array_filter($documents, 'is_array'));
    usort($documents, static fn(array $a, array $b): int => strcmp(
        (string) ($b['uploaded_at'] ?? ''),
        (string) ($a['uploaded_at'] ?? '')
    ));
    return $documents;
}

function portal_vehicle_documents_for_user(array $user, string $plate): array
{
    $email = portal_normalize_company_email((string) ($user['email'] ?? '')) ?? '';
    $plate = portal_normalize_vehicle_plate($plate) ?? '';
    $vehicle = portal_vehicle_directory()[$plate] ?? null;
    if (!is_array($vehicle) || (($user['role'] ?? '') !== 'admin' && !hash_equals($email, (string) ($vehicle['employee_email'] ?? '')))) {
        return [];
    }
    return portal_vehicle_documents($plate);
}

function portal_register_vehicle_document(
    string $plate,
    string $type,
    string $expiresOn,
    string $policyNumber,
    array $attachment,
    ?string $documentId = null
): array {
    $plate = portal_normalize_vehicle_plate($plate) ?? '';
    $vehicles = portal_vehicle_directory();
    if ($plate === '' || !isset($vehicles[$plate])) {
        throw new RuntimeException('הרכב שנבחר אינו קיים במערכת.');
    }
    $labels = portal_vehicle_document_type_labels();
    if (!isset($labels[$type])) {
        throw new RuntimeException('סוג מסמך הרכב אינו תקין.');
    }
    if ($expiresOn !== '' && !portal_valid_date($expiresOn)) {
        throw new RuntimeException('תאריך התוקף אינו תקין.');
    }
    if ($type !== 'other' && $expiresOn === '') {
        throw new RuntimeException('יש להזין תאריך תוקף למסמך.');
    }
    if (($attachment['storage_name'] ?? '') === '') {
        throw new RuntimeException('חובה לצרף מסמך רכב.');
    }

    $documentId ??= bin2hex(random_bytes(12));
    if (!preg_match('/^[a-f0-9]{24}$/', $documentId)) {
        throw new RuntimeException('מזהה מסמך הרכב אינו תקין.');
    }
    $document = [
        'id' => $documentId,
        'type' => $type,
        'type_label' => $labels[$type],
        'name' => (string) ($attachment['original_name'] ?? 'מסמך רכב'),
        'expires_on' => $expiresOn,
        'policy_number' => portal_substr(trim($policyNumber), 0, 160),
        'status' => $expiresOn === '' ? 'ללא תאריך תוקף' : portal_vehicle_deadline_status($expiresOn)['label'],
        'attachment' => $attachment,
        'uploaded_at' => gmdate('c'),
    ];

    $manifest = portal_json_read(portal_vehicle_document_manifest_file());
    $documents = is_array($manifest[$plate] ?? null) ? $manifest[$plate] : [];
    $documents[] = $document;
    $manifest[$plate] = $documents;
    portal_json_write(portal_vehicle_document_manifest_file(), $manifest);

    $expiryField = portal_vehicle_document_expiry_field($type);
    if ($expiryField !== null && $expiresOn !== '') {
        $vehicles[$plate][$expiryField] = $expiresOn;
        $vehicles[$plate]['updated_at'] = gmdate('c');
        portal_json_write(portal_vehicle_directory_file(), $vehicles);
    }
    return $document;
}

function portal_save_vehicle_document(array $user): array
{
    if (($user['role'] ?? '') !== 'admin') {
        throw new RuntimeException('הפעולה דורשת הרשאת מנהל.');
    }
    $plate = portal_normalize_vehicle_plate(portal_post('vehicle_document_plate', 20)) ?? '';
    $type = portal_post('vehicle_document_type', 30);
    $expiresOn = portal_post('vehicle_document_expires_on', 10);
    $policyNumber = portal_post('vehicle_document_policy_number', 160);
    $documentId = bin2hex(random_bytes(12));
    $directory = portal_vehicle_document_directory($plate, $documentId);
    try {
        $attachments = portal_save_uploads($directory, $_FILES['vehicle_document_file'] ?? []);
        if (count($attachments) !== 1) {
            throw new RuntimeException('יש לצרף קובץ אחד לכל מסמך רכב.');
        }
        return portal_register_vehicle_document(
            $plate,
            $type,
            $expiresOn,
            $policyNumber,
            $attachments[0],
            $documentId
        );
    } catch (Throwable $error) {
        portal_remove_tree($directory);
        throw $error;
    }
}

function portal_user_can_access_vehicle(array $user, string $plate): bool
{
    $plate = portal_normalize_vehicle_plate($plate) ?? '';
    $vehicle = portal_vehicle_directory()[$plate] ?? null;
    if (!is_array($vehicle)) {
        return false;
    }
    if (($user['role'] ?? '') === 'admin') {
        return true;
    }
    $email = portal_normalize_company_email((string) ($user['email'] ?? '')) ?? '';
    return $email !== '' && hash_equals($email, (string) ($vehicle['employee_email'] ?? ''));
}

function portal_handle_vehicle_document_download(array $user): never
{
    $plate = portal_normalize_vehicle_plate((string) ($_GET['plate'] ?? '')) ?? '';
    $documentId = trim((string) ($_GET['document'] ?? ''));
    if (!portal_user_can_access_vehicle($user, $plate) || !preg_match('/^[a-f0-9]{24}$/', $documentId)) {
        http_response_code(403);
        exit('Forbidden');
    }
    $document = null;
    foreach (portal_vehicle_documents($plate) as $candidate) {
        if (hash_equals($documentId, (string) ($candidate['id'] ?? ''))) {
            $document = $candidate;
            break;
        }
    }
    $attachment = is_array($document['attachment'] ?? null) ? $document['attachment'] : null;
    if (!is_array($attachment)) {
        http_response_code(404);
        exit('Not found');
    }
    $storageName = basename((string) ($attachment['storage_name'] ?? ''));
    if ($storageName === '' || $storageName !== (string) ($attachment['storage_name'] ?? '')) {
        http_response_code(400);
        exit('Bad request');
    }
    $path = portal_vehicle_document_directory($plate, $documentId)
        . DIRECTORY_SEPARATOR . 'files' . DIRECTORY_SEPARATOR . $storageName;
    if (!is_file($path)) {
        http_response_code(404);
        exit('Not found');
    }
    $original = (string) ($attachment['original_name'] ?? 'vehicle-document');
    $ascii = preg_replace('/[^A-Za-z0-9._-]/', '_', $original) ?: 'vehicle-document';
    header('Content-Type: ' . ((string) ($attachment['mime'] ?? 'application/octet-stream')));
    header('Content-Length: ' . filesize($path));
    header('Content-Disposition: attachment; filename="' . $ascii . '"; filename*=UTF-8\'\'' . rawurlencode($original));
    portal_audit('vehicle_document_downloaded', ['plate_hash' => hash('sha256', $plate), 'document_id' => $documentId]);
    readfile($path);
    exit;
}

function portal_vehicle_monthly_dir(string $plate, string $month, int $version): string
{
    $plate = portal_normalize_vehicle_plate($plate) ?? '';
    if ($plate === '' || !preg_match('/^\d{4}-\d{2}$/', $month) || $version < 1) {
        throw new RuntimeException('נתוני הדיווח החודשי אינם תקינים.');
    }
    return portal_storage_root() . DIRECTORY_SEPARATOR . 'vehicle-mo3c�6U�VU�FRuғ���b���'&��FFVFƖ��v6�72u��w7FGW2�֗76��r�w7FGW2�&Wf�Wru�G'VR����&WGW&��v6�72r�w7FGW2�&Wf�Wrr�v�&V��}y�y��z-y]y�2y�My]y"uӰ�ТТ&WGW&��v6�72r�w7FGW2�&�VBr�v�&V��}z�z}y�y�ӰЧ��ЦgV�F���F�&V�W%�V��6���F�Ǖ��҆'&�GfV��6���f�Ч�ТG&Wf��2��F�fV��6��&Wf��5�F�WFW"��7G&���GfV��6��w�FRuғ�Т�Т�V7F��6�73�f��6&BfV��6���F�ǒ�&B"�C����ǒ�W�B#����b6�73�f��6&E��VFW"#�7�6�73�7FW#��7���c��#�=y�y]y]yry}y]y=z�y�z}zmz���#��My=y�y]y]yry��y]z-y2y�}y�y�]y��z�yym{2y]y��myyMz�y�yyy�y2�y�y��y�y�zy�y]yy�y�y]yry�y]yMy��y�yzzMz�y2�����c���c������F����B"V�G�S����'B���FF"6�73�f�V��&�Bf�V��&�B�"#��Ɩ�WBG�S���FFV����77&b"f�S����F����F�77&e��ₒ��#��Ɩ�WBG�S���FFV����7F��"f�S�7V&֗E�V��6���F�ǒ#��Ɩ�WBG�S���FFV�������Ǖ�V��6���FR"f�S����F���GfV��6��w�FRuҒ�#���&V�6�73�f�V�#�7�z}y�y�]y��z�yym{2zy]y�y}y�������Ɩ�WBG�S���W""������Ǖ�F�WFW""&WV�&VB֖�#"����������"��WF�FS���&�2"�6V��FW#���G&Wf��2��}y=y�y]y]yrz}y]y=yӢr�G&Wf��2�rr�#��&V�Т�&V�6�73�f�V�#�7�yy�yMz}y�y�]y��z�yym{2y�z�y2(	ByMzyz��7�Ɩ�WBG�S�FW�B"�����WFW%�V7&V6U����F��"����F��c#��&V�Т�&V�6�73�f�V�#�7�y�y�zMy]y��y��������V�7B������Ǖ�&VF��"&WV�&VC��F��f�S���#��zy=z�z�y�y�zMy]y��F����F��f�S�&WV�&VB#�y=z�z�y�y�zMy]y��F����F��f�S�66�VGV�B#�z}yz"y�y�zMy]y��F����F��f�S�6��FVB#�y]zmz"y�y�zMy]y��F����V�7C��&V�Т�&V�6�73�f�V�#�7�z�z}y�zy]z�zmy��y-y�y��������V�7B������Ǖ��&W2"&WV�&VC��F��f�S����z}y�zy�y��F����F��f�S�6�V6�#�=y]z�z�y�y�yy=y�z}yC��F����F��f�S�&W�6R#�=y]z�z�y�y�yMy}y�MyC��F����F��f�S�W&vV�#�}y�y�y��z�z}y�By=y}y]zMyC��F����V�7C��&V�Т�&V�6�73�f�V�#�7�z�z}y�zy]z�y�y���z��������V�7B������Ǖ�V�&�7FGW2"&WV�&VC��F��f�S���Mz�y�yz�z}y�y��F����F��f�S��77VR#�}y�y�y��z�z}y�Bz�yy�zyBy=y}y]zMyC��F����F��f�S�6���y=z�z�y�y�zMy]y�yyMz}y=y��F����F��f�S�V�fR#�Mz�y�yyy�zyRyy�y]yry�zy�z-yC��F����V�7C��&V�Т�&V�6�73�f�V�#�7�zy]y"y�y�zMy]y��z�z}y�C�7�Ɩ�WBG�S�FW�B"������Ǖ�&VF����R"����F��3#��&V�Т�&V�6�73�f�V�#�7�z�yz�y�y�y�y�zMy]y���Ɩ�WBG�S�FFR"������Ǖ�&VF���FR#��&V�Т�&V�6�73�f�V�#�7�y�]zy��7�Ɩ�WBG�S�FW�B"������Ǖ�&vR"����F��##��&V�Т�&V�6�73�f�V�f�V��gV�#�7�z�y�yy]z�y]yMz-z�y]z�yy�}z�yBz�y�z�z}y�C�7��W�F&V������Ǖ�7VU�W67&�F��"&�3�2"����F��##��W�F&V��&V�Т�&V�6�73�f�V�f�V��gV�#�7�y}z�yy]zy�z��z�y�]zyByyRy�y���7�Ɩ�WBG�S�f��"������Ǖ�GF6���5������66WC��FbƖ�vR�VrƖ�vR��Ɩ�vR�V'Ɩ�vR��2Ɩ�vR��bƖ�vR�f�b#��&V�Т��b6�73�V�fR�&�rf�V��gV�#�y�yMz�y�yyy�zyRyy�y]yry�zy�z-yC�yy�y�y�My��y�y�y�zy]z"yz�y�yy�Mzy�z}yy��yMzy}y�yBy�My�yMy��F�c����b6�73�f�V��gV�#�'WGF�G�S�7V&֗B"6�73�'WGF�'WGF��&��'�'WGF���&vR#��y��y}z�yMy=y�y]y]yryMy}y]y=z�y��'WGF����c���f��Т�6V7F������ Ч��ЦgV�F���F�&V�W%���V��6��vR�'&�GW6W"��'&�Ff�6���f�Ч�Т�F�&V�W%��6��Ff�6���ТGfV��6�2��F�fV��6�5������VR�GW6W"��Т�Т�V7F��6�73�vRֆVF��#�F�c�6�73�W�V'&�#��y�yy}yz�yC����Mz�y�yz�y�������yy�zy�z�y�y�mzMy]z�yzMz�y�y�z�y�yyMy}yz�yB�yy�y��y�y�yMy}z�y]yy�y�y]yy�]z-y=y�yMy}y�y=y]z��y]y��y�]yryz�yMy=y�y]y]yryMy}y]y=z�y�yMz}zmz������c�6�73�'WGF�'WGF��&��'�'WGF���&vR"�&Vc�6���ǒ�W�B#���y�]y�y=y�y]y]yry}y]y=z�y����V7F������f�V6��GfV��6�22GfV��6����Т��F�FW7B��F�fV��6��FW7E��F�ǒ��7G&���GfV��6��w�FRuғ�G7FGW2��F�fV��6��fW&��FGW2�GfV��6��F�FW7B���Т�V7F��6�73�fV��6�ֆW&�����c�6�73�W�V'&�#���F����F�V���VU�&����GW6W"��v��uҒ����#���F���GfV��6��v��U��V���}zMz�y�y�yMy=y-y�y�z�y�yMy]z�y��Rr����#�"F�#��"#���F����F�f��E�V��6���FR�GfV��6��w�FRuҒ���#���c����6�73�7FGW2���F���G7FGW5�v6�72uҒ�#���F���G7FGW5�v�&V�Ғ��7�Т��b6�73�fV��6�ֆW&��FG2#�7�y�zy��G&�s���F���GfV��6��wFW7E�VU�FRu��}y}zz�r���7G&�s�����yy�y�y]yry}y]yyC�G&�s���F���GfV��6��v6�V����7W&�U�VU�FRu��}y}zz�r���7G&�s�����z}{My�yy}z�y]y�7G&�s���F���GfV��6��v7W'&V��u��}y�z�y�y=y]y]yrr���7G&�s�����z-y=y�y]y�yy}z�y]y�7G&�s���F���GfV��6��v�7E�FFRu��}y�z�y�y=y]y]yrr���7G&�s����F�c���6V7F�������F�&V�W%�V��6���F�Ǖ��҂GfV��6����Т�V7F��6�73�FWF��6&BfV��6���V��2�&B#��#��y��y�yMz�y�yy]yMzyMy#��#����FF�V��2��F�fV��6���V��5���6W"�GW6W"��7G&���GfV��6��w�FRuғ��Т���b�FF�V��2���ғ����b6�73��'B�'B�����-y=y�y�y�y�zz�y��yRy�y��y�y�y��y�yymyB�y�yMy�y�y�y]y�y�Mz-y�]z�z�y�z�y�y]y�y�zy�y]yy�y�y]y}y�y�yy�y�z�y�yy�yMz-y]yy=y�y��F�c���V�S����b6�73�F�V����7B#���f�V6��FF�V��22FF�V�������c�7G&�s���F���FF�V���wG�U�&V���}y�y��r���7G&�s�7��6�73�FW�B����&Vc����F����F�W&�v7F��r�wfV��6���V������Br�w�FRr�GfV��6��w�FRu�vF�V��r�FF�V���v�Bu��ruҒ��#���F���FF�V���v��u��rr�����������F����FF�V���vW��&W5����rr��rr�}z�y]z}z2r�FF�V���vW��&W5����}y��z�y]z}z2r���7��F�c���V�f�V6����F�c���V��c����6V7F�����V7F��6�73�FWF��6&B#��#�My�zy�y]z�y�y�z�y=y�y]y]y}y�y�y}y]y=z�y�y�y������F��7F����F�fV��6��W�G5����FR��7G&���GfV��6��w�FRuғ��Т���b�F��7F�����ғ���6�73��FVB�W�B#�-y=y�y�y�y�zz�y�ry=y�y]y]yry}y]y=z�y������V�S����b6�73���7F����7B#����'6�B�F��7F����f�V6��F��7F��2F����GfW'6��2��F�7B��5�'&��GfW'6��2��V��GfW'6��2���Ӳ��'F�6�6�73���7F���&B#�F�c�7�6�73���7F���&E�FFR#���F���F������7�ƃ#���F����7G&����F�7E�v��WFW"u��rr���z}{My���6�S��6���GfW'6��2��y-z�zyy]z��6�S���c�7�6�73�7FGW2���F�7E�v��vW%�Wf�Wu�WV�&VBu��f�R��w7FGW2�&Wf�Wrr�w7FGW2�&�VBr�#���F�7E�v��vW%�Wf�Wu�WV�&VBu��f�R��}y�y=y�z}z�y�yMy��}z�z}y�y���7��'F�6����V�f�V6����F�c���V��c��Т�6V7F������V�f�V6���Т�� Ч��ЦgV�F���F�fV��6���F�Ǖ�V֖�W%�FFU������7G&��Ч�Т&WGW&��F�7F�vU��B���D�$T5D���U$D��w6V7W&�G�r�D�$T5D���U$D��wfV��6���F�ǒ�V֖�W'2��s�Ч��ЦgV�F���F�&�W75�V��6���F�Ǖ�V֖�W'2�FFUF����WF&�F�r���&�F���"�����'&�Ч�ТF���"��7FF�2f�G&��FV���7G&��G7V&�V7B�7G&��F&���'&�FGF6���2��&���Т�F�6V����v�F��GF6���2�FV���G7V&�V7B�F&���FGF6���2��ТF�6��F�r�6WEF����R��rFFUF����R�t6��'W6�����ТFF������F�6����B�v�r��ТG&W7V���w6V�r��v֗76����vvVBr��vf��Br�ӰТ�b���'&��FF���"�B�r���G'VR���Т&WGW&�G&W7V��Т��F�����F�fV��6���F����F�6�ТG7FFR��F��6��VB��F�fV��6���F�Ǖ�V֖�W%�FFU�������Тf�V6���F�fV��6���&V7F����2G�FR�GfV��6���ТG�FR��7G&���G�FS�ТGfW'6��2��F�fV��6���F�Ǖ�W�G2���G�FUղF������ӰТ�b��5�'&��GfW'6��2�bbGfW'6��2��Ғ�Т6�F��S�Т��FV�����F��&�Ɨ�U���V���7G&����GfV��6��vV���VU������rr���Т�b�FV���������Т6�F��S�Т��G&V6��V��FF�����v�V�r��F�6��V���F��ₒ�FV��ðТGF���F����s�r�FF��s�r�G�FS�Т�b��76WB�G7FFU�GF�����Т6�F��S�Т��G7V&�V7B�FF�����}y=y�y]y]yrz�y�yy}y]y=z�y�y}zz�r�}z�ymy�y]z�z�y���y�]y�y=y�y]y]yryMz�y�yyMy}y]y=z�y�s�ТF&����FF�����}yMy=y�y]y]yryMy}y]y=z�y�y�z�y�y�]y�z-yy]z�yMz�y�yr�}y�z�y���yz�yMy=y�y]y]yryMy}y]y=z�y�yMz}zmz�z-yy]z�yMz�y�yr�Т��F�f��E�V��6���FR�G�FR��"�%��GG3����VV�6���7Ffb��V�W2�F#���V��6�#�Т�b�F���"�G&V6��V��G7V&�V7B�F&����Ғ��ТG7FFU�GF���v�FR�v2r��ТFF�����G&W7V��v֗76����vvVBuҲ��G&W7V��w6V�uҲ��Т�V�R�ТG&W7V��vf��BuҲ��Т�����F��6��&�FR��F�fV��6���F�Ǖ�V֖�W%�FFU������G7FFR��Т&WGW&�G&W7V��Ч�
