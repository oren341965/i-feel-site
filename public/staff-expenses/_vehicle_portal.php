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
    return portal_storage_root() . DIRECTORY_SEPARATOR . 'vehicle-monthly' . DIRECTORY_SEPARATOR . $plate
        . DIRECTORY_SEPARATOR . $month . DIRECTORY_SEPARATOR . 'v' . $version;
}

function portal_vehicle_previous_odometer(string $plate): int
{
    $latest = portal_vehicle_latest_monthly($plate);
    if ($latest !== null) {
        return (int) ($latest['odometer'] ?? 0);
    }
    $vehicle = portal_vehicle_directory()[$plate] ?? [];
    return (int) preg_replace('/\D+/', '', (string) ($vehicle['current_km'] ?? ''));
}

function portal_handle_vehicle_monthly_submission(array $user): never
{
    $plate = portal_normalize_vehicle_plate(portal_post('monthly_vehicle_plate', 20));
    $vehicles = portal_vehicles_for_employee($user);
    $vehicle = null;
    foreach ($vehicles as $candidate) {
        if ($plate !== null && hash_equals($plate, (string) ($candidate['plate'] ?? ''))) {
            $vehicle = $candidate;
            break;
        }
    }
    if (!is_array($vehicle)) {
        throw new RuntimeException('הרכב אינו משויך לחשבון העובד המחובר.');
    }

    $odometerRaw = portal_post('monthly_odometer', 12);
    $odometer = ctype_digit($odometerRaw) ? (int) $odometerRaw : 0;
    if ($odometer < 1 || $odometer > 9999999) {
        throw new RuntimeException('יש להזין קילומטראז׳ נוכחי תקין.');
    }
    $previous = portal_vehicle_previous_odometer($plate);
    $decreaseExplanation = portal_post('odometer_decrease_explanation', 600);
    if ($previous > 0 && $odometer < $previous && $decreaseExplanation === '') {
        throw new RuntimeException('הקילומטראז׳ נמוך מהדיווח הקודם. יש להוסיף הסבר כדי להעביר את החריגה לבדיקת מנהל.');
    }

    $treatment = portal_post('monthly_treatment', 30);
    $tireStatus = portal_post('monthly_tires', 30);
    $generalStatus = portal_post('monthly_general_status', 30);
    if (!in_array($treatment, ['none', 'required', 'scheduled', 'completed'], true)
        || !in_array($tireStatus, ['ok', 'check', 'replace', 'urgent'], true)
        || !in_array($generalStatus, ['ok', 'issue', 'soon', 'unsafe'], true)) {
        throw new RuntimeException('יש להשלים את מצב הטיפול, הצמיגים והתקינות הכללית.');
    }
    $issueDescription = portal_post('monthly_issue_description', 1200);
    if (($treatment !== 'none' || $tireStatus !== 'ok' || $generalStatus !== 'ok') && $issueDescription === '') {
        throw new RuntimeException('כאשר מסומנת תקלה או טיפול, יש להוסיף תיאור קצר.');
    }

    $month = portal_vehicle_month_key();
    $all = portal_vehicle_monthly_reports();
    $versions = is_array($all[$plate][$month] ?? null) ? $all[$plate][$month] : [];
    $version = count($versions) + 1;
    $attachments = portal_save_uploads(
        portal_vehicle_monthly_dir($plate, $month, $version),
        $_FILES['monthly_attachments'] ?? []
    );
    $record = [
        'id' => $plate . '-' . $month . '-v' . $version,
        'plate' => $plate,
        'employee_email' => portal_normalize_company_email((string) ($user['email'] ?? '')),
        'month' => $month,
        'version' => $version,
        'odometer' => $odometer,
        'previous_odometer' => $previous,
        'odometer_decrease_explanation' => $decreaseExplanation,
        'treatment_status' => $treatment,
        'treatment_type' => portal_post('monthly_treatment_type', 300),
        'treatment_date' => portal_post('monthly_treatment_date', 10),
        'garage' => portal_post('monthly_garage', 200),
        'tire_status' => $tireStatus,
        'general_status' => $generalStatus,
        'description' => $issueDescription,
        'attachments' => $attachments,
        'manager_review_required' => ($previous > 0 && $odometer < $previous) || $generalStatus !== 'ok' || $tireStatus !== 'ok' || $treatment !== 'none',
        'submitted_at' => gmdate('c'),
    ];
    $versions[] = $record;
    $all[$plate][$month] = $versions;
    portal_json_write(portal_vehicle_monthly_file(), $all);

    $directory = portal_vehicle_directory();
    $directory[$plate]['current_km'] = (string) $odometer;
    $directory[$plate]['last_update'] = date('Y-m-d');
    portal_json_write(portal_vehicle_directory_file(), $directory);
    portal_audit('vehicle_monthly_submitted', ['plate_hash' => hash('sha256', $plate), 'month' => $month, 'version' => $version]);

    if ($generalStatus === 'unsafe') {
        portal_send_mail_with_attachments(
            'oren@' . portal_company_email_domain(),
            'התראה דחופה: רכב אינו בטוח לנסיעה',
            "עובד סימן שהרכב " . portal_format_vehicle_plate($plate) . " אינו בטוח לנסיעה.\r\nיש לבדוק את הדיווח בפורטל העובדים.",
            []
        );
    }
    portal_flash_set('success', 'הדיווח החודשי נשמר בהצלחה. גרסה ' . $version . ' לחודש ' . $month . '.');
    portal_redirect(['tab' => 'my_vehicle']);
}

function portal_vehicle_overall_status(array $vehicle, ?array $monthly): array
{
    if ($monthly === null || (string) ($monthly['month'] ?? '') !== portal_vehicle_month_key()) {
        return ['class' => 'status--missing', 'label' => 'דיווח חודשי חסר'];
    }
    if (($monthly['general_status'] ?? '') === 'unsafe' || ($monthly['tire_status'] ?? '') === 'urgent') {
        return ['class' => 'status--missing', 'label' => 'דורש טיפול דחוף'];
    }
    if (($monthly['manager_review_required'] ?? false) === true) {
        return ['class' => 'status--review', 'label' => 'ממתין לבדיקת מנהל'];
    }
    foreach (['test_due_date', 'compulsory_insurance_due_date'] as $field) {
        $deadline = portal_vehicle_deadline_status((string) ($vehicle[$field] ?? ''));
        if (in_array($deadline['class'], ['status--missing', 'status--review'], true)) {
            return ['class' => 'status--review', 'label' => 'מסמך עומד לפוג'];
        }
    }
    if ((string) ($vehicle['comprehensive_insurance_due_date'] ?? '') !== '') {
        $deadline = portal_vehicle_deadline_status((string) $vehicle['comprehensive_insurance_due_date']);
        if (in_array($deadline['class'], ['status--missing', 'status--review'], true)) {
            return ['class' => 'status--review', 'label' => 'מסמך עומד לפוג'];
        }
    }
    if ((string) ($vehicle['third_party_insurance_due_date'] ?? '') !== '') {
        $deadline = portal_vehicle_deadline_status((string) $vehicle['third_party_insurance_due_date']);
        if (in_array($deadline['class'], ['status--missing', 'status--review'], true)) {
            return ['class' => 'status--review', 'label' => 'מסמך עומד לפוג'];
        }
    }
    return ['class' => 'status--approved', 'label' => 'תקין'];
}

function portal_render_vehicle_monthly_form(array $vehicle): void
{
    $previous = portal_vehicle_previous_odometer((string) $vehicle['plate']);
    ?>
    <section class="form-card vehicle-monthly-card" id="monthly-report">
        <div class="form-card__header"><span class="step">1</span><div><h2>דיווח חודשי קצר</h2><p>הדיווח מיועד לקילומטראז׳ ולמצב הרכב בלבד. מסמכי טסט וביטוח מנוהלים בנפרד.</p></div></div>
        <form method="post" enctype="multipart/form-data" class="field-grid field-grid--2">
            <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
            <input type="hidden" name="action" value="submit_vehicle_monthly">
            <input type="hidden" name="monthly_vehicle_plate" value="<?= portal_h($vehicle['plate']) ?>">
            <label class="field"><span>קילומטראז׳ נוכחי <b>*</b></span><input type="number" name="monthly_odometer" required min="1" max="9999999" inputmode="numeric" placeholder="<?= $previous > 0 ? 'דיווח קודם: ' . $previous : '' ?>"></label>
            <label class="field"><span>אם הקילומטראז׳ ירד — הסבר</span><input type="text" name="odometer_decrease_explanation" maxlength="600"></label>
            <label class="field"><span>טיפולים <b>*</b></span><select name="monthly_treatment" required><option value="none">לא נדרש טיפול</option><option value="required">נדרש טיפול</option><option value="scheduled">נקבע טיפול</option><option value="completed">בוצע טיפול</option></select></label>
            <label class="field"><span>תקינות צמיגים <b>*</b></span><select name="monthly_tires" required><option value="ok">תקינים</option><option value="check">דורשים בדיקה</option><option value="replace">דורשים החלפה</option><option value="urgent">קיימת תקלה דחופה</option></select></label>
            <label class="field"><span>תקינות כללית <b>*</b></span><select name="monthly_general_status" required><option value="ok">הרכב תקין</option><option value="issue">קיימת תקלה שאינה דחופה</option><option value="soon">נדרש טיפול בהקדם</option><option value="unsafe">הרכב אינו בטוח לנסיעה</option></select></label>
            <label class="field"><span>סוג טיפול / תקלה</span><input type="text" name="monthly_treatment_type" maxlength="300"></label>
            <label class="field"><span>תאריך טיפול</span><input type="date" name="monthly_treatment_date"></label>
            <label class="field"><span>מוסך</span><input type="text" name="monthly_garage" maxlength="200"></label>
            <label class="field field--full"><span>תיאור והערות במקרה של תקלה</span><textarea name="monthly_issue_description" rows="3" maxlength="1200"></textarea></label>
            <label class="field field--full"><span>חשבונית, תמונה או מסמך</span><input type="file" name="monthly_attachments[]" multiple accept=".pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif"></label>
            <div class="unsafe-warning field--full">אם הרכב אינו בטוח לנסיעה: אין להמשיך לנסוע ברכב לפני קבלת הנחיה מהמנהל.</div>
            <div class="field--full"><button type="submit" class="button button--primary button--large">שליחת הדיווח החודשי</button></div>
        </form>
    </section>
    <?php
}

function portal_render_my_vehicle_page(array $user, ?array $flash): void
{
    portal_render_flash($flash);
    $vehicles = portal_vehicles_for_employee($user);
    ?>
    <section class="page-heading"><div><p class="eyebrow">רכב חברה</p><h1>הרכב שלי</h1><p>כאן ניתן לצפות בפרטי רכב החברה, במסמכים החשובים ובמועדי החידוש, ולשלוח את הדיווח החודשי הקצר.</p></div><a class="button button--primary button--large" href="#monthly-report">מילוי דיווח חודשי</a></section>
    <?php foreach ($vehicles as $vehicle): ?>
        <?php $latest = portal_vehicle_latest_monthly((string) $vehicle['plate']); $status = portal_vehicle_overall_status($vehicle, $latest); ?>
        <section class="vehicle-hero">
            <div><p class="eyebrow"><?= portal_h(portal_employee_profile($user)['name']) ?></p><h2><?= portal_h($vehicle['make_model'] ?: 'פרטי הדגם טרם הושלמו') ?></h2><b dir="ltr"><?= portal_h(portal_format_vehicle_plate($vehicle['plate'])) ?></b></div>
            <span class="status <?= portal_h($status['class']) ?>"><?= portal_h($status['label']) ?></span>
            <div class="vehicle-hero__stats"><span>טסט<strong><?= portal_h($vehicle['test_due_date'] ?: 'חסר') ?></strong></span><span>ביטוח חובה<strong><?= portal_h($vehicle['compulsory_insurance_due_date'] ?: 'חסר') ?></strong></span><span>ק״מ אחרון<strong><?= portal_h($vehicle['current_km'] ?: 'טרם דווח') ?></strong></span><span>עדכון אחרון<strong><?= portal_h($vehicle['last_update'] ?: 'טרם דווח') ?></strong></span></div>
        </section>
        <?php portal_render_vehicle_monthly_form($vehicle); ?>
        <section class="detail-card vehicle-documents-card"><h2>מסמכי הרכב והנהג</h2>
            <?php $documents = portal_vehicle_documents_for_user($user, (string) $vehicle['plate']); ?>
            <?php if ($documents === []): ?><div class="alert alert--info">עדיין לא נשמרו מסמכים לרכב זה. מנהל יכול להעלות רישיון, טסט וביטוחים במסך רכבי העובדים.</div>
            <?php else: ?><div class="document-list"><?php foreach ($documents as $document): ?><div><strong><?= portal_h($document['type_label'] ?? 'מסמך') ?></strong><span><a class="text-link" href="<?= portal_h(portal_url(['action' => 'vehicle_document_download', 'plate' => $vehicle['plate'], 'document' => $document['id'] ?? ''])) ?>"><?= portal_h($document['name'] ?? '') ?></a></span><span><?= portal_h(($document['expires_on'] ?? '') !== '' ? 'תוקף ' . $document['expires_on'] : 'ללא תוקף') ?></span></div><?php endforeach; ?></div><?php endif; ?>
        </section>
        <section class="detail-card"><h2>היסטוריית דיווחים חודשיים</h2>
            <?php $history = portal_vehicle_reports_for_plate((string) $vehicle['plate']); ?>
            <?php if ($history === []): ?><p class="muted-text">עדיין לא נשלח דיווח חודשי.</p><?php else: ?><div class="history-list"><?php krsort($history); foreach ($history as $month => $versions): $last = is_array($versions) ? end($versions) : []; ?><article class="history-card"><div><span class="history-card__date"><?= portal_h($month) ?></span><h2><?= portal_h((string) ($last['odometer'] ?? '')) ?> ק״מ</h2><code><?= count($versions) ?> גרסאות</code></div><span class="status <?= ($last['manager_review_required'] ?? false) ? 'status--review' : 'status--approved' ?>"><?= ($last['manager_review_required'] ?? false) ? 'לבדיקת מנהל' : 'תקין' ?></span></article><?php endforeach; ?></div><?php endif; ?>
        </section>
    <?php endforeach; ?>
    <?php
}

function portal_vehicle_monthly_reminder_state_file(): string
{
    return portal_storage_root() . DIRECTORY_SEPARATOR . 'security' . DIRECTORY_SEPARATOR . 'vehicle-monthly-reminders.json';
}

function portal_process_vehicle_monthly_reminders(DateTimeImmutable $now, ?callable $mailer = null): array
{
    $mailer ??= static fn(string $email, string $subject, string $body, array $attachments): bool =>
        portal_send_mail_with_attachments($email, $subject, $body, $attachments);
    $local = $now->setTimezone(new DateTimeZone('Asia/Jerusalem'));
    $day = (int) $local->format('j');
    $result = ['sent' => 0, 'missing_flagged' => 0, 'failed' => 0];
    if (!in_array($day, [2, 4, 7, 8], true)) {
        return $result;
    }
    $month = portal_vehicle_month_key($local);
    $state = portal_json_read(portal_vehicle_monthly_reminder_state_file());
    foreach (portal_vehicle_directory() as $plate => $vehicle) {
        $plate = (string) $plate;
        $versions = portal_vehicle_monthly_reports()[$plate][$month] ?? [];
        if (is_array($versions) && $versions !== []) {
            continue;
        }
        $email = portal_normalize_company_email((string) ($vehicle['employee_email'] ?? ''));
        if ($email === null) {
            continue;
        }
        $recipient = $day === 8 ? 'oren@' . portal_company_email_domain() : $email;
        $token = $month . ':' . $day . ':' . $plate;
        if (isset($state[$token])) {
            continue;
        }
        $subject = $day === 8 ? 'דיווח רכב חודשי חסר' : 'תזכורת למילוי דיווח הרכב החודשי';
        $body = ($day === 8 ? 'הדיווח החודשי טרם מולא עבור הרכב ' : 'יש למלא את הדיווח החודשי הקצר עבור הרכב ')
            . portal_format_vehicle_plate($plate) . ".\r\nhttps://i-feel.co.il/staff-expenses/?tab=my_vehicle";
        if ($mailer($recipient, $subject, $body, [])) {
            $state[$token] = gmdate('c');
            $day === 8 ? $result['missing_flagged']++ : $result['sent']++;
        } else {
            $result['failed']++;
        }
    }
    portal_json_write(portal_vehicle_monthly_reminder_state_file(), $state);
    return $result;
}
