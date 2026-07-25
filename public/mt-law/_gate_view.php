<?php
declare(strict_types=1);

if (!function_exists('str_contains')) {
    function str_contains(string $haystack, string $needle): bool
    {
        return $needle === '' || strpos($haystack, $needle) !== false;
    }
}

function mtlaw_gate_verified_header(array $user, string $csrf): string
{
    $logo = mtlaw_h(MTLAW_GATE_LOGO_PATH);
    $email = mtlaw_h((string) ($user['email'] ?? ''));
    return <<<HTML
<header class="gate-verified-header no-print">
  <div class="gate-verified-shell">
    <a class="gate-ifeel-brand" href="/" aria-label="I Feel, דף הבית">
      <img src="/assets/ifeel-logo.png" alt="I Feel" width="140" height="145">
      <span>בית חכם, אודיו ואבטחה</span>
    </a>
    <span class="gate-brand-divider" aria-hidden="true">×</span>
    <img class="gate-mt-logo" src="{$logo}" alt="מרקמן טומשין ושות׳">
    <div class="gate-verified-tools">
      <span class="gate-verified-email">מחובר: {$email}</span>
      <form method="post" action="/mt-law/gate.php">
        <input type="hidden" name="csrf" value="{$csrf}">
        <input type="hidden" name="action" value="logout">
        <button type="submit">יציאה</button>
      </form>
    </div>
  </div>
</header>
HTML;
}

function mtlaw_gate_staff_panel(): string
{
    $stats = mtlaw_gate_stats();
    $verified = (int) $stats['verified'];
    $subscribers = (int) $stats['subscribers'];
    $month = (int) $stats['month'];
    $accesses = (int) $stats['accesses'];
    return <<<HTML
<section class="content-card gate-admin-card no-print" id="mailing-admin">
  <div class="section-heading">
    <div>
      <p class="eyebrow">רישום כניסות ורשימת הדיוור</p>
      <h2>בקרת הצטרפות לעובדי I Feel</h2>
      <p>כל כניסה נרשמת רק לאחר אימות הדואר והסכמה מפורשת. ל-CSV של קרן נכנסים רק עובדי MT-Law שאימתו את הדואר ואישרו קבלת עדכונים והטבות.</p>
    </div>
  </div>
  <div class="gate-admin-stats">
    <div><strong>{$verified}</strong><span>עובדי MT-Law שאומתו</span></div>
    <div><strong>{$accesses}</strong><span>כניסות מאומתות</span></div>
    <div><strong>{$subscribers}</strong><span>אישרו דיוור</span></div>
    <div><strong>{$month}</strong><span>מצטרפים החודש</span></div>
  </div>
  <div class="button-row gate-admin-actions">
    <a class="primary-button" href="/mt-law/gate.php?view=mailing-csv&amp;period=month">הורדת מצטרפי החודש ל-Smoove</a>
    <a class="ghost-button" href="/mt-law/gate.php?view=mailing-csv&amp;period=all">הורדת כל המאושרים</a>
  </div>
</section>
HTML;
}

function mtlaw_gate_enhance_verified_output(string $html, array $user, string $csrf): string
{
    $css = '<link rel="stylesheet" href="/mt-law/gate.css?v=20260725-2">';
    if (!str_contains($html, '/mt-law/gate.css')) {
        $html = str_replace('</head>', $css . "\n</head>", $html);
    }
    $header = mtlaw_gate_verified_header($user, $csrf);
    $html = preg_replace('#<header class="site-header shell">.*?</header>#s', $header, $html, 1) ?? $html;

    $view = trim((string) ($_GET['view'] ?? ''));
    if (($user['role'] ?? '') === 'staff' && !in_array($view, ['benefit', 'turntable'], true)) {
        $panel = mtlaw_gate_staff_panel();
        $html = str_replace('<footer class="footer shell">', $panel . "\n<footer class=\"footer shell\">", $html);
    }
    return $html;
}

function mtlaw_gate_render_head(string $title): void
{
    ?><!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive,nosnippet,noimageindex">
  <meta name="description" content="מתחם הטבות פרטי לעובדי מרקמן טומשין ושות׳: בית חכם, אודיו, אזעקה, מצלמות, הנחה ומתנות מיוחדות.">
  <title><?= mtlaw_h($title) ?></title>
  <link rel="stylesheet" href="/mt-law/gate.css?v=20260725-2">
</head>
<body class="gate-body"><?php
}

function mtlaw_gate_render_login(string $error, string $accessStatus, string $pendingEmail, string $csrf): void
{
    $logo = mtlaw_h(MTLAW_GATE_LOGO_PATH);
    $pendingOptIn = (bool) ($_SESSION['mtlaw_gate_marketing_opt_in'] ?? false);
    mtlaw_gate_render_head('הטבה בלעדית לעובדי מרקמן טומשין ושות׳ | I Feel');
    ?>
<header class="gate-topbar">
  <div class="gate-shell gate-brand-row">
    <a class="gate-ifeel-brand" href="/" aria-label="I Feel, דף הבית">
      <img src="/assets/ifeel-logo.png" alt="I Feel" width="140" height="145">
      <span>מערכות בית חכם ובקרת מבנה</span>
    </a>
    <span class="gate-brand-divider" aria-hidden="true">×</span>
    <img class="gate-mt-logo" src="<?= $logo ?>" alt="מרקמן טומשין ושות׳">
    <span class="gate-private-chip">מתחם הטבות פרטי לעובדי המשרד</span>
  </div>
</header>

<main>
  <section class="gate-hero" aria-labelledby="gate-title">
    <div class="gate-hero-shade" aria-hidden="true"></div>
    <div class="gate-shell gate-hero-grid">
      <div class="gate-hero-copy">
        <p class="gate-eyebrow">קבוצה נבחרת. הטבה שלא פתוחה לקהל הרחב.</p>
        <h1 id="gate-title">הבית הבא שלכם יכול להרגיש <span>חכם, בטוח ומדויק יותר</span></h1>
        <p class="gate-lead">עובדי מרקמן טומשין ושות׳ מקבלים כניסה למתחם פרטי של I Feel עם פתרונות לבית חכם, אודיו, אזעקה ומצלמות, הנחה קבועה ומתנות מיוחדות לפרויקטים זכאים.</p>

        <div class="gate-value-row" aria-label="עיקרי ההטבה">
          <div><strong>10%</strong><span>הנחה על כלל הפריטים</span></div>
          <div><strong>1 מתוך 2</strong><span>מתנות פרימיום לפי הזכאות</span></div>
          <div><strong>4 עולמות</strong><span>חשמל, אודיו, אזעקה ומצלמות</span></div>
        </div>

        <div class="gate-hero-actions">
          <a class="gate-primary-link" href="#gate-access">פתחו לי את אזור ההטבות</a>
          <a class="gate-secondary-link" href="#gate-gifts">הצצה למתנות וליכולות</a>
        </div>
        <p class="gate-trust-line">I Feel פועלת משנת 2008, עם מעל 9,000 לקוחות, תכנון, התקנה, תכנות ושירות תחת חברה אחת.</p>
      </div>

      <aside class="gate-access-card" id="gate-access" aria-labelledby="gate-access-title">
        <div class="gate-access-head">
          <span class="gate-lock" aria-hidden="true">●</span>
          <div><p>כניסה מאובטחת</p><h2 id="gate-access-title">גלו מה מחכה לכם בפנים</h2></div>
        </div>
        <p class="gate-access-intro">הזינו את כתובת הדואר הארגונית ואשרו קבלת עדכונים והטבות. קוד חד פעמי יישלח אליכם, ורק לאחר האימות יוצגו התנאים המלאים, המתנות ושאלון ההתאמה.</p>

        <?php if ($error !== ''): ?><div class="gate-alert gate-alert-error" role="alert"><?= mtlaw_h($error) ?></div><?php endif; ?>
        <?php if ($accessStatus === 'code-sent'): ?><div class="gate-alert gate-alert-success" role="status">הקוד נשלח. בדקו גם את תיקיית דואר הזבל. הקוד תקף ל-10 דקות.</div><?php endif; ?>
        <?php if ($accessStatus === 'logged-out'): ?><div class="gate-alert" role="status">החיבור נותק. אפשר להיכנס שוב בכל עת.</div><?php endif; ?>
        <?php if ($accessStatus === 'required'): ?><div class="gate-alert" role="status">כדי לצפות בהטבה יש לבצע אימות מחדש.</div><?php endif; ?>

        <?php if ($pendingEmail !== ''): ?>
          <form class="gate-access-form" method="post" action="/mt-law/gate.php" autocomplete="one-time-code">
            <input type="hidden" name="csrf" value="<?= mtlaw_h($csrf) ?>">
            <input type="hidden" name="action" value="verify_code">
            <label><span>הקוד שנשלח אל</span><strong><?= mtlaw_h($pendingEmail) ?></strong>
              <input type="text" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" placeholder="000000" required autofocus>
            </label>
            <button type="submit">אימות וכניסה למתחם</button>
          </form>
          <form class="gate-resend" method="post" action="/mt-law/gate.php">
            <input type="hidden" name="csrf" value="<?= mtlaw_h($csrf) ?>">
            <input type="hidden" name="action" value="request_code">
            <input type="hidden" name="email" value="<?= mtlaw_h($pendingEmail) ?>">
            <?php if ($pendingOptIn): ?>
              <input type="hidden" name="marketing_opt_in" value="yes">
            <?php else: ?>
              <label class="gate-consent">
                <input type="checkbox" name="marketing_opt_in" value="yes" required>
                <span><strong>אני מאשר/ת קבלת עדכונים והטבות מ-I Feel</strong><?= mtlaw_h(MTLAW_GATE_CONSENT_TEXT) ?></span>
              </label>
            <?php endif; ?>
            <button type="submit">שליחת קוד חדש</button>
          </form>
        <?php else: ?>
          <form class="gate-access-form" method="post" action="/mt-law/gate.php">
            <input type="hidden" name="csrf" value="<?= mtlaw_h($csrf) ?>">
            <input type="hidden" name="action" value="request_code">
            <label><span>דואר אלקטרוני של המשרד</span>
              <input type="email" name="email" placeholder="name@mt-law.co.il" autocomplete="email" required autofocus>
            </label>
            <label class="gate-consent">
              <input type="checkbox" name="marketing_opt_in" value="yes" required>
              <span><strong>אני מאשר/ת קבלת עדכונים והטבות מ-I Feel</strong><?= mtlaw_h(MTLAW_GATE_CONSENT_TEXT) ?><small>האישור נדרש לצורך קבלת קוד הכניסה. ניתן לבטל את ההרשמה בכל עת.</small></span>
            </label>
            <button type="submit">שלחו לי קוד והציגו לי את ההטבות</button>
          </form>
        <?php endif; ?>

        <div class="gate-security-note">
          <strong>למה צריך אימות?</strong>
          <span>ההטבה מיועדת רק לעובדי המשרד. כתובות אחרות אינן מקבלות גישה. עובדי I Feel יכולים להיכנס באמצעות דואר ארגוני לצורכי תמיכה ובדיקה.</span>
        </div>
      </aside>
    </div>
  </section>

  <section class="gate-preview" aria-labelledby="gate-preview-title">
    <div class="gate-shell">
      <div class="gate-section-heading">
        <p class="gate-eyebrow gate-eyebrow-dark">מה מחכה אחרי האימות</p>
        <h2 id="gate-preview-title">לא עוד מוצר בודד. פתרון שמחבר את הבית כולו.</h2>
        <p>מתחילים מהתמונה המלאה, ובוחרים אם להתקדם למערכת שלמה או למערכת אחת שמביאה ערך מיידי.</p>
      </div>
      <div class="gate-capability-grid">
        <article><img src="/projects/knx-smart-home-central-moshav/05-knx-touch-panel-kitchen.jpg" alt="מסך מגע KNX בבית חכם של I Feel" loading="lazy"><div><span>בית חכם</span><h3>תאורה, תריסים, מיזוג ותרחישים</h3><p>שליטה פשוטה ממפסקים, מסך ואפליקציה, בתכנון שמתאים לנכס ולשגרת החיים.</p></div></article>
        <article><img src="/assets/projects/villa-raanana.jpg" alt="וילה חכמה בפרויקט I Feel" loading="lazy"><div><span>אודיו</span><h3>מוזיקה שמשתלבת בבית</h3><p>רמקולים שקועים, אזורי שמע ופתרונות אודיו לחללים נבחרים, בלי להעמיס על העיצוב.</p></div></article>
        <article><img src="/projects/knx-smart-home-central-moshav/12-knx-detector-outdoor-siren.jpg" alt="גלאי וצופר אזעקה בפרויקט I Feel" loading="lazy"><div><span>אזעקה</span><h3>קווית או אלחוטית לפי מצב הבית</h3><p>פתרון לבית חדש, שיפוץ או בית קיים, עם התאמה מקצועית להכנות ולצרכים.</p></div></article>
        <article><img src="/projects/knx-smart-home-central-moshav/15-outdoor-security-camera.jpg" alt="מצלמת אבטחה בפרויקט I Feel" loading="lazy"><div><span>מצלמות</span><h3>תמונה, הקלטה וגישה חכמה</h3><p>תכנון מצלמות לפי ההכנות, נקודות הצפייה, הגינה והכניסות לנכס.</p></div></article>
      </div>
    </div>
  </section>

  <section class="gate-gifts" id="gate-gifts" aria-labelledby="gate-gifts-title">
    <div class="gate-shell">
      <div class="gate-section-heading gate-section-heading-light">
        <p class="gate-eyebrow">הטבה בלעדית לעובדי המשרד</p>
        <h2 id="gate-gifts-title">10% הנחה, ובפרויקט זכאי גם מתנה שקשה להתעלם ממנה</h2>
        <p>המתנות אינן מצטברות. כאשר קיימת זכאות לשתי האפשרויות, בוחרים מתנה אחת.</p>
      </div>
      <div class="gate-gift-grid">
        <article class="gate-gift-card">
          <div class="gate-gift-image"><img src="/mt-law/product-image.php?v=2" alt="פטיפון Argon Audio TT MK2 בגוון Earth Grey" loading="lazy"></div>
          <div><span>לרכישה מעל 15,000 ש״ח</span><h3>פטיפון Argon Audio TT MK2</h3><p>מתנת אודיו מעוצבת עם קדם מגבר מובנה, שנבחרה במיוחד למבצע העובדים.</p></div>
        </article>
        <article class="gate-gift-card">
          <div class="gate-gift-image"><img src="/projects/knx-smart-home-central-moshav/07-knx-touch-panel-display.jpg" alt="מסך מגע KNX בפרויקט I Feel" loading="lazy"></div>
          <div><span>לבית חדש עם מערכת קווית מלאה</span><h3>Siemens Touch Control TC4</h3><p>מסך מגע KNX בכניסה לבית לשליטה בתאורה, הצללה, מיזוג ותרחישים, בכפוף להתאמה הטכנית.</p></div>
        </article>
      </div>
      <div class="gate-gifts-cta"><p><strong>הפרטים המלאים נשמרים לעובדים המאומתים.</strong> הכניסה אורכת פחות מדקה.</p><a href="#gate-access">קבלו קוד וגלו את ההטבה</a></div>
    </div>
  </section>

  <section class="gate-proof" aria-label="נתוני אמון">
    <div class="gate-shell gate-proof-grid">
      <div><strong>2008</strong><span>שנת ההקמה</span></div>
      <div><strong>9,000+</strong><span>לקוחות</span></div>
      <div><strong>חברה אחת</strong><span>תכנון, התקנה, תכנות ושירות</span></div>
      <div><strong>פנייה מסודרת</strong><span>הכול עובר דרך האתר לצוות המתאים</span></div>
    </div>
  </section>
</main>

<footer class="gate-footer"><div class="gate-shell"><span>I Feel Smart Home</span><span>מתחם פרטי לעובדי מרקמן טומשין ושות׳</span></div></footer>
</body>
</html><?php
    exit;
}