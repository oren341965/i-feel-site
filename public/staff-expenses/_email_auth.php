<?php
declare(strict_types=1);

const IFEEL_PORTAL_EMAIL_DOMAIN = 'i-feel.co.il';
const IFEEL_PORTAL_EMAIL_CODE_TTL = 600;
const IFEEL_PORTAL_EMAIL_CODE_MAX_ATTEMPTS = 5;
const IFEEL_PORTAL_EMAIL_CODE_RESEND_SECONDS = 60;

function portal_company_email_domain(): string
{
    $configured = '';
    if (defined('EXPENSE_PORTAL_EMAIL_DOMAIN')) {
        $configured = trim((string) constant('EXPENSE_PORTAL_EMAIL_DOMAIN'));
    }
    if ($configured === '') {
        $configured = trim((string) getenv('EXPENSE_PORTAL_EMAIL_DOMAIN'));
    }
    $domain = strtolower($configured !== '' ? $configured : IFEEL_PORTAL_EMAIL_DOMAIN);
    return preg_match('/^[a-z0-9.-]+$/', $domain) ? $domain : IFEEL_PORTAL_EMAIL_DOMAIN;
}

function portal_normalize_company_email(string $email): ?string
{
    $email = strtolower(trim($email));
    if ($email === '' || strlen($email) > 160 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        return null;
    }

    [$local, $domain] = array_pad(explode('@', $email, 2), 2, '');
    if ($domain !== portal_company_email_domain()) {
        return null;
    }
    if (!preg_match('/^[a-z0-9._+-]{1,64}$/', $local)) {
        return null;
    }

    return $local . '@' . $domain;
}

function portal_email_admins(): array
{
    $values = ['oren@' . portal_company_email_domain()];

    if (defined('EXPENSE_PORTAL_ADMIN_EMAILS')) {
        $configured = constant('EXPENSE_PORTAL_ADMIN_EMAILS');
        if (is_array($configured)) {
            $values = array_merge($values, $configured);
        } elseif (is_string($configured)) {
            $values = array_merge($values, preg_split('/[\s,;]+/', $configured) ?: []);
        }
    }

    $environment = trim((string) getenv('EXPENSE_PORTAL_ADMIN_EMAILS'));
    if ($environment !== '') {
        $values = array_merge($values, preg_split('/[\s,;]+/', $environment) ?: []);
    }

    $admins = [];
    foreach ($values as $value) {
        if (!is_string($value)) {
            continue;
        }
        $email = portal_normalize_company_email($value);
        if ($email !== null) {
            $admins[$email] = true;
        }
    }
    return array_keys($admins);
}

function portal_email_challenge(): ?array
{
    $challenge = $_SESSION['portal_email_challenge'] ?? null;
    if (!is_array($challenge)) {
        return null;
    }

    $email = portal_normalize_company_email((string) ($challenge['email'] ?? ''));
    $expiresAt = (int) ($challenge['expires_at'] ?? 0);
    $codeHash = (string) ($challenge['code_hash'] ?? '');
    if ($email === null || $expiresAt <= 0 || $codeHash === '') {
        unset($_SESSION['portal_email_challenge']);
        return null;
    }

    $challenge['email'] = $email;
    return $challenge;
}

function portal_clear_email_challenge(): void
{
    unset($_SESSION['portal_email_challenge']);
}

function portal_email_subject(string $subject): string
{
    if (function_exists('mb_encode_mimeheader')) {
        return mb_encode_mimeheader($subject, 'UTF-8', 'B', "\r\n");
    }
    return '=?UTF-8?B?' . base64_encode($subject) . '?=';
}

function portal_email_setting(string $name, string $default = ''): string
{
    if (defined($name)) {
        $value = trim((string) constant($name));
        if ($value !== '') {
            return $value;
        }
    }
    $value = trim((string) getenv($name));
    return $value !== '' ? $value : $default;
}

function portal_smtp_read($socket): string
{
    $response = '';
    do {
        $line = fgets($socket, 4096);
        if ($line === false) {
            throw new RuntimeException('SMTP connection closed unexpectedly.');
        }
        $response .= $line;
    } while (strlen($line) >= 4 && $line[3] === '-');
    return $response;
}

function portal_smtp_expect($socket, array $codes): string
{
    $response = portal_smtp_read($socket);
    $code = (int) substr($response, 0, 3);
    if (!in_array($code, $codes, true)) {
        throw new RuntimeException('SMTP server rejected the request (code ' . $code . ').');
    }
    return $response;
}

function portal_smtp_command($socket, string $command, array $codes): string
{
    if (fwrite($socket, $command . "\r\n") === false) {
        throw new RuntimeException('Unable to write to SMTP server.');
    }
    return portal_smtp_expect($socket, $codes);
}

function portal_smtp_send(string $recipient, string $subject, string $body, array $headers): bool
{
    $host = portal_email_setting('EXPENSE_PORTAL_SMTP_HOST');
    if ($host === '') {
        return false;
    }

    $port = (int) portal_email_setting('EXPENSE_PORTAL_SMTP_PORT', '587');
    $security = strtolower(portal_email_setting('EXPENSE_PORTAL_SMTP_SECURITY', 'tls'));
    $username = portal_email_setting('EXPENSE_PORTAL_SMTP_USERNAME');
    $password = portal_email_setting('EXPENSE_PORTAL_SMTP_PASSWORD');
    $timeout = max(5, min(30, (int) portal_email_setting('EXPENSE_PORTAL_SMTP_TIMEOUT', '15')));
    if ($port < 1 || $port > 65535 || !in_array($security, ['tls', 'ssl', 'none'], true)) {
        throw new RuntimeException('Invalid SMTP configuration.');
    }

    $transport = $security === 'ssl' ? 'ssl://' : 'tcp://';
    $socket = @stream_socket_client(
        $transport . $host . ':' . $port,
        $errorNumber,
        $errorMessage,
        $timeout,
        STREAM_CLIENT_CONNECT
    );
    if (!is_resource($socket)) {
        throw new RuntimeException('Unable to connect to SMTP server (' . $errorNumber . ').');
    }

    try {
        stream_set_timeout($socket, $timeout);
        portal_smtp_expect($socket, [220]);
        $serverName = preg_replace('/[^A-Za-z0-9.-]/', '', portal_company_email_domain()) ?: 'localhost';
        portal_smtp_command($socket, 'EHLO ' . $serverName, [250]);

        if ($security === 'tls') {
            portal_smtp_command($socket, 'STARTTLS', [220]);
            if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException('Unable to establish encrypted SMTP connection.');
            }
            portal_smtp_command($socket, 'EHLO ' . $serverName, [250]);
        }

        if ($username !== '') {
            if ($password === '') {
                throw new RuntimeException('SMTP password is missing.');
            }
            portal_smtp_command($socket, 'AUTH LOGIN', [334]);
            portal_smtp_command($socket, base64_encode($username), [334]);
            portal_smtp_command($socket, base64_encode($password), [235]);
        }

        $sender = portal_email_setting('EXPENSE_PORTAL_FROM_EMAIL', 'no-reply@' . portal_company_email_domain());
        portal_smtp_command($socket, 'MAIL FROM:<' . $sender . '>', [250]);
        portal_smtp_command($socket, 'RCPT TO:<' . $recipient . '>', [250, 251]);
        portal_smtp_command($socket, 'DATA', [354]);

        $message = implode("\r\n", $headers)
            . "\r\nSubject: " . $subject
            . "\r\nTo: <" . $recipient . ">"
            . "\r\n\r\n" . $body;
        $message = preg_replace('/(?m)^\./', '..', $message) ?? $message;
        portal_smtp_command($socket, $message . "\r\n.", [250]);
        portal_smtp_command($socket, 'QUIT', [221]);
        return true;
    } finally {
        fclose($socket);
    }
}

function portal_send_email_code(string $email, string $code): bool
{
    $sender = '';
    if (defined('EXPENSE_PORTAL_FROM_EMAIL')) {
        $sender = trim((string) constant('EXPENSE_PORTAL_FROM_EMAIL'));
    }
    if ($sender === '') {
        $sender = trim((string) getenv('EXPENSE_PORTAL_FROM_EMAIL'));
    }
    if (filter_var($sender, FILTER_VALIDATE_EMAIL) === false) {
        $sender = 'no-reply@' . portal_company_email_domain();
    }

    $subject = portal_email_subject('קוד כניסה לאזור עובדי I Feel');
    $body = implode("\r\n", [
        'שלום,',
        '',
        'קוד הכניסה שלך לאזור דיווח ההוצאות של I Feel הוא:',
        '',
        $code,
        '',
        'הקוד תקף ל-10 דקות וניתן לשימוש פעם אחת בלבד.',
        'אם לא ביקשת את הקוד, אין צורך לבצע פעולה.',
        '',
        'I Feel',
    ]);
    $headers = [
        'From: I Feel <' . $sender . '>',
        'Reply-To: ' . $sender,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        'X-Mailer: I Feel Staff Expenses Portal',
    ];

    if (portal_email_setting('EXPENSE_PORTAL_SMTP_HOST') !== '') {
        try {
            return portal_smtp_send($email, $subject, $body, $headers);
        } catch (Throwable $error) {
            error_log('Staff expenses SMTP delivery failed: ' . $error->getMessage());
            return false;
        }
    }

    return function_exists('mail') && mail($email, $subject, $body, implode("\r\n", $headers));
}

function portal_request_email_code(string $input): string
{
    $blocked = portal_login_is_blocked();
    if ($blocked > 0) {
        throw new RuntimeException('הכניסה נחסמה זמנית בעקבות ניסיונות רבים. ניתן לנסות שוב בעוד כ-' . (int) ceil($blocked / 60) . ' דקות.');
    }

    $email = portal_normalize_company_email($input);
    if ($email === null) {
        portal_record_login_failure();
        usleep(random_int(200000, 500000));
        throw new RuntimeException('הגישה מותרת רק באמצעות כתובת דוא״ל המסתיימת ב-@' . portal_company_email_domain() . '.');
    }

    $existing = portal_email_challenge();
    if (is_array($existing)
        && hash_equals((string) ($existing['email'] ?? ''), $email)
        && time() - (int) ($existing['sent_at'] ?? 0) < IFEEL_PORTAL_EMAIL_CODE_RESEND_SECONDS) {
        $wait = IFEEL_PORTAL_EMAIL_CODE_RESEND_SECONDS - (time() - (int) ($existing['sent_at'] ?? 0));
        throw new RuntimeException('קוד כבר נשלח. ניתן לבקש קוד חדש בעוד כ-' . max(1, $wait) . ' שניות.');
    }

    $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $_SESSION['portal_email_challenge'] = [
        'email' => $email,
        'code_hash' => password_hash($code, PASSWORD_DEFAULT),
        'created_at' => time(),
        'sent_at' => time(),
        'expires_at' => time() + IFEEL_PORTAL_EMAIL_CODE_TTL,
        'attempts' => 0,
    ];

    if (!portal_send_email_code($email, $code)) {
        portal_clear_email_challenge();
        portal_audit('email_code_delivery_failed', ['email_hash' => hash('sha256', $email)]);
        throw new RuntimeException('לא ניתן היה לשלוח את קוד הכניסה. יש לנסות שוב או לפנות למנהל המערכת.');
    }

    portal_audit('email_code_sent', ['email_hash' => hash('sha256', $email)]);
    return $email;
}

function portal_verify_email_code(string $input): array
{
    $blocked = portal_login_is_blocked();
    if ($blocked > 0) {
        throw new RuntimeException('הכניסה נחסמה זמנית בעקבות ניסיונות רבים. ניתן לנסות שוב בעוד כ-' . (int) ceil($blocked / 60) . ' דקות.');
    }

    $challenge = portal_email_challenge();
    if ($challenge === null) {
        throw new RuntimeException('לא נמצאה בקשת כניסה פעילה. יש להזין מחדש את כתובת הדוא״ל.');
    }
    if ((int) ($challenge['expires_at'] ?? 0) < time()) {
        portal_clear_email_challenge();
        throw new RuntimeException('תוקף קוד הכניסה פג. יש לבקש קוד חדש.');
    }

    $code = preg_replace('/\D+/', '', trim($input)) ?? '';
    $valid = strlen($code) === 6 && password_verify($code, (string) ($challenge['code_hash'] ?? ''));
    if (!$valid) {
        $challenge['attempts'] = (int) ($challenge['attempts'] ?? 0) + 1;
        $_SESSION['portal_email_challenge'] = $challenge;
        portal_record_login_failure();
        usleep(random_int(250000, 650000));

        if ($challenge['attempts'] >= IFEEL_PORTAL_EMAIL_CODE_MAX_ATTEMPTS) {
            portal_clear_email_challenge();
            throw new RuntimeException('בוצעו יותר מדי ניסיונות שגויים. יש לבקש קוד חדש מאוחר יותר.');
        }
        throw new RuntimeException('קוד הכניסה שגוי. נותרו ' . (IFEEL_PORTAL_EMAIL_CODE_MAX_ATTEMPTS - $challenge['attempts']) . ' ניסיונות.');
    }

    $email = (string) $challenge['email'];
    $isAdmin = in_array($email, portal_email_admins(), true);
    $username = $isAdmin ? 'oren' : 'employee';
    $accounts = portal_users();
    $account = $accounts[$username] ?? null;
    if (!is_array($account) || !(bool) ($account['active'] ?? false)) {
        portal_clear_email_challenge();
        throw new RuntimeException('הגישה לכתובת זו הושבתה. יש לפנות למנהל המערכת.');
    }

    portal_clear_login_failures();
    session_regenerate_id(true);
    $_SESSION['portal_user'] = [
        'username' => $username,
        'display_name' => $isAdmin ? (string) ($account['display_name'] ?? 'אורן לוי') : $email,
        'role' => $isAdmin ? 'admin' : 'employee',
        'email' => $email,
        'auth_method' => 'company_email_code',
        'logged_in_at' => time(),
        'last_activity' => time(),
    ];
    portal_clear_email_challenge();
    unset($_SESSION['portal_csrf']);
    portal_csrf_token();
    portal_audit('email_login_success', ['email_hash' => hash('sha256', $email), 'role' => $isAdmin ? 'admin' : 'employee']);
    return $_SESSION['portal_user'];
}

function portal_render_email_entry(?string $error = null, string $email = ''): never
{
    $blocked = portal_login_is_blocked();
    portal_page_start('כניסה באמצעות דוא״ל חברה');
    ?>
    <section class="login-card">
        <img src="/assets/ifeel-logo.png" alt="I Feel" class="login-logo">
        <div class="security-mark" aria-hidden="true">●</div>
        <h1>כניסה לאזור העובדים</h1>
        <p>יש להזין כתובת דוא״ל ארגונית של I Feel. קוד חד-פעמי יישלח לתיבת הדואר ורק לאחר אימותו תיפתח הגישה לדוח.</p>
        <?php if ($error !== null): ?>
            <div class="alert alert--error" role="alert"><?= portal_h($error) ?></div>
        <?php endif; ?>
        <?php if ($blocked > 0): ?>
            <div class="alert alert--error" role="alert">הכניסה נחסמה זמנית. ניתן לנסות שוב בעוד כ-<?= (int) ceil($blocked / 60) ?> דקות.</div>
        <?php endif; ?>
        <form method="post" autocomplete="on" class="stack-form">
            <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
            <input type="hidden" name="action" value="request_email_code">
            <label>
                <span>דוא״ל I Feel</span>
                <input type="email" name="email" autocomplete="email" required maxlength="160" dir="ltr" placeholder="name@<?= portal_h(portal_company_email_domain()) ?>" value="<?= portal_h($email) ?>" <?= $blocked > 0 ? 'disabled' : '' ?>>
            </label>
            <button type="submit" class="button button--primary button--wide" <?= $blocked > 0 ? 'disabled' : '' ?>>שליחת קוד כניסה</button>
        </form>
        <p class="login-note">כתובות שאינן מסתיימות ב-@<?= portal_h(portal_company_email_domain()) ?> אינן מקבלות גישה. הזנת כתובת בלבד אינה מספיקה: חובה לאמת את הקוד שנשלח אליה.</p>
    </section>
    <?php
    portal_page_end();
    exit;
}

function portal_render_email_code(?string $error = null): never
{
    $challenge = portal_email_challenge();
    if ($challenge === null) {
        portal_render_email_entry($error);
    }
    $email = (string) $challenge['email'];
    $remaining = max(0, (int) ($challenge['expires_at'] ?? 0) - time());

    portal_page_start('אימות קוד כניסה');
    ?>
    <section class="login-card">
        <img src="/assets/ifeel-logo.png" alt="I Feel" class="login-logo">
        <div class="security-mark" aria-hidden="true">●</div>
        <h1>אימות כתובת הדוא״ל</h1>
        <p>קוד בן 6 ספרות נשלח אל <strong dir="ltr"><?= portal_h($email) ?></strong>. הקוד תקף לעוד כ-<?= (int) ceil($remaining / 60) ?> דקות.</p>
        <?php if ($error !== null): ?>
            <div class="alert alert--error" role="alert"><?= portal_h($error) ?></div>
        <?php endif; ?>
        <form method="post" autocomplete="on" class="stack-form">
            <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
            <input type="hidden" name="action" value="verify_email_code">
            <label>
                <span>קוד כניסה</span>
                <input type="text" name="code" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" required dir="ltr" autofocus>
            </label>
            <button type="submit" class="button button--primary button--wide">אימות וכניסה לדוח</button>
        </form>
        <form method="post" class="inline-form">
            <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
            <input type="hidden" name="action" value="restart_email_login">
            <button type="submit" class="button button--ghost button--small">שינוי כתובת הדוא״ל</button>
        </form>
    </section>
    <?php
    portal_page_end();
    exit;
}
