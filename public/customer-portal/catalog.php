<?php
declare(strict_types=1);
require_once __DIR__ . '/_commerce.php';
header('Content-Type: application/json; charset=UTF-8');
$user = cp_current_user();
if ($user === null) { http_response_code(401); echo json_encode(['authenticated'=>false]); exit; }
$products = array_map(fn($p) => cp_customer_product($p, $user), array_values(cp_catalog_all()));
echo json_encode(['authenticated'=>true,'products'=>$products,'currency'=>'ILS','pricesIncludeVat'=>true], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);