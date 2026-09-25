<?php
declare(strict_types=1);

require_once __DIR__ . '/../public/customer-portal/_portal.php';

function assert_true(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
}

$profile = cp_profile_from_item([
    'id' => '12345',
    'name' => 'לקוח בדיקה',
    'column_values' => [
        ['id' => '_____3', 'text' => 'customer@example.com', 'value' => '{"email":"customer@example.com","text":"customer@example.com"}'],
        ['id' => 'phone', 'text' => '0501234567', 'value' => null],
        ['id' => 'location7', 'text' => 'פתח תקווה', 'value' => null],
        ['id' => 'color_mm5271fc', 'text' => 'כן', 'value' => null],
        ['id' => 'dropdown5', 'text' => 'פרטי', 'value' => null],
        ['id' => 'long_text9', 'text' => 'KNX', 'value' => null],
        ['id' => '______9', 'text' => '43640', 'value' => null],
    ],
], 'customer@example.com');

assert_true($profile['service_agreement'] === true, 'service agreement should be active');
assert_true($profile['accounting_key'] === '43640', 'accounting key should be read');
assert_true($profile['basic_system'] === 'KNX', 'basic system should be read');
assert_true(count(cp_eligible_products($profile)) >= 2, 'service customer should receive eligible items');

$profile['service_agreement'] = false;
assert_true(cp_eligible_products($profile) === [], 'customer without service agreement should not receive agreement-only items');

echo "customer portal unit tests passed\n";
