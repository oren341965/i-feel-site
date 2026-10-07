<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/_bootstrap.php';
$project = esp_project_by_slug('even-shaprut');
$user = esp_current_user();
if ($project === null || $user === null || !esp_user_has_project($user, $project['id'])) {
    header('Location: /developer-projects/', true, 302);
    exit;
}
// Both portals store verified access tickets in the same private server directory.
// Grant the project-scoped cookie only after validating this project's membership.
$ticket = esp_ticket_from_cookie('access', ESP_ACCESS_COOKIE);
if ($ticket === null || !setcookie('ifeel_esp_verified', $ticket['id'], [
    'expires' => (int)$ticket['state']['expires'],
    'path' => '/even-shaprut/',
    'secure' => esp_is_https(),
    'httponly' => true,
    'samesite' => 'Strict',
])) {
    http_response_code(503);
    exit('לא ניתן להשלים את הכניסה כרגע. יש לרענן ולנסות שוב.');
}
header('Location: /even-shaprut/', true, 302);
exit;
