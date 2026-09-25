<?php
declare(strict_types=1);
require_once __DIR__ . '/_portal.php';

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, private, max-age=0');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    header('Allow: GET');
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

$user = cp_current_user();
if ($user === null) {
    http_response_code(401);
    echo json_encode(['authenticated' => false], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

echo json_encode([
    'authenticated' => true,
    'customer' => [
        'name' => (string) ($user['name'] ?? ''),
        'serviceAgreement' => !empty($user['service_agreement']),
        'serviceAgreementLabel' => (string) ($user['service_agreement_label'] ?? ''),
        'category' => (string) ($user['category'] ?? ''),
        'basicSystem' => (string) ($user['basic_system'] ?? ''),
    ],
    'serviceAgreementTerms' => cp_service_agreement_terms($user),
    'eligibleProducts' => cp_eligible_products($user),
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
