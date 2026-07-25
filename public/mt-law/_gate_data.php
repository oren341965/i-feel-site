<?php
declare(strict_types=1);

const MTLAW_GATE_CONSENT_VERSION = 'mt-law-monthly-2026-07-v1';
const MTLAW_GATE_CONSENT_TEXT = 'אני רוצה לקבל מ-I Feel פעם בחודש רעיונות, פרויקטים, עדכונים והטבות לבית חכם בדואר האלקטרוני. ידוע לי שאפשר להסיר את עצמי בכל עת.';
const MTLAW_GATE_LOGO_PATH = '/mt-law/mt-law-logo.svg?v=1';

function mtlaw_gate_storage_root(): string
{
    $configured = '';
    if (defined('MTLAW_PRIVATE_STORAGE_PATH')) {
        $configured = trim((string) constant('MTLAW_PRIVATE_STORAGE_PATH'));
    }
    if ($configured === '') {
        $configured = trim((string) getenv('MTLAW_PRIVATE_STORAGE_PATH'));
    }

    $root = $configured !== ''
        ? rtrim($configured, DIRECTORY_SEPARATOR)
        : dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'private_mtlaw';

    if (!is_dir($root) && !mkdir($root, 0700, true) && !is_dir($root)) {
        throw new RuntimeException('לא ניתן ליצור את אזור הרישום המאובטח.');
    }
    @chmod($root, 0700);

    $deny = $root . DIRECTORY_SEPARATOR . '.htaccess';
    if (!is_file($deny)) {
        @file_put_contents($deny, "Require all denied\nDeny from all\n", LOCK_EX);
        @chmod($deny, 0600);
    }
    $index = $root . DIRECTORY_SEPARATOR . 'index.html';
    if (!is_file($index)) {
        @file_put_contents($index, '', LOCK_EX);
        @chmod($index, 0600);
    }

    return $root;
}

function mtlaw_gate_contacts_path(): string
{
    return mtlaw_gate_storage_root() . DIRECTORY_SEPARATOR . 'verified-contacts.json';
}

function mtlaw_gate_read_contacts(): array
{
    $path = mtlaw_gate_contacts_path();
    if (!is_file($path)) {
        return [];
    }
    $raw = file_get_contents($path);
    if (!is_string($raw) || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function mtlaw_gate_update_contacts(callable $mutator): array
{
    $path = mtlaw_gate_contacts_path();
    $handle = fopen($path, 'c+');
    if (!is_resource($handle)) {
        throw new RuntimeException('לא ניתן לפתוח את קובץ הרישום המאובטח.');
    }

    try {
        if (!flock($handle, LOCK_EX)) {
            throw new RuntimeException('לא ניתן לנעול את קובץ הרישום המאובטח.');
        }
        rewind($handle);
        $raw = stream_get_contents($handle);
        $decoded = is_string($raw) && trim($raw) !== '' ? json_decode($raw, true) : [];
        $contacts = is_array($decoded) ? $decoded : [];
        $contacts = $mutator($contacts);
        if (!is_array($contacts)) {
            throw new RuntimeException('עדכון הרישום החזיר מידע לא תקין.');
        }
        ksort($contacts, SORT_NATURAL | SORT_FLAG_CASE);
        $json = json_encode($contacts, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        if (!is_string($json)) {
            throw new RuntimeException('לא ניתן לקודד את קובץ הרישום.');
        }
        ftruncate($handle, 0);
        rewind($handle);
        if (fwrite($handle, $json) === false) {
            throw new RuntimeException('לא ניתן לשמור את קובץ הרישום.');
        }
        fflush($handle);
        @chmod($path, 0600);
        flock($handle, LOCK_UN);
        return $contacts;
    } finally {
        fclose($handle);
    }
}

function mtlaw_gate_record_verified_access(array $user): void
{
    $verifiedAt = (int) ($_SESSION['mtlaw_verified_at'] ?? 0);
    $alreadyRecorded = (int) ($_SESSION['mtlaw_gate_recorded_verified_at'] ?? 0);
    if ($verifiedAt <= 0 || $alreadyRecorded === $verifiedAt) {
        return;
    }

    $email = strtolower(trim((string) ($user['email'] ?? '')));
    $role = (string) ($user['role'] ?? 'member');
    $organization = $role === 'staff' ? 'i-feel' : 'mt-law';
    $requestedConsent = (bool) ($_SESSION['mtlaw_gate_marketing_opt_in'] ?? false);
    $now = new DateTimeImmutable('now', new DateTimeZone('Asia/Jerusalem'));
    $nowIso = $now->format(DATE_ATOM);

    try {
        mtlaw_gate_update_contacts(static function (array $contacts) use ($email, $organization, $requestedConsent, $verifiedAt, $nowIso): array {
            $existing = isset($contacts[$email]) && is_array($contacts[$email]) ? $contacts[$email] : [];
            $permission = (string) ($existing['mailing_permission'] ?? 'opt-in-required');
            $consentAt = (string) ($existing['marketing_consent_at'] ?? '');

            if ($requestedConsent && $organization === 'mt-law') {
                $permission = 'explicit-consent';
                if ($consentAt === '') {
                    $consentAt = $nowIso;
                }
            }

            $contacts[$email] = [
                'email' => $email,
                'organization' => $organization,
                'source' => 'mt-law-portal',
                'spam_law_status' => 'פנה מיוזמתו',
                'mailing_permission' => $permission,
                'first_verified_at' => (string) ($existing['first_verified_at'] ?? date(DATE_ATOM, $verifiedAt)),
                'last_verified_at' => $nowIso,
                'verified_count' => max(0, (int) ($existing['verified_count'] ?? 0)) + 1,
                'marketing_consent_at' => $consentAt,
                'marketing_consent_last_confirmed_at' => ($requestedConsent && $organization === 'mt-law') ? $nowIso : (string) ($existing['marketing_consent_last_confirmed_at'] ?? ''),
                'marketing_consent_version' => ($permission === 'explicit-consent') ? MTLAW_GATE_CONSENT_VERSION : '',
                'marketing_consent_text_hash' => ($permission === 'explicit-consent') ? hash('sha256', MTLAW_GATE_CONSENT_TEXT) : '',
                'consent_evidence' => ($permission === 'explicit-consent') ? 'verified-corporate-email+optional-checkbox-unchecked-by-default' : 'none',
            ];
            return $contacts;
        });
        $_SESSION['mtlaw_gate_recorded_verified_at'] = $verifiedAt;
        unset($_SESSION['mtlaw_gate_marketing_opt_in']);
    } catch (Throwable $error) {
        error_log('[i-feel mt-law gate record] ' . $error->getMessage());
    }
}

function mtlaw_gate_capture_lead_profile(array $user): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST' || mtlaw_post('action', 40) !== 'lead') {
        return;
    }

    try {
        mtlaw_verify_csrf();
    } catch (Throwable $error) {
        error_log('[i-feel mt-law gate profile] rejected invalid CSRF: ' . $error->getMessage());
        return;
    }

    $email = strtolower(trim((string) ($user['email'] ?? '')));
    $fullName = trim(mtlaw_post('name', 120));
    $phone = trim(mtlaw_post('phone', 80));
    if ($email === '' || ($fullName === '' && $phone === '')) {
        return;
    }

    $parts = preg_split('/\s+/u', $fullName, 2) ?: [];
    $firstName = trim((string) ($parts[0] ?? ''));
    $lastName = trim((string) ($parts[1] ?? ''));

    try {
        mtlaw_gate_update_contacts(static function (array $contacts) use ($email, $fullName, $firstName, $lastName, $phone): array {
            $existing = isset($contacts[$email]) && is_array($contacts[$email]) ? $contacts[$email] : [
                'email' => $email,
                'organization' => 'mt-law',
                'source' => 'mt-law-portal',
                'spam_law_status' => 'פנה מיוזמתו',
                'mailing_permission' => 'opt-in-required',
                'first_verified_at' => '',
                'last_verified_at' => '',
                'verified_count' => 0,
                'marketing_consent_at' => '',
                'marketing_consent_last_confirmed_at' => '',
                'marketing_consent_version' => '',
                'marketing_consent_text_hash' => '',
                'consent_evidence' => 'none',
            ];
            $existing['full_name'] = $fullName;
            $existing['first_name'] = $firstName;
            $existing['last_name'] = $lastName;
            $existing['phone'] = $phone;
            $existing['profile_updated_at'] = (new DateTimeImmutable('now', new DateTimeZone('Asia/Jerusalem')))->format(DATE_ATOM);
            $contacts[$email] = $existing;
            return $contacts;
        });
    } catch (Throwable $error) {
        error_log('[i-feel mt-law gate profile] ' . $error->getMessage());
    }
}

function mtlaw_gate_stats(): array
{
    try {
        $contacts = mtlaw_gate_read_contacts();
    } catch (Throwable $error) {
        error_log('[i-feel mt-law gate stats] ' . $error->getMessage());
        return ['verified' => 0, 'subscribers' => 0, 'month' => 0, 'accesses' => 0];
    }

    $monthStart = new DateTimeImmutable('first day of this month 00:00:00', new DateTimeZone('Asia/Jerusalem'));
    $stats = ['verified' => 0, 'subscribers' => 0, 'month' => 0, 'accesses' => 0];
    foreach ($contacts as $contact) {
        if (!is_array($contact) || ($contact['organization'] ?? '') !== 'mt-law') {
            continue;
        }
        $stats['verified']++;
        $stats['accesses'] += max(0, (int) ($contact['verified_count'] ?? 0));
        if (($contact['mailing_permission'] ?? '') !== 'explicit-consent') {
            continue;
        }
        $stats['subscribers']++;
        $consentAt = trim((string) ($contact['marketing_consent_at'] ?? ''));
        if ($consentAt !== '') {
            try {
                if (new DateTimeImmutable($consentAt) >= $monthStart) {
                    $stats['month']++;
                }
            } catch (Throwable $error) {
            }
        }
    }
    return $stats;
}

function mtlaw_gate_stream_mailing_csv(string $period): void
{
    $user = mtlaw_current_user();
    if ($user === null || ($user['role'] ?? '') !== 'staff') {
        http_response_code(403);
        header('Content-Type: text/plain; charset=UTF-8');
        echo 'הגישה לקובץ מותרת רק לעובדי I Feel שאומתו בדואר הארגוני.';
        exit;
    }

    $contacts = mtlaw_gate_read_contacts();
    $timezone = new DateTimeZone('Asia/Jerusalem');
    $monthStart = new DateTimeImmutable('first day of this month 00:00:00', $timezone);
    $filename = $period === 'all' ? 'mt-law-mailing-all.csv' : 'mt-law-mailing-' . $monthStart->format('Y-m') . '.csv';

    header('Content-Type: text/csv; charset=UTF-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-store, private, max-age=0');

    $output = fopen('php://output', 'wb');
    if (!is_resource($output)) {
        throw new RuntimeException('לא ניתן ליצור את קובץ ה-CSV.');
    }
    fwrite($output, "\xEF\xBB\xBF");
    fputcsv($output, ['email', 'first_name', 'last_name', 'phone', 'source', 'spam_law_status', 'mailing_permission', 'first_seen', 'notes']);

    foreach ($contacts as $contact) {
        if (!is_array($contact)
            || ($contact['organization'] ?? '') !== 'mt-law'
            || ($contact['mailing_permission'] ?? '') !== 'explicit-consent') {
            continue;
        }
        $consentAtRaw = trim((string) ($contact['marketing_consent_at'] ?? ''));
        try {
            $consentAt = $consentAtRaw !== '' ? new DateTimeImmutable($consentAtRaw) : null;
        } catch (Throwable $error) {
            $consentAt = null;
        }
        if ($period !== 'all' && ($consentAt === null || $consentAt < $monthStart)) {
            continue;
        }
        $firstSeen = $consentAt !== null ? $consentAt->setTimezone($timezone)->format('Y-m-d') : '';
        $notes = implode('; ', array_filter([
            'אומת באמצעות דואר ארגוני של MT-Law',
            $consentAtRaw !== '' ? 'הסכמה מפורשת: ' . $consentAtRaw : '',
            'גרסת הסכמה: ' . (string) ($contact['marketing_consent_version'] ?? ''),
            'כניסות מאומתות: ' . (int) ($contact['verified_count'] ?? 0),
        ]));
        fputcsv($output, [
            (string) ($contact['email'] ?? ''),
            (string) ($contact['first_name'] ?? ''),
            (string) ($contact['last_name'] ?? ''),
            (string) ($contact['phone'] ?? ''),
            'mt-law-portal',
            'פנה מיוזמתו',
            'explicit-consent',
            $firstSeen,
            $notes,
        ]);
    }
    fclose($output);
    exit;
}
