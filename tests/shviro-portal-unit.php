<?php
declare(strict_types=1);
$_SERVER['HTTP_HOST'] = 'localhost';
$_SERVER['REQUEST_METHOD'] = 'GET';
ob_start();
require dirname(__DIR__) . '/public/shviro-ganei-tikva/index.php';
$html = ob_get_clean();
function verify_shviro(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
verify_shviro(strpos($html, 'שלחו לי קוד כניסה') !== false && strpos($html, 'id="pricelist"') === false, 'Anonymous visitors only see login');
verify_shviro(SGT_MONDAY_GROUP_ID === 'group_mm4djwwb', 'Exact confirmed project group');
verify_shviro(SGT_BASE_PATH === '/shviro-ganei-tikva/' && SGT_ACCESS_COOKIE === 'ifeel_sgt_verified', 'Cookies isolated from Even Shaprut');
$resident = sgt_profile_from_item(['id'=>'123456','name'=>'דייר בדיקה','column_values'=>[
    ['id'=>'numbers21','text'=>'12'], ['id'=>'text8','text'=>'19'], ['id'=>'location7','text'=>'כתובת בדיקה']
]], 'resident@example.invalid');
verify_shviro(sgt_profile_allowed($resident) && $resident['name'] === 'דייר בדיקה' && $resident['apartment'] === '12', 'Monday name and apartment mapping');
foreach ([null, array_merge($resident,['project_id'=>'group_mm15570j']), array_merge($resident,['role'=>'service']), array_merge($resident,['monday_item_id'=>'invalid']), ['role'=>'staff','email'=>'attacker@example.invalid']] as $profile) {
    verify_shviro(!sgt_profile_allowed($profile), 'Cross-project and unrelated accounts denied');
}
verify_shviro(sgt_column_email(['text'=>'','value'=>'{"email":"RESIDENT@example.invalid"}']) === 'resident@example.invalid', 'Structured email normalization');
$quote = sgt_shop_quote(['touch-panel-9'=>1,'glass-2'=>2,'programming'=>3]);
verify_shviro($quote['netCents'] === 421800 && $quote['vatCents'] === 75924 && $quote['totalCents'] === 497724, 'Equipment, per-unit installation, hours and VAT');
verify_shviro($quote['lines'][2]['unitLabel'] === 'שעות', 'Programming uses hours');
verify_shviro(sgt_shop_quote(['soundbar'=>1])['requiresQuote'], 'Variable model cannot be sold as a fixed price');
verify_shviro(sgt_shop_quote(['floor-speaker-kit'=>1])['netCents'] === 610500, 'Audio equipment plus installation');
foreach ([['unknown'=>1],['glass-1'=>0],['glass-1'=>21],['glass-1'=>'2']] as $cart) {
    $rejected=false; try { sgt_shop_quote($cart); } catch (InvalidArgumentException $e) { $rejected=true; }
    verify_shviro($rejected, 'Invalid cart rejected');
}
$token=bin2hex(random_bytes(24));
verify_shviro(strpos(sgt_ticket_path('access',$token),'ifeel-sgt-access-') !== false, 'Ticket files isolated per project');
verify_shviro(sgt_ticket_path('access','../bad') === '', 'Invalid ticket path denied');
verify_shviro(!sgt_shop_local_preview(), 'No CLI preview bypass');
// Render the real authenticated branch using an isolated synthetic ticket, never a real resident.
$now=time();
sgt_write_ticket('access',$token,['profile'=>$resident,'last_activity'=>$now,'expires'=>$now+60]);
$_COOKIE[SGT_ACCESS_COOKIE]=$token;
ob_start(); require dirname(__DIR__) . '/public/shviro-ganei-tikva/index.php'; $privateHtml=ob_get_clean();
sgt_delete_ticket('access',$token);
verify_shviro(strpos($privateHtml,'id="pricelist"') !== false && strpos($privateHtml,'id="app-guide"') !== false, 'Verified ticket unlocks catalog and guide');
verify_shviro(strpos($privateHtml,'דייר בדיקה') !== false, 'Resident name rendered from verified profile');
fwrite(STDOUT, "Shviro portal unit tests passed.\n");
