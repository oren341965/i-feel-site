<?php
declare(strict_types=1);

function portal_filter_records(array $records): array
{
    $type = trim((string) ($_GET['type'] ?? ''));
    $status = trim((string) ($_GET['status'] ?? ''));
    $employee = trim((string) ($_GET['employee'] ?? ''));
    return array_values(array_filter($records, static function (array $record) use ($type, $status, $employee): bool {
        if ($type !== '' && ($record['type'] ?? '') !== $type) return false;
        if ($status !== '' && ($record['status'] ?? '') !== $status) return false;
        if ($employee !== '') {
            $name = portal_lower((string) ($record['employee']['name'] ?? ''));
            if (!str_contains($name, portal_lower($employee))) return false;
        }
        return true;
    }));
}

function portal_render_reports(?array $flash): void
{
    portal_render_flash($flash);
    $records = portal_filter_records(portal_all_records());
    ?>
    <section class="page-heading page-heading--compact">
        <div><p class="eyebrow">ניהול פנימי</p><h1>דיווחים ומסמכים</h1><p>צפייה בדיווחים, הורדת קבלות ועדכון סטטוס טיפול.</p></div>
        <a href="<?= portal_h(portal_url(['action' => 'export'])) ?>" class="button button--secondary">ייצוא לקובץ Excel/CSV</a>
    </section>
    <form method="get" class="filter-bar">
        <input type="hidden" name="tab" value="reports">
        <label><span>סוג</span><select name="type"><option value="">הכול</option><option value="vehicle" <?= ($_GET['type'] ?? '') === 'vehicle' ? 'selected' : '' ?>>רכב ונסיעות</option><option value="travel" <?= ($_GET['type'] ?? '') === 'travel' ? 'selected' : '' ?>>חו״ל</option><option value="general" <?= ($_GET['type'] ?? '') === 'general' ? 'selected' : '' ?>>כללי</option></select></label>
        <label><span>סטטוס</span><select name="status"><option value="">הכול</option><?php foreach (portal_valid_statuses() as $status): ?><option value="<?= portal_h($status) ?>" <?= ($_GET['status'] ?? '') === $status ? 'selected' : '' ?>><?= portal_h(portal_status_label($status)) ?></option><?php endforeach; ?></select></label>
        <label class="filter-grow"><span>שם עובד/ת</span><input type="search" name="employee" value="<?= portal_h($_GET['employee'] ?? '') ?>"></label>
        <button class="button button--primary button--small" type="submit">סינון</button>
        <a class="button button--ghost button--small" href="<?= portal_h(portal_url(['tab' => 'reports'])) ?>">ניקוי</a>
    </form>
    <div class="stats-row">
        <div><strong><?= count($records) ?></strong><span>דיווחים בתצוגה</span></div>
        <div><strong><?= count(array_filter($records, static fn($r) => ($r['status'] ?? '') === 'new')) ?></strong><span>חדשים</span></div>
        <div><strong><?= array_sum(array_map(static fn($r) => count($r['attachments'] ?? []), $records)) ?></strong><span>מסמכים מצורפים</span></div>
    </div>
    <div class="table-wrap records-wrap">
        <table class="records-table">
            <thead><tr><th>מספר</th><th>תאריך</th><th>עובד/ת</th><th>סוג</th><th>סכום</th><th>מסמכים</th><th>סטטוס</th><th></th></tr></thead>
            <tbody>
            <?php if ($records === []): ?>
                <tr><td colspan="8" class="empty-cell">לא נמצאו דיווחים התואמים לסינון.</td></tr>
            <?php else: foreach ($records as $record): ?>
                <tr>
                    <td><code><?= portal_h($record['id'] ?? '') ?></code></td>
                    <td><?= portal_h($record['report_date'] ?? '') ?></td>
                    <td><strong><?= portal_h($record['employee']['name'] ?? '') ?></strong><small><?= portal_h($record['employee']['email'] ?? '') ?></small></td>
                    <td><?= portal_h(portal_report_type_label((string) ($record['type'] ?? ''))) ?></td>
                    <td><?= portal_h(portal_format_totals($record)) ?></td>
                    <td><?= count($record['attachments'] ?? []) ?></td>
                    <td><span class="status status--<?= portal_h($record['status'] ?? 'new') ?>"><?= portal_h(portal_status_label((string) ($record['status'] ?? 'new'))) ?></span></td>
                    <td><a class="text-link" href="<?= portal_h(portal_url(['tab' => 'reports', 'view' => $record['id'] ?? ''])) ?>">פתיחה</a></td>
                </tr>
            <?php endforeach; endif; ?>
            </tbody>
        </table>
    </div>
    <?php
}

function detail_row(string $label, $value): void
{
    if ($value === '' || $value === null) return;
    ?><div class="detail-item"><span><?= portal_h($label) ?></span><strong><?= nl2br(portal_h($value)) ?></strong></div><?php
}

function portal_render_record_detail(array $record, ?array $flash): void
{
    portal_render_flash($flash);
    $details = is_array($record['details'] ?? null) ? $record['details'] : [];
    ?>
    <div class="detail-topbar">
        <a class="text-link" href="<?= portal_h(portal_url(['tab' => 'reports'])) ?>">חזרה לכל הדיווחים</a>
        <span class="status status--<?= portal_h($record['status'] ?? 'new') ?>"><?= portal_h(portal_status_label((string) ($record['status'] ?? 'new'))) ?></span>
    </div>
    <section class="page-heading page-heading--compact">
        <div><p class="eyebrow"><?= portal_h(portal_report_type_label((string) ($record['type'] ?? ''))) ?></p><h1>דיווח <?= portal_h($record['id'] ?? '') ?></h1><p>נשלח בתאריך <?= portal_h(portal_format_datetime((string) ($record['created_at'] ?? ''))) ?> על ידי <?= portal_h($record['submitted_by']['display_name'] ?? '') ?></p></div>
        <div class="total-card"><span>סה״כ מדווח</span><strong><?= portal_h(portal_format_totals($record)) ?></strong></div>
    </section>

    <section class="detail-card"><h2>פרטי העובד/ת</h2><div class="detail-grid"><?php detail_row('שם', $record['employee']['name'] ?? ''); detail_row('דוא״ל', $record['employee']['email'] ?? ''); detail_row('טלפון', $record['employee']['phone'] ?? ''); ?></div></section>

    <section class="detail-card"><h2>פרטי הדיווח</h2><div class="detail-grid">
        <?php if (($record['type'] ?? '') === 'travel'): ?>
            <?php detail_row('שם החברה', $details['company_name'] ?? ''); detail_row('נוסע/ת', $details['traveler_name'] ?? ''); detail_row('תפקיד', $details['traveler_role'] ?? ''); detail_row('יעד', $details['destination'] ?? ''); detail_row('תאריך יציאה', $details['departure_date'] ?? ''); detail_row('תאריך חזרה', $details['return_date'] ?? ''); detail_row('ימי עבודה', $details['business_days'] ?? ''); detail_row('מספר הזמנה / PNR', $details['booking_reference'] ?? ''); detail_row('מטרת נסיעה', $details['trip_purpose'] ?? ''); detail_row('הערות', $details['notes'] ?? ''); ?>
        <?php else: ?>
            <?php detail_row('תאריך הוצאה', $details['expense_date'] ?? ''); detail_row('קטגוריה', ($record['type'] ?? '') === 'vehicle' ? vehicle_category_label((string) ($details['vehicle_category'] ?? '')) : general_category_label((string) ($details['general_category'] ?? ''))); detail_row('מספר רכב', $details['vehicle_plate'] ?? ''); detail_row('דגם / תיאור הרכב', $details['vehicle_model'] ?? ''); detail_row('נהג/ת', $details['vehicle_driver'] ?? ''); detail_row('קילומטראז׳', $details['odometer'] ?? ''); detail_row('ספק', $details['supplier'] ?? ''); detail_row('מספר חשבונית', $details['invoice_number'] ?? ''); detail_row('אמצעי תשלום', payment_method_label((string) ($details['payment_method'] ?? ''))); detail_row('פרויקט / לקוח', $details['project_customer'] ?? ''); detail_row('תיאור', $details['description'] ?? ''); ?>
        <?php endif; ?>
    </div></section>

    <?php if (($record['type'] ?? '') === 'travel'): ?>
    <section class="detail-card"><h2>הוצאות הנסיעה</h2><div class="table-wrap"><table class="records-table"><thead><tr><th>סוג</th><th>תאריך</th><th>ספק</th><th>סכום</th><th>הערה</th></tr></thead><tbody><?php foreach ($record['expense_items'] ?? [] as $item): ?><tr><td><?= portal_h(travel_category_label((string) ($item['category'] ?? ''))) ?></td><td><?= portal_h($item['date'] ?? '') ?></td><td><?= portal_h($item['vendor'] ?? '') ?></td><td><?= portal_h(number_format((float) ($item['amount'] ?? 0), 2) . ' ' . portal_currency_label((string) ($item['currency'] ?? ''))) ?></td><td><?= portal_h($item['note'] ?? '') ?></td></tr><?php endforeach; ?></tbody></table></div></section>
    <?php endif; ?>

    <section class="detail-card"><h2>קבלות ומסמכים</h2>
        <?php if (($record['attachments'] ?? []) === []): ?><div class="alert alert--info">לא צורפו קבצים. סיבה: <?= portal_h($record['no_receipt_reason'] ?? 'לא צוינה') ?></div>
        <?php else: ?><div class="file-list"><?php foreach ($record['attachments'] as $index => $attachment): ?><a class="file-card" href="<?= portal_h(portal_url(['action' => 'download', 'id' => $record['id'] ?? '', 'file' => $index])) ?>"><span class="file-icon">↓</span><span><strong><?= portal_h($attachment['original_name'] ?? '') ?></strong><small><?= portal_h(number_format(((int) ($attachment['size'] ?? 0)) / 1024, 1)) ?> KB</small></span></a><?php endforeach; ?></div><?php endif; ?>
        <?php if (($record['attachment_notes'] ?? '') !== ''): ?><p class="muted-text"><?= nl2br(portal_h($record['attachment_notes'])) ?></p><?php endif; ?>
    </section>

    <section class="detail-card"><h2>טיפול מנהל</h2><form method="post" class="field-grid field-grid--2"><input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>"><input type="hidden" name="action" value="update_record"><input type="hidden" name="record_id" value="<?= portal_h($record['id'] ?? '') ?>"><label class="field"><span>סטטוס</span><select name="status"><?php foreach (portal_valid_statuses() as $status): ?><option value="<?= portal_h($status) ?>" <?= ($record['status'] ?? '') === $status ? 'selected' : '' ?>><?= portal_h(portal_status_label($status)) ?></option><?php endforeach; ?></select></label><label class="field field--full"><span>הערת מנהל</span><textarea name="admin_note" rows="3" maxlength="2000"><?= portal_h($record['admin_note'] ?? '') ?></textarea></label><div class="field--full"><button type="submit" class="button button--primary">שמירת סטטוס</button></div></form></section>
    <?php
}

function portal_render_users(?array $flash): void
{
    portal_render_flash($flash);
    $users = portal_users();
    ksort($users);
    $editName = strtolower(trim((string) ($_GET['edit_user'] ?? '')));
    $editing = $editName !== '' ? ($users[$editName] ?? null) : null;
    ?>
    <section class="page-heading page-heading--compact"><div><p class="eyebrow">הרשאות וגישה</p><h1>ניהול משתמשים</h1><p>מומלץ ליצור חשבון אישי לכל עובד ולהשבית חשבון מיד עם סיום העסקה.</p></div></section>
    <div class="users-layout">
        <section class="detail-card"><h2>משתמשים פעילים</h2><div class="table-wrap"><table class="records-table"><thead><tr><th>שם משתמש</th><th>שם מלא</th><th>תפקיד</th><th>מצב</th><th></th></tr></thead><tbody><?php foreach ($users as $username => $account): ?><tr><td><code><?= portal_h($username) ?></code></td><td><?= portal_h($account['display_name'] ?? '') ?></td><td><?= ($account['role'] ?? '') === 'admin' ? 'מנהל' : 'עובד' ?></td><td><span class="status <?= ($account['active'] ?? false) ? 'status--approved' : 'status--missing' ?>"><?= ($account['active'] ?? false) ? 'פעיל' : 'מושבת' ?></span></td><td><a class="text-link" href="<?= portal_h(portal_url(['tab' => 'users', 'edit_user' => $username])) ?>">עריכה</a></td></tr><?php endforeach; ?></tbody></table></div></section>
        <section class="detail-card"><h2><?= $editing !== null ? 'עריכת משתמש' : 'יצירת משתמש חדש' ?></h2><form method="post" class="stack-form"><input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>"><input type="hidden" name="action" value="save_user"><label><span>שם משתמש באנגלית</span><input type="text" name="account_username" required maxlength="40" pattern="[A-Za-z0-9._-]{3,40}" value="<?= portal_h($editName) ?>" <?= $editing !== null ? 'readonly' : '' ?>></label><label><span>שם מלא</span><input type="text" name="account_display_name" required maxlength="120" value="<?= portal_h($editing['display_name'] ?? '') ?>"></label><label><span>הרשאה</span><select name="account_role"><option value="employee" <?= ($editing['role'] ?? '') !== 'admin' ? 'selected' : '' ?>>עובד, דיווח בלבד</option><option value="admin" <?= ($editing['role'] ?? '') === 'admin' ? 'selected' : '' ?>>מנהל, צפייה בכל הדיווחים</option></select></label><label><span><?= $editing !== null ? 'סיסמה חדשה, להשאיר ריק ללא שינוי' : 'סיסמה זמנית' ?></span><input type="password" name="account_password" minlength="12" maxlength="200" <?= $editing === null ? 'required' : '' ?> autocomplete="new-password"></label><label class="check-field"><input type="checkbox" name="account_active" value="1" <?= $editing === null || ($editing['active'] ?? false) ? 'checked' : '' ?>><span>משתמש פעיל</span></label><button type="submit" class="button button--primary"><?= $editing !== null ? 'שמירת שינויים' : 'יצירת משתמש' ?></button><?php if ($editing !== null): ?><a class="text-link" href="<?= portal_h(portal_url(['tab' => 'users'])) ?>">ביטול עריכה</a><?php endif; ?></form></section>
    </div>
    <?php
}
