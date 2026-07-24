<?php
declare(strict_types=1);

function portal_profile_is_complete(array $user): bool
{
    $profile = portal_employee_profile($user);
    return $profile['name'] !== '' && portal_normalize_israeli_mobile($profile['phone']) !== null;
}

function portal_render_profile_completion_notice(array $user, string $tab): void
{
    if (portal_profile_is_complete($user) || $tab === 'profile') {
        return;
    }
    ?>
    <div class="alert alert--info profile-notice" role="status">
        <span>📱 יש לשמור מספר טלפון קבוע בפרופיל העובד. לאחר שמירה אחת הוא ימולא אוטומטית בכל דיווח.</span>
        <a class="button button--secondary button--small" href="<?= portal_h(portal_url(['tab' => 'profile'])) ?>">שמירת הפרטים שלי</a>
    </div>
    <?php
}

function portal_render_employee_profile_form(array $user): void
{
    $profile = portal_employee_profile($user);
    ?>
    <section class="form-card">
        <div class="form-card__header">
            <span class="step">1</span>
            <div>
                <h2>הפרטים הקבועים שלי</h2>
                <p>השם והטלפון נשמרים באחסון הפרטי ומופיעים אוטומטית בכל דיווח חדש. אפשר לעדכן אותם בכל עת.</p>
            </div>
        </div>
        <form method="post" class="field-grid field-grid--2">
            <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
            <input type="hidden" name="action" value="save_employee_profile">
            <label class="field">
                <span>שם מלא <b>*</b></span>
                <input type="text" name="profile_name" required maxlength="120" autocomplete="name" value="<?= portal_h($profile['name']) ?>">
            </label>
            <label class="field">
                <span>מספר טלפון נייד <b>*</b></span>
                <input type="tel" name="profile_phone" required maxlength="30" autocomplete="tel" inputmode="tel" placeholder="05X-XXX-XXXX" value="<?= portal_h($profile['phone']) ?>">
            </label>
            <label class="field field--full">
                <span>דוא״ל ארגוני</span>
                <input type="email" value="<?= portal_h($profile['email']) ?>" readonly dir="ltr">
            </label>
            <div class="field--full">
                <button type="submit" class="button button--primary">שמירת הפרטים הקבועים</button>
            </div>
        </form>
    </section>
    <?php
}

function portal_render_employee_vehicle_form(array $vehicle = []): void
{
    $hasVehicle = $vehicle !== [];
    $plate = (string) ($vehicle['plate'] ?? '');
    ?>
    <section class="form-card vehicle-profile-form">
        <div class="form-card__header">
            <span class="step">2</span>
            <div>
                <h2><?= $hasVehicle ? 'עדכון הרכב שלי' : 'הוספת הרכב שלי' ?></h2>
                <p>ממלאים את פרטי הרכב פעם אחת. את תאריכי הטסט והביטוח מעדכנים רק בחידוש השנתי — הם אינם חלק מדיווח ההוצאות החודשי.</p>
            </div>
        </div>
        <form method="post" class="field-grid field-grid--3">
            <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
            <input type="hidden" name="action" value="save_employee_vehicle">
            <input type="hidden" name="existing_plate" value="<?= portal_h($plate) ?>">
            <label class="field">
                <span>מספר רכב <b>*</b></span>
                <input type="text" name="profile_vehicle_plate" required maxlength="20" inputmode="numeric" placeholder="123-45-678" value="<?= portal_h(portal_format_vehicle_plate($plate)) ?>" <?= $hasVehicle ? 'readonly' : '' ?>>
            </label>
            <label class="field">
                <span>יצרן ודגם <b>*</b></span>
                <input type="text" name="profile_vehicle_model" required maxlength="160" placeholder="לדוגמה: סקודה אוקטביה" value="<?= portal_h($vehicle['make_model'] ?? '') ?>">
            </label>
            <label class="field">
                <span>שנת הרכב</span>
                <input type="number" name="profile_vehicle_year" min="1980" max="<?= (int) date('Y') + 1 ?>" inputmode="numeric" value="<?= (int) ($vehicle['year'] ?? 0) > 0 ? (int) $vehicle['year'] : '' ?>">
            </label>
            <label class="field">
                <span>טסט בתוקף עד <b>*</b></span>
                <input type="date" name="profile_vehicle_test_due" required value="<?= portal_h($vehicle['test_due_date'] ?? '') ?>">
            </label>
            <label class="field">
                <span>ביטוח בתוקף עד <b>*</b></span>
                <input type="date" name="profile_vehicle_insurance_due" required value="<?= portal_h($vehicle['compulsory_insurance_due_date'] ?? $vehicle['insurance_due_date'] ?? '') ?>">
            </label>
            <label class="field">
                <span>חברת ביטוח</span>
                <input type="text" name="profile_vehicle_insurance_company" maxlength="160" value="<?= portal_h($vehicle['insurance_company'] ?? '') ?>">
            </label>
            <label class="field">
                <span>מספר פוליסה</span>
                <input type="text" name="profile_vehicle_policy" maxlength="160" dir="ltr" value="<?= portal_h($vehicle['policy_number'] ?? '') ?>">
            </label>
            <label class="field field--full">
                <span>הערות</span>
                <textarea name="profile_vehicle_notes" rows="3" maxlength="600"><?= portal_h($vehicle['notes'] ?? '') ?></textarea>
            </label>
            <div class="field--full">
                <button type="submit" class="button button--primary"><?= $hasVehicle ? 'שמירת עדכון הרכב' : 'שמירת הרכב שלי' ?></button>
            </div>
        </form>
    </section>
    <?php
}

function portal_render_employee_profile_page(array $user, ?array $flash): void
{
    portal_render_flash($flash);
    $vehicles = portal_vehicles_for_employee($user);
    ?>
    <section class="page-heading page-heading--compact">
        <div>
            <p class="eyebrow">מידע קבוע לעובד</p>
            <h1>הפרטים והרכב שלי</h1>
            <p>המידע נשמר פעם אחת וממולא אוטומטית בדיווחים. אין צורך להזין מחדש טלפון, מספר רכב או תאריכי תוקף בכל חודש.</p>
        </div>
        <div class="total-card"><span>רכבים משויכים</span><strong><?= count($vehicles) ?></strong></div>
    </section>
    <div class="profile-layout">
        <?php portal_render_employee_profile_form($user); ?>
        <div>
            <?php if ($vehicles !== []): ?>
                <?php portal_render_employee_vehicle_card($user); ?>
                <?php foreach ($vehicles as $vehicle): ?>
                    <?php portal_render_employee_vehicle_form($vehicle); ?>
                <?php endforeach; ?>
            <?php else: ?>
                <?php portal_render_employee_vehicle_form(); ?>
            <?php endif; ?>
        </div>
    </div>
    <?php
}
