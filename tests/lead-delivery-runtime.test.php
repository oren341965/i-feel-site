<?php
declare(strict_types=1);
// Execute the production handler with ONLY external I/O replaced. Every child
// uses synthetic inputs, an isolated session path, no config, network or mail.
$source = file_get_contents(__DIR__ . '/../public/api/lead.php');
$helper = realpath(__DIR__ . '/../public/api/enhanced-conversion-data.php');
$source = str_replace("__DIR__ . '/enhanced-conversion-data.php'", var_export($helper, true), $source);
$redirect = <<<'CODE'
function redirect_back(string $status, ?string $proof = null): never {
    echo json_encode(['status' => $status, 'proof' => $proof !== null,
        'stored' => isset($_SESSION['ads_conversion_proof']),
        'calls' => $GLOBALS['test_calls'], 'emails' => $GLOBALS['test_emails'],
        'source' => $GLOBALS['test_source'] ?? null]);
    exit;
}

CODE;
$monday = <<<'CODE'
function monday_request(string $query, array $variables, string $token): array {
    $create = strpos($query, 'create_item') !== false;
    $GLOBALS['test_calls'][] = $create ? 'create' : 'update';
    $scenario = $GLOBALS['test_scenario'];
    if ($create) {
        if ($scenario === 'all-fail' || $scenario === 'mail-fail') throw new RuntimeException('synthetic create failure');
        if ($scenario === 'minimal' && count($GLOBALS['test_calls']) === 1) throw new RuntimeException('synthetic columns failure');
        return ['data' => ['create_item' => ['id' => 'synthetic-item']]];
    }
    if ($scenario === 'update-fail' || $scenario === 'update-mail-fail') throw new RuntimeException('synthetic annotation failure');
    return ['data' => ['create_update' => ['id' => 'synthetic-update']]];
}

CODE;
$mail = <<<'CODE'
function fallback_mail(array $lead, string $reason, array $marketing = []): bool {
    $GLOBALS['test_emails'][] = ['already_created' => !empty($lead['delivered_monday_item_id']),
        'wbraid' => $marketing['wbraid'] ?? null, 'gbraid' => $marketing['gbraid'] ?? null];
    $GLOBALS['test_source'] = $lead['automatic_source'];
    if ($GLOBALS['test_scenario'] === 'update-mail-fail') throw new RuntimeException('synthetic mail failure');
    return $GLOBALS['test_scenario'] !== 'mail-fail';
}

CODE;
$source = preg_replace('/function redirect_back\(.*?(?=function monday_request\()/s', $redirect, $source, 1, $count);
if ($count !== 1) throw new RuntimeException('Redirect interception failed');
$source = preg_replace('/function monday_request\(.*?(?=function attribution_source\()/s', $monday, $source, 1, $count);
if ($count !== 1) throw new RuntimeException('Network interception failed');
$source = preg_replace('/function fallback_mail\(.*?(?=function landing_label\()/s', $mail, $source, 1, $count);
if ($count !== 1 || strpos($source, 'curl_init(') !== false || strpos($source, 'return mail(') !== false) throw new RuntimeException('External I/O remains');
$setup = <<<'CODE'
$GLOBALS['test_calls'] = []; $GLOBALS['test_emails'] = [];
$GLOBALS['test_scenario'] = $argv[1];
session_save_path(__DIR__);
session_id('synthetic-' . bin2hex(random_bytes(12)));
putenv('MONDAY_API_TOKEN=synthetic-only');
$_SERVER['REQUEST_METHOD'] = 'POST';
$_POST = ['name' => 'Synthetic test', 'phone' => '0000000000', 'city' => 'Synthetic',
    'lead_type' => 'BMS', 'heard_from' => 'Google', 'wbraid' => 'synthetic-web', 'gbraid' => 'synthetic-app'];

CODE;
$source = str_replace('declare(strict_types=1);', 'declare(strict_types=1);' . "\n" . $setup, $source);
$directory = sys_get_temp_dir() . '/ifeel-delivery-' . bin2hex(random_bytes(12));
mkdir($directory, 0700);
$file = $directory . '/handler.php';
file_put_contents($file, $source);
$cases = [
    'success' => ['sent', true, ['create', 'update'], 0],
    'minimal' => ['sent', true, ['create', 'create', 'update'], 0],
    'update-fail' => ['sent', true, ['create', 'update'], 1],
    'update-mail-fail' => ['sent', true, ['create', 'update'], 1],
    'all-fail' => ['sent-mail', false, ['create', 'create'], 1],
    'mail-fail' => ['error', false, ['create', 'create'], 1],
];
try {
    foreach ($cases as $scenario => $expected) {
        $command = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($file) . ' ' . escapeshellarg($scenario);
        exec($command, $lines, $exitCode);
        $result = json_decode(implode("\n", $lines), true, 512, JSON_THROW_ON_ERROR);
        $lines = [];
        $actual = [$result['status'], $result['proof'], $result['calls'], count($result['emails'])];
        if ($exitCode !== 0 || $actual !== $expected || $result['stored'] !== $expected[1]) throw new RuntimeException($scenario . ' failed');
        if ($expected[3]) {
            if ($result['source'] !== 'Google Ads' || $result['emails'][0]['wbraid'] !== 'synthetic-web') throw new RuntimeException('Click attribution lost');
            if ($result['emails'][0]['already_created'] !== (strpos($scenario, 'update-') === 0)) throw new RuntimeException('Duplicate warning incorrect');
        }
        echo $scenario . ": passed\n";
    }
} finally {
    foreach (glob($directory . '/*') as $temporary) unlink($temporary);
    rmdir($directory);
}
