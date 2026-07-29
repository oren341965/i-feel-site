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
    throw new RuntimeException('×©×•×¨×” ' . $row . ': ×ª××¨×™×š ×”×˜×¡×˜ ××• ×”×‘×™×˜×•×— ××™× ×• ×ª×§×™×Ÿ. ×™×© ×œ×”×©×ª×ž×© ×‘×¤×•×¨×ž×˜ DD/MM/YYYY ××• YYYY-MM-DD.');
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
        throw new RuntimeException('×™×© ×œ×”×“×‘×™×§ ×œ×¤×—×•×ª ×©×•×¨×ª ×¨×›×‘ ××—×ª.');
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
        if ($lineNumber === 0 && trim($first) === '×©×' && trim($second) === '××™×ž×™×™×œ') {
            $sourceFormat = true;
            continue;
        }
        if ($lineNumber === 0 && (
            str_contains($first, 'email')
            || str_contains($first, '×“×•×')
            || str_contains($first, '×ž×™×™×œ')
            || str_contains($second, 'plate')
            || str_contains($second, '×ž×¡×¤×¨ ×¨×›×‘')
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
            throw new RuntimeException('×©×•×¨×” ' . $row . ': ×“×•×"×œ ×”×¢×•×‘×“ ××™× ×• ×§×™×™× ×‘×¡×¤×¨ ×”×¢×•×‘×“×™×.');
        }
        if ($plate === null) {
            throw new RuntimeException('×©×•×¨×” ' . $row . ': ×ž×¡×¤×¨ ×”×¨×›×‘ ×—×™×™×‘ ×œ×”×›×™×œ 7 ××• 8 ×¡×¤×¨×•×ª.');
        }
        if ($year !== 0 && ($year < 1980 || $year > (int) date('Y') + 1)) {
            throw new RuntimeException('×©×•×¨×” ' . $row . ': ×©× ×ª ×”×¨×›×‘ ××™× ×” ×ª×§×™× ×”.');
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
        throw new RuntimeException('×œ× × ×ž×¦××• ×©×•×¨×•×ª ×¨×›×‘ ×ª×§×™× ×•×ª.');
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

function portal_save_employee_vehicle(array $user, array $input): array
{
    $email = portal_normalize_company_email((string) ($user['email'] ?? ''));
    if ($email === null) {
        throw new RuntimeException('×œ× × ×ž×¦××” ×›×ª×•×‘×ª ×“×•××´×œ ×ž××•×ž×ª×ª ×œ×¢×•×‘×“.');
    }

    $existingPlate = portal_normalize_vehicle_plate((string) ($input['existing_plate'] ?? ''));
    $plate = portal_normalize_vehicle_plate((string) ($input['plate'] ?? ''));
    $makeModel = trim((string) ($input['make_model'] ?? ''));
    $yearRaw = trim((string) ($input['year'] ?? ''));
    $year = $yearRaw === '' ? 0 : (int) $yearRaw;
    $testDueDate = portal_normalize_vehicle_date((string) ($input['test_due_date'] ?? ''), 1);
    $insuranceDueDate = portal_normalize_vehicle_date((string) ($input['insurance_due_date'] ?? ''), 1);

    if ($plate === null) {
        throw new RuntimeException('×ž×¡×¤×¨ ×”×¨×›×‘ ×—×™×™×‘ ×œ×”×›×™×œ 7 ××• 8 ×¡×¤×¨×•×ª.');
    }
    if ($makeModel === '') {
        throw new RuntimeException('×™×© ×œ×”×–×™×Ÿ ×™×¦×¨×Ÿ ×•×“×’× ×©×œ ×”×¨×›×‘.');
    }
    if ($year !== 0 && ($year < 1980 || $year > (int) date('Y') + 1)) {
        throw new RuntimeException('×©× ×ª ×”×¨×›×‘ ××™× ×” ×ª×§×™× ×”.');
    }
    if ($testDueDate === '' || $insuranceDueDate === '') {
        throw new RuntimeException('×™×© ×œ×”×–×™×Ÿ ×ª××¨×™×š ×˜×¡×˜ ×•×ª××¨×™×š ×—×™×“×•×© ×‘×™×˜×•×—.');
    }

    $vehicles = portal_vehicle_directory();
    if ($existingPlate !== null) {
        $existing = $vehicles[$existingPlate] ?? null;
        if (!is_array($existing) || !hash_equals($email, (string) ($existing['employee_email'] ?? ''))) {
            throw new RuntimeException('×”×¨×›×‘ ×”×ž×‘×•×§×© ××™× ×• ×ž×©×•×™×š ×œ×—×©×‘×•×Ÿ ×”×¢×•×‘×“ ×”×ž×—×•×‘×¨.');
        }
        if (!hash_equals($existingPlate, $plate)) {
            throw new RuntimeException('×œ× × ×™×ª×Ÿ ×œ×©× ×•×ª ×ž×¡×¤×¨ ×¨×›×‘ ×§×™×™×. ×™×© ×œ×¤× ×•×ª ×œ××•×¨×Ÿ ×‘×ž×§×¨×” ×©×œ ×”×—×œ×¤×ª ×¨×›×‘.');
        }
    } elseif (isset($vehicles[$plate])) {
        throw new RuntimeException('×ž×¡×¤×¨ ×”×¨×›×‘ ×›×‘×¨ ×§×™×™× ×‘×ž×¢×¨×›×ª ×•×ž×©×•×™×š ×œ×¢×•×‘×“ ××—×¨.');
    }

    $existing = $vehicles[$plate] ?? [];
    $vehicles[$plate] = array_merge($existing, [
        'plate' => $plate,
        'employee_email' => $email,
        'make_model' => portal_substr($makeModel, 0, 160),
        'year' => $year,
        'test_due_date' => $testDueDate,
        'test_due_label' => $testDueDate,
        'test_status' => '',
        'insurance_due_date' => $insuranceDueDate,
        'compulsory_insurance_due_date' => $insuranceDueDate,
        'compulsory_insurance_due_label' => $insuranceDueDate,
        'compulsory_insurance_status' => '',
        'insurance_company' => portal_substr(trim((string) ($input['insurance_company'] ?? '')), 0, 160),
        'policy_number' => portal_substr(trim((string) ($input['policy_number'] ?? '')), 0, 160),
        'notes' => portal_substr(trim((string) ($input['notes'] ?? '')), 0, 600),
        'last_update' => date('Y-m-d'),
        'updated_at' => gmdate('c'),
    ]);
    portal_json_write(portal_vehicle_directory_file(), $vehicles);
    portal_audit('employee_vehicle_saved', [
        'email_hash' => hash('sha256', $email),
        'plate_hash' => hash('sha256', $plate),
    ]);
    return $vehicles[$plate];
}

function portal_vehicle_deadline_status(string $date, ?DateTimeImmutable $now = null): array
{
    if ($date === '') {
        return ['label' => '×œ× ×”×•×–×Ÿ', 'class' => 'status--review', 'days' => null];
    }
    $today = ($now ?? new DateTimeImmutable('now', new DateTimeZone('Asia/Jerusalem')))
        ->setTimezone(new DateTimeZone('Asia/Jerusalem'))
        ->setTime(0, 0);
    $due = new DateTimeImmutable($date . ' 00:00:00×Nx¶‰žËkºwµçC^g^{^g^tœ4(€€€€€€€€€€€€€€€€è€ ‘‘…åÌ€ôôô€À€ü€Ÿ^S^{^W^‹^Lƒ^_^pƒ^S^g^W^tœ€è€Ÿ^S^{^W^‹^Lƒ^g^_^W^pƒ^G^‹^W^L€œ€¸€‘‘…åÌ€¸€œƒ^g^{^g^tœ¤ì4(€€€€€€€€€€€€‘ÍÕ‰©•Ð€ô€Ÿ^«^[^o^W^£^¨ƒ^£^o^Dè€œ€¸€‘±…‰•°€¸€œƒ^s^£^o^D€œ€¸Á½ÉÑ…±}™½Éµ…Ñ}Ù•¡¥±•}Á±…Ñ” ‘Á±…Ñ”¤ì4(€€€€€€€€€€€€‘‰½‘ä€ô¥µÁ±½‘” ‰qÉq¸ˆ°l4(€€€€€€€€€€€€€€€€Ÿ^§^s^W^t€œ€¸€¡ÍÑÉ¥¹œ¤€ ‘•µÁ±½å••l¹…µ”t€üü€œœ¤€¸€œ°œ°4(€€€€€€€€€€€€€€€€œœ°4(€€€€€€€€€€€€€€€€Ÿ^[^W^S^dƒ^«^[^o^W^£^¨ƒ^s^K^G^dƒ^£^o^Dƒ^S^_^G^£^Pƒ^S^{^§^W^g^hƒ^C^s^g^hèœ°4(€€€€€€€€€€€€€€€€Ÿ^£^o^Dè€œ€¸€¡ÍÑÉ¥¹œ¤€ ‘Ù•¡¥±•lµ…­•}µ½‘•°t€üü€œœ¤€¸€œƒ
Ü€œ€¸Á½ÉÑ…±}™½Éµ…Ñ}Ù•¡¥±•}Á±…Ñ” ‘Á±…Ñ”¤°4(€€€€€€€€€€€€€€€€‘±…‰•°€¸€œè€œ€¸€‘‘Õ”´ù™½Éµ…Ð ½´½dœ¤°4(€€€€€€€€€€€€€€€€‘Ñ¥µ¥¹œ€¸€œ¸œ°4(€€€€€€€€€€€€€€€€œœ°4(€€€€€€€€€€€€€€€€Ÿ^“^£^c^dƒ^S^£^o^Dƒ^S^{^s^C^g^tƒ^{^W^“^g^‹^g^tƒ^G^C^[^W^ ƒ^S^‹^W^G^O^g^tèœ°4(€€€€€€€€€€€€€€€€¡ÑÑÁÌè¼½¤µ™••°¹¼¹¥°½ÍÑ…™˜µ•áÁ•¹Í•Ì¼œ°4(€€€€€€€€€€€€€€€€œœ°4(€€€€€€€€€€€€€€€€$••°œ°4(€€€€€€€€€€€t¤ì4(€€€€€€€€€€€€‘•Ù•¹ÑQ½­•¸€ô€‘Á±…Ñ”€¸€œèœ€¸€‘™¥•±€¸€œèœ€¸€‘‘…Ñ”€¸€œèœ€¸€‘‘…åÌì4(€€€€€€€€€€€€‘Í•¹Ñ½ÉÙ•¹Ð€ô™…±Í”ì4(€€€€€€€€€€€™½É•… €¡l‘•µÁ±½å••µ…¥°°€½É•¹ œ€¸Á½ÉÑ…±}½µÁ…¹å}•µ…¥±}‘½µ…¥¸ ¥t…Ì€‘É•¥Á¥•¹Ð¤ì4(€€€€€€€€€€€€€€€€‘Ñ½­•¸€ô€‘•Ù•¹ÑQ½­•¸€¸€œèœ€¸€‘É•¥Á¥•¹Ðì4(€€€€€€€€€€€€€€€¥˜€¡¥ÍÍ•Ð ‘ÍÑ…Ñ•l‘Ñ½­•¹t¤¤ì4(€€€€€€€€€€€€€€€€€€€½¹Ñ¥¹Õ”ì4(€€€€€€€€€€€€€€€ô4(€€€€€€€€€€€€€€€¥˜€ ‘µ…¥±•È ‘É•¥Á¥•¹Ð°€‘ÍÕ‰©•Ð°€‘‰½‘ä°mt¤¤ì4(€€€€€€€€€€€€€€€€€€€€‘ÍÑ…Ñ•l‘Ñ½­•¹t€ôµ‘…Ñ” Œœ¤ì4(€€€€€€€€€€€€€€€€€€€€‘É•ÍÕ±Ñl•µ…¥±Í}Í•¹Ðt¬¬ì4(€€€€€€€€€€€€€€€€€€€€‘¡…¹•€ôÑÉÕ”ì4(€€€€€€€€€€€€€€€€€€€€‘Í•¹Ñ½ÉÙ•¹Ð€ôÑÉÕ”ì4(€€€€€€€€€€€€€€€ô•±Í”ì4(€€€€€€€€€€€€€€€€€€€€‘É•ÍÕ±Ñl™…¥±•t¬¬ì4(€€€€€€€€€€€€€€€ô4(€€€€€€€€€€€ô4(€€€€€€€€€€€¥˜€ ‘Í•¹Ñ½ÉÙ•¹Ð¤ì4(€€€€€€€€€€€€€€€€‘É•ÍÕ±ÑlÉ•µ¥¹‘•ÉÍ}Í•¹Ðt¬¬ì4(€€€€€€€€€€€ô4(€€€€€€€ô4(€€€ô4(4(€€€¥˜€ ‘¡…¹•¤ì4(€€€€€€€Á½ÉÑ…±}©Í½¹}ÝÉ¥Ñ”¡Á½ÉÑ…±}Ù•¡¥±•}¹½Ñ¥™¥…Ñ¥½¹}ÍÑ…Ñ•}™¥±” ¤°€‘ÍÑ…Ñ”¤ì4(€€€ô4(€€€É•ÑÕÉ¸€‘É•ÍÕ±Ðì4)ô4(4)™Õ¹Ñ¥½¸Á½ÉÑ…±}É•¹‘•É}Ù•¡¥±•}‘•…‘±¥¹” (€€€ÍÑÉ¥¹œ€‘±…‰•°°4(€€€ÍÑÉ¥¹œ€‘‘…Ñ”°4(€€€ÍÑÉ¥¹œ€‘‘¥ÍÁ±…å1…‰•°€ô€œœ°4(€€€ÍÑÉ¥¹œ€‘Í½ÕÉ•MÑ…ÑÕÌ€ô€œœ4(¤èÙ½¥4)ì4(€€€€‘ÍÑ…ÑÕÌ€ô€‘‘…Ñ”€„ôô€œœ€üÁ½ÉÑ…±}Ù•¡¥±•}‘•…‘±¥¹•}ÍÑ…ÑÕÌ ‘‘…Ñ”¤€èÁ½ÉÑ…±}Ù•¡¥±•}Í½ÕÉ•}ÍÑ…ÑÕÌ ‘Í½ÕÉ•MÑ…ÑÕÌ¤ì4(€€€€‘‘¥ÍÁ±…å…Ñ”€ô€‘‘…Ñ”€„ôô€œœ4(€€€€€€€€ü€¡¹•Ü…Ñ•Q¥µ•%µµÕÑ…‰±” ‘‘…Ñ”¤¤´ù™½Éµ…Ð ½´½dœ¤4(€€€€€€€€è€ ‘‘¥ÍÁ±…å1…‰•°€„ôô€œœ€ü€‘‘¥ÍÁ±…å1…‰•°€è€Ÿ^s^@ƒ^S^W^[^|œ¤ì4(€€€€üø4(€€€€ñ‘¥Ø±…ÍÌô‰Ù•¡¥±”µ‘•…‘±¥¹”ˆø4(€€€€€€€€ñÍÁ…¸øðüôÁ½ÉÑ…±}  ‘±…‰•°¤€üøð½ÍÁ…¸ø4(€€€€€€€€ñÍÑÉ½¹œøðüôÁ½ÉÑ…±}  ‘‘¥ÍÁ±…å…Ñ”¤€üøð½ÍÑÉ½¹œø4(€€€€€€€€ñÍÁ…¸±…ÍÌô‰ÍÑ…ÑÕÌ€ðüôÁ½ÉÑ…±}  ‘ÍÑ…ÑÕÍl±…ÍÌt¤€üøˆøðüôÁ½ÉÑ…±}  ‘ÍÑ…ÑÕÍl±…‰•°t¤€üøð½ÍÁ…¸ø4(€€€€ð½‘¥Øø4(€€€€ðýÁ¡À4)ô()™Õ¹Ñ¥½¸Á½ÉÑ…±}É•¹‘•É}½ÁÑ¥½¹…±}Ù•¡¥±•}‘•…‘±¥¹”¡ÍÑÉ¥¹œ€‘±…‰•°°ÍÑÉ¥¹œ€‘‘…Ñ”¤èÙ½¥)ì(€€€¥˜€ ‘‘…Ñ”€„ôô€œœ¤ì(€€€€€€€Á½ÉÑ…±}É•¹‘•É}Ù•¡¥±•}‘•…‘±¥¹” ‘±…‰•°°€‘‘…Ñ”°€‘‘…Ñ”°€œœ¤ì(€€€€€€€É•ÑÕÉ¸ì(€€€ô(€€€€üø(€€€€ñ‘¥Ø±…ÍÌô‰Ù•¡¥±”µ‘•…‘±¥¹”ˆø(€€€€€€€€ñÍÁ…¸øðüôÁ½ÉÑ…±}  ‘±…‰•°¤€üøð½ÍÁ…¸ø(€€€€€€€€ñÍÑÉ½¹œû^s^@ƒ^ƒ^O^£^¤€¼ƒ^s^@ƒ^S^W^[^|ð½ÍÑÉ½¹œø(€€€€€€€€ñÍÁ…¸±…ÍÌô‰ÍÑ…ÑÕÌÍÑ…ÑÕÌ´µ…ÁÁÉ½Ù•ˆû^C^W^“^›^g^W^ƒ^s^dð½ÍÁ…¸ø(€€€€ð½‘¥Øø(€€€€ðýÁ¡À)ô(4)™Õ¹Ñ¥½¸Á½ÉÑ…±}É•¹‘•É}•µÁ±½å••}Ù•¡¥±•}…É¡…ÉÉ…ä€‘ÕÍ•È¤èÙ½¥4)ì4(€€€€‘Ù•¡¥±•Ì€ôÁ½ÉÑ…±}Ù•¡¥±•Í}™½É}•µÁ±½å•” ‘ÕÍ•È¤ì4(€€€¥˜€ ‘Ù•¡¥±•Ì€ôôômt¤ì4(€€€€€€€É•ÑÕÉ¸ì4(€€€ô4(€€€€üø4(€€€€ñÍ•Ñ¥½¸±…ÍÌô‰Ù•¡¥±”µÁ…¹•°ˆ…É¥„µ±…‰•°ô‹^“^£^c^dƒ^S^£^o^Dƒ^§^s^dˆø4(€€€€€€€€ñ‘¥Ø±…ÍÌô‰Ù•¡¥±”µÁ…¹•±}}¡•…‘¥¹œˆø4(€€€€€€€€€€€€ñÍÁ…¸±…ÍÌô‰Ù•¡¥±”µÁ…¹•±}}¥½¸ˆ…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆûÂ~jdð½ÍÁ…¸ø4(€€€€€€€€€€€€ñ‘¥ØøñÀ±…ÍÌô‰•å•‰É½Üˆû^S^£^o^Dƒ^§^s^dð½Àøñ Èû^“^£^c^dƒ^£^o^Dƒ^W^«^W^Ÿ^Œƒ^{^‡^{^o^g^tð½ Èøð½‘¥Øø4(€€€€€€€€ð½‘¥Øø4(€€€€€€€€ñ‘¥Ø±…ÍÌô‰Ù•¡¥±”µÉ¥ˆø4(€€€€€€€€€€€€ðýÁ¡À™½É•… € ‘Ù•¡¥±•Ì…Ì€‘Ù•¡¥±”¤è€üø4(€€€€€€€€€€€€€€€€ñ…ÉÑ¥±”±…ÍÌô‰Ù•¡¥±”µ…Éˆø4(€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰Ù•¡¥±”µ…É‘}}Ñ¥Ñ±”ˆø4(€€€€€€€€€€€€€€€€€€€€€€€€ñ‘¥ØøñÍÑÉ½¹œøðüôÁ½ÉÑ…±}  ‘Ù•¡¥±•lµ…­•}µ½‘•°t¤€üøð½ÍÑÉ½¹œøðýÁ¡À¥˜€ ¡¥¹Ð¤€‘Ù•¡¥±•lå•…Èt€ø€À¤è€üøñÍÁ…¸û^§^ƒ^¨€ðüô€¡¥¹Ð¤€‘Ù•¡¥±•lå•…Èt€üøð½ÍÁ…¸øðýÁ¡À•¹‘¥˜ì€üøð½‘¥Øø4(€€€€€€€€€€€€€€€€€€€€€€€€ñˆ‘¥Èô‰±ÑÈˆøðüôÁ½ÉÑ…±} ¡Á½ÉÑ…±}™½Éµ…Ñ}Ù•¡¥±•}Á±…Ñ” ‘Ù•¡¥±•lÁ±…Ñ”t¤¤€üøð½ˆø4(€€€€€€€€€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰Ù•¡¥±”µ‘•…‘±¥¹•Ìˆø4(€€€€€€€€€€€€€€€€€€€€€€€€ðýÁ¡ÀÁ½ÉÑ…±}É•¹‘•É}Ù•¡¥±•}‘•…‘±¥¹” Ÿ^£^g^§^g^W^|œ°€‘Ù•¡¥±•l±¥•¹Í•}‘Õ•}‘…Ñ”t°€‘Ù•¡¥±•l±¥•¹Í•}‘Õ•}±…‰•°t°€‘Ù•¡¥±•l±¥•¹Í•}ÍÑ…ÑÕÌt¤ì€üø4(€€€€€€€€€€€€€€€€€€€€€€€€ðýÁ¡ÀÁ½ÉÑ…±}É•¹‘•É}Ù•¡¥±•}‘•…‘±¥¹” Ÿ^c^‡^`ƒ^§^ƒ^«^dœ°€‘Ù•¡¥±•lÑ•ÍÑ}‘Õ•}‘…Ñ”t°€‘Ù•¡¥±•lÑ•ÍÑ}‘Õ•}±…‰•°t°€‘Ù•¡¥±•lÑ•ÍÑ}ÍÑ…ÑÕÌt¤ì€üø4(€€€€€€€€€€€€€€€€€€€€€€€€ðýÁ¡ÀÁ½ÉÑ…±}É•¹‘•É}Ù•¡¥±•}‘•…‘±¥¹” Ÿ^G^g^c^W^\ƒ^_^W^G^Pœ°€‘Ù•¡¥±•l½µÁÕ±Í½Éå}¥¹ÍÕÉ…¹•}‘Õ•}‘…Ñ”t°€‘Ù•¡¥±•l½µÁÕ±Í½Éå}¥¹ÍÕÉ…¹•}‘Õ•}±…‰•°t°€‘Ù•¡¥±•l½µÁÕ±Í½Éå}¥¹ÍÕÉ…¹•}ÍÑ…ÑÕÌt¤ì€üø(€€€€€€€€€€€€€€€€€€€€€€€€ðýÁ¡ÀÁ½ÉÑ…±}É•¹‘•É}½ÁÑ¥½¹…±}Ù•¡¥±•}‘•…‘±¥¹” Ÿ^G^g^c^W^\ƒ^{^Ÿ^g^Œœ°€‘Ù•¡¥±•l½µÁÉ•¡•¹Í¥Ù•}¥¹ÍÕÉ…¹•}‘Õ•}‘…Ñ”t¤ì€üø(€€€€€€€€€€€€€€€€€€€€€€€€ðýÁ¡ÀÁ½ÉÑ…±}É•¹‘•É}½ÁÑ¥½¹…±}Ù•¡¥±•}‘•…‘±¥¹” Ÿ^G^g^c^W^\ƒ^›^Lƒ^K^Ìœ°€‘Ù•¡¥±•lÑ¡¥É‘}Á…ÉÑå}¥¹ÍÕÉ…¹•}‘Õ•}‘…Ñ”t¤ì€üø(€€€€€€€€€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€€€€€€€€€ðýÁ¡À¥˜€ ‘Ù•¡¥±•lÕÉÉ•¹Ñ}­´t€„ôô€œœ¤è€üøñÀ±…ÍÌô‰Ù•¡¥±”µ…É‘}}µ•Ñ„ˆû^Ÿ^g^s^W^{^c^£^C^Xœƒ^G^‹^O^o^W^|ƒ^S^C^_^£^W^|è€ñˆøðüôÁ½ÉÑ…±} ¡¹Õµ‰•É}™½Éµ…Ð ¡™±½…Ð¤ÁÉ•}É•Á±…” œ½myq¹t¼œ°€œœ°€‘Ù•¡¥±•lÕÉÉ•¹Ñ}­´t¤¤¤€üøð½ˆøð½ÀøðýÁ¡À•¹‘¥˜ì€üø4(€€€€€€€€€€€€€€€€€€€€ðýÁ¡À¥˜€ ‘Ù•¡¥±•l±…ÍÑ}ÕÁ‘…Ñ”t€„ôô€œœ¤è€üøñÀ±…ÍÌô‰Ù•¡¥±”µ…É‘}}µ•Ñ„ˆû^‹^O^o^W^|ƒ^C^_^£^W^|è€ðüôÁ½ÉÑ…±}  ‘Ù•¡¥±•l±…ÍÑ}ÕÁ‘…Ñ”t¤€üøð½ÀøðýÁ¡À•¹‘¥˜ì€üø4(€€€€€€€€€€€€€€€€€€€€ðýÁ¡À¥˜€ ‘Ù•¡¥±•l¥¹ÍÕÉ…¹•}½µÁ…¹ät€„ôô€œœñð€‘Ù•¡¥±•lÁ½±¥å}¹Õµ‰•Èt€„ôô€œœ¤è€üø4(€€€€€€€€€€€€€€€€€€€€€€€€ñÀ±…ÍÌô‰Ù•¡¥±”µ…É‘}}µ•Ñ„ˆû^G^g^c^W^\è€ðüôÁ½ÉÑ…±} ¡ÑÉ¥´ ‘Ù•¡¥±•l¥¹ÍÕÉ…¹•}½µÁ…¹ät€¸€ ‘Ù•¡¥±•lÁ½±¥å}¹Õµ‰•Èt€„ôô€œœ€ü€œƒ
Üƒ^“^W^s^g^‡^P€œ€¸€‘Ù•¡¥±•lÁ½±¥å}¹Õµ‰•Èt€è€œœ¤¤¤€üøð½Àø4(€€€€€€€€€€€€€€€€€€€€ðýÁ¡À•¹‘¥˜ì€üø4(€€€€€€€€€€€€€€€€€€€€ðýÁ¡À¥˜€ ‘Ù•¡¥±•l¹½Ñ•Ìt€„ôô€œœ¤è€üøñÀ±…ÍÌô‰Ù•¡¥±”µ…É‘}}µ•Ñ„ˆøðüôÁ½ÉÑ…±}  ‘Ù•¡¥±•l¹½Ñ•Ìt¤€üøð½ÀøðýÁ¡À•¹‘¥˜ì€üø4(€€€€€€€€€€€€€€€€ð½…ÉÑ¥±”ø4(€€€€€€€€€€€€ðýÁ¡À•¹‘™½É•… ì€üø4(€€€€€€€€ð½‘¥Øø4(€€€€ð½Í•Ñ¥½¸ø4(€€€€ðýÁ¡À4)ô4(4)™Õ¹Ñ¥½¸Á½ÉÑ…±}É•¹‘•É}Ù•¡¥±•}…‘µ¥¸ ý…ÉÉ…ä€‘™±…Í ¤èÙ½¥)ì4(€€€Á½ÉÑ…±}É•¹‘•É}™±…Í  ‘™±…Í ¤ì4(€€€€‘Ù•¡¥±•Ì€ôÁ½ÉÑ…±}Ù•¡¥±•}‘¥É•Ñ½Éä ¤ì4(€€€€‘•µÁ±½å••Ì€ôÁ½ÉÑ…±}•µÁ±½å••}‘¥É•Ñ½Éä ¤ì4(€€€€üø4(€€€€ñÍ•Ñ¥½¸±…ÍÌô‰Á…”µ¡•…‘¥¹œÁ…”µ¡•…‘¥¹œ´µ½µÁ…Ðˆø4(€€€€€€€€ñ‘¥Øø4(€€€€€€€€€€€€ñÀ±…ÍÌô‰•å•‰É½Üˆû^›^dƒ^£^o^Dƒ^“^£^c^dð½Àø4(€€€€€€€€€€€€ñ Äû^£^o^G^dƒ^‹^W^G^O^g^tƒ^W^«^[^o^W^£^W^¨ð½ Äø4(€€€€€€€€€€€€ñÀû^o^pƒ^£^o^Dƒ^{^§^W^g^hƒ^s^‹^W^G^Lƒ^s^“^dƒ^S^O^W^@‹^pƒ^S^C^£^K^W^ƒ^d¸ƒ^S^{^g^O^ˆƒ^ƒ^§^{^ ƒ^{^_^W^”ƒ^s^C^«^ ƒ^S^›^g^G^W^£^d°ƒ^W^g^g^G^W^@ƒ^_^W^[^ ƒ^{^‹^O^o^|ƒ^W^{^W^‡^g^Œƒ^G^s^dƒ^s^{^_^W^œƒ^£^o^G^g^tƒ^C^_^£^g^t¸ð½Àø4(€€€€€€€€ð½‘¥Øø4(€€€€€€€€ñ‘¥Ø±…ÍÌô‰Ñ½Ñ…°µ…ÉˆøñÍÁ…¸û^£^o^G^g^tƒ^§^ƒ^§^{^£^Tð½ÍÁ…¸øñÍÑÉ½¹œøðüô½Õ¹Ð ‘Ù•¡¥±•Ì¤€üøð½ÍÑÉ½¹œøð½‘¥Øø4(€€€€ð½Í•Ñ¥½¸ø4(4(€€€€ñÍ•Ñ¥½¸±…ÍÌô‰‘•Ñ…¥°µ…Éˆø4(€€€€€€€€ñ Èû^£^o^G^g^tƒ^G^{^‹^£^o^¨ð½ Èø4(€€€€€€€€ñ‘¥Ø±…ÍÌô‰Ñ…‰±”µÝÉ…Àˆø4(€€€€€€€€€€€€ñÑ…‰±”±…ÍÌô‰É•½É‘ÌµÑ…‰±”ˆø4(€€€€€€€€€€€€€€€€ñÑ¡•…øñÑÈøñÑ û^‹^W^G^Lð½Ñ øñÑ û^£^o^Dð½Ñ øñÑ û^{^‡^“^ ð½Ñ øñÑ û^£^g^§^g^W^|ð½Ñ øñÑ û^c^‡^`ð½Ñ øñÑ û^G^g^c^W^\ƒ^_^W^G^Pð½Ñ øñÑ û^G^g^c^W^\ƒ^{^Ÿ^g^Œð½Ñ øñÑ û^G^g^c^W^\ƒ^›^Lƒ^K^Ìð½Ñ øñÑ û^œ‹^x€¼ƒ^‹^O^o^W^|ð½Ñ øð½ÑÈøð½Ñ¡•…ø(€€€€€€€€€€€€€€€€ñÑ‰½‘äø4(€€€€€€€€€€€€€€€€ðýÁ¡À¥˜€ ‘Ù•¡¥±•Ì€ôôômt¤è€üø4(€€€€€€€€€€€€€€€€€€€€ñÑÈøñÑ½±ÍÁ…¸ôˆäˆ±…ÍÌô‰•µÁÑäµ•±°ˆû^‹^O^g^g^|ƒ^s^@ƒ^ƒ^§^{^£^Tƒ^£^o^G^g^t¸ð½Ñøð½ÑÈø(€€€€€€€€€€€€€€€€ðýÁ¡À•±Í”è€üø4(€€€€€€€€€€€€€€€€€€€€ðýÁ¡À™½É•… € ‘Ù•¡¥±•Ì…Ì€‘Ù•¡¥±”¤è€üø4(€€€€€€€€€€€€€€€€€€€€€€€€ðýÁ¡À€‘•µÁ±½å•”€ô€‘•µÁ±½å••Íl‘Ù•¡¥±•l•µÁ±½å••}•µ…¥°ut€üül¹…µ”œ€ôø€œœ°€•µ…¥°œ€ôø€‘Ù•¡¥±•l•µÁ±½å••}•µ…¥°utì€üø4(€€€€€€€€€€€€€€€€€€€€€€€€ñÑÈø4(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñÑøñÍÑÉ½¹œøðüôÁ½ÉÑ…±}  ‘•µÁ±½å••l¹…µ”t¤€üøð½ÍÑÉ½¹œøñÍµ…±°øðüôÁ½ÉÑ…±}  ‘•µÁ±½å••l•µ…¥°t¤€üøð½Íµ…±°øð½Ñø4(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñÑøðüôÁ½ÉÑ…±}  ‘Ù•¡¥±•lµ…­•}µ½‘•°t¤€üøðüô€¡¥¹Ð¤€‘Ù•¡¥±•lå•…Èt€ø€À€ü€œƒ
Ü€œ€¸€¡¥¹Ð¤€‘Ù•¡¥±•lå•…Èt€è€œœ€üøð½Ñø4(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñÑ‘¥Èô‰±ÑÈˆøðüôÁ½ÉÑ…±} ¡Á½ÉÑ…±}™½Éµ…Ñ}Ù•¡¥±•}Á±…Ñ” ‘Ù•¡¥±•lÁ±…Ñ”t¤¤€üøð½Ñø4(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñÑøðýÁ¡ÀÁ½ÉÑ…±}É•¹‘•É}Ù•¡¥±•}‘•…‘±¥¹” Ÿ^£^g^§^g^W^|œ°€‘Ù•¡¥±•l±¥•¹Í•}‘Õ•}‘…Ñ”t°€‘Ù•¡¥±•l±¥•¹Í•}‘Õ•}±…‰•°t°€‘Ù•¡¥±•l±¥•¹Í•}ÍÑ…ÑÕÌt¤ì€üøð½Ñø4(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñÑøðýÁ¡ÀÁ½ÉÑ…±}É•¹‘•É}Ù•¡¥±•}‘•…‘±¥¹” Ÿ^c^‡^`œ°€‘Ù•¡¥±•lÑ•ÍÑ}‘Õ•}‘…Ñ”t°€‘Ù•¡¥±•lÑ•ÍÑ}‘Õ•}±…‰•°t°€‘Ù•¡¥±•lÑ•ÍÑ}ÍÑ…ÑÕÌt¤ì€üøð½Ñø4(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñÑøðýÁ¡ÀÁ½ÉÑ…±}É•¹‘•É}Ù•¡¥±•}‘•…‘±¥¹” Ÿ^_^W^G^Pœ°€‘Ù•¡¥±•l½µÁÕ±Í½Éå}¥¹ÍÕÉ…¹•}‘Õ•}‘…Ñ”t°€‘Ù•¡¥±•l½µÁÕ±Í½Éå}¥¹ÍÕÉ…¹•}‘Õ•}±…‰•°t°€‘Ù•¡¥±•l½µÁÕ±Í½Éå}¥¹ÍÕÉ…¹•}ÍÑ…ÑÕÌt¤ì€üøð½Ñø4(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñÑøðýÁ¡ÀÁ½ÉÑ…±}É•¹‘•É}½ÁÑ¥½¹…±}Ù•¡¥±•}‘•…‘±¥¹” Ÿ^{^Ÿ^g^Œœ°€‘Ù•¡¥±•l½µÁÉ•¡•¹Í¥Ù•}¥¹ÍÕÉ…¹•}‘Õ•}‘…Ñ”t¤ì€üøð½Ñø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñÑøðýÁ¡ÀÁ½ÉÑ…±}É•¹‘•É}½ÁÑ¥½¹…±}Ù•¡¥±•}‘•…‘±¥¹” Ÿ^›^Lƒ^K^Ìœ°€‘Ù•¡¥±•lÑ¡¥É‘}Á…ÉÑå}¥¹ÍÕÉ…¹•}‘Õ•}‘…Ñ”t¤ì€üøð½Ñø(€€€€€€€€€€€€€€€€€€€€€€€€€€€€ñÑøðüô€‘Ù•¡¥±•lÕÉÉ•¹Ñ}­´t€„ôô€œœ€üÁ½ÉÑ…±}  ‘Ù•¡¥±•lÕÉÉ•¹Ñ}­´t¤€¸€œƒ^œ‹^xœ€è€ŸŠPœ€üøðüô€‘Ù•¡¥±•l±…ÍÑ}ÕÁ‘…Ñ”t€„ôô€œœ€ü€œñ‰ÈøñÍµ…±°øœ€¸Á½ÉÑ…±}  ‘Ù•¡¥±•l±…ÍÑ}ÕÁ‘…Ñ”t¤€¸€œð½Íµ…±°øœ€è€œœ€üøð½Ñø4(€€€€€€€€€€€€€€€€€€€€€€€€ð½ÑÈø4(€€€€€€€€€€€€€€€€€€€€ðýÁ¡À•¹‘™½É•… ì€üø4(€€€€€€€€€€€€€€€€ðýÁ¡À•¹‘¥˜ì€üø4(€€€€€€€€€€€€€€€€ð½Ñ‰½‘äø4(€€€€€€€€€€€€ð½Ñ…‰±”ø4(€€€€€€€€ð½‘¥Øø4(€€€€ð½Í•Ñ¥½¸ø4(4(€€€€ñÍ•Ñ¥½¸±…ÍÌô‰‘•Ñ…¥°µ…Éˆø(€€€€€€€€ñ Èû^g^g^G^W^@ƒ^C^Tƒ^‹^O^o^W^|ƒ^£^o^G^g^tð½ Èø(€€€€€€€€€€€€ñÀû^C^“^§^ ƒ^s^S^O^G^g^œƒ^g^§^g^£^W^¨ƒ^C^¨ƒ^‹^{^W^O^W^¨ŠMXƒ^{^S^K^g^s^g^W^|€‹^«^Ÿ^g^ƒ^W^¨ƒ^£^o^G^g^tˆ°ƒ^C^Tƒ^s^S^§^«^{^¤ƒ^G^«^G^ƒ^g^¨ƒ^S^{^›^W^{^›^{^¨¸ƒ^s^“^ƒ^dƒ^S^g^g^G^W^@°ƒ^S^‹^W^G^Lƒ^_^g^g^Dƒ^s^S^W^“^g^ˆƒ^G^{^‡^h€‹^‹^W^G^O^g^tƒ^W^g^{^dƒ^S^W^s^O^¨ˆ¸ƒ^s^§^g^W^hƒ^£^C^§^W^ƒ^dƒ^{^‡^“^g^Ÿ^g^tƒ^O^W^@‹^pƒ^S^‹^W^G^Lƒ^W^{^‡^“^ ƒ^S^£^o^Dìƒ^C^¨ƒ^S^O^K^t°ƒ^S^c^‡^`ƒ^W^S^G^g^c^W^\ƒ^S^‹^W^G^Lƒ^g^o^W^pƒ^s^S^§^s^g^tƒ^s^C^_^ ƒ^S^o^ƒ^g^‡^P¸ð½Àø4(€€€€€€€€ñ™½É´µ•Ñ¡½ô‰Á½ÍÐˆ±…ÍÌô‰™½É´µÉ¥ˆø4(€€€€€€€€€€€€ñ¥¹ÁÕÐÑåÁ”ô‰¡¥‘‘•¸ˆ¹…µ”ô‰ÍÉ˜ˆÙ…±Õ”ôˆðüôÁ½ÉÑ…±} ¡Á½ÉÑ…±}ÍÉ™}Ñ½­•¸ ¤¤€üøˆø4(€€€€€€€€€€€€ñ¥¹ÁÕÐÑåÁ”ô‰¡¥‘‘•¸ˆ¹…µ”ô‰…Ñ¥½¸ˆÙ…±Õ”ô‰¥µÁ½ÉÑ}Ù•¡¥±•}‘¥É•Ñ½Éäˆø4(€€€€€€€€€€€€ñ±…‰•°±…ÍÌô‰™¥•±™¥•±´µ™Õ±°ˆø4(€€€€€€€€€€€€€€€€ñÍÁ…¸û^ƒ^«^W^ƒ^dƒ^£^o^G^g^tð½ÍÁ…¸ø4(€€€€€€€€€€€€€€€€ñÑ•áÑ…É•„¹…µ”ô‰Ù•¡¥±•}‘¥É•Ñ½Éå}Ñ•áÐˆÉ½ÝÌôˆäˆµ…á±•¹Ñ ôˆØÀÀÀÀˆÉ•ÅÕ¥É•Á±…•¡½±‘•Èô‹^O^W^C^Ó^pƒ^‹^W^G^L'^{^‡^“^ ƒ^£^o^D'^g^›^£^|ƒ^W^O^K^t'^§^ƒ^«^W^|'^«^W^Ÿ^Œƒ^c^‡^`'^«^W^Ÿ^Œƒ^G^g^c^W^\'^_^G^£^¨ƒ^G^g^c^W^\'^{^‡^“^ ƒ^“^W^s^g^‡^P'^S^‹^£^W^¨ˆøð½Ñ•áÑ…É•„ø4(€€€€€€€€€€€€ð½±…‰•°ø4(€€€€€€€€€€€€ñÀ±…ÍÌô‰™½É´µ¹½Ñ”™¥•±´µ™Õ±°ˆû^S^{^‹^£^o^¨ƒ^{^[^S^Pƒ^C^W^c^W^{^c^g^¨ƒ^C^¨ƒ^{^G^ƒ^Pƒ^S^K^g^s^g^W^|ƒ^S^Ÿ^g^g^t¸ƒ^G^«^G^ƒ^g^¨ƒ^S^{^›^W^{^›^{^¨ƒ^£^œƒ^O^W^@‹^pƒ^S^‹^W^G^Lƒ^W^{^‡^“^ ƒ^S^£^o^Dƒ^S^tƒ^_^W^G^P¸ƒ^g^«^ ƒ^S^‹^{^W^O^W^¨ƒ^S^|èƒ^g^›^£^|ƒ^W^O^K^t°ƒ^§^ƒ^«^W^|°ƒ^«^W^Ÿ^Œƒ^c^‡^`°ƒ^«^W^Ÿ^Œƒ^G^g^c^W^\°ƒ^_^G^£^¨ƒ^G^g^c^W^\°ƒ^{^‡^“^ ƒ^“^W^s^g^‡^Pƒ^W^S^‹^£^W^¨¸ð½Àø4(€€€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰™¥•±´µ™Õ±°ˆøñ‰ÕÑÑ½¸ÑåÁ”ô‰ÍÕ‰µ¥Ðˆ±…ÍÌô‰‰ÕÑÑ½¸‰ÕÑÑ½¸´µÁÉ¥µ…Éäˆû^§^{^g^£^¨ƒ^S^£^o^G^g^tð½‰ÕÑÑ½¸øð½‘¥Øø4(€€€€€€€€ð½™½É´ø4(€€€€ð½Í•Ñ¥½¸ø((€€€€ñÍ•Ñ¥½¸±…ÍÌô‰‘•Ñ…¥°µ…ÉÙ•¡¥±”µ‘½Õµ•¹Ðµ…‘µ¥¸ˆø(€€€€€€€€ñ Èû^S^‹^s^C^¨ƒ^{^‡^{^hƒ^£^o^Dƒ^W^‹^O^o^W^|ƒ^«^W^Ÿ^Œð½ Èø(€€€€€€€€ñÀû^S^{^‡^{^hƒ^ƒ^§^{^ ƒ^G^C^_^‡^W^|ƒ^S^“^£^c^dƒ^W^C^g^ƒ^Tƒ^ƒ^K^g^¤ƒ^G^Ÿ^g^§^W^ ƒ^›^g^G^W^£^d¸ƒ^S^‹^W^G^Lƒ^S^{^§^W^g^hƒ^W^S^{^ƒ^S^pƒ^G^s^G^Lƒ^g^o^W^s^g^tƒ^s^S^W^£^g^Lƒ^C^W^«^T¸ð½Àø(€€€€€€€€ñ™½É´µ•Ñ¡½ô‰Á½ÍÐˆ•¹ÑåÁ”ô‰µÕ±Ñ¥Á…ÉÐ½™½É´µ‘…Ñ„ˆ±…ÍÌô‰™¥•±µÉ¥™¥•±µÉ¥´´Èˆø(€€€€€€€€€€€€ñ¥¹ÁÕÐÑåÁ”ô‰¡¥‘‘•¸ˆ¹…µ”ô‰ÍÉ˜ˆÙ…±Õ”ôˆðüôÁ½ÉÑ…±} ¡Á½ÉÑ…±}ÍÉ™}Ñ½­•¸ ¤¤€üøˆø(€€€€€€€€€€€€ñ¥¹ÁÕÐÑåÁ”ô‰¡¥‘‘•¸ˆ¹…µ”ô‰…Ñ¥½¸ˆÙ…±Õ”ô‰Í…Ù•}Ù•¡¥±•}‘½Õµ•¹Ðˆø(€€€€€€€€€€€€ñ¥¹ÁÕÐÑåÁ”ô‰¡¥‘‘•¸ˆ¹…µ”ô‰5a}%1}M%iˆÙ…±Õ”ôˆðüô%1}A=IQ1}5a}%1}	eQL€üøˆø(€€€€€€€€€€€€ñ±…‰•°±…ÍÌô‰™¥•±ˆøñÍÁ…¸û^£^o^D€ñˆø¨ð½ˆøð½ÍÁ…¸øñÍ•±•Ð¹…µ”ô‰Ù•¡¥±•}‘½Õµ•¹Ñ}Á±…Ñ”ˆÉ•ÅÕ¥É•øñ½ÁÑ¥½¸Ù…±Õ”ôˆˆû^G^_^g^£^Pð½½ÁÑ¥½¸øðýÁ¡À™½É•… € ‘Ù•¡¥±•Ì…Ì€‘Ù•¡¥±”¤è€‘•µÁ±½å•”€ô€‘•µÁ±½å••Íl‘Ù•¡¥±•l•µÁ±½å••}•µ…¥°ut€üümtì€üøñ½ÁÑ¥½¸Ù…±Õ”ôˆðüôÁ½ÉÑ…±}  ‘Ù•¡¥±•lÁ±…Ñ”t¤€üøˆøðüôÁ½ÉÑ…±} ¡Á½ÉÑ…±}™½Éµ…Ñ}Ù•¡¥±•}Á±…Ñ” ‘Ù•¡¥±•lÁ±…Ñ”t¤€¸€œƒŠP€œ€¸€ ‘•µÁ±½å••l¹…µ”t€üü€‘Ù•¡¥±•l•µÁ±½å••}•µ…¥°t¤¤€üøð½½ÁÑ¥½¸øðýÁ¡À•¹‘™½É•… ì€üøð½Í•±•Ðøð½±…‰•°ø(€€€€€€€€€€€€ñ±…‰•°±…ÍÌô‰™¥•±ˆøñÍÁ…¸û^‡^W^Hƒ^{^‡^{^h€ñˆø¨ð½ˆøð½ÍÁ…¸øñÍ•±•Ð¹…µ”ô‰Ù•¡¥±•}‘½Õµ•¹Ñ}ÑåÁ”ˆÉ•ÅÕ¥É•øñ½ÁÑ¥½¸Ù…±Õ”ôˆˆû^G^_^g^£^Pð½½ÁÑ¥½¸øðýÁ¡À™½É•… €¡Á½ÉÑ…±}Ù•¡¥±•}‘½Õµ•¹Ñ}ÑåÁ•}±…‰•±Ì ¤…Ì€‘Ù…±Õ”€ôø€‘±…‰•°¤è€üøñ½ÁÑ¥½¸Ù…±Õ”ôˆðüôÁ½ÉÑ…±}  ‘Ù…±Õ”¤€üøˆøðüôÁ½ÉÑ…±}  ‘±…‰•°¤€üøð½½ÁÑ¥½¸øðýÁ¡À•¹‘™½É•… ì€üøð½Í•±•Ðøð½±…‰•°ø(€€€€€€€€€€€€ñ±…‰•°±…ÍÌô‰™¥•±ˆøñÍÁ…¸û^«^W^Ÿ^Œƒ^S^{^‡^{^hð½ÍÁ…¸øñ¥¹ÁÕÐÑåÁ”ô‰‘…Ñ”ˆ¹…µ”ô‰Ù•¡¥±•}‘½Õµ•¹Ñ}•áÁ¥É•Í}½¸ˆøð½±…‰•°ø(€€€€€€€€€€€€ñ±…‰•°±…ÍÌô‰™¥•±ˆøñÍÁ…¸û^{^‡^“^ ƒ^“^W^s^g^‡^P€¼ƒ^C^‡^{^o^«^Pð½ÍÁ…¸øñ¥¹ÁÕÐÑåÁ”ô‰Ñ•áÐˆ¹…µ”ô‰Ù•¡¥±•}‘½Õµ•¹Ñ}Á½±¥å}¹Õµ‰•Èˆµ…á±•¹Ñ ôˆÄØÀˆøð½±…‰•°ø(€€€€€€€€€€€€ñ±…‰•°±…ÍÌô‰™¥•±™¥•±´µ™Õ±°ˆøñÍÁ…¸û^Ÿ^W^G^”Aƒ^C^Tƒ^«^{^W^ƒ^P€ñˆø¨ð½ˆøð½ÍÁ…¸øñ¥¹ÁÕÐÑåÁ”ô‰™¥±”ˆ¹…µ”ô‰Ù•¡¥±•}‘½Õµ•¹Ñ}™¥±”ˆÉ•ÅÕ¥É•…•ÁÐôˆ¹Á‘˜±¥µ…”½©Á•œ±¥µ…”½Á¹œ±¥µ…”½Ý•‰À±¥µ…”½¡•¥Œ±¥µ…”½¡•¥˜±¥µ…”½…Ù¥˜ˆøð½±…‰•°ø(€€€€€€€€€€€€ñÀ±…ÍÌô‰™½É´µ¹½Ñ”™¥•±´µ™Õ±°ˆû^s^£^g^§^g^W^|°ƒ^c^‡^`ƒ^W^G^g^c^W^\ƒ^g^¤ƒ^s^S^[^g^|ƒ^«^C^£^g^hƒ^«^W^Ÿ^Œ¸ƒ^G^g^c^W^\ƒ^›^Lƒ^K^Ìƒ^ƒ^§^{^ ƒ^G^ƒ^“^£^Lƒ^W^C^g^ƒ^Tƒ^{^‡^W^{^|ƒ^o^G^g^c^W^\ƒ^{^Ÿ^g^Œ¸ð½Àø(€€€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰™¥•±´µ™Õ±°ˆøñ‰ÕÑÑ½¸ÑåÁ”ô‰ÍÕ‰µ¥Ðˆ±…ÍÌô‰‰ÕÑÑ½¸‰ÕÑÑ½¸´µÁÉ¥µ…Éäˆû^§^{^g^£^¨ƒ^S^{^‡^{^hƒ^W^‹^O^o^W^|ƒ^S^«^W^Ÿ^Œð½‰ÕÑÑ½¸øð½‘¥Øø(€€€€€€€€ð½™½É´ø(€€€€€€€€ñ‘¥Ø±…ÍÌô‰Ù•¡¥±”µ‘½Õµ•¹ÐµÉ½ÕÁÌˆø(€€€€€€€€€€€€ðýÁ¡À™½É•… € ‘Ù•¡¥±•Ì…Ì€‘Ù•¡¥±”¤è€‘‘½Õµ•¹ÑÌ€ôÁ½ÉÑ…±}Ù•¡¥±•}‘½Õµ•¹ÑÌ ¡ÍÑÉ¥¹œ¤€‘Ù•¡¥±•lÁ±…Ñ”t¤ì¥˜€ ‘‘½Õµ•¹ÑÌ€ôôômt¤½¹Ñ¥¹Õ”ì€üø(€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰Ù•¡¥±”µ‘½Õµ•¹ÐµÉ½ÕÀˆøñ ÌøðüôÁ½ÉÑ…±} ¡Á½ÉÑ…±}™½Éµ…Ñ}Ù•¡¥±•}Á±…Ñ” ‘Ù•¡¥±•lÁ±…Ñ”t¤¤€üøð½ Ìøñ‘¥Ø±…ÍÌô‰‘½Õµ•¹Ðµ±¥ÍÐˆø(€€€€€€€€€€€€€€€€ðýÁ¡À™½É•… € ‘‘½Õµ•¹ÑÌ…Ì€‘‘½Õµ•¹Ð¤è€üøñ‘¥ØøñÍÑÉ½¹œøðüôÁ½ÉÑ…±}  ‘‘½Õµ•¹ÑlÑåÁ•}±…‰•°t€üü€Ÿ^{^‡^{^hœ¤€üøð½ÍÑÉ½¹œøñÍÁ…¸øñ„±…ÍÌô‰Ñ•áÐµ±¥¹¬ˆ¡É•˜ôˆðüôÁ½ÉÑ…±} ¡Á½ÉÑ…±}ÕÉ°¡l…Ñ¥½¸œ€ôø€Ù•¡¥±•}‘½Õµ•¹Ñ}‘½Ý¹±½…œ°€Á±…Ñ”œ€ôø€‘Ù•¡¥±•lÁ±…Ñ”t°€‘½Õµ•¹Ðœ€ôø€‘‘½Õµ•¹Ñl¥t€üü€œt¤¤€üøˆøðüôÁ½ÉÑ…±}  ‘‘½Õµ•¹Ñl¹…µ”t€üü€œœ¤€üøð½„øðýÁ¡À¥˜€  ‘‘½Õµ•¹ÑlÁ½±¥å}¹Õµ‰•Èt€üü€œœ¤€„ôô€œœ¤è€üøñÍµ…±°û^“^W^s^g^‡^P¿^C^‡^{^o^«^Pè€ðüôÁ½ÉÑ…±}  ‘‘½Õµ•¹ÑlÁ½±¥å}¹Õµ‰•Èt¤€üøð½Íµ…±°øðýÁ¡À•¹‘¥˜ì€üøð½ÍÁ…¸øñÍÁ…¸øðüôÁ½ÉÑ…±}   ‘‘½Õµ•¹Ñl•áÁ¥É•Í}½¸t€üü€œœ¤€„ôô€œœ€ü€Ÿ^«^W^Ÿ^Œ€œ€¸€‘‘½Õµ•¹Ñl•áÁ¥É•Í}½¸t€è€Ÿ^s^s^@ƒ^«^W^Ÿ^Œœ¤€üøð½ÍÁ…¸øð½‘¥ØøðýÁ¡À•¹‘™½É•… ì€üø(€€€€€€€€€€€€€€€€ð½‘¥Øøð½‘¥Øø(€€€€€€€€€€€€ðýÁ¡À•¹‘™½É•… ì€üø(€€€€€€€€ð½‘¥Øø(€€€€ð½Í•Ñ¥½¸ø(4(€€€€ñÍ•Ñ¥½¸±…ÍÌô‰‘•Ñ…¥°µ…Éˆø4(€€€€€€€€ñ Èû^{^W^‹^O^dƒ^«^[^o^W^£^¨ƒ^C^W^c^W^{^c^g^g^tð½ Èø4(€€€€€€€€ñÀû^S^‹^W^G^Lƒ^W^C^W^£^|ƒ^g^Ÿ^G^s^Tƒ^O^W^@‹^pƒ^‹^pƒ^£^g^§^g^W^|°ƒ^c^‡^`°ƒ^G^g^c^W^\ƒ^_^W^G^P°ƒ^G^g^c^W^\ƒ^{^Ÿ^g^Œƒ^C^Tƒ^G^g^c^W^\ƒ^›^Lƒ^K^ÌƒŠP€ÌÀ°€ÄÐ°€Üƒ^W^g^W^tƒ^C^_^Lƒ^s^“^ƒ^dƒ^S^{^W^‹^L°ƒ^G^g^W^tƒ^S^{^W^‹^L°ƒ^W^o^|ƒ^g^W^t°ƒ^§^G^W^ˆƒ^W^_^W^O^¤ƒ^s^C^_^ ƒ^{^W^‹^Lƒ^§^_^s^Œ¸ƒ^«^[^o^W^£^¨ƒ^ƒ^§^s^_^¨ƒ^£^œƒ^o^C^§^ ƒ^Ÿ^g^g^tƒ^«^C^£^g^hƒ^{^s^@ƒ^W^{^O^W^g^œ¸ð½Àø(€€€€ð½Í•Ñ¥½¸ø4(€€€€ðýÁ¡À4)ô4(