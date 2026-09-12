<?php
declare(strict_types=1);
require __DIR__ . '/../public/api/enhanced-conversion-data.php';
function check(bool $condition, string $message): void {
    if (!$condition) { throw new RuntimeException($message); }
}
$email = ' First.Last@GMAIL.COM ';
check(enhanced_conversion_data(['email' => $email]) === [], 'No consent must produce no customer data');
check(enhanced_conversion_data(['email' => $email, 'measurement_consent' => ['1']]) === [], 'Invalid consent');
foreach (['', 'not-an-email', ['name@example.com'], str_repeat('a', 300) . '@example.com'] as $invalid) {
    check(enhanced_conversion_data(['email' => $invalid, 'measurement_consent' => '1']) === [], 'Invalid email');
}
$data = enhanced_conversion_data(['email' => $email, 'measurement_consent' => '1']);
check($data === ['sha256_email_address' => hash('sha256', 'firstlast@gmail.com')], 'Google normalization');
check(enhanced_conversion_data(['email' => 'First.Last@example.com', 'measurement_consent' => '1']) === ['sha256_email_address' => hash('sha256', 'first.last@example.com')], 'Preserve non-Gmail dots');
echo "Enhanced conversion hashing and consent: passed\n";
