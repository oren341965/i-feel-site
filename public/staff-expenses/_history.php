<?php
declare(strict_types=1);

function portal_employee_email(array $user): string
{
    return portal_normalize_company_email((string) ($user['email'] ?? '')) ?? '';
}

function portal_records_for_employee(array $user): array
{
    $email = portal_employee_email($user);
    if ($email === '') {
        return [];
    }

    return array_values(array_filter(
        portal_all_records(),
        static function (array $record) use ($email): bool {
            $recordEmail = portal_normalize_company_email((string) ($record['employee']['email'] ?? ''));
            return $recordEmail !== null && hash_equals($email, $recordEmail);
        }
    ));
}

function portal_employee_profile(array $user): array
{
    $email = portal_employee_email($user);
    $directoryEntry = portal_employee_directory_entry($user);
    $displayName = trim((string) ($user['display_name'] ?? ''));
    $profile = [
        'name' => trim((string) ($directoryEntry['name'] ?? '')),
        'email' => $email,
        'phone' => trim((string) ($directoryEntry['phone'] ?? '')),
    ];
    if ($profile['name'] === '' && $displayName !== $email) {
        $profile['name'] = $displayName;
    }

    foreach (portal_records_for_employee($user) as $record) {
        $employee = is_array($record['employee'] ?? null) ? $record['employee'] : [];
        if ($profile['name'] === '' && trim((string) ($employee['name'] ?? '')) !== '') {
            $profile['name'] = trim((string) $employee['name']);
        }
        if ($profile['phone'] === '' && trim((string) ($employee['phone'] ?? '')) !== '') {
            $profile['phone'] = trim((string) $employee['phone']);
        }
        if ($profile['name'] !== '' && $profile['phone'] !== '') {
            break;
        }
    }

    return $profile;
}

function portal_render_employee_history(array $user, ?array $flash): void
{
    portal_render_flash($flash);
    $records = portal_records_for_employee($user);
    ?>
    <section class="page-heading page-heading--compact">
        <div>
            <p class="eyebrow">ההוצאות שלי</p>
            <h1>היסטוריית דיווחים</h1>
            <p>כאן מופיעים רק הדיווחים שנשלחו מחשבון הדוא״ל המחובר. ניתן לצפות ולהוריד מכאן את הקבלות והמסמכים שצורפו לכל דיווח.</p>
        </div>
        <div class="total-card"><span>דיווחים שנמצאו</span><strong><?= count($records) ?></strong></div>
    </section>

    <div class="history-list">
        <?php if ($records === []): ?>
            <div class="detail-card history-empty">
                <strong>עדיין אין הוצאות בחשבון הזה</strong>
                <span>לאחר שליחת הדיווח הראשון הוא יופיע כאן אוטומטית.</span>
                <a class="button button--primary" href="<?= portal_h(portal_url(['tab' => 'new'])) ?>">דיווח הוצאה חדשה</a>
            </div>
        <?php else: ?>
            <?php foreach ($records as $record): ?>
                <article class="history-card">
                    <div>
                        <span class="history-card__date"><?= portal_h($record['report_date'] ?? '') ?></span>
                        <h2><?= portal_h(portal_report_type_label((string) ($record['type'] ?? ''))) ?></h2>
                        <code><?= portal_h($record['id'] ?? '') ?></code>
                    </div>
                    <div class="history-card__summary">
                        <strong><?= portal_h(portal_format_totals($record)) ?></strong>
                        <span><?= count($record['attachments'] ?? []) ?> מסמכים צורפו</span>
                    </div>
                    <span class="status status--<?= portal_h($record['status'] ?? 'new') ?>"><?= portal_h(portal_status_label((string) ($record['status'] ?? 'new'))) ?></span>
                    <?php if (($record['attachments'] ?? []) !== []): ?>
                        <div class="file-list history-card__files">
                            <?php foreach ($record['attachments'] as $index => $attachment): ?>
                                <a class="file-card" href="<?= portal_h(portal_url(['action' => 'download', 'id' => $record['id'] ?? '', 'file' => $index])) ?>">
                                    <span class="file-icon">↓</span>
                                    <span>
                                        <strong><?= portal_h($attachment['original_name'] ?? 'מסמך') ?></strong>
                                        <small>צפייה או הורדה · <?= portal_h(number_format(((int) ($attachment['size'] ?? 0)) / 1024, 1)) ?> KB</small>
                                    </span>
                                </a>
                            <?php endforeach; ?>
                        </div>
                    <?php endif; ?>
                </article>
            <?php endforeach; ?>
        <?php endif; ?>
    </div>
    <?php
}
