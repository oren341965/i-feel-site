<?php
declare(strict_types=1);

function portal_equipment_statuses(): array
{
    return [
        'חסר להזמנה',
        'הוזמן וממתין',
        'התקבל אך לא שויך',
        'ממתין לאישור לקוח',
        'מוכן להתקנה',
        'דורש בירור',
    ];
}

function portal_equipment_file(): string
{
    return portal_storage_root() . DIRECTORY_SEPARATOR . 'equipment' . DIRECTORY_SEPARATOR . 'records.json';
}

function portal_equipment_records(): array
{
    $path = portal_equipment_file();
    $records = portal_json_read($path);
    if ($records !== []) {
        return array_values(array_filter($records, 'is_array'));
    }

    // Carry the already reviewed Kotsik summary into the employee portal.
    // Unknown quantities, suppliers, costs and dates stay blank until verified.
    $records = [[
        'id' => 'kotsik-summary-2026-11-08',
        'project' => "משפחת קוצ'יק — האשל 97, הרצליה",
        'customer' => "משפחת קוצ'יק",
        'item' => 'השלמות תשתית והתקנה לפי דיווח עמיאל מ־08.11.2026',
        'category' => 'השלמות התקנה / תשתיות',
        'model' => '',
        'requiredQty' => '',
        'orderedQty' => '',
        'receivedQty' => '',
        'supplier' => '',
        'orderNumber' => '',
        'expectedDate' => '',
        'location' => '',
        'cost' => '',
        'paymentStatus' => '',
        'quoteLink' => '',
        'purchaseOrderLink' => '',
        'owner' => '',
        'status' => 'דורש בירור',
        'nextTask' => 'לאמת מול שי ניב, ארטיום ושיין את האחראי, הפתרון והמועד לכל סעיף; לבדוק תשתיות תקשורת ו-KNX, מצלמות חוץ וגלאי הצפה, BUS2 17–18, פתחים ומיקומי מסכים/אינטרקום. לאחר מכן תכנות, בדיקות, הדרכה ותיעוד מסירה. כמויות, ספק, עלות ומועד לא נמסרו.',
        'taskDate' => '',
        'sourceTitle' => 'עדכון עמיאל אדרי מ־08.11.2026',
        'verified' => false,
        'updatedAt' => gmdate('c'),
        'updatedBy' => 'העברה לאזור העובדים',
        'history' => [],
    ]];
    portal_json_write($path, $records);
    return $records;
}

function portal_equipment_handle_post(array $user): never
{
    portal_verify_csrf();
    if (($user['role'] ?? '') !== 'admin') {
        http_response_code(403);
        throw new RuntimeException('רק מנהל יכול לעדכן פרטי ציוד והזמנות.');
    }

    $records = portal_equipment_records();
    $id = portal_post('record_id', 80);
    if ($id === '') {
        $id = bin2hex(random_bytes(12));
    }

    $existing = null;
    foreach ($records as $index => $record) {
        if ((string) ($record['id'] ?? '') === $id) {
            $existing = $index;
            break;
        }
    }

    $status = portal_post('status', 80);
    if (!in_array($status, portal_equipment_statuses(), true)) {
        $status = 'דורש בירור';
    }

    $fields = [
        'project' => portal_post('project', 180),
        'customer' => portal_post('customer', 160),
        'item' => portal_post('item', 500),
        'category' => portal_post('category', 120),
        'model' => portal_post('model', 120),
        'requiredQty' => portal_post('requiredQty', 40),
        'orderedQty' => portal_post('orderedQty', 40),
        'receivedQty' => portal_post('receivedQty', 40),
        'supplier' => portal_post('supplier', 160),
        'orderNumber' => portal_post('orderNumber', 100),
        'expectedDate' => portal_post('expectedDate', 40),
        'location' => portal_post('location', 160),
        'cost' => portal_post('cost', 80),
        'paymentStatus' => portal_post('paymentStatus', 100),
        'quoteLink' => portal_post('quoteLink', 800),
        'purchaseOrderLink' => portal_post('purchaseOrderLink', 800),
        'owner' => portal_post('owner', 120),
        'status' => $status,
        'nextTask' => portal_post('nextTask', 1200),
        'taskDate' => portal_post('taskDate', 40),
        'sourceTitle' => portal_post('sourceTitle', 240),
        'verified' => portal_post('verified', 1) === '1',
        'updatedAt' => gmdate('c'),
        'updatedBy' => (string) ($user['display_name'] ?? 'מנהל'),
    ];

    if ($fields['item'] === '') {
        throw new RuntimeException('יש להזין תיאור לפריט הציוד או למשימת ההשלמה.');
    }

    $before = $existing === null ? null : $records[$existing];
    $history = is_array($before['history'] ?? null) ? $before['history'] : [];
    $history[] = [
        'at' => gmdate('c'),
        'actor' => (string) ($user['display_name'] ?? 'מנהל'),
        'text' => $before === null ? 'נוצרה רשומת ציוד באזור העובדים.' : 'פרטי הרשומה עודכנו באזור העובדים.',
    ];
    $fields['history'] = array_slice($history, -30);
    $fields['id'] = $id;

    if ($existing === null) {
        $records[] = $fields;
    } else {
        $records[$existing] = $fields + ['id' => $id];
    }

    portal_json_write(portal_equipment_file(), array_values($records));
    portal_flash_set('success', 'פרטי הציוד נשמרו באזור העובדים.');
    portal_redirect(['tab' => 'equipment']);
}

function portal_equipment_field(string $name, string $label, $value, string $type = 'text', string $extra = ''): void
{
    ?>
    <label class="field">
        <span><?= portal_h($label) ?></span>
        <input type="<?= portal_h($type) ?>" name="<?= portal_h($name) ?>" value="<?= portal_h($value) ?>" <?= $extra ?>>
    </label>
    <?php
}

function portal_render_equipment(array $user, ?array $flash = null): void
{
    $records = portal_equipment_records();
    $admin = ($user['role'] ?? '') === 'admin';
    $statuses = portal_equipment_statuses();
    $filters = [
        'q' => portal_get('q', 160),
        'project' => portal_get('project', 160),
        'supplier' => portal_get('supplier', 120),
        'owner' => portal_get('owner', 120),
        'category' => portal_get('category', 120),
        'status' => portal_get('status', 80),
    ];
    $matches = static function (array $record) use ($filters): bool {
        $haystack = implode(' ', array_map(static fn($key) => (string) ($record[$key] ?? ''), ['project', 'customer', 'item', 'model', 'supplier', 'owner', 'category', 'orderNumber']));
        if ($filters['q'] !== '' && stripos($haystack, $filters['q']) === false) return false;
        foreach (['project', 'supplier', 'owner', 'category', 'status'] as $key) {
            if ($filters[$key] !== '' && (string) ($record[$key] ?? '') !== $filters[$key]) return false;
        }
        return true;
    };
    $shown = array_values(array_filter($records, $matches));
    $valueOptions = static function (array $rows, string $field): array {
        $values = array_unique(array_filter(array_map(static fn($row) => trim((string) ($row[$field] ?? '')), $rows)));
        sort($values, SORT_NATURAL | SORT_FLAG_CASE);
        return $values;
    };
    ?>
    <?php if (is_array($flash) && ($flash['message'] ?? '') !== ''): ?>
        <div class="alert alert--<?= portal_h($flash['type'] ?? 'success') ?>" role="status"><?= portal_h($flash['message']) ?></div>
    <?php endif; ?>
    <section class="card">
        <h2>ציוד, הזמנות ואספקות</h2>
        <p>מסך פנימי לאיתור ציוד לפי פרויקט, ספק, לקוח ואחראי. מידע חסר נשאר ריק עד לאימות.</p>
        <?php if (!$admin): ?><p class="form-note">תצוגת קריאה בלבד. פרטי עלות ותשלום מוצגים למנהלים בלבד.</p><?php endif; ?>
        <form method="get" action="<?= portal_h(portal_base_path()) ?>" class="form-grid">
            <input type="hidden" name="tab" value="equipment">
            <label class="field"><span>חיפוש</span><input name="q" value="<?= portal_h($filters['q']) ?>" placeholder="פריט, לקוח או הזמנה"></label>
            <?php foreach (['project' => 'פרויקט', 'supplier' => 'ספק', 'owner' => 'אחראי', 'category' => 'סוג ציוד'] as $field => $label): ?>
                <label class="field"><span><?= portal_h($label) ?></span><select name="<?= portal_h($field) ?>"><option value="">הכול</option><?php foreach ($valueOptions($records, $field) as $value): ?><option value="<?= portal_h($value) ?>" <?= $filters[$field] === $value ? 'selected' : '' ?>><?= portal_h($value) ?></option><?php endforeach; ?></select></label>
            <?php endforeach; ?>
            <label class="field"><span>סטטוס</span><select name="status"><option value="">הכול</option><?php foreach ($statuses as $status): ?><option value="<?= portal_h($status) ?>" <?= $filters['status'] === $status ? 'selected' : '' ?>><?= portal_h($status) ?></option><?php endforeach; ?></select></label>
            <button class="button button--primary" type="submit">סינון</button>
            <a class="button button--secondary" href="<?= portal_h(portal_url(['tab' => 'equipment'])) ?>">איפוס</a>
        </form>
    </section>
    <section class="card" aria-label="תצוגות סטטוס">
        <h3>תצוגות מהירות</h3>
        <div class="tabs">
            <?php foreach ($statuses as $status): ?>
                <a class="tab<?= $filters['status'] === $status ? ' is-active' : '' ?>" href="<?= portal_h(portal_url(['tab' => 'equipment', 'status' => $status])) ?>"><?= portal_h($status) ?> (<?= count(array_filter($records, static fn($r) => ($r['status'] ?? '') === $status)) ?>)</a>
            <?php endforeach; ?>
            <a class="tab<?= $filters['status'] === '' ? ' is-active' : '' ?>" href="<?= portal_h(portal_url(['tab' => 'equipment'])) ?>">הכול (<?= count($records) ?>)</a>
        </div>
    </section>
    <?php if ($admin): ?>
        <details class="card">
            <summary>הוספת פריט ציוד</summary>
            <?php portal_equipment_render_editor([], $statuses); ?>
        </details>
    <?php endif; ?>
    <?php if ($shown === []): ?>
        <section class="card"><p>לא נמצאו רשומות לפי הסינון.</p></section>
    <?php endif; ?>
    <?php foreach ($shown as $record): ?>
        <article class="card">
            <h3><?= portal_h($record['item'] ?? '') ?></h3>
            <p><strong>פרויקט:</strong> <?= portal_h($record['project'] ?? 'לא נמסר') ?> · <strong>לקוח:</strong> <?= portal_h($record['customer'] ?? 'לא נמסר') ?></p>
            <p><strong>סטטוס:</strong> <?= portal_h($record['status'] ?? 'דורש בירור') ?><?= empty($record['verified']) ? ' · ממתין לאימות' : ' · אומת' ?></p>
            <dl>
                <dt>דגם / מק״ט</dt><dd><?= portal_h($record['model'] ?? 'לא נמסר') ?></dd>
                <dt>נדרש / הוזמן / התקבל</dt><dd><?= portal_h($record['requiredQty'] ?? '—') ?> / <?= portal_h($record['orderedQty'] ?? '—') ?> / <?= portal_h($record['receivedQty'] ?? '—') ?></dd>
                <dt>ספק / מספר הזמנה</dt><dd><?= portal_h($record['supplier'] ?? 'לא נמסר') ?> / <?= portal_h($record['orderNumber'] ?? 'לא נמסר') ?></dd>
                <dt>נמצא אצל / אחראי</dt><dd><?= portal_h($record['location'] ?? 'לא נמסר') ?> / <?= portal_h($record['owner'] ?? 'לא נמסר') ?></dd>
                <dt>אספקה צפויה</dt><dd><?= portal_h($record['expectedDate'] ?? 'לא נמסר') ?></dd>
                <dt>משימה הבאה</dt><dd><?= nl2br(portal_h($record['nextTask'] ?? 'לא נמסרה')) ?></dd>
                <dt>מקור</dt><dd><?= portal_h($record['sourceTitle'] ?? 'לא צוין') ?></dd>
                <?php if (!empty($record['quoteLink'])): ?><dt>הצעת מחיר</dt><dd><a href="<?= portal_h($record['quoteLink']) ?>" rel="noopener noreferrer">פתיחה</a></dd><?php endif; ?>
                <?php if (!empty($record['purchaseOrderLink'])): ?><dt>הזמנת רכש</dt><dd><a href="<?= portal_h($record['purchaseOrderLink']) ?>" rel="noopener noreferrer">פתיחה</a></dd><?php endif; ?>
                <?php if ($admin): ?>
                    <dt>עלות / תשלום</dt><dd><?= portal_h($record['cost'] ?? 'לא נמסר') ?> / <?= portal_h($record['paymentStatus'] ?? 'לא נמסר') ?></dd>
                <?php endif; ?>
            </dl>
            <?php if ($admin): ?>
                <details>
                    <summary>עריכת הרשומה</summary>
                    <?php portal_equipment_render_editor($record, $statuses); ?>
                </details>
            <?php endif; ?>
        </article>
    <?php endforeach; ?>
    <?php
}

function portal_equipment_render_editor(array $record, array $statuses): void
{
    ?>
    <form method="post" action="<?= portal_h(portal_url(['tab' => 'equipment'])) ?>" class="form-grid">
        <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
        <input type="hidden" name="action" value="equipment_save">
        <input type="hidden" name="record_id" value="<?= portal_h($record['id'] ?? '') ?>">
        <?php
        portal_equipment_field('item', 'ציוד / פריט / משימה', $record['item'] ?? '', 'text', 'required');
        portal_equipment_field('project', 'פרויקט', $record['project'] ?? '');
        portal_equipment_field('customer', 'לקוח', $record['customer'] ?? '');
        portal_equipment_field('category', 'סוג ציוד', $record['category'] ?? '');
        portal_equipment_field('model', 'דגם / מק״ט', $record['model'] ?? '');
        portal_equipment_field('requiredQty', 'כמות נדרשת', $record['requiredQty'] ?? '', 'text', 'inputmode="decimal"');
        portal_equipment_field('orderedQty', 'כמות שהוזמנה', $record['orderedQty'] ?? '', 'text', 'inputmode="decimal"');
        portal_equipment_field('receivedQty', 'כמות שהתקבלה', $record['receivedQty'] ?? '', 'text', 'inputmode="decimal"');
        portal_equipment_field('supplier', 'ספק', $record['supplier'] ?? '');
        portal_equipment_field('orderNumber', 'מספר הזמנה', $record['orderNumber'] ?? '');
        portal_equipment_field('expectedDate', 'תאריך אספקה צפוי', $record['expectedDate'] ?? '', 'date');
        portal_equipment_field('location', 'אצל מי / מיקום', $record['location'] ?? '');
        portal_equipment_field('owner', 'אחראי / איש צוות', $record['owner'] ?? '');
        portal_equipment_field('cost', 'עלות', $record['cost'] ?? '');
        portal_equipment_field('paymentStatus', 'סטטוס תשלום', $record['paymentStatus'] ?? '');
        portal_equipment_field('quoteLink', 'קישור להצעת מחיר', $record['quoteLink'] ?? '', 'url');
        portal_equipment_field('purchaseOrderLink', 'קישור להזמנת רכש', $record['purchaseOrderLink'] ?? '', 'url');
        portal_equipment_field('sourceTitle', 'מקור המידע', $record['sourceTitle'] ?? '');
        ?>
        <label class="field"><span>סטטוס</span><select name="status"><?php foreach ($statuses as $status): ?><option value="<?= portal_h($status) ?>" <?= ($record['status'] ?? 'דורש בירור') === $status ? 'selected' : '' ?>><?= portal_h($status) ?></option><?php endforeach; ?></select></label>
        <label class="field"><span>המשימה הבאה</span><textarea name="nextTask" rows="4"><?= portal_h($record['nextTask'] ?? '') ?></textarea></label>
        <label class="field"><span>תאריך משימה</span><input type="date" name="taskDate" value="<?= portal_h($record['taskDate'] ?? '') ?>"></label>
        <label class="field"><input type="checkbox" name="verified" value="1" <?= !empty($record['verified']) ? 'checked' : '' ?>> אימות ידני הושלם</label>
        <button class="button button--primary" type="submit">שמירה</button>
    </form>
    <?php
}
