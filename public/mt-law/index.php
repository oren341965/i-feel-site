<?php
declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

$error = '';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    try {
        mtlaw_verify_csrf();
        $action = mtlaw_post('action', 40);

        if ($action === 'request_code') {
            $email = strtolower(mtlaw_post('email', 180));
            if (!mtlaw_allowed_email($email)) {
                throw new InvalidArgumentException('הכניסה פתוחה רק לכתובות דואר של I Feel או של mt-law.co.il.');
            }
            if (!mtlaw_send_code($email)) {
                throw new RuntimeException('לא ניתן לשלוח קוד כרגע. יש להמתין דקה ולנסות שוב.');
            }
            mtlaw_redirect(['access' => 'code-sent']);
        }

        if ($action === 'verify_code') {
            $email = strtolower((string) ($_SESSION['mtlaw_otp_email'] ?? ''));
            $code = mtlaw_post('code', 20);
            if (!mtlaw_verify_code($email, $code)) {
                throw new InvalidArgumentException('הקוד שגוי או שפג תוקפו.');
            }
            mtlaw_redirect(['access' => 'verified']);
        }

        if ($action === 'logout') {
            mtlaw_logout();
            mtlaw_redirect(['access' => 'logged-out']);
        }

        if ($action === 'lead') {
            $user = mtlaw_require_user();
            $result = mtlaw_submit_lead($user);
            mtlaw_redirect(['lead' => $result]);
        }

        throw new InvalidArgumentException('הפעולה המבוקשת אינה זמינה.');
    } catch (Throwable $exception) {
        $error = $exception->getMessage();
    }
}

$user = mtlaw_current_user();
$csrf = mtlaw_csrf_token();
$accessStatus = trim((string) ($_GET['access'] ?? ''));
$leadStatus = trim((string) ($_GET['lead'] ?? ''));
$view = trim((string) ($_GET['view'] ?? ''));
$pendingEmail = strtolower((string) ($_SESSION['mtlaw_otp_email'] ?? ''));

function mtlaw_document_head(string $title): void
{
    ?><!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive,nosnippet,noimageindex">
  <title><?= mtlaw_h($title) ?></title>
  <link rel="stylesheet" href="/mt-law/styles.css">
</head>
<body><?php
}

function mtlaw_header(?array $user, string $csrf): void
{
    ?><header class="site-header shell">
  <a class="brand" href="/mt-law/" aria-label="I Feel, עמוד הבית של ההטבה">
    <span class="brand-mark" aria-hidden="true">IF</span>
    <span class="brand-copy"><strong>I FEEL</strong><span>Smart Home &amp; Building Management</span></span>
  </a>
  <?php if ($user !== null): ?>
    <div class="header-tools">
      <span class="verified-chip" title="<?= mtlaw_h($user['email']) ?>">מחובר: <?= mtlaw_h($user['email']) ?></span>
      <form method="post" action="/mt-law/">
        <input type="hidden" name="csrf" value="<?= mtlaw_h($csrf) ?>">
        <input type="hidden" name="action" value="logout">
        <button class="text-button" type="submit">יציאה</button>
      </form>
    </div>
  <?php endif; ?>
</header><?php
}

function mtlaw_print_view(string $view, array $user, string $csrf): void
{
    $turntable = $view === 'turntable';
    mtlaw_document_head($turntable ? 'מפרט הפטיפון, I Feel' : 'הטבת עובדי MT-Law, I Feel');
    mtlaw_header($user, $csrf);
    ?>
<main class="print-shell">
  <div class="print-toolbar no-print">
    <a class="ghost-button" href="/mt-law/">חזרה לעמוד ההטבה</a>
    <button class="primary-button" type="button" onclick="window.print()">הדפסה או שמירה כ-PDF</button>
  </div>
  <article class="print-card">
    <p class="eyebrow">I FEEL SMART HOME</p>
    <?php if ($turntable): ?>
      <h1>Argon Audio TT MK2, Earth Grey</h1>
      <p>מפרט מקומי לעובדי MT-Law. כל המידע מוצג באתר I Feel ללא מעבר לאתר חיצוני.</p>
      <div class="print-banner"><strong>פטיפון במתנה</strong><br>ברכישת מערכת בסכום העולה על 15,000 ש״ח, ובחירת חלופת מתנה זו.</div>
      <div class="two-column">
        <section>
          <h2>עיקרי המוצר</h2>
          <ul class="feature-list">
            <li>קדם מגבר RIAA מובנה לחיבור נוח למערכת שמע</li>
            <li>מהירויות נגינה 33 ו-45 סל״ד</li>
            <li>זרוע אלומיניום</li>
            <li>ראש Audio-Technica AT-3600L</li>
            <li>גוון Earth Grey בעיצוב נקי ומודרני</li>
          </ul>
        </section>
        <section>
          <h2>תנאי המתנה</h2>
          <ul class="feature-list">
            <li>מתנה אחת לכל פרויקט זכאי</li>
            <li>לא ניתן לקבל את הפטיפון ואת Siemens TC4 יחד</li>
            <li>בכפוף למלאי, להצעה הסופית ולתנאי המבצע</li>
            <li>המתנה אינה ניתנת להמרה בכסף</li>
          </ul>
        </section>
      </div>
    <?php else: ?>
      <h1>הטבה בלעדית לעובדי מרקמן טומשין ושות׳</h1>
      <p>פתרונות בית חכם, אודיו, אזעקה, מצלמות ואינטרקום בתכנון, התקנה, תכנות ושירות של I Feel.</p>
      <div class="print-banner"><strong>10% הנחה על כלל הפריטים</strong><br>ובנוסף, מתנה אחת בלבד בהתאם לזכאות.</div>
      <div class="two-column">
        <section>
          <h2>חלופה 1, פטיפון</h2>
          <p>Argon Audio TT MK2 בגוון Earth Grey, ברכישת מערכת בסכום העולה על 15,000 ש״ח.</p>
        </section>
        <section>
          <h2>חלופה 2, Siemens TC4</h2>
          <p>מסך מגע KNX בגודל 4 אינץ׳ בכניסה לבית, לבונים בית ורוכשים מערכת בית חכם קווית מלאה, בכפוף להתאמה טכנית.</p>
        </section>
      </div>
      <p class="mutual-note">המתנות אינן מצטברות. במקרה של זכאות לשתי החלופות, בוחרים פטיפון או TC4.</p>
      <h2>הפתרונות שניתן לשלב</h2>
      <div class="three-column">
        <section class="info-tile"><h3>חשמל חכם ואודיו</h3><p>מערכת מלאה או התחלה ממערכת נקודתית, בהתאם לנכס ולתקציב.</p></section>
        <section class="info-tile"><h3>אזעקה</h3><p>אפשרות למערכת קווית או אלחוטית, לפי מצב הבית וההכנות.</p></section>
        <section class="info-tile"><h3>מצלמות</h3><p>תכנון והצעה בהתאם להכנות קיימות, חלקיות או נדרשות.</p></section>
        <section class="info-tile"><h3>אינטרקום</h3><p>אינטרקום IP עם וידאו, פתיחת דלת וגישה מהמסך בבית או מהטלפון.</p></section>
      </div>
      <h2>תנאים עיקריים</h2>
      <ul class="terms">
        <li>הזכאות מיועדת לעובדים שאומתו בכתובת דואר ארגונית.</li>
        <li>הנחת 10% חלה על כלל הפריטים המופיעים בהצעה המאושרת.</li>
        <li>מתנה אחת בלבד לכל פרויקט זכאי, בכפוף למלאי ולתנאי המבצע.</li>
        <li>כל הפניות נשלחות באמצעות העמוד המאובטח באתר I Feel.</li>
      </ul>
    <?php endif; ?>
  </article>
</main>
<footer class="footer shell">I Feel Smart Home, עמוד פנימי ומוגבל לעובדים זכאים</footer>
</body>
</html><?php
    exit;
}

if ($user !== null && in_array($view, ['benefit', 'turntable'], true)) {
    mtlaw_print_view($view, $user, $csrf);
}

mtlaw_document_head('הטבת עובדי MT-Law, I Feel');
mtlaw_header($user, $csrf);
?>

<main class="main">
<?php if ($user === null): ?>
  <section class="login-wrap shell">
    <div class="login-card">
      <div class="login-head">
        <p class="eyebrow">עמוד עובדים מאובטח</p>
        <h1>כניסה להטבה הארגונית</h1>
        <p class="lead">העמוד מיועד לעובדי I Feel ולעובדי מרקמן טומשין ושות׳ בלבד. הכניסה מתבצעת באמצעות קוד חד פעמי הנשלח לכתובת הדואר הארגונית.</p>
      </div>
      <div class="login-body">
        <div class="security-note"><span class="security-icon" aria-hidden="true">●</span><span>כתובות מורשות בלבד: <b>@i-feel.co.il</b> או <b>@mt-law.co.il</b>. תוכן ההטבה אינו מוצג לפני אימות הכתובת.</span></div>

        <?php if ($error !== ''): ?><div class="alert alert-error" role="alert"><?= mtlaw_h($error) ?></div><?php endif; ?>
        <?php if ($accessStatus === 'code-sent'): ?><div class="alert alert-success" role="status">קוד בן 6 ספרות נשלח לכתובת הארגונית. הקוד תקף ל-10 דקות.</div><?php endif; ?>
        <?php if ($accessStatus === 'logged-out'): ?><div class="alert alert-info" role="status">החיבור לעמוד נותק.</div><?php endif; ?>
        <?php if ($accessStatus === 'required'): ?><div class="alert alert-info" role="status">יש לבצע אימות מחדש כדי להמשיך.</div><?php endif; ?>

        <?php if ($pendingEmail !== ''): ?>
          <form class="form-grid" method="post" action="/mt-law/" autocomplete="one-time-code">
            <input type="hidden" name="csrf" value="<?= mtlaw_h($csrf) ?>">
            <input type="hidden" name="action" value="verify_code">
            <label class="field">
              <span>הקוד שנשלח אל <?= mtlaw_h($pendingEmail) ?></span>
              <input type="text" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required autofocus>
              <small>יש להזין 6 ספרות.</small>
            </label>
            <button class="primary-button" type="submit">אימות וכניסה</button>
          </form>
          <form method="post" action="/mt-law/" style="margin-top:14px">
            <input type="hidden" name="csrf" value="<?= mtlaw_h($csrf) ?>">
            <input type="hidden" name="action" value="request_code">
            <input type="hidden" name="email" value="<?= mtlaw_h($pendingEmail) ?>">
            <button class="text-button" type="submit">שליחת קוד חדש</button>
          </form>
        <?php else: ?>
          <form class="form-grid" method="post" action="/mt-law/">
            <input type="hidden" name="csrf" value="<?= mtlaw_h($csrf) ?>">
            <input type="hidden" name="action" value="request_code">
            <label class="field">
              <span>כתובת דואר אלקטרוני ארגונית</span>
              <input type="email" name="email" placeholder="name@mt-law.co.il" autocomplete="email" required autofocus>
              <small>הקוד יישלח לכתובת זו בלבד.</small>
            </label>
            <button class="primary-button" type="submit">שליחת קוד כניסה</button>
          </form>
        <?php endif; ?>
      </div>
    </div>
  </section>
<?php else: ?>
  <div class="shell">
    <?php if ($accessStatus === 'verified'): ?><div class="alert alert-success" role="status">הכתובת אומתה. ניתן לעיין בהטבה ולשלוח בקשת התאמה.</div><?php endif; ?>
    <?php if ($leadStatus === 'sent' || $leadStatus === 'sent-mail'): ?><div class="alert alert-success" role="status">הפנייה התקבלה. צוות I Feel יחזור אליך בדרך הקשר שבחרת.</div><?php endif; ?>
    <?php if ($leadStatus === 'error'): ?><div class="alert alert-error" role="alert">הפנייה לא נשלחה. יש לנסות שוב מאוחר יותר.</div><?php endif; ?>
    <?php if ($error !== ''): ?><div class="alert alert-error" role="alert"><?= mtlaw_h($error) ?></div><?php endif; ?>

    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="eyebrow">הטבה בלעדית לעובדי מרקמן טומשין ושות׳</p>
        <h1 id="hero-title">בית חכם שמתחיל בהחלטה נכונה</h1>
        <p class="hero-lead">I Feel מרכזת עבורכם חשמל חכם, אודיו, אזעקה, מצלמות ואינטרקום, עם מסלול קצר שמוביל ממערכת מלאה לפתרון נקודתי בהתאם לנכס, להכנות ולתקציב.</p>
        <nav class="quick-nav" aria-label="ניווט בעמוד">
          <a href="#about">מי אנחנו</a>
          <a href="#benefit">ההטבה</a>
          <a href="#systems">המערכות</a>
          <a href="#advisor">בדיקת התאמה</a>
        </nav>
      </div>
      <aside class="hero-offer" aria-label="ההטבה המרכזית">
        <div class="discount-number">10%</div>
        <div class="discount-copy"><strong>הנחה על כלל הפריטים</strong><span>בהצעה המאושרת של I Feel</span></div>
        <div class="one-gift">ובנוסף, מתנה אחת בלבד לפי הזכאות</div>
      </aside>
    </section>

    <section class="content-card" id="about">
      <div class="section-heading">
        <div><p class="eyebrow">I FEEL</p><h2>מי אנחנו ומה נעשה עבורכם</h2><p>חברה ישראלית המתמחה בתכנון, אספקה, התקנה, תכנות ושירות למערכות בית חכם וניהול מבנה. התהליך נשאר תחת כתובת אחת, משלב התכנון ועד למסירה והשירות.</p></div>
      </div>
      <div class="three-column">
        <article class="info-tile"><h3>תכנון לפי הנכס</h3><p>בנייה חדשה, שיפוץ או בית קיים מקבלים מסלול שונה, כדי לא להציע מערכת שאינה מתאימה להכנות.</p></article>
        <article class="info-tile"><h3>פתרון מלא או מדורג</h3><p>אפשר להתחיל ממערכת מלאה, או לבחור חשמל חכם, אודיו, אזעקה, מצלמות או אינטרקום כפתרון עצמאי.</p></article>
        <article class="info-tile"><h3>פנייה אחת מסודרת</h3><p>כל הנתונים נשלחים דרך האתר, מסווגים מראש ומועברים לאיש המקצוע המתאים ללא צורך בריבוי שיחות.</p></article>
      </div>
    </section>

    <section class="content-card" id="benefit">
      <div class="section-heading">
        <div><p class="eyebrow">הטבת העובדים</p><h2>10% הנחה ומתנה אחת לבחירה</h2><p>ההנחה ניתנת לעובד מאומת. המתנות אינן מצטברות, וגם כאשר קיימת זכאות כפולה בוחרים חלופה אחת.</p></div>
        <div class="button-row no-print">
          <a class="ghost-button" href="/mt-law/?view=benefit">גרסה להדפסה ולשמירה כ-PDF</a>
        </div>
      </div>
      <div class="gift-grid">
        <article class="gift-card">
          <div class="gift-visual"><div class="turntable-art" role="img" aria-label="איור פטיפון בגוון אפור"></div></div>
          <div class="gift-copy">
            <p class="gift-kicker">חלופת מתנה 1</p>
            <h3>Argon Audio TT MK2</h3>
            <p>פטיפון בגוון Earth Grey עם קדם מגבר RIAA מובנה, מהירויות 33 ו-45 סל״ד, זרוע אלומיניום וראש Audio-Technica AT-3600L.</p>
            <p class="gift-condition">ברכישת מערכת בסכום העולה על 15,000 ש״ח.</p>
            <div class="button-row" style="margin-top:15px"><a class="secondary-button" href="/mt-law/?view=turntable">מפרט מלא באתר I Feel</a></div>
          </div>
        </article>
        <article class="gift-card">
          <div class="gift-visual"><div class="tc4-art" role="img" aria-label="איור מסך מגע Siemens TC4"><div><strong>TC4</strong><span>Siemens KNX Touch Control</span></div></div></div>
          <div class="gift-copy">
            <p class="gift-kicker">חלופת מתנה 2</p>
            <h3>Siemens Touch Control TC4</h3>
            <p>מסך מגע KNX בגודל 4 אינץ׳ לשליטה בתאורה, הצללה, מיזוג ותרחישים, המותקן בכניסה לבית בהתאם לתכנון.</p>
            <p class="gift-condition">לבונים בית ורוכשים מערכת בית חכם קווית מלאה, בכפוף להתאמה טכנית.</p>
          </div>
        </article>
      </div>
      <p class="mutual-note">פטיפון או TC4. לא ניתן לקבל את שתי המתנות יחד.</p>
    </section>

    <section class="content-card" id="systems">
      <div class="section-heading"><div><p class="eyebrow">מערכות לבחירה</p><h2>הפתרון המתאים למצב הבית</h2><p>השאלון בהמשך בודק את התמונה המלאה, ולאחר מכן מאפשר לבחור מערכת אחת או מספר מערכות.</p></div></div>
      <div class="two-column">
        <article class="system-card"><h3>חשמל חכם ואודיו</h3><p>שליטה בתאורה, תריסים, מיזוג ותרחישים, לצד פתרונות שמע המותאמים לחללים ולשימוש היומיומי.</p></article>
        <article class="system-card"><h3>אזעקה קווית או אלחוטית</h3><p>מערכת קווית מתאימה בדרך כלל כאשר קיימת תשתית מתוכננת. מערכת אלחוטית מאפשרת פתרון יעיל גם בבית קיים.</p></article>
        <article class="system-card"><h3>מצלמות</h3><p>כאשר קיימות הכנות, ניתן לתכנן את סוג המצלמות, נקודות הצפייה וההקלטה. כאשר אין הכנות, נבדוק חלופות אפשריות.</p></article>
        <article class="system-card"><h3>אינטרקום IP</h3><p>שיחה בווידאו, פתיחת דלת וגישה מהמסך בבית או מהטלפון, עם התאמה לשער, ללובי ולתשתית הקיימת.</p></article>
        <article class="system-card"><h3>מערכת מלאה או נקודתית</h3><p>המסלול מתחיל בבחינת מערכת מלאה, אך מאפשר לעבור בצורה מסודרת לחשמל חכם, אודיו, אזעקה, מצלמות או אינטרקום בלבד.</p></article>
      </div>
    </section>

    <section class="content-card" id="advisor">
      <div class="section-heading"><div><p class="eyebrow">בדיקת התאמה</p><h2>בנו את הבקשה שלכם</h2><p>הפרטים מאפשרים לצוות להחזיר תשובה ממוקדת. לא מוצג מספר טלפון בעמוד, וכל הפניות עוברות דרך הטופס.</p></div></div>
      <form class="wizard" id="project-form" method="post" action="/mt-law/">
        <input type="hidden" name="csrf" value="<?= mtlaw_h($csrf) ?>">
        <input type="hidden" name="action" value="lead">
        <input type="hidden" name="gift" id="gift-value" value="none">

        <div class="wizard-main">
          <fieldset class="fieldset">
            <legend>1. מה מצב הנכס?</legend>
            <div class="option-grid">
              <label class="option-card"><input type="radio" name="property" value="new" required><span><strong>בנייה חדשה</strong><span>בית שנמצא בתכנון או בביצוע</span></span></label>
              <label class="option-card"><input type="radio" name="property" value="renovation" required><span><strong>שיפוץ</strong><span>שינוי תשתיות או שדרוג משמעותי</span></span></label>
              <label class="option-card"><input type="radio" name="property" value="existing" required><span><strong>בית או דירה קיימים</strong><span>נדרשת התאמה ללא שיפוץ מלא</span></span></label>
              <label class="option-card"><input type="radio" name="property" value="checking" required><span><strong>בדיקת אפשרויות</strong><span>עדיין אין החלטה על היקף הפרויקט</span></span></label>
            </div>
          </fieldset>

          <fieldset class="fieldset">
            <legend>2. מה היקף הפתרון הרצוי?</legend>
            <div class="option-grid">
              <label class="option-card"><input type="radio" name="scope" value="full" required><span><strong>מערכת בית חכם מלאה</strong><span>תכנון כולל של המערכות בבית</span></span></label>
              <label class="option-card"><input type="radio" name="scope" value="partial" required><span><strong>מערכת נקודתית</strong><span>בחירת מערכת אחת או מספר מערכות</span></span></label>
              <label class="option-card"><input type="radio" name="scope" value="advice" required><span><strong>נדרשת המלצה</strong><span>הצוות יעזור לבחור את ההיקף</span></span></label>
            </div>
          </fieldset>

          <fieldset class="fieldset">
            <legend>3. אילו מערכות מעניינות אתכם?</legend>
            <div class="option-grid">
              <label class="option-card"><input type="checkbox" name="systems[]" value="smart-electricity"><span><strong>חשמל חכם</strong><span>תאורה, תריסים, מיזוג ותרחישים</span></span></label>
              <label class="option-card"><input type="checkbox" name="systems[]" value="audio"><span><strong>אודיו</strong><span>מוזיקה ורמקולים בחללים נבחרים</span></span></label>
              <label class="option-card"><input type="checkbox" name="systems[]" value="alarm"><span><strong>אזעקה</strong><span>קווית, אלחוטית או המלצה מקצועית</span></span></label>
              <label class="option-card"><input type="checkbox" name="systems[]" value="cameras"><span><strong>מצלמות</strong><span>בהתאם להכנות ולצרכי האבטחה</span></span></label>
              <label class="option-card"><input type="checkbox" name="systems[]" value="intercom"><span><strong>אינטרקום</strong><span>וידאו, פתיחת דלת וגישה מהטלפון</span></span></label>
            </div>
          </fieldset>

          <fieldset class="fieldset conditional" id="alarm-options" aria-hidden="true">
            <legend>4. איזו אזעקה מתאימה?</legend>
            <input class="visually-hidden" type="radio" name="alarm_type" value="none" checked>
            <div class="option-grid">
              <label class="option-card"><input type="radio" name="alarm_type" value="wired"><span><strong>אזעקה קווית</strong><span>קיימת או מתוכננת תשתית מתאימה</span></span></label>
              <label class="option-card"><input type="radio" name="alarm_type" value="wireless"><span><strong>אזעקה אלחוטית</strong><span>מתאימה במיוחד לבית קיים</span></span></label>
              <label class="option-card"><input type="radio" name="alarm_type" value="recommend"><span><strong>נדרשת המלצה</strong><span>נבדוק את התשתית ואת צורכי הבית</span></span></label>
            </div>
          </fieldset>

          <fieldset class="fieldset conditional" id="camera-options" aria-hidden="true">
            <legend>5. מה מצב ההכנות למצלמות?</legend>
            <input class="visually-hidden" type="radio" name="camera_preparations" value="unknown" checked>
            <div class="option-grid">
              <label class="option-card"><input type="radio" name="camera_preparations" value="ready"><span><strong>יש הכנות מלאות</strong><span>נקודות ותקשורת הוכנו מראש</span></span></label>
              <label class="option-card"><input type="radio" name="camera_preparations" value="partial"><span><strong>יש הכנות חלקיות</strong><span>נדרשת בדיקה והשלמה</span></span></label>
              <label class="option-card"><input type="radio" name="camera_preparations" value="none"><span><strong>אין הכנות</strong><span>נבדוק חלופות אפשריות</span></span></label>
              <label class="option-card"><input type="radio" name="camera_preparations" value="unknown"><span><strong>לא ידוע</strong><span>הצוות יסייע בבדיקה</span></span></label>
            </div>
          </fieldset>

          <fieldset class="fieldset">
            <legend>6. מה היקף הרכישה המשוער?</legend>
            <div class="option-grid">
              <label class="option-card"><input type="radio" name="budget" value="over" required><span><strong>מעל 15,000 ש״ח</strong><span>עשויה להיות זכאות לפטיפון</span></span></label>
              <label class="option-card"><input type="radio" name="budget" value="under" required><span><strong>עד 15,000 ש״ח</strong><span>הנחת 10% נשמרת</span></span></label>
              <label class="option-card"><input type="radio" name="budget" value="unknown" required><span><strong>טרם נקבע</strong><span>נדרשת הצעה כדי להעריך</span></span></label>
            </div>
          </fieldset>

          <fieldset class="fieldset conditional" id="gift-choice-section" aria-hidden="true">
            <legend>7. בחירת מתנה</legend>
            <p class="help" id="eligibility-text" tabindex="-1">הבחירה תוצג לפי מצב הנכס והיקף הרכישה.</p>
            <div class="option-grid">
              <label class="option-card" id="gift-turntable-option"><input type="radio" name="gift_choice" value="turntable"><span><strong>פטיפון Argon Audio TT MK2</strong><span>חלופת המתנה לרכישה מעל 15,000 ש״ח</span></span></label>
              <label class="option-card" id="gift-tc4-option"><input type="radio" name="gift_choice" value="tc4"><span><strong>Siemens TC4</strong><span>חלופת המתנה לבית חדש עם מערכת קווית מלאה</span></span></label>
            </div>
          </fieldset>

          <fieldset class="fieldset">
            <legend>8. לוח זמנים ואופן המשך</legend>
            <div class="form-row">
              <label class="field"><span>מתי תרצו להתקדם?</span><select name="timeline" required><option value="">בחירה</option><option value="now">מיידי, עד חודש</option><option value="quarter">בחודשים הקרובים</option><option value="later">בהמשך השנה</option><option value="unknown">טרם נקבע</option></select></label>
              <label class="field"><span>דרך קשר מועדפת</span><select name="contact_preference" required><option value="email">דואר אלקטרוני</option><option value="whatsapp">WhatsApp</option><option value="scheduled-call">שיחה מתוזמנת בלבד</option></select></label>
            </div>
          </fieldset>

          <fieldset class="fieldset">
            <legend>9. פרטים להעברת הבקשה</legend>
            <div class="contact-note">הפנייה תישלח עם כתובת הדואר המאומתת: <b><?= mtlaw_h($user['email']) ?></b></div>
            <div class="form-row" style="margin-top:16px">
              <label class="field"><span>שם מלא</span><input type="text" name="name" autocomplete="name" required></label>
              <label class="field"><span>מספר טלפון</span><input type="tel" name="phone" inputmode="tel" autocomplete="tel" required><small>ישמש רק בהתאם לדרך הקשר שבחרתם.</small></label>
            </div>
            <label class="field" style="margin-top:16px"><span>הערות, כתובת הפרויקט או מידע נוסף</span><textarea name="notes" maxlength="1800" placeholder="אפשר לציין גודל הנכס, שלב התכנון, הכנות קיימות או שאלות מיוחדות"></textarea></label>
            <label class="consent-row" style="margin-top:16px"><input type="checkbox" name="consent" value="yes" required><span>אני מאשר או מאשרת להעביר את פרטי הפנייה ל-I Feel לצורך הכנת המלצה והצעה. ההטבה כפופה להצעה הסופית ולתנאי המבצע.</span></label>
            <div class="button-row" style="margin-top:18px"><button class="primary-button" type="submit">שליחת בקשת התאמה</button></div>
          </fieldset>
        </div>

        <aside class="summary-panel" aria-live="polite">
          <div class="summary-head"><h3>סיכום הבקשה</h3><p style="margin:5px 0 0;color:rgba(255,255,255,.72)">הנחת 10% כלולה בזכאות</p></div>
          <div class="summary-body">
            <ul class="summary-list">
              <li><span class="summary-label">מצב הנכס</span><span class="summary-value" id="summary-property">טרם נבחר</span></li>
              <li><span class="summary-label">היקף המערכת</span><span class="summary-value" id="summary-scope">טרם נבחר</span></li>
              <li><span class="summary-label">מערכות</span><span class="summary-value" id="summary-systems">טרם נבחרו מערכות</span></li>
              <li><span class="summary-label">אזעקה</span><span class="summary-value" id="summary-alarm">לא נבחרה אזעקה</span></li>
              <li><span class="summary-label">מצלמות</span><span class="summary-value" id="summary-cameras">לא נבחרו מצלמות</span></li>
              <li><span class="summary-label">היקף משוער</span><span class="summary-value" id="summary-budget">טרם נבחר</span></li>
              <li><span class="summary-label">לוח זמנים</span><span class="summary-value" id="summary-timeline">טרם נבחר</span></li>
              <li><span class="summary-label">דרך קשר</span><span class="summary-value" id="summary-contact">דואר אלקטרוני</span></li>
            </ul>
            <div class="eligibility-box"><strong>המתנה לפי הפרטים</strong><span id="summary-gift">לא נקבעה זכאות למתנה בשלב זה</span></div>
          </div>
        </aside>
      </form>
    </section>

    <section class="content-card">
      <div class="section-heading"><div><p class="eyebrow">תנאי המבצע</p><h2>הבהרות עיקריות</h2></div></div>
      <ul class="terms">
        <li>ההטבה מיועדת לכתובות ארגוניות מאומתות של I Feel ושל mt-law.co.il.</li>
        <li>הנחת 10% חלה על כלל הפריטים המופיעים בהצעה המאושרת של I Feel.</li>
        <li>ברכישת מערכת בסכום העולה על 15,000 ש״ח ניתן לקבל פטיפון, בכפוף להצעה הסופית ולמלאי.</li>
        <li>לבונים בית ורוכשים מערכת בית חכם קווית מלאה ניתן לקבל Siemens TC4 בכניסה, בכפוף להתאמה טכנית.</li>
        <li>כאשר קיימת זכאות לשתי חלופות, נבחרת מתנה אחת בלבד. ההטבות אינן ניתנות להמרה בכסף.</li>
        <li>פרטי המוצר, ההצעה וההתקנה הסופיים ייקבעו לאחר בדיקת הפרויקט.</li>
      </ul>
    </section>

    <?php if ($user['role'] === 'staff'): ?>
      <section class="content-card">
        <div class="section-heading"><div><p class="eyebrow">בדיקה פנימית לעובדי I Feel</p><h2>נקודות לבדיקה לפני שליחת הקישור</h2><p>ודאו שקוד הכניסה מתקבל בדואר, שכל מסלולי הזכאות מציגים מתנה אחת בלבד, שהגרסאות להדפסה נפתחות ושפניית ניסיון מתקבלת במערכת הלידים.</p></div></div>
      </section>
    <?php endif; ?>
  </div>
<?php endif; ?>
</main>

<footer class="footer shell">I Feel Smart Home, עמוד פנימי שאינו מופיע בתפריטי האתר ואינו מיועד לאינדוקס</footer>
<?php if ($user !== null): ?><script src="/mt-law/app.js?v=20260725-2" defer></script><?php endif; ?>
</body>
</html>
