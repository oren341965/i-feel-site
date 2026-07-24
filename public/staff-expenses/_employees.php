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

function portal_save_employee_profile(array $user, string $name, string $phone): array
{
    $email = portal_normalize_company_email((string) ($user['email'] ?? ''));
    $name = trim($name);
    $normalizedPhone = portal_normalize_israeli_mobile($phone);
    if ($email === null) {
        throw new RuntimeException('לא נמצאה כתובת דוא״ל מאומתת לעובד.');
    }
    if ($name === '') {
        throw new RuntimeException('יש להזין שם מלא.');
    }
    if ($normalizedPhone === null) {
        throw new RuntimeException('יש להזין מספר טלפון נייד ישראלי תקין.');
    }

    $employees = portal_employee_directory();
    $existing = $employees[$email] ?? [];
    $employees[$email] = [
        'name' => portal_substr($name, 0, 120),
        'email' => $email,
        'phone' => $normalizedPhone,
        'birth_day' => (int) ($existing['birth_day'] ?? 0),
        'birth_month' => (int) ($existing['birth_month'] ?? 0),
        'updated_at' => gmdate('c'),
    ];
    portal_json_write(portal_employee_directory_file(), $employees);

    $_SESSION['portal_user']['display_name'] = $employees[$email]['name'];
    portal_audit('employee_profile_saved', ['email_hash' => hash('sha256', $email)]);
    return $employees[$email];
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

function portal_birthday_gifts_file(): string
{
    return portal_storage_root() . DIRECTORY_SEPARATOR . 'security' . DIRECTORY_SEPARATOR . 'birthday-gifts.json';
}

function portal_birthday_gifts(): array
{
    return portal_json_read(portal_birthday_gifts_file());
}

function portal_birthday_gift(string $email, int $year): ?array
{
    $email = portal_normalize_company_email($email) ?? '';
    if ($email === '' || $year < 2026 || $year > 2100) {
        return null;
    }
    $gift = portal_birthday_gifts()[(string) $year][$email] ?? null;
    return is_array($gift) ? $gift : null;
}

function portal_birthday_gift_dir(string $email, int $year): string
{
    return portal_storage_root()
        . DIRECTORY_SEPARATOR
        . 'birthday-gifts'
        . DIRECTORY_SEPARATOR
        . $year
        . DIRECTORY_SEPARATOR
        . hash('sha256', strtolower($email));
}

function portal_save_birthday_gift(
    string $email,
    int $year,
    string $title,
    string $message,
    string $couponCode,
    string $redemptionUrl,
    array $file
): void {
    $email = portal_normalize_company_email($email) ?? '';
    $employee = portal_employee_directory()[$email] ?? null;
    if (!is_array($employee) || (int) ($employee['birth_month'] ?? 0) === 0) {
        throw new RuntimeException('יש לבחור עובד עם תאריך יום הולדת שמור.');
    }
    if ($year < (int) date('Y') || $year > (int) date('Y') + 2) {
        throw new RuntimeException('שנת המתנה אינה תקינה.');
    }
    if ($title === '') {
        throw new RuntimeException('יש להזין כותרת למתנה.');
    }
    if ($redemptionUrl !== '') {
        $validatedUrl = filter_var($redemptionUrl, FILTER_VALIDATE_URL);
        if ($validatedUrl === false || strtolower((string) parse_url($redemptionUrl, PHP_URL_SCHEME)) !== 'https') {
            throw new RuntimeException('קישור המימוש חייב להיות כתובת HTTPS תקינה.');
        }
    }

    $existing = portal_birthday_gift($email, $year);
    $attachments = portal_save_uploads(portal_birthday_gift_dir($email, $year), $file);
    $attachment = $attachments[0] ?? ($existing['attachment'] ?? null);
    if ($couponCode === '' && $redemptionUrl === '' && !is_array($attachment)) {
        throw new RuntimeException('יש להזין קוד קופון, קישור מימוש או לצרף קובץ מתנה.');
    }

    $gifts = portal_birthday_gifts();
    $gifts[(string) $year][$email] = [
        'title' => portal_substr($title, 0, 160),
        'message' => portal_substr($message, 0, 1200),
        'coupon_code' => portal_substr($couponCode, 0, 160),
        'redemption_url' => portal_substr($redemptionUrl, 0, 500),
        'attachment' => is_array($attachment) ? $attachment : null,
        'updated_at' => gmdate('c'),
        'updated_by' => (string) ($_SESSION['portal_user']['email'] ?? $_SESSION['portal_user']['username'] ?? 'system'),
    ];
    portal_json_write(portal_birthday_gifts_file(), $gifts);
}

function portal_birthday_gift_attachment(string $email, int $year, array $gift): ?array
{
    $attachment = $gift['attachment'] ?? null;
    if (!is_array($attachment)) {
        return null;
    }
    $storageName = basename((string) ($attachment['storage_name'] ?? ''));
    if ($storageName === '' || $storageName !== (string) ($attachment['storage_name'] ?? '')) {
        return null;
    }
    $path = portal_birthday_gift_dir($email, $year)
        . DIRECTORY_SEPARATOR
        . 'files'
        . DIRECTORY_SEPARATOR
        . $storageName;
    if (!is_file($path)) {
        return null;
    }
    return [
        'path' => $path,
        'name' => (string) ($attachment['original_name'] ?? 'birthday-gift'),
        'mime' => (string) ($attachment['mime'] ?? 'application/octet-stream'),
        'size' => (int) ($attachment['size'] ?? filesize($path)),
    ];
}

function portal_birthday_notification_state_file(): string
{
    return portal_storage_root() . DIRECTORY_SEPARATOR . 'security' . DIRECTORY_SEPARATOR . 'birthday-notifications.json';
}

function portal_birthday_date_matches(array $employee, DateTimeImmutable $date): bool
{
    return (int) ($employee['birth_day'] ?? 0) === (int) $date->format('j')
        && (int) ($employee['birth_month'] ?? 0) === (int) $date->format('n');
}

function portal_birthday_gift_email_body(array $employee, array $gift): string
{
    $lines = [
        'שלום ' . (string) ($employee['name'] ?? '') . ',',
        '',
        'מזל טוב ליום הולדתך! 🎉',
        'כל צוות I Feel מאחל לך יום שמח, בריאות, הצלחה והרבה רגעים טובים.',
        '',
        'מחכה לך מתנה אישית באזור העובדים:',
        'https://i-feel.co.il/staff-expenses/',
        '',
        (string) ($gift['title'] ?? 'מתנת יום הולדת'),
    ];
    if (trim((string) ($gift['message'] ?? '')) !== '') {
        $lines[] = (string) $gift['message'];
    }
    if (trim((string) ($gift['coupon_code'] ?? '')) !== '') {
        $lines[] = 'קוד קופון: ' . (string) $gift['coupon_code'];
    }
    if (trim((string) ($gift['redemption_url'] ?? '')) !== '') {
        $lines[] = 'קישור למימוש: ' . (string) $gift['redemption_url'];
    }
    $lines[] = '';
    $lines[] = 'באהבה,';
    $lines[] = 'כל צוות I Feel';
    return implode("\r\n", $lines);
}

function portal_process_birthday_notifications(
    DateTimeImmutable $now,
    ?callable $mailer = null
): array {
    $mailer ??= static fn(string $email, string $subject, string $body, array $attachments): bool =>
        portal_send_mail_with_attachments($email, $subject, $body, $attachments);
    $localNow = $now->setTimezone(new DateTimeZone('Asia/Jerusalem'));
    $tomorrow = $localNow->modify('+1 day');
    $year = (int) $localNow->format('Y');
    $state = portal_json_read(portal_birthday_notification_state_file());
    $result = ['reminders_sent' => 0, 'greetings_sent' => 0, 'missing_gifts' => 0, 'failed' => 0];
    $changed = false;

    foreach (portal_employee_directory() as $email => $employee) {
        if (portal_birthday_date_matches($employee, $tomorrow)) {
            $token = 'reminder:' . $tomorrow->format('Y') . ':' . $email;
            if (!isset($state[$token])) {
                $gift = portal_birthday_gift($email, (int) $tomorrow->format('Y'));
                $giftStatus = $gift === null
                    ? 'עדיין לא הוגדרה מתנה. יש להיכנס למסך "עובדים וימי הולדת" ולהעלות קופון.'
                    : 'המתנה כבר מוכנה במערכת.';
                $bodyLines = [
                    'אורן שלום,',
                    '',
                    'מחר יום ההולדת של ' . (string) ($employee['name'] ?? '') . '.',
                    $giftStatus,
                    '',
                    'ניהול המתנה:',
                    'https://i-feel.co.il/staff-expenses/?tab=employees',
                ];
                if ($gift !== null) {
                    $bodyLines[] = '';
                    $bodyLines[] = 'העתק הברכה והמתנה המתוכננות למחר:';
                    $bodyLines[] = '--------------------------------';
                    $bodyLines[] = portal_birthday_gift_email_body($employee, $gift);
                }
                $bodyLines[] = '';
                $bodyLines[] = 'I Feel';
                $body = implode("\r\n", $bodyLines);
                if ($mailer('oren@' . portal_company_email_domain(), 'תזכורת: יום הולדת מחר - ' . (string) ($employee['name'] ?? ''), $body, [])) {
                    $state[$token] = gmdate('c');
                    $result['reminders_sent']++;
                    $changed = true;
                } else {
                    $result['failed']++;
                }
            }
        }

        if (!portal_birthday_date_matches($employee, $localNow)) {
            continue;
        }
        $token = 'greeting:' . $year . ':' . $email;
        if (isset($state[$token])) {
            continue;
        }
        $gift = portal_birthday_gift($email, $year);
        if ($gift === null) {
            $result['missing_gifts']++;
            continue;
        }
        $attachment = portal_birthday_gift_attachment($email, $year, $gift);
        $attachments = $attachment === null ? [] : [$attachment];
        if ($mailer(
            $email,
            'מזל טוב ליום ההולדת מכל צוות I Feel 🎉',
            portal_birthday_gift_email_body($employee, $gift),
            $attachments
        )) {
            $state[$token] = gmdate('c');
            $result['greetings_sent']++;
            $changed = true;
        } else {
            $result['failed']++;
        }
    }

    if ($changed) {
        portal_json_write(portal_birthday_notification_state_file(), $state);
    }
    return $result;
}

function portal_handle_birthday_gift_download(array $user): never
{
    $email = portal_normalize_company_email((string) ($_GET['gift_email'] ?? '')) ?? '';
    $year = filter_var($_GET['gift_year'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 2026, 'max_range' => 2100]]);
    $viewerEmail = portal_normalize_company_email((string) ($user['email'] ?? '')) ?? '';
    if ($email === '' || $year === false || (($user['role'] ?? '') !== 'admin' && !hash_equals($viewerEmail, $email))) {
        http_response_code(403);
        exit('Forbidden');
    }
    $gift = portal_birthday_gift($email, (int) $year);
    $attachment = $gift === null ? null : portal_birthday_gift_attachment($email, (int) $year, $gift);
    if ($attachment === null) {
        http_response_code(404);
        exit('Not found');
    }
    $ascii = preg_replace('/[^A-Za-z0-9._-]/', '_', $attachment['name']) ?: 'birthday-gift';
    header('Content-Type: ' . $attachment['mime']);
    header('Content-Length: ' . $attachment['size']);
    header('Content-Disposition: attachment; filename="' . $ascii . '"; filename*=UTF-8\'\'' . rawurlencode($attachment['name']));
    portal_audit('birthday_gift_downloaded', ['email_hash' => hash('sha256', $email), 'year' => (int) $year]);
    readfile($attachment['path']);
    exit;
}

function portal_render_birthday_banner(array $user): void
{
    if (!portal_employee_has_birthday_this_month($user)) {
        return;
    }
    $entry = portal_employee_directory_entry($user);
    $name = trim((string) ($entry['name'] ?? ''));
    $firstName = preg_split('/\s+/u', $name)[0] ?? $name;
    $year = (int) (new DateTimeImmutable('now', new DateTimeZone('Asia/Jerusalem')))->format('Y');
    $gift = portal_birthday_gift((string) ($entry['email'] ?? ''), $year);
    ?>
    <section class="birthday-banner" role="status" aria-label="ברכת יום הולדת">
        <span class="birthday-banner__icon" aria-hidden="true">🎉</span>
        <div>
            <strong>מזל טוב, <?= portal_h($firstName) ?>!</strong>
            <span>זה חודש יום ההולדת שלך. כל צוות I Feel מאחל לך חודש שמח, בריאות והצלחה.</span>
            <?php if ($gift !== null): ?>
                <div class="birthday-gift">
                    <b>🎁 <?= portal_h($gift['title'] ?? 'מתנת יום הולדת') ?></b>
                    <?php if (($gift['message'] ?? '') !== ''): ?><span><?= nl2br(portal_h($gift['message'])) ?></span><?php endif; ?>
                    <?php if (($gift['coupon_code'] ?? '') !== ''): ?><code><?= portal_h($gift['coupon_code']) ?></code><?php endif; ?>
                    <div class="birthday-gift__actions">
                        <?php if (($gift['redemption_url'] ?? '') !== ''): ?><a class="button button--small button--primary" href="<?= portal_h($gift['redemption_url']) ?>" rel="noopener noreferrer">מימוש המתנה</a><?php endif; ?>
                        <?php if (is_array($gift['attachment'] ?? null)): ?><a class="button button--small button--secondary" href="<?= portal_h(portal_url(['action' => 'gift_download', 'gift_email' => $entry['email'], 'gift_year' => $year])) ?>">הורדת הקופון</a><?php endif; ?>
                    </div>
                </div>
            <?php else: ?>
                <span class="birthday-banner__gift-note">המתנה האישית שלך תופיע כאן ביום ההולדת.</span>
            <?php endif; ?>
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
                    <thead><tr><th>שם מלא</th><th>דוא"ל</th><th>טלפון</th><th>יום הולדת</th><th>מתנה <?= (int) date('Y') ?></th></tr></thead>
                    <tbody>
                    <?php if ($employees === []): ?>
                        <tr><td colspan="5" class="empty-cell">עדיין לא נשמרו פרטי עובדים.</td></tr>
                    <?php else: ?>
                        <?php foreach ($employees as $employee): ?>
                            <?php $currentGift = portal_birthday_gift($employee['email'], (int) date('Y')); ?>
                            <tr>
                                <td><strong><?= portal_h($employee['name']) ?></strong></td>
                                <td><code><?= portal_h($employee['email']) ?></code></td>
                                <td><?= portal_h($employee['phone']) ?></td>
                                <td><?= (int) $employee['birth_day'] > 0 ? portal_h($employee['birth_day'] . '/' . $employee['birth_month']) : 'לא נמסר' ?></td>
                                <td><span class="status <?= $currentGift !== null ? 'status--approved' : 'status--missing' ?>"><?= $currentGift !== null ? 'מוכנה' : 'חסרה' ?></span></td>
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

    <section class="detail-card gift-admin-card">
        <h2>🎁 העלאת מתנת יום הולדת</h2>
        <p class="muted-text">המתנה תוצג רק לעובד המתאים באזור האישי שלו. ביום ההולדת היא תישלח אליו גם בדוא"ל בשם כל צוות I Feel.</p>
        <form method="post" enctype="multipart/form-data" class="field-grid field-grid--2">
            <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
            <input type="hidden" name="action" value="save_birthday_gift">
            <input type="hidden" name="MAX_FILE_SIZE" value="<?= IFEEL_PORTAL_MAX_FILE_BYTES ?>">
            <label class="field">
                <span>עובד/ת <b>*</b></span>
                <select name="gift_employee_email" required>
                    <option value="">בחירה</option>
                    <?php foreach ($employees as $employee): ?>
                        <?php if ((int) ($employee['birth_month'] ?? 0) > 0): ?>
                            <option value="<?= portal_h($employee['email']) ?>"><?= portal_h($employee['name'] . ' — ' . $employee['birth_day'] . '/' . $employee['birth_month']) ?></option>
                        <?php endif; ?>
                    <?php endforeach; ?>
                </select>
            </label>
            <label class="field">
                <span>שנת המתנה <b>*</b></span>
                <input type="number" name="gift_year" min="<?= (int) date('Y') ?>" max="<?= (int) date('Y') + 2 ?>" value="<?= (int) date('Y') ?>" required>
            </label>
            <label class="field field--full">
                <span>כותרת המתנה <b>*</b></span>
                <input type="text" name="gift_title" maxlength="160" required placeholder="לדוגמה: ארוחת בוקר זוגית">
            </label>
            <label class="field field--full">
                <span>ברכה אישית</span>
                <textarea name="gift_message" rows="3" maxlength="1200" placeholder="הודעה שתופיע לעובד ותישלח בדוא״ל"></textarea>
            </label>
            <label class="field">
                <span>קוד קופון</span>
                <input type="text" name="gift_coupon_code" maxlength="160" autocomplete="off">
            </label>
            <label class="field">
                <span>קישור למימוש</span>
                <input type="url" name="gift_redemption_url" maxlength="500" placeholder="https://">
            </label>
            <label class="field field--full">
                <span>קובץ קופון — PDF או תמונה</span>
                <input type="file" name="gift_attachment" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.avif,application/pdf,image/*">
            </label>
            <p class="form-note field--full">יש להזין לפחות קוד קופון, קישור מימוש או קובץ מתנה. עדכון חוזר אינו מוחק קבצים קודמים מהשרת.</p>
            <div class="field--full"><button type="submit" class="button button--primary">שמירת המתנה לעובד</button></div>
        </form>
    </section>
    <?php
}
