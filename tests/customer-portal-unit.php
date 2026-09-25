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
$eligible = cp_eligible_products($profile);
assert_true(count($eligible) >= 3, 'service customer should receive agreement benefits');
assert_true(($eligible[1]['price'] ?? null) === 250, 'technician visit should be 250 ILS per hour');
assert_true(($eligible[2]['discountPercent'] ?? null) === 50, 'product discount should be 50 percent');
$terms = cp_service_agreement_terms($profile);
assert_true(($terms['monthlyPrice'] ?? null) === 50, 'monthly agreement price should be 50 ILS');
assert_true(($terms['commitmentMonths'] ?? null) === 36, 'agreement commitment should be 36 months');

$profile['service_agreement'] = false;
assert_true(cp_eligible_products($profile) === [], 'customer without service agreement should not receive agreement-only items');

echo "customer portal unit tests passed\n";
