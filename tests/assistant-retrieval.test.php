<?php

require_once __DIR__ . '/../public/api/assistant.php';

function assistant_test_assert($condition, $message)
{
    if (!$condition) throw new RuntimeException($message);
}

$blindTerms = assistant_query_terms('לתריסים');
assistant_test_assert(in_array(assistant_normalize('תריסים'), $blindTerms, true), 'Hebrew ל prefix should be removed for תריסים');

$bmsTerms = assistant_query_terms('לבקרת מבנה');
assistant_test_assert(in_array('bms', $bmsTerms, true), 'Hebrew building-control phrase should add BMS');
assistant_test_assert(in_array('desigo', $bmsTerms, true), 'Hebrew building-control phrase should add Desigo');

$knxTerms = assistant_query_terms('קיי-אן-אקס');
assistant_test_assert(in_array('knx', $knxTerms, true), 'Hebrew transliteration should add KNX');

$fixture = [
    [
        'url' => '/equipment/knx-switch/',
        'title' => 'מפסק KNX לתאורה ולתריסים',
        'description' => 'מק״ט 5WG1532-1DB51',
        'headings' => 'מפרט טכני',
        'body' => 'מפסק KNX. מק״ט 5WG1532-1DB51. הבקר משמש לשליטה בתאורה ובתריסים.',
    ],
    [
        'url' => 'https://example.invalid/remote',
        'title' => 'מפסק חיצוני',
        'description' => '',
        'headings' => '',
        'body' => 'תוצאה חיצונית לא אמורה להיחשף כמקור.',
    ],
];
$temporaryIndex = tempnam(sys_get_temp_dir(), 'ifeel-assistant-test-');
if ($temporaryIndex === false) throw new RuntimeException('Unable to create temporary search index');
file_put_contents($temporaryIndex, json_encode($fixture, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
try {
    $sources = assistant_find_sources('5WG1532-1DB51', $temporaryIndex);
    assistant_test_assert(count($sources) === 1, 'SKU retrieval should return the matching internal result only');
    assistant_test_assert($sources[0]['url'] === '/equipment/knx-switch/', 'SKU source should remain an internal path');
    assistant_test_assert(strpos($sources[0]['excerpt'], '5WG1532-1DB51') !== false, 'SKU result excerpt should contain the product code');
} finally {
    unlink($temporaryIndex);
}

echo "Assistant retrieval tests passed.\n";
