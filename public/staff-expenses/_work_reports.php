<?php
declare(strict_types=1);

function portal_installation_form_url(): string
{
    return 'https://www.superform.spot-nik.com/form/63cd90e88ff7b62b2d669d62';
}

function portal_work_report_recipient(): string
{
    $configured = portal_normalize_company_email(trim((string) getenv('EXPENSE_PORTAL_WORK_REPORT_RECIPIENT')));
    return $configured ?? 'myhome@' . portal_company_email_domain();
}

function portal_work_report_type_label(string $type): string
{
    $labels = [
        'installation' => '׳¡׳™׳•׳ ׳”׳×׳§׳ ׳”',
        'service' => '׳§׳¨׳™׳׳× ׳©׳™׳¨׳•׳×',
    ];
    return $labels[$type] ?? '׳“׳™׳•׳•׳— ׳¢׳‘׳•׳“׳”';
}

function portal_work_report_outcome_label(string $outcome): string
{
    return $outcome === 'follow_up' ? '׳ ׳“׳¨׳© ׳”׳׳©׳ ׳˜׳™׳₪׳•׳' : '׳”׳¢׳‘׳•׳“׳” ׳”׳•׳©׳׳׳”';
}

function portal_work_report_dir(string $reportId): string
{
    if (!preg_match('/^WR-(\d{4})(\d{2})\d{2}-\d{6}-[a-f0-9]{12}$/', $reportId, $match)) {
        throw new InvalidArgumentException('׳׳¡׳₪׳¨ ׳“׳™׳•׳•׳— ׳”׳¢׳‘׳•׳“׳” ׳׳™׳ ׳• ׳×׳§׳™׳.');
    }
    return portal_storage_root()
        . DIRECTORY_SEPARATOR . 'work-reports'
        . DIRECTORY_SEPARATOR . $match[1]
        . DIRECTORY_SEPARATOR . $match[2]
        . DIRECTORY_SEPARATOR . $reportId;
}

function portal_new_work_report_id(): string
{
    return 'WR-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(6));
}

function portal_work_report_file(string $reportId): string
{
    return portal_work_report_dir($reportId) . DIRECTORY_SEPARATOR . 'metadata.json';
}

function portal_save_work_report(array $report): void
{
    portal_json_write(portal_work_report_file((string) ($report['id'] ?? '')), $report);
}

function portal_all_work_reports(): array
{
    $pattern = portal_storage_root()
        . DIRECTORY_SEPARATOR . 'work-reports'
        . DIRECTORY_SEPARATOR . '*'
        . DIRECTORY_SEPARATOR . '*'
        . DIRECTORY_SEPARATOR . '*'
        . DIRECTORY_SEPARATOR . 'metadata.json';
    $reports = [];
    foreach (glob($pattern) ?: [] as $path) {
        $report = portal_json_read($path);
        if ($report !== [] && isset($report['id'])) {
            $reports[] = $report;
        }
    }
    usort($reports, static fn(array $a, array $b): int =>
        strcmp((string) ($b['created_at'] ?? ''), (string) ($a['created_at'] ?? '')));
    return $reports;
}

function portal_work_reports_for_user(array $user): array
{
    if (($user['role'] ?? '') === 'admin') {
        return portal_all_work_reports();
    }
    $email = portal_normalize_company_email((string) ($user['email'] ?? '')) ?? '';
    return array_values(array_filter(
        portal_all_work_reports(),
        static fn(array $report): bool =>
            $email !== ''
            && hash_equals($email, portal_normalize_company_email((string) ($report['employee']['email'] ?? '')) ?? '')
    ));
}

function portal_work_report_email_attachments(array $report): array
{
    $attachments = [];
    foreach (($report['attachments'] ?? []) as $attachment) {
        if (!is_array($attachment)) {
            continue;
        }
        $storageName = basename((string) ($attachment['storage_name'] ?? ''));
        if ($storageName === '' || $storageName !== (string) ($attachment['storage_name'] ?? '')) {
            continue;
        }
        $path = portal_work_report_dir((string) $report['id'])
            . DIRECTORY_SEPARATOR . 'files'
            . DIRECTORY_SEPARATOR . $storageName;
        if (!is_file($path)) {
            continue;
        }
        $attachments[] = [
            'path' => $path,
            'name' => (string) ($attachment['original_name'] ?? 'work-document'),
            'mime' => (string) ($attachment['mime'] ?? 'application/octet-stream'),
            'size' => (int) ($attachment['size'] ?? filesize($path)),
        ];
    }
    return $attachments;
}

function portal_work_report_email_body(array $report): string
{
    $employee = is_array($report['employee'] ?? null) ? $report['employee'] : [];
    return implode("\r\n", [
        '׳ ׳©׳׳¨ ׳“׳™׳•׳•׳— ׳¢׳‘׳•׳“׳” ׳—׳“׳© ׳׳¢׳•׳‘׳“/׳× I Feel.',
        '',
        '׳׳¡׳₪׳¨ ׳“׳™׳•׳•׳—: ' . (string) ($report['id'] ?? ''),
        '׳¡׳•׳’: ' . portal_work_report_type_label((string) ($report['type'] ?? '')),
        '׳¢׳•׳‘׳“/׳×: ' . (string) ($employee['name'] ?? ''),
        '׳“׳•׳"׳: ' . (string) ($employee['email'] ?? ''),
        '׳˜׳׳₪׳•׳: ' . (string) ($employee['phone'] ?? ''),
        '׳×׳׳¨׳™׳ ׳¢׳‘׳•׳“׳”: ' . (string) ($report['work_date'] ?? ''),
        '׳׳§׳•׳— / ׳₪׳¨׳•׳™׳§׳˜: ' . (string) ($report['customer_project'] ?? ''),
        '׳›׳×׳•׳‘׳×: ' . (string) ($report['site_address'] ?? ''),
        '׳×׳•׳¦׳׳”: ' . portal_work_report_outcome_label((string) ($report['outcome'] ?? 'completed')),
        '',
        '׳¡׳™׳›׳•׳:',
        (string) ($report['summary'] ?? ''),
        '',
        '׳”׳׳©׳ ׳˜׳™׳₪׳•׳:',
        (string) ($report['follow_up'] ?? ''),
        '',
        '׳׳¡׳₪׳¨ ׳×׳׳•׳ ׳•׳× ׳•׳׳¡׳׳›׳™׳: ' . count($report['attachments'] ?? []),
        '',
        '׳׳¦׳₪׳™׳™׳” ׳‘׳¡׳˜׳˜׳™׳¡׳˜׳™׳§׳” ׳•׳‘׳“׳™׳•׳•׳—׳™׳:',
        'https://i-feel.co.il/staff-expenses/?tab=work_stats',
        '',
        'I Feel',
    ]);
}

function portal_notify_work_report(array $report): bool
{
    $attachments = portal_work_report_email_attachments($report);
    $batches = portal_attachment_batches($attachments);
    if ((string) getenv('IFEEL_PORTAL_TEST_MODE') === '1') {
        return count($batches) >= 1;
    }
    foreach ($batches as $index => $batch) {
        $subject = portal_work_report_type_label((string) ($report['type'] ?? ''))
            . ' ג€” '
            . (string) ($report['customer_project'] ?? '')
            . (count($batches) > 1 ? ' ג€” ׳§׳‘׳¦׳™׳ ' . ($index + 1) . '/' . count($batches) : '');
        if (!portal_send_mail_with_attachments(
            portal_work_report_recipient(),
            $subject,
            portal_work_report_email_body($report),
            $batch
        )) {
            return false;
        }
    }
    return true;
}

function portal_handle_work_report_post(array $user): never
{
    portal_verify_csrf();
    $type = portal_post('work_type', 40);
    $outcome = portal_post('work_outcome', 40);
    $workDate = portal_post('work_date', 20);
    $customerProject = portal_post('customer_project', 180);
    $siteAddress = portal_post('site_address', 240);
    $summary = portal_post('work_summary', 3000);
    $followUp = portal_post('work_follow_up', 2000);

    if (!in_array($type, ['installation', 'service'], true)) {
        throw new RuntimeException('׳™׳© ׳׳‘׳—׳•׳¨ ׳¡׳™׳•׳ ׳”׳×׳§׳ ׳” ׳׳• ׳§׳¨׳™׳׳× ׳©׳™׳¨׳•׳×.');
    }
    if (!in_array($outcome, ['completed', 'follow_up'], true)) {
        throw new RuntimeException('׳™׳© ׳׳‘׳—׳•׳¨ ׳׳× ׳×׳•׳¦׳׳× ׳”׳¢׳‘׳•׳“׳”.');
    }
    if (!portal_valid_date($workDate)) {
        throw new RuntimeException('׳×׳׳¨׳™׳ ׳”׳¢׳‘׳•׳“׳” ׳׳™׳ ׳• ׳×׳§׳™׳.');
    }
    if ($customerProject === '' || $summary === '') {
        throw new RuntimeException('׳—׳•׳‘׳” ׳׳”׳–׳™׳ ׳׳§׳•׳— ׳׳• ׳₪׳¨׳•׳™׳§׳˜ ׳•׳¡׳™׳›׳•׳ ׳¢׳‘׳•׳“׳”.');
    }
    if ($outcome === 'follow_up' && $followUp === '') {
        throw new RuntimeException('׳›׳׳©׳¨ ׳ ׳“׳¨׳© ׳”׳׳©׳ ׳˜׳™׳₪׳•׳, ׳—׳•׳‘׳” ׳׳₪׳¨׳˜ ׳׳” ׳ ׳•׳×׳¨ ׳׳‘׳¦׳¢.');
    }

    $reportId = portal_new_work_report_id();
    $reportDir = portal_work_report_dir($reportId);
    portal_ensure_directory($reportDir);
    try {
        $attachments = portal_save_uploads($reportDir, $_FILES['work_attachments'] ?? []);
        if ($attachments === []) {
            throw new RuntimeException('׳—׳•׳‘׳” ׳׳¦׳׳ ׳׳• ׳׳¦׳¨׳£ ׳׳₪׳—׳•׳× ׳˜׳•׳₪׳¡ ׳׳• ׳×׳׳•׳ ׳” ׳׳—׳× ׳׳¡׳™׳•׳ ׳”׳¢׳‘׳•׳“׳”.');
        }
        $profile = portal_employee_profile($user);
        $report = [
            'id' => $reportId,
            'type' => $type,
            'outcome' => $outcome,
            'work_date' => $workDate,
            'customer_project' => portal_substr($customerProject, 0, 180),
            'site_address' => portal_substr($siteAddress, 0, 240),
            'summary' => portal_substr($summary, 0, 3000),
            'follow_up' => portal_substr($followUp, 0, 2000),
            'employee' => [
                'name' => (string) ($profile['name'] ?? ''),
                'email' => (string) ($profile['email'] ?? ''),
                'phone' => (string) ($profile['phone'] ?? ''),
            ],
            'attachments' => $attachments,
            'created_at' => gmdate('c'),
            'email_recipient' => portal_work_report_recipient(),
            'email_sent' => false,
        ];
        portal_save_work_report($report);
        $report['email_sent'] = portal_notify_work_report($report);
        $report['email_attempted_at'] = gmdate('c');
        portal_save_work_report($report);
        portal_audit('work_report_submitted', [
            'report_id' => $reportId,
            'type' => $type,
            'outcome' => $outcome,
            'attachments' => count($attachments),
            'email_sent' => $report['email_sent'],
        ]);
        portal_flash_set(
            $report['email_sent'] ? 'success' : 'error',
            $report['email_sent']
                ? '׳“׳™׳•׳•׳— ׳”׳¢׳‘׳•׳“׳” ׳ ׳©׳׳¨ ׳•׳ ׳©׳׳— ׳׳ ' . portal_work_report_recipient() . '.'
                : '׳”׳“׳™׳•׳•׳— ׳ ׳©׳׳¨, ׳׳ ׳©׳׳™׳—׳× ׳”׳“׳•׳"׳ ׳ ׳›׳©׳׳”. ׳”׳“׳™׳•׳•׳— ׳–׳׳™׳ ׳׳׳ ׳”׳ ׳׳¦׳•׳¨׳ ׳˜׳™׳₪׳•׳.'
        );
        portal_redirect(['tab' => 'work']);
    } catch (Throwable $error) {
        portal_remove_tree($reportDir);
        throw $error;
    }
}

function portal_work_report_stats(array $reports): array
{
    $stats = [];
    foreach ($reports as $report) {
        $email = portal_normalize_company_email((string) ($report['employee']['email'] ?? '')) ?? 'unknown';
        $name = trim((string) ($report['employee']['name'] ?? $email));
        $stats[$email] ??= [
            'name' => $name,
            'email' => $email,
            'total' => 0,
            'installations' => 0,
            'service' => 0,
            'follow_up' => 0,
            'attachments' => 0,
        ];
        $stats[$email]['total']++;
        $stats[$email][($report['type'] ?? '') === 'installation' ? 'installations' : 'service']++;
        if (($report['outcome'] ?? '') === 'follow_up') {
            $stats[$email]['follow_up']++;
        }
        $stats[$email]['attachments'] += count($report['attachments'] ?? []);
    }
    uasort($stats, static fn(array $a, array $b): int => $b['total'] <=> $a['total']);
    return $stats;
}

function portal_render_work_report_form(array $user, ?array $flash): void
{
    portal_render_flash($flash);
    $reports = portal_work_reports_for_user($user);
    ?>
    <section class="page-heading page-heading--compact">
        <div>
            <p class="eyebrow">׳¡׳™׳•׳ ׳¢׳‘׳•׳“׳” ׳׳”׳©׳˜׳—</p>
            <h1>׳”׳×׳§׳ ׳” ׳׳• ׳§׳¨׳™׳׳× ׳©׳™׳¨׳•׳×</h1>
            <p>׳‘׳¡׳™׳•׳ ׳”׳¢׳‘׳•׳“׳” ׳׳¦׳׳׳™׳ ׳׳× ׳”׳˜׳₪׳¡׳™׳ ׳•׳”׳×׳׳•׳ ׳•׳× ׳׳”׳˜׳׳₪׳•׳. ׳”׳“׳™׳•׳•׳— ׳ ׳©׳׳¨ ׳×׳—׳× ׳”׳¢׳•׳‘׳“ ׳•׳ ׳©׳׳— ׳¢׳ ׳”׳§׳‘׳¦׳™׳ ׳׳ <?= portal_h(portal_work_report_recipient()) ?>.</p>
        </div>
        <div class="total-card"><span>׳”׳“׳™׳•׳•׳—׳™׳ ׳©׳׳™</span><strong><?= count($reports) ?></strong></div>
    </section>

    <form method="post" enctype="multipart/form-data" class="detail-card form-grid">
        <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
        <input type="hidden" name="action" value="submit_work_report">
        <label class="field">
            <span>׳¡׳•׳’ ׳”׳¢׳‘׳•׳“׳” <b>*</b></span>
            <select name="work_type" required><option value="">׳‘׳—׳™׳¨׳”</option><option value="installation">׳¡׳™׳•׳ ׳”׳×׳§׳ ׳”</option><option value="service">׳§׳¨׳™׳׳× ׳©׳™׳¨׳•׳×</option></select>
        </label>
        <label class="field">
            <span>׳×׳׳¨׳™׳ ׳”׳¢׳‘׳•׳“׳” <b>*</b></span>
            <input type="date" name="work_date" value="<?= portal_h(date('Y-m-d')) ?>" required>
        </label>
        <label class="field field--full">
            <span>׳׳§׳•׳— / ׳₪׳¨׳•׳™׳§׳˜ <b>*</b></span>
            <input type="text" name="customer_project" maxlength="180" required>
        </label>
        <label class="field field--full">
            <span>׳›׳×׳•׳‘׳× ׳”׳׳×׳¨</span>
            <input type="text" name="site_address" maxlength="240" autocomplete="street-address">
        </label>
        <label class="field field--full">
            <span>׳¡׳™׳›׳•׳ ׳”׳¢׳‘׳•׳“׳” <b>*</b></span>
            <textarea name="work_summary" rows="5" maxlength="3000" required placeholder="׳׳” ׳‘׳•׳¦׳¢, ׳׳” ׳ ׳‘׳“׳§ ׳•׳׳” ׳ ׳׳¡׳¨ ׳׳׳§׳•׳—"></textarea>
        </label>
        <label class="field">
            <span>׳×׳•׳¦׳׳” <b>*</b></span>
            <select name="work_outcome" required><option value="completed">׳”׳¢׳‘׳•׳“׳” ׳”׳•׳©׳׳׳”</option><option value="follow_up">׳ ׳“׳¨׳© ׳”׳׳©׳ ׳˜׳™׳₪׳•׳</option></select>
        </label>
        <label class="field field--full">
            <span>׳”׳׳©׳ ׳˜׳™׳₪׳•׳</span>
            <textarea name="work_follow_up" rows="3" maxlength="2000" placeholder="׳—׳׳§׳™׳ ׳—׳¡׳¨׳™׳, ׳‘׳™׳§׳•׳¨ ׳ ׳•׳¡׳£ ׳׳• ׳₪׳¢׳•׳׳” ׳׳©׳¨׳“׳™׳×"></textarea>
        </label>
        <div class="field field--full">
            <span>׳¦׳™׳׳•׳ ׳˜׳₪׳¡׳™׳ ׳•׳×׳׳•׳ ׳•׳× <b>*</b></span>
            <div class="receipt-actions">
                <label class="receipt-action receipt-action--camera">
                    <span class="receipt-action__icon" aria-hidden="true">נ“·</span><strong>׳¦׳™׳׳•׳ ׳׳”׳˜׳׳₪׳•׳</strong>
                    <input class="receipt-input" type="file" name="work_attachments[]" multiple accept="image/*" capture="environment">
                </label>
                <label class="receipt-action">
                    <span class="receipt-action__icon" aria-hidden="true">נ“</span><strong>׳‘׳—׳™׳¨׳× ׳§׳‘׳¦׳™׳</strong>
                    <input class="receipt-input" type="file" name="work_attachments[]" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.avif,application/pdf,image/*">
                </label>
            </div>
            <p class="form-note">׳—׳•׳‘׳” ׳׳¦׳¨׳£ ׳׳₪׳—׳•׳× ׳§׳•׳‘׳¥ ׳׳—׳“. ׳¢׳“ 20 ׳§׳‘׳¦׳™׳, 12MB ׳׳§׳•׳‘׳¥ ׳•ײ¾60MB ׳‘׳¡׳ ׳”׳›׳•׳.</p>
        </div>
        <div class="field--full"><button type="submit" class="button button--primary">׳©׳׳™׳¨׳” ׳•׳©׳׳™׳—׳” ׳ײ¾MyHome</button></div>
    </form>

    <section class="detail-card">
        <h2>׳“׳™׳•׳•׳—׳™׳ ׳׳—׳¨׳•׳ ׳™׳ ׳©׳׳™</h2>
        <div class="table-wrap"><table class="records-table">
            <thead><tr><th>׳×׳׳¨׳™׳</th><th>׳¡׳•׳’</th><th>׳׳§׳•׳— / ׳₪׳¨׳•׳™׳§׳˜</th><th>׳×׳•׳¦׳׳”</th><th>׳§׳‘׳¦׳™׳</th><th>׳“׳•׳"׳</th></tr></thead>
            <tbody>
            <?php if ($reports === []): ?><tr><td colspan="6" class="empty-cell">׳¢׳“׳™׳™׳ ׳׳ ׳ ׳©׳׳—׳• ׳“׳™׳•׳•׳—׳™ ׳¢׳‘׳•׳“׳”.</td></tr><?php endif; ?>
            <?php foreach (array_slice($reports, 0, 10) as $report): ?>
                <tr>
                    <td><?= portal_h((string) ($report['work_date'] ?? '')) ?></td>
                    <td><?= portal_h(portal_work_report_type_label((string) ($report['type'] ?? ''))) ?></td>
                    <td><?= portal_h((string) ($report['customer_project'] ?? '')) ?></td>
                    <td><span class="status <?= ($report['outcome'] ?? '') === 'follow_up' ? 'status--missing' : 'status--approved' ?>"><?= portal_h(portal_work_report_outcome_label((string) ($report['outcome'] ?? ''))) ?></span></td>
                    <td><?= count($report['attachments'] ?? []) ?></td>
                    <td><?= ($report['email_sent'] ?? false) ? '׳ ׳©׳׳—' : '׳“׳•׳¨׳© ׳˜׳™׳₪׳•׳' ?></td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table></div>
    </section>
    <?php
}

function portal_render_work_report_stats(?array $flash): void
{
    portal_render_flash($flash);
    $reports = portal_all_work_reports();
    $stats = portal_work_report_stats($reports);
    $followUps = count(array_filter($reports, static fn(array $report): bool => ($report['outcome'] ?? '') === 'follow_up'));
    ?>
    <section class="page-heading page-heading--compact">
        <div><p class="eyebrow">׳‘׳™׳¦׳•׳¢׳™ ׳©׳˜׳—</p><h1>׳¡׳˜׳˜׳™׳¡׳˜׳™׳§׳× ׳”׳×׳§׳ ׳•׳× ׳•׳§׳¨׳™׳׳•׳× ׳©׳™׳¨׳•׳×</h1><p>׳¡׳™׳›׳•׳ ׳“׳™׳•׳•׳—׳™׳ ׳׳₪׳™ ׳¢׳•׳‘׳“, ׳›׳•׳׳ ׳׳©׳™׳׳•׳× ׳₪׳×׳•׳—׳•׳× ׳•׳›׳׳•׳× ׳×׳™׳¢׳•׳“ ׳©׳”׳•׳’׳©׳”.</p></div>
        <div class="heading-stats"><div class="total-card"><span>׳›׳ ׳”׳“׳™׳•׳•׳—׳™׳</span><strong><?= count($reports) ?></strong></div><div class="total-card"><span>׳”׳׳©׳ ׳˜׳™׳₪׳•׳</span><strong><?= $followUps ?></strong></div></div>
    </section>
    <section class="detail-card">
        <div class="table-wrap"><table class="records-table">
            <thead><tr><th>׳¢׳•׳‘׳“</th><th>׳¡׳”"׳›</th><th>׳”׳×׳§׳ ׳•׳×</th><th>׳§׳¨׳™׳׳•׳× ׳©׳™׳¨׳•׳×</th><th>׳”׳׳©׳ ׳˜׳™׳₪׳•׳</th><th>׳×׳׳•׳ ׳•׳× ׳•׳׳¡׳׳›׳™׳</th></tr></thead>
            <tbody>
            <?php if ($stats === []): ?><tr><td colspan="6" class="empty-cell">׳¢׳“׳™׳™׳ ׳׳ ׳ ׳©׳׳—׳• ׳“׳™׳•׳•׳—׳™ ׳¢׳‘׳•׳“׳”.</td></tr><?php endif; ?>
            <?php foreach ($stats as $row): ?><tr><td><strong><?= portal_h($row['name']) ?></strong><small><?= portal_h($row['email']) ?></small></td><td><?= $row['total'] ?></td><td><?= $row['installations'] ?></td><td><?= $row['service'] ?></td><td><?= $row['follow_up'] ?></td><td><?= $row['attachments'] ?></td></tr><?php endforeach; ?>
            </tbody>
        </table></div>
    </section>
    <?php
}

