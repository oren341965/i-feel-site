<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/_bootstrap.php';
$project = esp_project_by_slug('hamashi-19-ganei-tikva');
$user = esp_current_user();
if ($project === null || $user === null || !esp_user_has_project($user, $project['id'])) {
    header('Location: /developer-projects/', true, 302);
    exit;
}
header('Location: /shviro-ganei-tikva/', true, 302);
exit;
