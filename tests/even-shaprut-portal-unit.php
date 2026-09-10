<?php
declare(strict_types=1);

$_SERVER['HTTP_HOST'] = 'localhost';
$_SERVER['REQUEST_METHOD'] = 'GET';

ob_start();
require dirname(__DIR__) . '/public/even-shaprut/index.php';
$html = (string) ob_get_clean();

function esp_test(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
}

esp_test(strpos($html, 'קוד חד-פעמי לדואר הרשום ב-Monday') !== false, 'Unauthenticated gate did not render.');
esp_test(strpos($html, 'id="pricelist"') === false, 'Price list rendered before authentication.');
esp_test(esp_price_with_vat(1180) === '1,392.40', 'VAT-inclusive price calculation is incorrect.');
esp_test(esp_price_range_with_vat(1200, 3350) === '1,416.00 - 3,953.00', 'VAT-inclusive range calculation is incorrect.');

$emailColumn = [
    'id' => '_____3',
    'text' => 'Synthetic Resident',
    'value' => '{"email":"resident@example.com","text":"Synthetic Resident"}',
];
esp_test(esp_column_email($emailColumn) === 'resident@example.com', 'Monday email value was not normalized.');

$profile = esp_profile_from_item([
    'id' => '123456',
    'name' => 'דייר בדיקה',
    'column_values' => [
        ['id' => 'numbers21', 'text' => '12', 'value' => null],
        ['id' => 'text8', 'text' => '5', 'value' => null],
        $emailColumn,
        ['id' => 'location7', 'text' => 'כתובת בדיקה', 'value' => null],
    ],
], 'resident@example.com');
esp_test($profile['name'] === 'דייר בדיקה' && $profile['building'] === '5' && $profile['apartment'] === '12', 'Monday resident profile mapping is incorrect.');

fwrite(STDOUT, "Even Shaprut portal unit tests passed.\n");
