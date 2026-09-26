<?php
declare(strict_types=1);
require_once __DIR__ . '/_commerce.php';
header('Content-Type: application/json; charset=UTF-8');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['ok'=>false]); exit; }
$expected = cp_config_value('CUSTOMER_PORTAL_CATALOG_SYNC_TOKEN','CUSTOMER_PORTAL_CATALOG_SYNC_TOKEN');
$auth = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? '');
$provided = str_starts_with($auth,'Bearer ') ? substr($auth,7) : '';
if ($expected === '' || $provided === '' || !hash_equals($expected,$provided)) { http_response_code(401); echo json_encode(['ok'=>false]); exit; }
$raw = file_get_contents('php://input');
if ($raw === false || strlen($raw) > 5_000_000) { http_response_code(413); echo json_encode(['ok'=>false]); exit; }
$data = json_decode($raw,true);
$items = is_array($data['products'] ?? null) ? $data['products'] : null;
if ($items === null) { http_response_code(400); echo json_encode(['ok'=>false,'error'=>'products required']); exit; }
$clean=[];
foreach ($items as $item) {
    if (!is_array($item)) continue;
    $sku=trim((string)($item['sku'] ?? '')); $name=trim((string)($item['name'] ?? '')); $price=(float)($item['priceIlsVat'] ?? 0);
    if ($sku==='' || $name==='' || $price<=0) continue;
    $clean[]=[
        'sku'=>$sku,'name'=>$name,'category'=>trim((string)($item['category'] ?? 'מוצרים')),
        'brand'=>trim((string)($item['brand'] ?? '')),'description'=>trim((string)($item['description'] ?? '')),
        'priceIlsVat'=>round($price,2),'stock'=>max(0,(int)($item['stock'] ?? 0)),
        'online'=>!empty($item['online']),'imageUrl'=>trim((string)($item['imageUrl'] ?? ''))
    ];
}
$out=['schemaVersion'=>1,'source'=>'Hashavshevet signed sync','updatedAt'=>gmdate('c'),'products'=>$clean];
$json=json_encode($out,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT);
if ($json===false || file_put_contents(CP_CATALOG_PATH,$json."\n",LOCK_EX)===false) { http_response_code(500); echo json_encode(['ok'=>false]); exit; }
echo json_encode(['ok'=>true,'products'=>count($clean),'online'=>count(array_filter($clean,fn($p)=>$p['online']))],JSON_UNESCAPED_UNICODE);