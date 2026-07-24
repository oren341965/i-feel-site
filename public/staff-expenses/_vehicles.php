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
    } catch (Throwable) {
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
        if ($makeModel === '') {
            throw new RuntimeException('שורה ' . $row . ': חובה להזין יצרן ודגם.');
        }
        if ($year !== 0 && ($year < 1980 || $year > (int) date('Y') + 1)) {
            throw new RuntimeException('שורה ' . $row . ': שנת הרכב אינה תקינה.');
        }
        if (!$sourceFormat && $testDueDate === '' && $insuranceDueDate === '') {
            throw new RuntimeException('שורה ' . $row . ': יש להזין לפחות תאריך טסט או תאריך חידוש ביטוח.');
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
            'last_update' => $sourceFormat ? portal_substr((string) ($columns[19] ?? ''), 0, 30) : '',
            'notes' => portal_substr((string) ($columns[$sourceFormat ? 18 : 8] ?? ''), 0, 600),
            'updated_at' => gmdate('c'),
        ];
    }

    if ($entries === []) {
        throw new RuntimeException('לא נמצאו שורות רכב תקינות.');
    }
    return $entries;
}

function portal_import_vehicle_directory(string $text): int
{
    $incoming = portal_parse_vehicle_directory_text($text);
    $vehicles = portal_vehicle_directory();
    foreach ($incoming as $plate => $vehicle) {
        $vehicles[$plate] = $vehicle;
    }
    portal_json_write(portal_vehicle_directory_file(), $vehicles);
    return count($incoming);
}

function portal_vehicles_for_employee(array $user): array
{
    $email = portal_normalize_company_email((string) ($user['email'] ?? ''));
    if ($email === null) {
        return [];
    }
    return array_values(array_filter(
        portal_vehicle_directory(),
        static fn(array $vehicle): bool => hash_equals($email, (string) ($vehicle['employee_email'] ?? ''))
    ));
}

function portal_vehicle_deadline_status(string $date, ?DateTimeImmutable $now = null): array
{
    if ($date === '') {
        return ['label' => 'לא הוזן', 'class' => 'status--review', 'days' => null];
    }
    $today = ($now ?? new DateTimeImmutable('now', new DateTimeZone('Asia/Jerusalem')))
        ->setTimezone(new DateTimeZone('Asia/Jerusalem'))
        ->setTime(0, 0);
    $due = new DateTimeImmutable($date . ' 00:00:00', new DateTimeZone('Asia/Jerusalem'));
    $days = (int) $today->diff($due)->format('%r%a');
    if ($days < 0) {
        return ['label' => 'באיחור של ' . abs($days) . ' ימים', 'class' => 'status--missing', 'days' => $days];
    }
    if ($days === 0) {
        return ['label' => 'היום', 'class' => 'status--missing', 'days' => 0];
    }
    if ($days <= 30) {
        return ['label' => 'בעוד ' . $days . ' ימים', 'class' => 'status--new', 'days' => $days];
    }
    return ['label' => 'בתוקף', 'class' => 'status--approved', 'days' => $days];
}

function portal_vehicle_source_status(string $sourceStatus): array
{
    $sourceStatus = trim($sourceStatus);
    if ($sourceStatus === '') {
        return ['label' => 'חסר תאריך מדויק', 'class' => 'status--review', 'days' => null];
    }
    if (str_contains($sourceStatus, 'לא תקף')) {
        return ['label' => $sourceStatus, 'class' => 'status--missing', 'days' => null];
    }
    return ['label' => $sourceStatus, 'class' => 'status--approved', 'days' => null];
}

function portal_vehicle_notification_state_file(): string
{
    return portal_storage_root() . DIRECTORY_SEPARATOR . 'security' . DIRECTORY_SEPARATOR . 'vehicle-notifications.json';
}

function portal_process_vehicle_notifications(
    DateTimeImmutable $now,
    ?callable $mailer = null
): array {
    $mailer ??= static fn(string $email, string $subject, string $body, array $attachments): bool =>
        portal_send_mail_with_attachments($email, $subject, $body, $attachments);
    $localNow = $now->setTimezone(new DateTimeZone('Asia/Jerusalem'))->setTime(0, 0);
    $thresholds = [30, 14, 7, 1, 0, -1, -7, -30];
    $state = portal_json_read(portal_vehicle_notification_state_file());
    $employees = portal_employee_directory();
    $result = ['reminders_sent' => 0, 'emails_sent' => 0, 'failed' => 0];
    $changed = false;

    foreach (portal_vehicle_directory() as $plate => $vehicle) {
        $plate = (string) $plate;
        $employeeEmail = (string) ($vehicle['employee_email'] ?? '');
        $employee = $employees[$employeeEmail] ?? null;
        if (!is_array($employee)) {
            continue;
        }
        foreach ([
            'license_due_date' => 'חידוש רישיון',
            'test_due_date' => 'טסט שנתי',
            'compulsory_insurance_due_date' => 'חידוש ביטוח חובה',
            'comprehensive_insurance_due_date' => 'חידוש ביטוח מקיף',
        ] as $field => $label) {
            $date = (string) ($vehicle[$field] ?? '');
            if ($date === '') {
                continue;
            }
            $due = new DateTimeImmutable($date . ' 00:00:00', new DateTimeZone('Asia/Jerusalem'));
            $days = (int) $localNow->diff($due)->format('%r%a');
            if (!in_array($days, $thresholds, true)) {
                continue;
            }

            $timing = $days < 0
                ? 'המועד עבר לפני ' . abs($days) . ' ימים'
                : ($days === 0 ? 'המועד חל היום' : 'המועד יחול בעוד ' . $days . ' ימים');
            $subject = 'תזכורת רכב: ' . $label . ' לרכב ' . portal_format_vehicle_plate($plate);
            $body = implode("\r\n", [
                'שלום ' . (string) ($employee['name'] ?? '') . ',',
                '',
                'זוהי תזכורת לגבי רכב החברה המשויך אליך:',
                'רכב: ' . (string) ($vehicle['make_model'] ?? '') . ' · ' . portal_format_vehicle_plate($plate),
                $label . ': ' . $due->format('d/m/Y'),
                $timing . '.',
                '',
                'פרטי הרכב המלאים מופיעים באזור העובדים:',
                'https://i-feel.co.il/staff-expenses/',
                '',
                'I Feel',
            ]);
            $eventToken = $plate . ':' . $field . ':' . $date . ':' . $days;
            $sentForEvent = false;
            foreach ([$employeeEmail, 'oren@' . portal_company_email_domain()] as $recipient) {
                $token = $eventToken . ':' . $recipient;
                if (isset($state[$token])) {
                    continue;
                }
                if ($mailer($recipient, $subject, $body, [])) {
                    $state[$token] = gmdate('c');
                    $result['emails_sent']++;
                    $changed = true;
                    $sentForEvent = true;
                } else {
                    $result['failed']++;
                }
            }
            if ($sentForEvent) {
                $result['reminders_sent']++;
            }
        }
    }

    if ($changed) {
        portal_json_write(portal_vehicle_notification_state_file(), $state);
    }
    return $result;
}

function portal_render_vehicle_deadline(
    string $label,
    string $date,
    string $displayLabel = '',
    string $sourceStatus = ''
): void
{
    $status = $date !== '' ? portal_vehicle_deadline_status($date) : portal_vehicle_source_status($sourceStatus);
    $displayDate = $date !== ''
        ? (new DateTimeImmutable($date))->format('d/m/Y')
        : ($displayLabel !== '' ? $displayLabel : 'לא הוזן');
    ?>
    <div class="vehicle-deadline">
        <span><?= portal_h($label) ?></span>
        <strong><?= portal_h($displayDate) ?></strong>
        <span class="status <?= portal_h($status['class']) ?>"><?= portal_h($status['label']) ?></span>
    </div>
    <?php
}

function portal_render_employee_vehicle_card(array $user): void
{
    $vehicles = portal_vehicles_for_employee($user);
    if ($vehicles === []) {
        return;
    }
    ?>
    <section class="vehicle-panel" aria-label="פרטי הרכב שלי">
        <div class="vehicle-panel__heading">
            <span class="vehicle-panel__icon" aria-hidden="true">🚙</span>
            <div><p class="eyebrow">הרכב שלי</p><h2>פרטי רכב ותוקף מסמכים</h2></div>
        </div>
        <div class="vehicle-grid">
            <?php foreach ($vehicles as $vehicle): ?>
                <article class="vehicle-card">
                    <div class="vehicle-card__title">
                        <div><strong><?= portal_h($vehicle['make_model']) ?></strong><?php if ((int) $vehicle['year'] > 0): ?><span>שנת <?= (int) $vehicle['year'] ?></span><?php endif; ?></div>
                        <b dir="ltr"><?= portal_h(portal_format_vehicle_plate($vehicle['plate'])) ?></b>
                    </div>
                    <div class="vehicle-deadlines">
                        <?php portal_render_vehicle_deadline('רישיון', $vehicle['license_due_date'], $vehicle['license_due_label'], $vehicle['license_status']); ?>
                        <?php portal_render_vehicle_deadline('טסט שנתי', $vehicle['test_due_date'], $vehicle['test_due_label'], $vehicle['test_status']); ?>
                        <?php portal_render_vehicle_deadline('ביטוח חובה', $vehicle['compulsory_insurance_due_date'], $vehicle['compulsory_insurance_due_label'], $vehicle['compulsory_insurance_status']); ?>
                        <?php portal_render_vehicle_deadline('ביטוח מקיף', $vehicle['comprehensive_insurance_due_date'], $vehicle['comprehensive_insurance_due_label'], $vehicle['comprehensive_insurance_status']); ?>
                    </div>
                    <?php if ($vehicle['current_km'] !== ''): ?><p class="vehicle-card__meta">קילומטראז' בעדכון האחרון: <b><?= portal_h(number_format((float) preg_replace('/[^\d.]/', '', $vehicle['current_km']))) ?></b></p><?php endif; ?>
                    <?php if ($vehicle['last_update'] !== ''): ?><p class="vehicle-card__meta">עדכון אחרון: <?= portal_h($vehicle['last_update']) ?></p><?php endif; ?>
                    <?php if ($vehicle['insurance_company'] !== '' || $vehicle['policy_number'] !== ''): ?>
                        <p class="vehicle-card__meta">ביטוח: <?= portal_h(trim($vehicle['insurance_company'] . ($vehicle['policy_number'] !== '' ? ' · פוליסה ' . $vehicle['policy_number'] : ''))) ?></p>
                    <?php endif; ?>
                    <?php if ($vehicle['notes'] !== ''): ?><p class="vehicle-card__meta"><?= portal_h($vehicle['notes']) ?></p><?php endif; ?>
                </article>
            <?php endforeach; ?>
        </div>
    </section>
    <?php
}

function portal_render_vehicle_admin(?array $flash): void
{
    portal_render_flash($flash);
    $vehicles = portal_vehicle_directory();
    $employees = portal_employee_directory();
    ?>
    <section class="page-heading page-heading--compact">
        <div>
            <p class="eyebrow">צי רכב פרטי</p>
            <h1>רכבי עובדים ותזכורות</h1>
            <p>כל רכב משויך לעובד לפי הדוא"ל הארגוני. המידע נשמר מחוץ לאתר הציבורי, וייבוא חוזר מעדכן ומוסיף בלי למחוק רכבים אחרים.</p>
        </div>
        <div class="total-card"><span>רכבים שנשמרו</span><strong><?= count($vehicles) ?></strong></div>
    </section>

    <section class="detail-card">
        <h2>רכבים במערכת</h2>
        <div class="table-wrap">
            <table class="records-table">
                <thead><tr><th>עובד</th><th>רכב</th><th>מספר</th><th>רישיון</th><th>טסט</th><th>ביטוח חובה</th><th>ביטוח מקיף</th><th>ק"מ / עדכון</th></tr></thead>
                <tbody>
                <?php if ($vehicles === []): ?>
                    <tr><td colspan="8" class="empty-cell">עדיין לא נשמרו רכבים.</td></tr>
                <?php else: ?>
                    <?php foreach ($vehicles as $vehicle): ?>
                        <?php $employee = $employees[$vehicle['employee_email']] ?? ['name' => '', 'email' => $vehicle['employee_email']]; ?>
                        <tr>
                            <td><strong><?= portal_h($employee['name']) ?></strong><small><?= portal_h($employee['email']) ?></small></td>
                            <td><?= portal_h($vehicle['make_model']) ?><?= (int) $vehicle['year'] > 0 ? ' · ' . (int) $vehicle['year'] : '' ?></td>
                            <td dir="ltr"><?= portal_h(portal_format_vehicle_plate($vehicle['plate'])) ?></td>
                            <td><?php portal_render_vehicle_deadline('רישיון', $vehicle['license_due_date'], $vehicle['license_due_label'], $vehicle['license_status']); ?></td>
                            <td><?php portal_render_vehicle_deadline('טסט', $vehicle['test_due_date'], $vehicle['test_due_label'], $vehicle['test_status']); ?></td>
                            <td><?php portal_render_vehicle_deadline('חובה', $vehicle['compulsory_insurance_due_date'], $vehicle['compulsory_insurance_due_label'], $vehicle['compulsory_insurance_status']); ?></td>
                            <td><?php portal_render_vehicle_deadline('מקיף', $vehicle['comprehensive_insurance_due_date'], $vehicle['comprehensive_insurance_due_label'], $vehicle['comprehensive_insurance_status']); ?></td>
                            <td><?= $vehicle['current_km'] !== '' ? portal_h($vehicle['current_km']) . ' ק"מ' : '—' ?><?= $vehicle['last_update'] !== '' ? '<br><small>' . portal_h($vehicle['last_update']) . '</small>' : '' ?></td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
                </tbody>
            </table>
        </div>
    </section>

    <section class="detail-card">
        <h2>ייבוא או עדכון רכבים</h2>
        <p>אפשר להדביק ישירות את עמודות A–V מהגיליון "תקינות רכבים", או להשתמש בתבנית המצומצמת. לפני הייבוא, העובד חייב להופיע במסך "עובדים וימי הולדת".</p>
        <form method="post" class="form-grid">
            <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
            <input type="hidden" name="action" value="import_vehicle_directory">
            <label class="field field--full">
                <span>נתוני רכבים</span>
                <textarea name="vehicle_directory_text" rows="9" maxlength="60000" required placeholder="דוא״ל עובד	מספר רכב	יצרן ודגם	שנתון	תוקף טסט	תוקף ביטוח	חברת ביטוח	מספר פוליסה	הערות"></textarea>
            </label>
            <p class="form-note field--full">המערכת מזהה אוטומטית את מבנה הגיליון הקיים. בתבנית המצומצמת העמודות הן: דוא"ל עובד, מספר רכב, יצרן ודגם, שנתון, תוקף טסט, תוקף ביטוח, חברת ביטוח, מספר פוליסה והערות.</p>
            <div class="field--full"><button type="submit" class="button button--primary">שמירת הרכבים</button></div>
        </form>
    </section>

    <section class="detail-card">
        <h2>מועדי תזכורת אוטומטיים</h2>
        <p>העובד ואורן יקבלו דוא"ל על רישיון, טסט, ביטוח חובה וביטוח מקיף — 30, 14, 7 ויום אחד לפני המועד, ביום המועד, וכן יום, שבוע וחודש לאחר מועד שחלף. תזכורת נשלחת רק כאשר בגיליון קיים תאריך מלא ומדויק.</p>
    </section>
    <?php
}
