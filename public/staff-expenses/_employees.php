<?php
declare(strict_types=1);

function portal_employee_directory_file(): string
{
    return portal_storage_root() . DIRECTORY_SEPARATOR . 'security' . DIRECTORY_SEPARATOR . 'employees.json';
}

function portal_employee_directory(): array
{
    $stored = portal_json_read(portal_employee_directory_file());
    $employees = [];

    foreach ($stored as $key => $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $email = portal_normalize_company_email((string) ($entry['email'] ?? $key));
        if ($email === null) {
            continue;
        }
        $employees[$email] = [
            'name' => trim((string) ($entry['name'] ?? '')),
            'email' => $email,
            'phone' => trim((string) ($entry['phone'] ?? '')),
            'birth_day' => (int) ($entry['birth_day'] ?? 0),
            'birth_month' => (int) ($entry['birth_month'] ?? 0),
            'updated_at' => (string) ($entry['updated_at'] ?? ''),
        ];
    }

    ksort($employees);
    return $employees;
}

function portal_normalize_israeli_mobile(string $input): ?string
{
    $clean = preg_replace('/[\x{200E}\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}]/u', '', trim($input)) ?? '';
    $digits = preg_replace('/\D+/', '', $clean) ?? '';

    if (str_starts_with($digits, '972')) {
        $digits = '0' . substr($digits, 3);
    } elseif (strlen($digits) === 9 && str_starts_with($digits, '5')) {
        $digits = '0' . $digits;
    }

    if (!preg_match('/^05\d{8}$/', $digits)) {
        return null;
    }

    return substr($digits, 0, 3) . '-' . substr($digits, 3, 3) . '-' . substr($digits, 6, 4);
}

function portal_parse_employee_directory_text(string $text): array
{
    $text = trim(str_replace("\xEF\xBB\xBF", '', $text));
    if ($text === '') {
        throw new RuntimeException('יש להדביק לפחות שורת עובד אחת.');
    }

    $entries = [];
    $lines = preg_split('/\R/u', $text) ?: [];
    foreach ($lines as $lineNumber => $line) {
        if (trim($line) === '') {
            continue;
        }

        $delimiter = str_contains($line, "\t") ? "\t" : ',';
        $columns = array_map('trim', str_getcsv($line, $delimiter, '"', ''));
        if ($lineNumber === 0 && isset($columns[1]) && str_contains(strtolower($columns[1]), 'email')) {
            continue;
        }
        if ($lineNumber === 0 && isset($columns[0]) && str_contains($columns[0], 'שם מלא')) {
            continue;
        }

        $name = (string) ($columns[0] ?? '');
        $email = portal_normalize_company_email((string) ($columns[1] ?? ''));
        $phone = portal_normalize_israeli_mobile((string) ($columns[2] ?? ''));
        $birthDayRaw = trim((string) ($columns[3] ?? ''));
        $birthMonthRaw = trim((string) ($columns[4] ?? ''));
        $birthDay = $birthDayRaw === '' ? 0 : (int) $birthDayRaw;
        $birthMonth = $birthMonthRaw === '' ? 0 : (int) $birthMonthRaw;
        $row = $lineNumber + 1;

        if ($name === '' || $email === null || $phone === null) {
            throw new RuntimeException('שורה ' . $row . ': חובה להזין שם, דוא"ל ארגוני ומספר טלפון נייד ישראלי תקין.');
        }
        if (($birthDay === 0) !== ($birthMonth === 0)) {
            throw new RuntimeException('שורה ' . $row . ': יש להזין גם יום וגם חודש לידה, או להשאיר את שניהם ריקים.');
        }
        if ($birthDay < 0 || $birthDay > 31 || $birthMonth < 0 || $birthMonth > 12) {
            throw new RuntimeException('שורה ' . $row . ': יום או חודש הלידה אינם תקינים.');
        }
        if ($birthDay > 0 && !checkdate($birthMonth, $birthDay, 2000)) {
            throw new RuntimeException('שורה ' . $row . ': תאריך הלידה אינו תקין.');
        }

        $entries[$email] = [
            'name' => portal_substr($name, 0, 120),
            'email' => $email,
            'phone' => $phone,
            'birth_day' => $birthDay,
            'birth_month' => $birthMonth,
            'updated_at' => gmdate('c'),
        ];
    }

    if ($entries === []) {
        throw new RuntimeException('לא נמצאו שורות עובדים תקינות.');
    }
    return $entries;
}

function portal_import_employee_directory(string $text): int
{
    $incoming = portal_parse_employee_directory_text($text);
    $employees = portal_employee_directory();
    foreach ($incoming as $email => $entry) {
        $employees[$email] = $entry;
    }
    portal_json_write(portal_employee_directory_file(), $employees);
    return count($incoming);
}

function portal_employee_directory_entry(array $user): ?array
{
    $email = portal_normalize_company_email((string) ($user['email'] ?? ''));
    if ($email === null) {
        return null;
    }
    return portal_employee_directory()[$email] ?? null;
}

function portal_employee_has_birthday_this_month(array $user, ?int $month = null): bool
{
    $entry = portal_employee_directory_entry($user);
    if ($entry === null || (int) ($entry['birth_month'] ?? 0) === 0) {
        return false;
    }
    $currentMonth = $month ?? (int) (new DateTimeImmutable('now', new DateTimeZone('Asia/Jerusalem')))->format('n');
    return (int) $entry['birth_month'] === $currentMonth;
}

function portal_render_birthday_banner(array $user): void
{
    if (!portal_employee_has_birthday_this_month($user)) {
        return;
    }
    $entry = portal_employee_directory_entry($user);
    $name = trim((string) ($entry['name'] ?? ''));
    $firstName = preg_split('/\s+/u', $name)[0] ?? $name;
    ?>
    <section class="birthday-banner" role="status" aria-label="ברכת יום הולדת">
        <span class="birthday-banner__icon" aria-hidden="true">🎉</span>
        <div>
            <strong>מזל טוב, <?= portal_h($firstName) ?>!</strong>
            <span>זה חודש יום ההולדת שלך. כל צוות I Feel מאחל לך חודש שמח, בריאות והצלחה.</span>
        </div>
        <span class="birthday-banner__confetti" aria-hidden="true">🎂</span>
    </section>
    <?php
}

function portal_render_employee_directory_admin(?array $flash): void
{
    portal_render_flash($flash);
    $employees = portal_employee_directory();
    ?>
    <section class="page-heading page-heading--compact">
        <div>
            <p class="eyebrow">ספר עובדים פרטי</p>
            <h1>פרטי עובדים וימי הולדת</h1>
            <p>המידע נשמר באחסון הפרטי של המערכת ואינו נכתב לקוד האתר או ל־GitHub. ייבוא חוזר מעדכן עובדים קיימים ומוסיף חדשים בלי למחוק אחרים.</p>
        </div>
        <div class="total-card"><span>עובדים שנשמרו</span><strong><?= count($employees) ?></strong></div>
    </section>

    <div class="users-layout">
        <section class="detail-card">
            <h2>עובדים במערכת</h2>
            <div class="table-wrap">
                <table class="records-table">
                    <thead><tr><th>שם מלא</th><th>דוא"ל</th><th>טלפון</th><th>יום הולדת</th></tr></thead>
                    <tbody>
                    <?php if ($employees === []): ?>
                        <tr><td colspan="4" class="empty-cell">עדיין לא נשמרו פרטי עובדים.</td></tr>
                    <?php else: ?>
                        <?php foreach ($employees as $employee): ?>
                            <tr>
                                <td><strong><?= portal_h($employee['name']) ?></strong></td>
                                <td><code><?= portal_h($employee['email']) ?></code></td>
                                <td><?= portal_h($employee['phone']) ?></td>
                                <td><?= (int) $employee['birth_day'] > 0 ? portal_h($employee['birth_day'] . '/' . $employee['birth_month']) : 'לא נמסר' ?></td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </section>

        <section class="detail-card">
            <h2>ייבוא או עדכון עובדים</h2>
            <form method="post" class="stack-form">
                <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
                <input type="hidden" name="action" value="import_employee_directory">
                <label>
                    <span>הדבקת נתונים מ־Excel</span>
                    <textarea name="employee_directory_text" rows="14" maxlength="30000" required placeholder="שם מלא	דואר אלקטרוני	טלפון	יום לידה	חודש לידה"></textarea>
                </label>
                <p class="form-note">יום וחודש לידה יכולים להישאר ריקים. אין להזין שנת לידה.</p>
                <button type="submit" class="button button--primary">שמירת פרטי העובדים</button>
            </form>
        </section>
    </div>
    <?php
}
