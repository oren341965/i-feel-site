<?php
declare(strict_types=1);
require_once __DIR__ . '/_commerce.php';
header('Content-Type: application/json; charset=UTF-8');
$user = cp_current_user();
if ($user === null) { http_response_code(401); echo json_encode(['authenticated'=>false]); exit; }
echo json_encode(['authenticated'=>true] + cp_cart_summary($user), JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);