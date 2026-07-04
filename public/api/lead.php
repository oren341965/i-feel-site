<?php
declare(strict_types=1);

const DEFAULT_BOARD_ID = '2732725332';
const DEFAULT_FALLBACK_EMAIL = 'sales@i-feel.co.il';

function field(string $key, int $max = 4000): string
{
    $value = $_POST[$key] ?? '';
    if (is_array($value)) {
        $value = implode(', ', $value);
    }

    $value = trim((string) $value);
    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value) ?? '';

    $length = function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
    if ($length > $max) {
        $value = function_exists('mb_substr') ? mb_substr($value, 0, $max, 'UTF-8') : substr($value, 0, $max);
    }

    return $value;
}

function redirect_back(string $status): never
{
    // Landing pages pass redirect_to so the visitor stays on the page that converted.
    // Only local, slash-delimited paths are accepted; anything else falls back to /contactus/.
    $target = '/contactus/';
    $to = $_POST['redirect_to'] ?? '';
    if (is_string($to)
        && preg_match('#^/[A-Za-z0-9\-_/]*/$#', $to)
        && strpos($to, '//') === false) {
        $target = $to;
    }

    $location = $target . '?' . http_build_query(['lead' => $status]);
    header('Location: ' . $location, true, 303);
    exit;
}

function monday_request(string $query, array $variables, string $token): array
{
    $payload = json_encode([
        'query' => $query,
        'variables' => $variables,
    ], JSON_UNESCAPED_UNICODE);

    $ch = curl_init('https://api.monday.com/v2');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: ' . $token,
            'Content-Type: application/json',
            'API-Version: 2025-01',
        ],
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 12,
    ]);

    $body = curl_exec($ch);
    $error = curl_error($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($body === false || $error !== '') {
        throw new RuntimeException('Monday request failed: ' . $error);
    }

    $decoded = json_decode($body, true);
    if ($status >= 400 || !is_array($decoded) || isset($decoded['errors'])) {
        throw new RuntimeException('Monday API error: HTTP ' . $status . ' ' . $body);
    }

    return $decoded;
}

function fallback_mail(array $lead, string $reason, array $marketing = []): bool
{
    $to = getenv('LEAD_FALLBACK_EMAIL') ?: DEFAULT_FALLBACK_EMAIL;
    $subject = 'Lead from i-feel website - ' . ($lead['name'] ?: 'unknown');
    $body = implode("\n", [
        'A lead could not be sent to Monday, so it was routed by email.',
        'Reason: ' . $reason,
        '',
        'Name: ' . $lead['name'],
        'Phone: ' . $lead['phone'],
        'Email: ' . $lead['email'],
        'Lead type: ' . $lead['lead_type'],
        'Subject: ' . $lead['subject'],
        'Message:',
        $lead['message'],
        '',
        'Source page: ' . $lead['source_page'],
        'Submitted at: ' . gmdate('c'),
        'IP: ' . ($_SERVER['REMOTE_ADDR'] ?? ''),
    ]);

    foreach ($marketing as $key => $value) {
        if ($value !== '') {
            $body .= "\n" . $key . ': ' . $value;
        }
    }

    $headers = [
        'From: i-feel Website <no-reply@i-feel.co.il>',
        'Content-Type: text/plain; charset=UTF-8',
    ];

    if ($lead['email'] !== '' && filter_var($lead['email'], FILTER_VALIDATE_EMAIL)) {
        $headers[] = 'Reply-To: ' . $lead['email'];
    }

    return mail($to, $subject, $body, implode("\r\n", $headers));
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    echo 'Method not allowed';
    exit;
}

if (field('website', 200) !== '') {
    redirect_back('sent');
}

$lead = [
    'name' => field('name', 120),
    'phone' => field('phone', 80),
    'email' => field('email', 160),
    'lead_type' => field('lead_type', 120),
    'subject' => field('subject', 180),
    'message' => field('message', 4000),
    'source_page' => field('source_page', 300),
];

$marketing = [
    'utm_source' => field('utm_source', 200),
    'utm_medium' => field('utm_medium', 200),
    'utm_campaign' => field('utm_campaign', 200),
    'utm_term' => field('utm_term', 200),
    'utm_content' => field('utm_content', 200),
    'gclid' => field('gclid', 200),
];

if ($lead['name'] === '' || $lead['phone'] === '' || $lead['lead_type'] === '') {
    redirect_back('missing');
}

if ($lead['email'] !== '' && !filter_var($lead['email'], FILTER_VALIDATE_EMAIL)) {
    redirect_back('bad-email');
}

$token = getenv('MONDAY_API_TOKEN') ?: '';
$boardId = getenv('MONDAY_BOARD_ID') ?: DEFAULT_BOARD_ID;
$groupId = getenv('MONDAY_GROUP_ID') ?: null;
$itemName = trim('Lead מהאתר - ' . $lead['name'] . ' - ' . $lead['lead_type']);

$updateBody = implode("\n", [
    '**Lead from i-feel website**',
    '',
    '* Name: ' . $lead['name'],
    '* Phone: ' . $lead['phone'],
    '* Email: ' . ($lead['email'] ?: '-'),
    '* Lead type: ' . $lead['lead_type'],
    '* Subject: ' . ($lead['subject'] ?: '-'),
    '* Source page: ' . ($lead['source_page'] ?: '/contactus/'),
    '* Submitted at: ' . gmdate('c'),
    '',
    '**Message**',
    $lead['message'] ?: '-',
]);

$marketingLines = [];
foreach ($marketing as $key => $value) {
    if ($value !== '') {
        $marketingLines[] = '* ' . $key . ': ' . $value;
    }
}
if ($marketingLines !== []) {
    $updateBody .= "\n\n**Marketing (UTM / Google Ads)**\n" . implode("\n", $marketingLines);
}

try {
    if ($token === '') {
        throw new RuntimeException('MONDAY_API_TOKEN is not configured');
    }

    $createItem = monday_request(
        'mutation ($boardId: ID!, $groupId: String, $itemName: String!) { create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName) { id } }',
        [
            'boardId' => $boardId,
            'groupId' => $groupId,
            'itemName' => $itemName,
        ],
        $token
    );

    $itemId = $createItem['data']['create_item']['id'] ?? null;
    if (!$itemId) {
        throw new RuntimeException('Monday item was not created');
    }

    monday_request(
        'mutation ($itemId: ID!, $body: String!) { create_update(item_id: $itemId, body: $body) { id } }',
        [
            'itemId' => $itemId,
            'body' => $updateBody,
        ],
        $token
    );

    redirect_back('sent');
} catch (Throwable $error) {
    error_log('[i-feel lead form] ' . $error->getMessage());

    if (fallback_mail($lead, $error->getMessage(), $marketing)) {
        redirect_back('sent-mail');
    }

    redirect_back('error');
}
