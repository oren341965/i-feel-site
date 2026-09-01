<?php
declare(strict_types=1);

const IFEEL_NEWSLETTER_CONSENT_VERSION = 'ifeel-insights-v1';
const IFEEL_NEWSLETTER_FALLBACK_PATH = '/newsletter/';

function newsletter_field(string $key, int $max = 300): string
{
    $value = $_POST[$key] ?? '';
    if (is_array($value)) {
        return '';
    }

    $value = trim((string) $value);
    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value) ?? '';
    $length = function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
    if ($length > $max) {
        $value = function_exists('mb_substr') ? mb_substr($value, 0, $max, 'UTF-8') : substr($value, 0, $max);
    }
    return $value;
}

function newsletter_redirect(string $status): void
{
    header('Location: ' . IFEEL_NEWSLETTER_FALLBACK_PATH . '?' . http_build_query(['newsletter' => $status]), true, 303);
    exit;
}

function newsletter_secret(string $name): string
{
    $environment = getenv($name);
    if (is_string($environment) && trim($environment) !== '') {
        return trim($environment);
    }
    if (defined($name)) {
        $constant = constant($name);
        return is_string($constant) ? trim($constant) : (string) $constant;
    }
    return '';
}

function newsletter_source_evidence(string $value, int $max = 160): string
{
    $value = trim($value);
    if ($value === '') {
        return '';
    }
    $parts = preg_split('/[?#]/', $value, 2);
    $value = is_array($parts) ? (string) ($parts[0] ?? '') : '';
    $value = preg_replace('/[|\r\n]+/', '-', $value) ?? '';
    return substr($value, 0, $max);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    echo 'Method not allowed';
    exit;
}

if (is_file(__DIR__ . '/config.php')) {
    require __DIR__ . '/config.php';
}

if (newsletter_field('website', 120) !== '') {
    newsletter_redirect('sent');
}

$email = strtolower(newsletter_field('email', 160));
$firstName = newsletter_field('first_name', 100);
$role = newsletter_field('professional_role', 100);
$sourcePage = newsletter_field('source_page', 240);
$firstReferrer = newsletter_field('first_referrer', 500);
$lastReferrer = newsletter_field('last_referrer', 500);
$entryPage = newsletter_field('entry_page', 500);
$lastPage = newsletter_field('last_page', 500);
$utmSource = newsletter_field('utm_source', 200);
$utmMedium = newsletter_field('utm_medium', 200);
$utmCampaign = newsletter_field('utm_campaign', 200);
$consentVersion = newsletter_field('consent_version', 80);
$explicitConsent = newsletter_field('marketing_consent', 10) === '1';

if (!filter_var($email, FILTER_VALIDATE_EMAIL)
    || $firstName === ''
    || !$explicitConsent
    || $consentVersion !== IFEEL_NEWSLETTER_CONSENT_VERSION) {
    newsletter_redirect('missing');
}

$apiKey = newsletter_secret('SMOOVE_API_KEY');
$listId = newsletter_secret('SMOOVE_NEWSLETTER_LIST_ID');
if ($apiKey === '' || !ctype_digit($listId) || (int) $listId <= 0) {
    error_log('[i-feel newsletter] Smoove configuration missing');
    newsletter_redirect('unavailable');
}

$consentAt = gmdate('c');
$campaignSourceParts = [
    'i-feel Insights',
    'explicit-consent',
    IFEEL_NEWSLETTER_CONSENT_VERSION,
    $consentAt,
];
if ($sourcePage !== '') {
    $campaignSourceParts[] = newsletter_source_evidence($sourcePage);
}
foreach ([$utmSource, $utmMedium, $utmCampaign, $firstReferrer, $lastReferrer, $entryPage, $lastPage] as $sourceEvidence) {
    $sourceEvidence = newsletter_source_evidence($sourceEvidence);
    if ($sourceEvidence !== '') {
        $campaignSourceParts[] = $sourceEvidence;
    }
}
$campaignSource = implode('|', $campaignSourceParts);
$campaignSource = function_exists('mb_substr')
    ? mb_substr($campaignSource, 0, 800, 'UTF-8')
    : substr($campaignSource, 0, 800);

$payload = [
    'email' => $email,
    'firstName' => $firstName,
    'position' => $role,
    'canReceiveEmails' => true,
    'lists_ToSubscribe' => [(int) $listId],
    'campaignSource' => $campaignSource,
];

$body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if (!is_string($body)) {
    newsletter_redirect('error');
}

$ch = curl_init('https://rest.smoove.io/v1/Contacts?updateIfExists=true&restoreIfDeleted=false&restoreIfUnsubscribed=false');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: ' . $apiKey,
        'Content-Type: application/json',
        'Accept: application/json',
    ],
    CURLOPT_POSTFIELDS => $body,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 12,
]);

$response = curl_exec($ch);
$curlError = curl_error($ch);
$status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($response === false || $curlError !== '' || $status < 200 || $status >= 300) {
    error_log('[i-feel newsletter] Smoove subscription failed with status ' . $status);
    newsletter_redirect('error');
}

newsletter_redirect('sent');
