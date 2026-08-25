<?php
declare(strict_types=1);

/**
 * שליחת פנייה מדף דיירי שכונת הפרדס אל לוח המכירות ב-Monday,
 * עם נפילה חזרה למייל אם ה-API לא זמין.
 */

const NSH_INTEREST_LABELS = [
    'shutters' => 'תריסים נוספים',
    'audio' => 'אודיו',
    'security' => 'אזעקה ומצלמות',
    'network' => 'רשת תקשורת',
    'shabbat' => 'מצב שבת וחגים',
    'plans' => 'שינויים בתכניות הדירה',
    'full' => 'חבילת שדרוג מלאה',
    'other' => 'אחר',
];

function nsh_post_array(string $key, int $maxItems = 12, int $maxLength = 40): array
{
    $values = $_POST[$key] ?? [];
    if (!is_array($values)) {
        return [];
    }
    $result = [];
    foreach (array_slice($values, 0, $maxItems) as $value) {
        if (!is_scalar($value)) {
            continue;
        }
        $item = preg_replace('/[^A-Za-z0-9_\-]/', '', trim((string) $value)) ?? '';
        if ($item !== '') {
            $result[] = substr($item, 0, $maxLength);
        }
    }
    return array_values(array_unique($result));
}

function nsh_monday_request(string $query, array $variables, string $token): array
{
    $payload = json_encode(['query' => $query, 'variables' => $variables], JSON_UNESCAPED_UNICODE);
    if ($payload === false) {
        throw new RuntimeException('Could not encode Monday request');
    }
    $ch = curl_init('https://api.monday.com/v2');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Authorization: ' . $token, 'Content-Type: application/json', 'API-Version: 2025-01'],
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

function nsh_fallback_mail(array $lead, string $reason): bool
{
    $to = getenv('LEAD_FALLBACK_EMAIL') ?: NSH_FALLBACK_EMAIL;
    $subjectText = 'פנייה מאזור דיירי שכונת הפרדס, ' . ($lead['name'] !== '' ? $lead['name'] : 'ללא שם');
    $subject = '=?UTF-8?B?' . base64_encode($subjectText) . '?=';
    $body = implode("\n", [
        'פנייה מאזור הדיירים המאובטח, שכונת הפרדס רעננה, נווה שוסטר',
        'סיבת ניתוב למייל: ' . $reason,
        '',
        'שם: ' . $lead['name'],
        'טלפון: ' . $lead['phone'],
        'מייל מאומת: ' . $lead['email'],
        'בניין: ' . $lead['building'],
        'דירה: ' . $lead['apartment'],
        'טיפוס דירה: ' . ($lead['apartment_type'] !== '' ? $lead['apartment_type'] : 'לא צוין'),
        '',
        $lead['message'],
        '',
        'נשלח: ' . gmdate('c'),
        'IP: ' . ($_SERVER['REMOTE_ADDR'] ?? ''),
    ]);
    $headers = [
        'From: I Feel Website <no-reply@i-feel.co.il>',
        'Reply-To: ' . $lead['email'],
        'Content-Type: text/plain; charset=UTF-8',
    ];
    return @mail($to, $subject, $body, implode("\r\n", $headers));
}

function nsh_submit_lead(array $user): string
{
    $name = (string) (($user['name'] ?? '') !== '' ? $user['name'] : nsh_post('name', 120));
    $phone = (string) (($user['phone'] ?? '') !== '' ? $user['phone'] : nsh_post('phone', 40));
    $building = (string) (($user['building'] ?? '') !== '' ? $user['building'] : nsh_post('building', 20));
    $apartment = (string) (($user['apartment'] ?? '') !== '' ? $user['apartment'] : nsh_post('apartment', 20));
    $apartmentType = (string) (($user['apartment_type'] ?? '') !== '' ? $user['apartment_type'] : nsh_post('apartment_type', 80));
    $interests = nsh_post_array('interests');
    $notes = nsh_post('notes', 1500);
    $consent = nsh_post('consent', 10);

    if ($name === '' || $phone === '' || $consent !== 'yes') {
        throw new InvalidArgumentException('יש למלא שם, טלפון ואישור להעברת הפנייה.');
    }
    $phoneDigits = preg_replace('/\D+/', '', $phone) ?? '';
    if (strlen($phoneDigits) < 9) {
        throw new InvalidArgumentException('מספר הטלפון אינו תקין.');
    }
    $interests = array_values(array_intersect($interests, array_keys(NSH_INTEREST_LABELS)));
    if ($interests === []) {
        throw new InvalidArgumentException('יש לבחור לפחות נושא אחד שמעניין אתכם.');
    }
    $building = nsh_normalize_building($building);
    if ($building === '') {
        throw new InvalidArgumentException('יש לבחור בניין לפני הזנת מספר הדירה.');
    }
    $apartment = preg_replace('/[^0-9]/', '', $apartment) ?? '';
    if ($apartment === '') {
        throw new InvalidArgumentException('יש להזין מספר דירה.');
    }
    $apartmentType = nsh_substr(trim($apartmentType), 0, 80);

    $interestLabels = array_map(static function (string $key): string {
        return NSH_INTEREST_LABELS[$key];
    }, $interests);

    $messageLines = [
        'פרויקט: שכונת הפרדס, רעננה, יזם נווה שוסטר, קבוצת דניה סיבוס',
        'בניין: ' . $building,
        'דירה: ' . $apartment,
        'טיפוס דירה: ' . ($apartmentType !== '' ? $apartmentType : 'לא צוין'),
        'מעוניין ב: ' . implode(', ', $interestLabels),
        'הערות: ' . ($notes !== '' ? $notes : '-'),
    ];

    $lead = [
        'name' => $name,
        'phone' => $phone,
        'email' => $user['email'],
        'building' => $building,
        'apartment' => $apartment,
        'apartment_type' => $apartmentType,
        'message' => implode("\n", $messageLines),
    ];

    $itemName = trim('נווה שוסטר, ' . $name . ', בניין ' . $building . ', דירה ' . $apartment);
    $updateBody = implode("\n", [
        '**פנייה מאזור הדיירים המאובטח, שכונת הפרדס רעננה**',
        '',
        '* שם: ' . $name,
        '* טלפון: ' . $phone,
        '* מייל מאומת: ' . $user['email'],
        '* סוג משתמש: ' . ($user['role'] === 'staff' ? 'עובד I Feel' : 'דייר'),
        '* מקור: /neve-shuster/',
        '* נשלח: ' . gmdate('c'),
        '',
        '**פרטי הבקשה**',
        $lead['message'],
    ]);

    $token = getenv('MONDAY_API_TOKEN') ?: '';
    $boardId = getenv('MONDAY_BOARD_ID') ?: NSH_DEFAULT_BOARD_ID;
    $groupId = getenv('MONDAY_GROUP_ID') ?: null;

    try {
        if ($token === '') {
            throw new RuntimeException('MONDAY_API_TOKEN is not configured');
        }
        $requiredColumns = [
            'phone' => ['phone' => $phoneDigits, 'countryShortName' => 'IL'],
            '_____3' => ['email' => $user['email'], 'text' => $user['email']],
        ];
        $extraColumns = [
            'text8' => $lead['building'] !== '' ? 'נווה שוסטר, בניין ' . $lead['building'] : 'נווה שוסטר',
            'location7' => 'יצחק שמיר 24, רעננה',
            'color_mm3sddjy' => ['label' => 'ליד חדש'],
            'short_textzqle0408' => 'neve-shuster-portal',
            'short_text99tuldfa' => 'resident-area',
            'short_text2l9c35ow' => 'neve-shuster-2026',
        ];
        if ($apartment !== '') {
            $extraColumns['numbers21'] = $apartment;
        }
        $mutation = 'mutation ($boardId: ID!, $groupId: String, $itemName: String!, $columnValues: JSON) { create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) { id } }';
        $variables = [
            'boardId' => $boardId,
            'groupId' => $groupId,
            'itemName' => $itemName,
            'columnValues' => json_encode(array_merge($requiredColumns, $extraColumns), JSON_UNESCAPED_UNICODE),
        ];
        try {
            $created = nsh_monday_request($mutation, $variables, $token);
        } catch (Throwable $columnError) {
            error_log('[i-feel neve-shuster] full Monday create failed, retrying required columns: ' . $columnError->getMessage());
            $variables['columnValues'] = json_encode($requiredColumns, JSON_UNESCAPED_UNICODE);
            $created = nsh_monday_request($mutation, $variables, $token);
        }
        $itemId = $created['data']['create_item']['id'] ?? null;
        if (!$itemId) {
            throw new RuntimeException('Monday item was not created');
        }
        nsh_monday_request(
            'mutation ($itemId: ID!, $body: String!) { create_update(item_id: $itemId, body: $body) { id } }',
            ['itemId' => $itemId, 'body' => $updateBody],
            $token
        );
        return 'sent';
    } catch (Throwable $error) {
        error_log('[i-feel neve-shuster lead] ' . $error->getMessage());
        return nsh_fallback_mail($lead, $error->getMessage()) ? 'sent-mail' : 'error';
    }
}
