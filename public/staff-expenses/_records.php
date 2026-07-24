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
        throw $error;
    }
}

function portal_handle_post(array $user): never
{
    portal_verify_csrf();
    $action = portal_post('action', 60);

    if ($action === 'logout') {
        portal_audit('logout');
        portal_logout();
        portal_redirect();
    }

    if ($action === 'submit_report') {
        $record = portal_build_record($user);
        portal_flash_set('success', 'הדיווח נשמר בהצלחה. מספר הדיווח: ' . $record['id']);
        portal_redirect(['tab' => 'history', 'submitted' => $record['id']]);
    }

    if ($action === 'update_record') {
        portal_require_admin();
        $recordId = portal_post('record_id', 80);
        $record = portal_load_record($recordId);
        if ($record === null) {
            throw new RuntimeException('הדיווח לא נמצא.');
        }
        $status = portal_post('status', 30);
        if (!in_array($status, portal_valid_statuses(), true)) {
            throw new RuntimeException('סטטוס הדיווח אינו תקין.');
        }
        $record['status'] = $status;
        $record['admin_note'] = portal_post('admin_note', 2000);
        $record['updated_at'] = gmdate('c');
        $record['history'][] = [
            'at' => $record['updated_at'],
            'by' => (string) ($user['username'] ?? ''),
            'action' => 'status_updated',
            'status' => $status,
        ];
        portal_save_record($record);
        portal_audit('record_updated', ['record_id' => $recordId, 'status' => $status]);
        portal_flash_set('success', 'סטטוס הדיווח עודכן.');
        portal_redirect(['tab' => 'reports', 'view' => $recordId]);
    }

    if ($action === 'save_user') {
        portal_require_admin();
        $username = strtolower(portal_post('account_username', 40));
        $displayName = portal_post('account_display_name', 120);
        $role = portal_post('account_role', 20) === 'admin' ? 'admin' : 'employee';
        $active = portal_post('account_active', 10) === '1';
        $password = portal_post('account_password', 200);
        $existing = portal_users()[$username] ?? null;

        if ($displayName === '') {
            throw new RuntimeException('חובה להזין שם מלא למשתמש.');
        }
        if ($existing === null && portal_strlen($password) < 12) {
            throw new RuntimeException('למשתמש חדש חובה להגדיר סיסמה באורך 12 תווים לפחות.');
        }
        if ($password !== '' && portal_strlen($password) < 12) {
            throw new RuntimeException('הסיסמה חייבת להכיל לפחות 12 תווים.');
        }
        if ($username === (string) ($user['username'] ?? '') && !$active) {
            throw new RuntimeException('לא ניתן להשבית את המשתמש המחובר.');
        }
        if ($username === (string) ($user['username'] ?? '') && $role !== 'admin') {
            throw new RuntimeException('לא ניתן להסיר מעצמך הרשאת מנהל.');
        }

        $passwordHash = $existing['password_hash'] ?? '';
        if ($password !== '') {
            $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        }
        portal_save_user($username, [
            'display_name' => $displayName,
            'role' => $role,
            'active' => $active,
            'password_hash' => $passwordHash,
        ]);
        portal_audit('user_saved', ['username' => $username, 'role' => $role, 'active' => $active, 'password_changed' => $password !== '']);
        portal_flash_set('success', $existing === null ? 'המשתמש נוצר בהצלחה.' : 'פרטי המשתמש עודכנו.');
        portal_redirect(['tab' => 'users']);
    }

    throw new RuntimeException('הפעולה המבוקשת אינה מוכרת.');
}

function portal_handle_download(array $user): never
{
    if (($user['role'] ?? '') !== 'admin') {
        http_response_code(403);
        exit('Forbidden');
    }
    $recordId = trim((string) ($_GET['id'] ?? ''));
    $index = filter_var($_GET['file'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
    if ($index === false) {
        http_response_code(400);
        exit('Bad request');
    }
    $record = portal_load_record($recordId);
    $attachment = is_array($record['attachments'] ?? null) ? ($record['attachments'][$index] ?? null) : null;
    if (!is_array($record) || !is_array($attachment)) {
        http_response_code(404);
        exit('Not found');
    }
    $storageName = basename((string) ($attachment['storage_name'] ?? ''));
    if ($storageName === '' || $storageName !== (string) ($attachment['storage_name'] ?? '')) {
        http_response_code(400);
        exit('Bad request');
    }
    $path = portal_record_dir($recordId) . DIRECTORY_SEPARATOR . 'files' . DIRECTORY_SEPARATOR . $storageName;
    if (!is_file($path)) {
        http_response_code(404);
        exit('Not found');
    }
    $original = (string) ($attachment['original_name'] ?? 'document');
    $ascii = preg_replace('/[^A-Za-z0-9._-]/', '_', $original) ?: 'document';
    header('Content-Type: ' . ((string) ($attachment['mime'] ?? 'application/octet-stream')));
    header('Content-Length: ' . filesize($path));
    header('Content-Disposition: attachment; filename="' . $ascii . '"; filename*=UTF-8\'\'' . rawurlencode($original));
    portal_audit('attachment_downloaded', ['record_id' => $recordId, 'file' => $index]);
    readfile($path);
    exit;
}

function portal_csv_value(mixed $value): string
{
    $text = (string) $value;
    if (preg_match('/^[\x00-\x20]*[=+\-@]/u', $text)) {
        return "'" . $text;
    }
    return $text;
}

function portal_csv_row($stream, array $values): void
{
    $safeValues = array_map('portal_csv_value', $values);
    if (fputcsv($stream, $safeValues) === false) {
        throw new RuntimeException('לא ניתן היה להשלים את יצוא קובץ ה-CSV.');
    }
}

function portal_handle_export(array $user): never
{
    if (($user['role'] ?? '') !== 'admin') {
        http_response_code(403);
        exit('Forbidden');
    }
    $filename = 'ifeel-expenses-' . gmdate('Y-m-d') . '.csv';
    header('Content-Type: text/csv; charset=UTF-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    echo "\xEF\xBB\xBF";
    $out = fopen('php://output', 'wb');
    if ($out === false) {
        exit;
    }
    portal_csv_row($out, [
        'מספר דיווח', 'סוג דיווח', 'סטטוס', 'שם עובד', 'תאריך דיווח',
        'קטגוריה', 'ספק', 'סכום', 'מטבע', 'יעד / מספר רכב', 'מטרת נסיעה / תיאור',
        'מספר קבצים', 'נשלח על ידי', 'נוצר בתאריך', 'הערת מנהל',
    ]);

    foreach (portal_all_records() as $record) {
        $details = is_array($record['details'] ?? null) ? $record['details'] : [];
        $employee = is_array($record['employee'] ?? null) ? $record['employee'] : [];
        $common = [
            (string) ($record['id'] ?? ''),
            portal_report_type_label((string) ($record['type'] ?? '')),
            portal_status_label((string) ($record['status'] ?? 'new')),
            (string) ($employee['name'] ?? ''),
            (string) ($record['report_date'] ?? ''),
        ];
        if (($record['type'] ?? '') === 'travel' && is_array($record['expense_items'] ?? null)) {
            foreach ($record['expense_items'] as $item) {
                portal_csv_row($out, array_merge($common, [
                    travel_category_label((string) ($item['category'] ?? '')),
                    (string) ($item['vendor'] ?? ''),
                    (string) ($item['amount'] ?? ''),
                    (string) ($item['currency'] ?? ''),
                    (string) ($details['destination'] ?? ''),
                    (string) ($details['trip_purpose'] ?? ''),
                    count($record['attachments'] ?? []),
                    (string) ($record['submitted_by']['display_name'] ?? ''),
                    (string) ($record['created_at'] ?? ''),
                    (string) ($record['admin_note'] ?? ''),
                ]));
            }
        } else {
            $category = ($record['type'] ?? '') === 'vehicle'
                ? vehicle_category_label((string) ($details['vehicle_category'] ?? ''))
                : general_category_label((string) ($details['general_category'] ?? ''));
            $target = ($record['type'] ?? '') === 'vehicle'
                ? (string) ($details['vehicle_plate'] ?? '')
                : (string) ($details['project_customer'] ?? '');
            portal_csv_row($out, array_merge($common, [
                $category,
                (string) ($details['supplier'] ?? ''),
                (string) ($details['amount'] ?? ''),
                (string) ($details['currency'] ?? ''),
                $target,
                (string) ($details['description'] ?? ''),
                count($record['attachments'] ?? []),
                (string) ($record['submitted_by']['display_name'] ?? ''),
                (string) ($record['created_at'] ?? ''),
                (string) ($record['admin_note'] ?? ''),
            ]));
        }
    }
    portal_audit('records_exported');
    fclose($out);
    exit;
}
