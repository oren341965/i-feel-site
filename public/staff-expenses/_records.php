<?php
declare(strict_types=1);

function portal_parse_travel_items(): array
{
    $categories = $_POST['travel_item_category'] ?? [];
    $dates = $_POST['travel_item_date'] ?? [];
    $vendors = $_POST['travel_item_vendor'] ?? [];
    $amounts = $_POST['travel_item_amount'] ?? [];
    $currencies = $_POST['travel_item_currency'] ?? [];
    $notes = $_POST['travel_item_note'] ?? [];

    if (!is_array($categories) || !is_array($dates) || !is_array($vendors) || !is_array($amounts) || !is_array($currencies) || !is_array($notes)) {
        throw new RuntimeException('פרטי ההוצאות בנסיעה אינם תקינים.');
    }

    $allowedCategories = [
        'flight', 'hotel', 'meals', 'car_rental', 'local_transport', 'parking',
        'communications', 'insurance_visa', 'conference', 'purchases', 'baggage',
        'tips', 'other',
    ];
    $allowedCurrencies = ['ILS', 'USD', 'EUR', 'GBP'];
    $items = [];
    $totals = [];
    $count = min(50, max(count($categories), count($amounts)));

    for ($i = 0; $i < $count; $i++) {
        $category = trim((string) ($categories[$i] ?? ''));
        $date = trim((string) ($dates[$i] ?? ''));
        $vendor = trim((string) ($vendors[$i] ?? ''));
        $amountRaw = trim((string) ($amounts[$i] ?? ''));
        $currency = trim((string) ($currencies[$i] ?? 'ILS'));
        $note = trim((string) ($notes[$i] ?? ''));

        if ($category === '' && $amountRaw === '' && $vendor === '' && $note === '') {
            continue;
        }
        if (!in_array($category, $allowedCategories, true)) {
            throw new RuntimeException('יש לבחור סוג הוצאה תקין בכל שורה.');
        }
        $amount = portal_parse_amount($amountRaw);
        if ($amount === null) {
            throw new RuntimeException('יש להזין סכום תקין בכל שורת הוצאה.');
        }
        if (!in_array($currency, $allowedCurrencies, true)) {
            throw new RuntimeException('המטבע שנבחר אינו תקין.');
        }
        if ($date !== '' && !portal_valid_date($date)) {
            throw new RuntimeException('אחד מתאריכי ההוצאות אינו תקין.');
        }

        $items[] = [
            'category' => $category,
            'date' => $date,
            'vendor' => portal_substr($vendor, 0, 160),
            'amount' => $amount,
            'currency' => $currency,
            'note' => portal_substr($note, 0, 500),
        ];
        $totals[$currency] = round((float) ($totals[$currency] ?? 0) + $amount, 2);
    }

    if ($items === []) {
        throw new RuntimeException('יש להזין לפחות שורת הוצאה אחת עבור הנסיעה לחו״ל.');
    }

    return [$items, $totals];
}

function portal_build_record(array $user): array
{
    $type = portal_post('report_type', 30);
    if (!in_array($type, ['vehicle', 'travel', 'general'], true)) {
        throw new RuntimeException('יש לבחור סוג דיווח.');
    }

    $employeeName = portal_post('employee_name', 120);
    if ($employeeName === '') {
        throw new RuntimeException('חובה להזין את שם העובד או העובדת.');
    }

    $employee = [
        'name' => $employeeName,
        'email' => portal_post('employee_email', 160),
        'phone' => portal_post('employee_phone', 60),
    ];
    if ($employee['email'] !== '' && !filter_var($employee['email'], FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('כתובת הדוא״ל אינה תקינה.');
    }

    $details = [];
    $items = [];
    $totals = [];
    $reportDate = '';

    if ($type === 'travel') {
        $departureDate = portal_post('departure_date', 20);
        $returnDate = portal_post('return_date', 20);
        if (!portal_valid_date($departureDate) || !portal_valid_date($returnDate)) {
            throw new RuntimeException('חובה להזין תאריכי יציאה וחזרה תקינים.');
        }
        if ($returnDate < $departureDate) {
            throw new RuntimeException('תאריך החזרה אינו יכול להיות מוקדם מתאריך היציאה.');
        }
        $destination = portal_post('destination', 300);
        $purpose = portal_post('trip_purpose', 800);
        if ($destination === '' || $purpose === '') {
            throw new RuntimeException('חובה להזין יעד ומטרת נסיעה.');
        }
        [$items, $totals] = portal_parse_travel_items();
        $reportDate = $departureDate;
        $businessDays = portal_post('business_days', 10);
        if ($businessDays !== '' && (!ctype_digit($businessDays) || (int) $businessDays > 365)) {
            throw new RuntimeException('מספר ימי העבודה אינו תקין.');
        }
        $details = [
            'company_name' => portal_post('company_name', 120) ?: 'I Feel',
            'traveler_name' => portal_post('traveler_name', 120) ?: $employeeName,
            'traveler_role' => portal_post('traveler_role', 120),
            'destination' => $destination,
            'departure_date' => $departureDate,
            'return_date' => $returnDate,
            'business_days' => $businessDays,
            'trip_purpose' => $purpose,
            'booking_reference' => portal_post('booking_reference', 120),
            'notes' => portal_post('travel_notes', 2000),
        ];
    } else {
        $prefix = $type === 'vehicle' ? 'vehicle_' : 'general_';
        $expenseDate = portal_post($prefix . 'expense_date', 20);
        if (!portal_valid_date($expenseDate)) {
            throw new RuntimeException('חובה להזין תאריך הוצאה תקין.');
        }
        $amount = portal_parse_amount(portal_post($prefix . 'amount', 40));
        if ($amount === null) {
            throw new RuntimeException('חובה להזין סכום תקין.');
        }
        $currency = portal_post($prefix . 'currency', 10);
        if (!in_array($currency, ['ILS', 'USD', 'EUR', 'GBP'], true)) {
            throw new RuntimeException('המטבע שנבחר אינו תקין.');
        }
        $totals = [$currency => $amount];
        $reportDate = $expenseDate;

        $base = [
            'expense_date' => $expenseDate,
            'supplier' => portal_post($prefix . 'supplier', 160),
            'invoice_number' => portal_post($prefix . 'invoice_number', 100),
            'amount' => $amount,
            'currency' => $currency,
            'payment_method' => portal_post($prefix . 'payment_method', 60),
            'project_customer' => portal_post($prefix . 'project_customer', 160),
            'description' => portal_post($prefix . 'description', 2000),
        ];

        if ($type === 'vehicle') {
            $category = portal_post('vehicle_category', 60);
            $plate = portal_post('vehicle_plate', 40);
            $allowedVehicleCategories = [
                'fuel', 'service', 'repair', 'parking', 'toll', 'insurance',
                'licensing', 'washing', 'rental', 'transport', 'other',
            ];
            if (!in_array($category, $allowedVehicleCategories, true)) {
                throw new RuntimeException('בדיווח נסיעה או רכב חובה לבחור סוג הוצאה תקין.');
            }
            $details = $base + [
                'vehicle_category' => $category,
                'vehicle_plate' => $plate,
                'vehicle_model' => portal_post('vehicle_model', 120),
                'vehicle_driver' => portal_post('vehicle_driver', 120) ?: $employeeName,
                'odometer' => portal_post('odometer', 30),
            ];
        } else {
            $category = portal_post('general_category', 60);
            if ($category === '') {
                throw new RuntimeException('חובה לבחור קטגוריית הוצאה.');
            }
            $details = $base + ['general_category' => $category];
        }
    }

    $recordId = portal_new_record_id();
    $recordDir = portal_record_dir($recordId);
    portal_ensure_directory($recordDir);

    try {
        $attachments = portal_save_uploads($recordDir, $_FILES['attachments'] ?? []);
        $noReceiptReason = portal_post('no_receipt_reason', 1000);
        if ($attachments === [] && $noReceiptReason === '') {
            throw new RuntimeException('חובה לצרף לפחות קבלה או חשבונית אחת, או להסביר מדוע אין מסמך.');
        }

        $now = gmdate('c');
        $record = [
            'schema_version' => 1,
            'id' => $recordId,
            'type' => $type,
            'status' => 'new',
            'report_date' => $reportDate,
            'employee' => $employee,
            'submitted_by' => [
                'username' => (string) ($user['username'] ?? ''),
                'display_name' => (string) ($user['display_name'] ?? ''),
            ],
            'details' => $details,
            'expense_items' => $items,
            'totals' => $totals,
            'attachments' => $attachments,
            'attachment_notes' => portal_post('attachment_notes', 1000),
            'no_receipt_reason' => $noReceiptReason,
            'admin_note' => '',
            'created_at' => $now,
            'updated_at' => $now,
            'history' => [[
                'at' => $now,
                'by' => (string) ($user['username'] ?? ''),
                'action' => 'created',
                'status' => 'new',
            ]],
        ];
        portal_save_record($record);
        portal_audit('record_created', ['record_id' => $recordId, 'type' => $type, 'attachments' => count($attachments)]);
        return $record;
    } catch (Throwable $error) {
        portal_remove_tree($recordDir);
      '��V���W�6WF���}y���z�y��y}y=z�y}y]yyBy�My-y=y�z�zy�zy�Byyy]z�y�"z�y]y]y�y�y�My}y]z����Т���b�G77v�B�rrbb�F�7G&��77v�B��"��ТF�&��r'V���W�6WF���}yMzy�zy�By}y�y�yz�y�My�y�y�y�My}y]z�"z�y]y]y�y�r��Т���b�GW6W&�����7G&����GW6W%�wW6W&��u��rr�bbF7F�fR��ТF�&��r'V���W�6WF���}y�zy�z�y�y�Mz�yy�z�yz�yMy��z�y��yMy�}y]yz����Т���b�GW6W&�����7G&����GW6W%�wW6W&��u��rr�bbG&�R�vF֖���ТF�&��r'V���W�6WF���}y�zy�z�y�y�Mzy�z�y�-zmy��yMz�z�yz�y�yMy�r��Т��ТG77v�D�6��FW��7F���w77v�E�6�u��rs�Т�b�G77v�B�rr��ТG77v�D�6��77v�E�6��G77v�B�55t�E�TdT���Т���F�6fU�6W"�GW6W&����ТvF�7����r�FF�7������w&�Rr�G&�R��v7F�fRr�F7F�fR��w77v�E�6�r�G77v�D�6���ғ�Т�F�VF�B�wW6W%�fVBr��wW6W&��r�GW6W&���w&�Rr�G&�R�v7F�fRr�F7F�fR�w77v�E���VBr�G77v�B�ruғ�Т�F�f�6��WB�w7V66W72r�FW��7F�������}yMy��z�y��zy]zmz�yyMzmy�}yB��}zMz�y�y�yMy��z�y��z-y]y=y�zyR���Т�F�&VF�&V7B��wF"r�wW6W'2uғ�Т��Т�b�F7F����v���E����VU��&V7F��r��Т�F�&WV�&U�F֖ₓ�ТF6����F����E����VU��&V7F����F��B�vV���VU��&V7F���W�Br�3���Т�F�VF�B�vV���VU��&V7F����FVBr��v6��r�F6��ғ�Т�F�f�6��WB�w7V66W72r�}zMz�y�y�r�F6���rz-y]yy=y�y�zz�y��yRyyMzmy�}yB���Т�F�&VF�&V7B��wF"r�vV���VW2uғ�Т��Т�b�F7F����v���E�V��6���&V7F��r����F�&WV�&U�F֖ₓ�ТF6����F����E�V��6���&V7F����F��B�wfV��6���&V7F���W�Br�c���Т�F�VF�B�wfV��6���&V7F����FVBr��v6��r�F6��ғ�Т�F�f�6��WB�w7V66W72r�}zMz�y�y�r�F6���rz�y�yy�y�zz�y��yRyyMzmy�}yB���Т�F�&VF�&V7B��wF"r�wfV��6�2uғ��Р��b�F7F����w6fU�V��6���V��r����F�&WV�&U�F֖ₓ��FF�V����F�6fU�V��6���V���GW6W"����F�VF�B�wfV��6���V���fVBr���vF�V���r��7G&����FF�V���v�Bu��rr�"wG�Rr��7G&����FF�V���wG�Ru��rr�"ғ���F�f�6��WB�w7V66W72r�}y�y��yMz�y�yzz�y��y]z�yz�y�y�yMz�y]z}z2z-y]y=y�y�r����F�&VF�&V7B��wF"r�wfV��6�2uғ��РТ�b�F7F����w6fU��'F�F���gBr��Т�F�&WV�&U�F֖ₓ�ТG�V%&r��F��B�vv�gE�"r�B��Т�b�7G�U��v�B�G�V%&r���ТF�&��r'V���W�6WF���}z�zz�yMy��zyByy�zyBz�z}y�zyB���Т��FV�����F��B�vv�gE����VU�����c��Т�F�6fU��'F�F���gB�ТFV���Т����G�V%&r���F��B�vv�gE��F�r�c����F��B�vv�gE�W76vRr�#����F��B�vv�gE�����Rr�c����F��B�vv�gE�VFV�F���&��S���E���5�vv�gE�GF6���u�������Т�F�VF�B�v&�'F�F���gE�fVBr��ТvV����6�r��6��w6�#Sbr�7G'F��W"�FV�����w�V"r�����G�V%&r��ғ�Т�F�f�6��WB�w7V66W72r�}y��zz�y�y]y�yMyMy]y�=z�zz�y��yByyymy]z�yMyy�z�y�z�y�yMz-y]yy2���Т�F�&VF�&V7B��wF"r�vV���VW2uғ�Т��ТF�&��r'V���W�6WF���}yMzMz-y]y�ByMy�y]z}z�z�yy�zyBy�]y�z�z����Ч��ЦgV�F���F�W6W%��F���E�V6�B�'&�GW6W"�'&�G&V6�B��&����Т�b��GW6W%�w&�Ru��rr���vF֖���Т&WGW&�G'VS�Т��Т�b��GW6W%�w&�Ru��rr��vV���VRr��Т&WGW&�f�S�Т��ТGW6W$V�����F��&�Ɨ�U���V���7G&����GW6W%�vV�����rr���ТG&V6�DV�����F��&�Ɨ�U���V���7G&����G&V6�E�vV���VRuղvV�����rr���РТ&WGW&�GW6W$V������ТbbG&V6�DV������Тbb�6��V��GW6W$V���G&V6�DV���Ч��ЦgV�F���F��������B�'&�GW6W"���fW Ч�ТG&V6�D�B�G&�҂�7G&����E�UE�v�Bu��rr���ТF��W��f��W%�"�E�UE�vf��u�����d��U%�ĔDDU�B��v�F��2r��v֖�&�Rr����Т�b�F��W���f�R��Т�GG�W7�6U��R�C��ТW��B�t&B&WVW7Br��Т��G&V6�B��F��E�V6�B�G&V6�D�B��Т�b��5�'&��G&V6�B���F�W6W%��F���E�V6�B�GW6W"�G&V6�B���Т�GG�W7�6U��R�C2��ТW��B�tf�&�FFV���Т��FGF6�����5�'&��G&V6�E�vGF6���2u�������G&V6�E�vGF6���2uղF��W����������Т�b��5�'&��FGF6������Т�GG�W7�6U��R�CB��ТW��B�t�Bf��r��Т��G7F�vT���&6V����7G&����FGF6����w7F�vU��u��rr���Т�b�G7F�vT����rr�G7F�vT����7G&����FGF6����w7F�vU��u��rr���Т�GG�W7�6U��R�C��ТW��B�t&B&WVW7Br��Т��GF���F�&V6�E��"�G&V6�D�B��D�$T5D���U$D��vf��2r�D�$T5D���U$D��G7F�vT���Т�b��5����GF����Т�GG�W7�6U��R�CB��ТW��B�t�Bf��r��Т��F��v�����7G&����FGF6����v��v�����u��vF�V��r��ТF66���&Vu�W�6R�r�զףӒ����u��F��v���vF�V��s�Т�VFW"�t6�FV���S�r���7G&����FGF6����v֖�u��vƖ6F���7FWB�G&V�����Т�VFW"�t6�FV��V�F��r�f��6��R�GF����Т�VFW"�t6�FV���7��F���GF6����f�����r�F66���r#�f������DbӅ��r�&wW&���R�F��v����Т�F�VF�B�vGF6�������FVBr��w&V6�E�r�G&V6�D�B�vf��r�F��W�ғ�Т&VFf���GF���ТW��C�Ч��ЦgV�F���F�77e��R�֗�VBGf�R��7G&��Ч�ТGFW�B��7G&���Gf�S�Т�b�&Vu�F6��r��ǃ��#ҥ�ҵ��Rr�GFW�B���Т&WGW&�"r"�GFW�C�Т��&WGW&�GFW�C�Ч��ЦgV�F���F�77e���G7G&V�'&�Gf�W2��f�Ч�ТG6fUf�W2�'&���w�F�77e��Rr�Gf�W2��Т�b�gWF77b�G7G&V�G6fUf�W2���f�R��ТF�&��r'V���W�6WF���}y�zy�z�y�yMy�yBy�Mz�y��y�yz�y�zmy]yz}y]yzRyB�5b���Т����ЦgV�F���F�������B�'&�GW6W"���fW Ч�Т�b��GW6W%�w&�Ru��rr��vF֖���Т�GG�W7�6U��R�C2��ТW��B�tf�&�FFV���Т��Ff�����v�fVV�W�V�W2��v�FR�u���r��r�7bs�Т�VFW"�t6�FV���S�FW�B�7c�6�'6WC�Dbӂr��Т�VFW"�t6�FV���7��F���GF6����f�����r�Ff�����r"r��ТV6��%ǄTeǄ$%Ǆ$b#�ТF�B�f�V�����GWBr�wv"r��Т�b�F�B��f�R��ТW��C�Т���F�77e���F�B��Т}y�zMz�y=y�y]y]yrr�}zy]y"y=y�y]y]yrr�}zy�y�y]zr�}z�y�z-y]yy2r�}z�yz�y�y�y=y�y]y]yrr��}z}y�y-y]z�y�yBr�}zzMzrr�}zy�y]y��}y��yz"r�}y�z-y2�y�zMz�z�y�yr�}y��z�z�zzy�z-yB�z�y�yy]z�r��}y�zMz�z}yzmy�y��}zz�y�rz-y�y�y=y�r�}zy]zmz�yz�yz�y�y�r�}yMz-z�z�y�yMy���ғ�РТf�V6���F���V6�G2��2G&V6�B��ТFFWF����5�'&��G&V6�E�vFWF��u������G&V6�E�vFWF��u���ӰТFV���VR��5�'&��G&V6�E�vV���VRu������G&V6�E�vV���VRu���ӰТF6�����Т�7G&����G&V6�E�v�Bu��rr����F�&W�E��U�&V�7G&����G&V6�E�wG�Ru��rr�����F�7FGW5�&V�7G&����G&V6�E�w7FGW2u��v�rr�����7G&����FV���VU�v��u��rr����7G&����G&V6�E�w&W�E�FRu��rr���ӰТ�b��G&V6�E�wG�Ru��rr���wG&fV�bb�5�'&��G&V6�E�vW�V�U�V�u�������Тf�V6��G&V6�E�vW�V�U�V�u�2F�FVҒ�Т�F�77e���F�B�'&��W&vR�F6����ТG&fV�6FVv���&V�7G&����F�FVղv6FVv��u��rr�����7G&����F�FVղwfV��u��rr����7G&����F�FVղv�V�u��rr����7G&����F�FVղv7W'&V��u��rr����7G&����FFWF���vFW7F��F��u��rr����7G&����FFWF���wG&��W'�Ru��rr���6���G&V6�E�vGF6���2u���Ғ���7G&����G&V6�E�w7V&֗GFVE��uղvF�7����u��rr����7G&����G&V6�E�v7&VFVE�Bu��rr����7G&����G&V6�E�vF֖��FRu��rr���Ғ��Т���V�R�ТF6FVv����G&V6�E�wG�Ru��rr���wfV��6�pТ�fV��6��FVv���&V�7G&����FFWF���wfV��6��FVv��u��rr��Т�vV�&�6FVv���&V�7G&����FFWF���vvV�&�6FVv��u��rr���ТGF&vWB��G&V6�E�wG�Ru��rr���wfV��6�pТ��7G&����FFWF���wfV��6���FRu��rr�Т��7G&����FFWF���w&�7E�W7F�W"u��rr��Т�F�77e���F�B�'&��W&vR�F6����ТF6FVv�����7G&����FFWF���w7WƖW"u��rr����7G&����FFWF���v�V�u��rr����7G&����FFWF���v7W'&V��u��rr���GF&vWB���7G&����FFWF���vFW67&�F��u��rr���6���G&V6�E�vGF6���2u���Ғ���7G&����G&V6�E�w7V&֗GFVE��uղvF�7����u��rr����7G&����G&V6�E�v7&VFVE�Bu��rr����7G&����G&V6�E�vF֖��FRu��rr���Ғ��Т�����F�VF�B�w&V6�G5���FVBr��Тf6�6R�F�B��ТW��C�Ч�
