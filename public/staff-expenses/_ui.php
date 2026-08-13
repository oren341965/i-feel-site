<?php
declare(strict_types=1);

function portal_flash_set(string $type, string $message): void
{
    $_SESSION['portal_flash'] = ['type' => $type, 'message' => $message];
}

function portal_flash_take(): ?array
{
    $flash = $_SESSION['portal_flash'] ?? null;
    unset($_SESSION['portal_flash']);
    return is_array($flash) ? $flash : null;
}

function portal_valid_date(string $value): bool
{
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
        return false;
    }
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    return $date !== false && $date->format('Y-m-d') === $value;
}

function portal_page_start(string $title, ?array $user = null): void
{
    $fullTitle = $title . ' | אזור עובדי I Feel';
    $csrf = portal_csrf_token();
    ?>
<!doctype html>
<html lang="he" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#1769aa">
    <meta name="robots" content="noindex,nofollow,noarchive,nosnippet,noimageindex">
    <title><?= portal_h($fullTitle) ?></title>
    <link rel="icon" type="image/png" href="/assets/favicon.png">
    <link rel="stylesheet" href="<?= portal_h(portal_base_path()) ?>portal.css?v=<?= portal_h(IFEEL_PORTAL_VERSION) ?>">
    <script defer src="<?= portal_h(portal_base_path()) ?>portal.js?v=<?= portal_h(IFEEL_PORTAL_VERSION) ?>"></script>
</head>
<body>
<?php if ($user !== null): ?>
    <header class="portal-header">
        <div class="portal-header__inner">
            <div class="brand-block">
                <img src="/assets/ifeel-logo.png" alt="I Feel" class="brand-logo">
                <div>
                    <strong>אזור עובדים</strong>
                    <span>הוצאות, מסמכים ומסירות</span>
                </div>
            </div>
            <div class="user-block">
                <span><?= portal_h($user['display_name'] ?? $user['username'] ?? '') ?></span>
                <form method="post" class="inline-form">
                    <input type="hidden" name="csrf" value="<?= portal_h($csrf) ?>">
                    <input type="hidden" name="action" value="logout">
                    <button type="submit" class="button button--ghost button--small">יציאה</button>
                </form>
            </div>
        </div>
    </header>
<?php endif; ?>
<main class="portal-main<?= $user === null ? ' portal-main--login' : '' ?>">
<?php
}

function portal_page_end(): void
{
    ?>
</main>
<footer class="portal-footer">מערכת פנימית לעובדי I Feel בלבד · גרסה <?= portal_h(IFEEL_PORTAL_VERSION) ?></footer>
</body>
</html>
<?php
}

function portal_render_flash(?array $flash): void
{
    if ($flash === null) {
        return;
    }
    $type = in_array($flash['type'] ?? '', ['success', 'error', 'info'], true) ? $flash['type'] : 'info';
    ?>
    <div class="alert alert--<?= portal_h($type) ?>" role="status"><?= portal_h($flash['message'] ?? '') ?></div>
    <?php
}

function portal_render_login(?string $error = null): void
{
    $blocked = portal_login_is_blocked();
    portal_page_start('כניסה מאובטחת');
    ?>
    <section class="login-card">
        <img src="/assets/ifeel-logo.png" alt="I Feel" class="login-logo">
        <div class="security-mark" aria-hidden="true">●</div>
        <h1>כניסה לאזור העובדים</h1>
        <p>הגישה מיועדת לעובדי I Feel המורשים בלבד.</p>
        <?php if ($error !== null): ?>
            <div class="alert alert--error" role="alert"><?= portal_h($error) ?></div>
        <?php endif; ?>
        <?php if ($blocked > 0): ?>
            <div class="alert alert--error" role="alert">הכניסה נחסמה זמנית בעקבות ניסיונות שגויים. ניתן לנסות שוב בעוד כ-<?= (int) ceil($blocked / 60) ?> דקות.</div>
        <?php endif; ?>
        <form method="post" autocomplete="on" class="stack-form">
            <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
            <input type="hidden" name="action" value="login">
            <label>
                <span>שם משתמש</span>
                <input type="text" name="username" autocomplete="username" required maxlength="40" inputmode="text" <?= $blocked > 0 ? 'disabled' : '' ?>>
            </label>
            <label>
                <span>סיסמה</span>
                <input type="password" name="password" autocomplete="current-password" required maxlength="200" <?= $blocked > 0 ? 'disabled' : '' ?>>
            </label>
            <button type="submit" class="button button--primary button--wide" <?= $blocked > 0 ? 'disabled' : '' ?>>כניסה מאובטחת</button>
        </form>
        <p class="login-note">המערכת אינה מופיעה בתפריטי האתר או במנועי חיפוש. כל ניסיון כניסה מתועד.</p>
    </section>
    <?php
    portal_page_end();
    exit;
}
