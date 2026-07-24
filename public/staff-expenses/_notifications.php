<?php
declare(strict_types=1);

// Base64 adds roughly 33%, so keep each raw batch below common 20–25 MB limits.
const IFEEL_PORTAL_EMAIL_ATTACHMENT_BATCH_BYTES = 14680064;

function portal_expense_notification_recipients(): array
{
    $configured = trim((string) getenv('EXPENSE_PORTAL_REPORT_RECIPIENTS'));
    if ($configured === '') {
        $candidates = ['account@i-feel.co.il', 'oren@i-feel.co.il'];
    } else {
        $split = preg_split('/[\s,;]+/', $configured);
        $candidates = is_array($split) ? $split : [];
    }
    $recipients = [];
    foreach ($candidates as $candidate) {
        $email = portal_normalize_company_email((string) $candidate);
        if ($email !== null) {
            $recipients[$email] = true;
        }
    }
    return array_keys($recipients);
}

function portal_record_email_attachments(array $record): array
{
    $recordId = (string) ($record['id'] ?? '');
    $attachments = [];
    foreach (($record['attachments'] ?? []) as $attachment) {
        if (!is_array($attachment)) {
            continue;
        }
        $storageName = basename((string) ($attachment['storage_name'] ?? ''));
        if ($storageName === '' || $storageName !== (string) ($attachment['storage_name'] ?? '')) {
            continue;
        }
        $path = portal_record_dir($recordId) . DIRECTORY_SEPARATOR . 'files' . DIRECTORY_SEPARATOR . $storageName;
        if (!is_file($path)) {
            continue;
        }
        $attachments[] = [
            'path' => $path,
            'name' => (string) ($attachment['original_name'] ?? 'document'),
            'mime' => (string) ($attachment['mime'] ?? 'application/octet-stream'),
            'size' => (int) ($attachment['size'] ?? filesize($path)),
        ];
    }
    return $attachments;
}

function portal_attachment_batches(array $attachments): array
{
    if ($attachments === []) {
        return [[]];
    }
    $batches = [];
    $batch = [];
    $batchBytes = 0;
    foreach ($attachments as $attachment) {
        $size = max(0, (int) ($attachment['size'] ?? 0));
        if ($batch !== [] && $batchBytes + $size > IFEEL_PORTAL_EMAIL_ATTACHMENT_BATCH_BYTES) {
            $batches[] = $batch;
            $batch = [];
            $batchBytes = 0;
        }
        $batch[] = $attachment;
        $batchBytes += $size;
    }
    if ($batch !== []) {
        $batches[] = $batch;
    }
    return $batches;
}

function portal_expense_notification_body(array $record): string
{
    $employee = is_array($record['employee'] ?? null) ? $record['employee'] : [];
    return implode("\r\n", [
        'נשמר דיווח הוצאה חדש באזור עובדי I Feel.',
        '',
        'מספר דיווח: ' . (string) ($record['id'] ?? ''),
        'עובד/ת: ' . (string) ($employee['name'] ?? ''),
        'דוא״ל: ' . (string) ($employee['email'] ?? ''),
        'טלפון: ' . (string) ($employee['phone'] ?? ''),
        'סוג דיווח: ' . portal_report_type_label((string) ($record['type'] ?? '')),
        'תאריך הוצאה: ' . (string) ($record['report_date'] ?? ''),
        'סה״כ: ' . portal_format_totals($record),
        'מספר מסמכים: ' . count($record['attachments'] ?? []),
        '',
        'לצפייה בדיווח במערכת הניהול:',
        'https://i-feel.co.il/staff-expenses/?tab=reports&view=' . rawurlencode((string) ($record['id'] ?? '')),
        '',
        'I Feel',
    ]);
}

function portal_notify_expense_submission(array $record): bool
{
    $recipients = portal_expense_notification_recipients();
    if ($recipients === []) {
        return false;
    }
    $attachments = portal_record_email_attachments($record);
    $batches = portal_attachment_batches($attachments);
    $subjectBase = 'דיווח הוצאה חדש ' . (string) ($record['id'] ?? '');
    $body = portal_expense_notification_body($record);

    if ((string) getenv('IFEEL_PORTAL_TEST_MODE') === '1') {
        return count($batches) >= 1;
    }

    foreach ($recipients as $recipient) {
        foreach ($batches as $index => $batch) {
            $subject = count($batches) > 1
                ? $subjectBase . ' — מסמכים ' . ($index + 1) . '/' . count($batches)
                : $subjectBase;
            if (!portal_send_mail_with_attachments($recipient, $subject, $body, $batch)) {
                return false;
            }
        }
    }
    return true;
}
