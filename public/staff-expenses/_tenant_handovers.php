<?php
declare(strict_types=1);

const IFEEL_HANDOVER_BOARD_ID = '18399467324';
const IFEEL_HANDOVER_SALES_BOARD_ID = '2732725332';
const IFEEL_HANDOVER_API_VERSION = '2026-07';

function portal_handover_config(string $constant, string $environment, string $fallback = ''): string
{
    $value = defined($constant) ? trim((string) constant($constant)) : '';
    if ($value === '') {
        $value = trim((string) getenv($environment));
    }
    return $value !== '' ? $value : $fallback;
}

function portal_handover_board_id(): string
{
    $boardId = portal_handover_config(
        'TENANT_HANDOVER_MONDAY_BOARD_ID',
        'TENANT_HANDOVER_MONDAY_BOARD_ID',
        IFEEL_HANDOVER_BOARD_ID
    );
    if (!preg_match('/^\d{1,20}$/', $boardId)) {
        throw new RuntimeException('מזהה לוח המסירות אינו תקין.');
    }
    return $boardId;
}

function portal_handover_sales_board_id(): string
{
    $boardId = portal_handover_config(
        'TENANT_HANDOVER_MONDAY_SALES_BOARD_ID',
        'TENANT_HANDOVER_MONDAY_SALES_BOARD_ID',
        IFEEL_HANDOVER_SALES_BOARD_ID
    );
    if (!preg_match('/^\d{1,20}$/', $boardId)) {
        throw new RuntimeException('מזהה לוח המכירות המקושר אינו תקין.');
    }
    return $boardId;
}

function portal_handover_monday_token(): string
{
    $token = portal_handover_config('TENANT_HANDOVER_MONDAY_TOKEN', 'TENANT_HANDOVER_MONDAY_TOKEN');
    if ($token === '') {
        $token = portal_handover_config('MONDAY_API_TOKEN', 'MONDAY_API_TOKEN');
    }
    return $token;
}

function portal_handover_api_version(): string
{
    $version = portal_handover_config(
        'TENANT_HANDOVER_MONDAY_API_VERSION',
        'TENANT_HANDOVER_MONDAY_API_VERSION',
        IFEEL_HANDOVER_API_VERSION
    );
    return preg_match('/^20\d{2}-(?:01|04|07|10)$/', $version) ? $version : IFEEL_HANDOVER_API_VERSION;
}

function portal_handover_project_display_title(string $title): string
{
    $title = trim((string) (preg_replace('/\s+/u', ' ', $title) ?? $title));
    $withoutImportSuffix = preg_replace('/(?:\s+(?:מאנדיי|מאנדי|monday))?\s*\.xls[xm]?$/iu', '', $title);
    if (is_string($withoutImportSuffix) && trim($withoutImportSuffix) !== '') {
        $title = trim($withoutImportSuffix);
    }
    return portal_substr($title, 0, 255);
}

function portal_handover_project_is_import_title(string $title): bool
{
    return preg_match('/\.xls[xm]?$/iu', trim($title)) === 1;
}

function portal_handover_project_is_excluded_title(string $title): bool
{
    $title = trim((string) (preg_replace('/\s+/u', ' ', $title) ?? $title));
    return preg_match(
        '/^(?:דיירים\s*-\s*(?:בהתקנה|התקנות\s+שהסתיימו)|facebook|פייסבוק|פניות\s+(?:מ)?אתר(?:\s+החברה)?|שם\s+הלקוח|תהליך\s+(?:ה)?מכירה\s+הסתיים|לידים?|leads?|לקוחות\s+פרטיים)$/iu',
        $title
    ) === 1;
}

function portal_handover_project_title_key(string $title): string
{
    $title = portal_handover_project_display_title($title);
    $title = str_replace(['‐', '‑', '‒', '–', '—', '−'], '-', $title);
    $title = (string) (preg_replace('/\s*-\s*/u', '-', $title) ?? $title);
    return function_exists('mb_strtolower') ? mb_strtolower($title, 'UTF-8') : strtolower($title);
}

function portal_handover_merge_project_groups(array $groups): array
{
    $buckets = [];
    foreach ($groups as $group) {
        if (!is_array($group) || ($group['archived'] ?? false) || ($group['deleted'] ?? false)) {
            continue;
        }
        $id = trim((string) ($group['id'] ?? ''));
        $rawTitle = trim((string) ($group['title'] ?? ''));
        $title = portal_handover_project_display_title($rawTitle);
        $titleKey = portal_handover_project_title_key($title);
        if (
            $id === ''
            || $title === ''
            || $titleKey === ''
            || !preg_match('/^[A-Za-z0-9_-]{1,128}$/', $id)
            || in_array($id, ['topics', 'group_title'], true)
            || portal_handover_project_is_excluded_title($rawTitle)
        ) {
            continue;
        }
        $buckets[$titleKey][] = [
            'id' => $id,
            'title' => $title,
            'is_import' => portal_handover_project_is_import_title($rawTitle),
        ];
    }

    $projects = [];
    foreach ($buckets as $candidates) {
        $canonical = null;
        foreach ($candidates as $candidate) {
            if (!$candidate['is_import']) {
                $canonical = $candidate;
                break;
            }
        }
        if ($canonical === null) {
            continue;
        }
        $projectId = (string) $canonical['id'];
        $canonicalGroupIds = array_values(array_unique(array_map(
            static fn(array $candidate): string => (string) $candidate['id'],
            array_filter($candidates, static fn(array $candidate): bool => !$candidate['is_import'])
        )));
        $projects[$projectId] = [
            'id' => $projectId,
            'title' => (string) $canonical['title'],
            'group_ids' => $canonicalGroupIds,
        ];
        foreach ($candidates as $candidate) {
            if (!$candidate['is_import'] && strlen((string) $candidate['title']) < strlen((string) $projects[$projectId]['title'])) {
                $projects[$projectId]['title'] = (string) $candidate['title'];
            }
        }
    }
    uasort($projects, static fn(array $a, array $b): int => strnatcasecmp($a['title'], $b['title']));
    return $projects;
}

function portal_handover_test_monday_response(string $query, array $variables): array
{
    if (str_contains($query, 'HandoverProjects')) {
        return ['data' => ['boards' => [[
            'id' => IFEEL_HANDOVER_BOARD_ID,
            'groups' => [
                ['id' => 'test-project', 'title' => 'פרויקט בדיקה', 'archived' => false, 'deleted' => false],
                ['id' => 'duplicate-project', 'title' => '  פרויקט   בדיקה  ', 'archived' => false, 'deleted' => false],
                ['id' => 'import-project', 'title' => 'פרויקט בדיקה מאנדי.xlsx', 'archived' => false, 'deleted' => false],
                ['id' => 'search-project', 'title' => 'Search Project', 'archived' => false, 'deleted' => false],
                ['id' => 'facebook-group', 'title' => 'Facebook', 'archived' => false, 'deleted' => false],
                ['id' => 'website-leads', 'title' => 'פניות מאתר החברה', 'archived' => false, 'deleted' => false],
                ['id' => 'import-only', 'title' => 'קובץ ישן.xls', 'archived' => false, 'deleted' => false],
                ['id' => 'topics', 'title' => 'דיירים - בהתקנה', 'archived' => false, 'deleted' => false],
                ['id' => 'group_title', 'title' => 'דיירים - התקנות שהסתיימו', 'archived' => false, 'deleted' => false],
                ['id' => 'archived-project', 'title' => 'פרויקט בארכיון', 'archived' => true, 'deleted' => false],
            ],
        ]]]];
    }
    if (str_contains($query, 'HandoverResidentsNext')) {
        return ['data' => ['next_items_page' => ['cursor' => null, 'items' => []]]];
    }
    if (str_contains($query, 'HandoverSearch')) {
        return ['data' => ['boards' => [[
            'items_page' => [
                'cursor' => null,
                'items' => [[
                    'id' => '1003',
                    'name' => 'Search Resident',
                    'group' => ['id' => 'search-project', 'title' => 'Search Project'],
                    'column_values' => [
                        ['id' => 'lookup_mm0m2n3j', 'text' => ''],
                        ['id' => 'text_mm0w7c0j', 'text' => '2'],
                        ['id' => 'phone2', 'text' => '050-123-4567'],
                        ['id' => 'email', 'text' => 'resident@example.com'],
                    ],
                    'linked_items' => [[
                        'id' => '9003',
                        'column_values' => [
                            ['id' => 'numbers21', 'text' => '21'],
                            ['id' => 'text8', 'text' => ''],
                            ['id' => 'phone', 'text' => ''],
                            ['id' => '_____3', 'text' => ''],
                            ['id' => 'location7', 'text' => 'Test address'],
                        ],
                    ]],
                ]],
            ],
        ]]]];
    }
    $groupIds = is_array($variables['groupIds'] ?? null) ? $variables['groupIds'] : [];
    $groups = [];
    foreach ($groupIds as $groupId) {
        $groupId = (string) $groupId;
        $itemId = $groupId === 'duplicate-project' ? '1002' : ($groupId === 'search-project' ? '1003' : '1001');
        $apartment = $groupId === 'duplicate-project' ? '13' : ($groupId === 'search-project' ? '21' : '12');
        $residentName = $groupId === 'duplicate-project' ? 'דייר בדיקה נוסף' : ($groupId === 'search-project' ? 'Search Resident' : 'דייר בדיקה');
        $groups[] = [
            'id' => $groupId,
            'title' => 'פרויקט בדיקה',
            'items_page' => [
                'cursor' => null,
                'items' => [[
                    'id' => $itemId,
                    'name' => $residentName,
                    'column_values' => [
                        ['id' => 'lookup_mm0m2n3j', 'text' => ''],
                        ['id' => 'text_mm0w7c0j', 'text' => '2'],
                        ['id' => 'phone2', 'text' => '050-123-4567'],
                        ['id' => 'email', 'text' => 'resident@example.com'],
                    ],
                    'linked_items' => [[
                        'id' => '9' . $itemId,
                        'column_values' => [
                            ['id' => 'numbers21', 'text' => $apartment],
                            ['id' => 'text8', 'text' => ''],
                            ['id' => 'phone', 'text' => ''],
                            ['id' => '_____3', 'text' => ''],
                            ['id' => 'location7', 'text' => 'רחוב הבדיקה 1'],
                        ],
                    ]],
                ]],
            ],
        ];
    }
    return ['data' => ['boards' => [[
        'groups' => $groups,
    ]]]];
}

function portal_handover_monday_request(string $query, array $variables): array
{
    if ((string) getenv('IFEEL_PORTAL_TEST_MODE') === '1') {
        return portal_handover_test_monday_response($query, $variables);
    }

    $token = portal_handover_monday_token();
    if ($token === '') {
        throw new RuntimeException('חיבור Monday למסירות טרם הוגדר בשרת.');
    }
    if (!function_exists('curl_init')) {
        throw new RuntimeException('שרת המסירות אינו כולל כרגע תמיכה בחיבור המאובטח ל-Monday.');
    }

    $payload = json_encode(['query' => $query, 'variables' => $variables], JSON_UNESCAPED_UNICODE);
    if ($payload === false) {
        throw new RuntimeException('לא ניתן להכין את בקשת Monday.');
    }

    $handle = curl_init('https://api.monday.com/v2');
    curl_setopt_array($handle, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: ' . $token,
            'Content-Type: application/json',
            'API-Version: ' . portal_handover_api_version(),
        ],
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_MAXREDIRS => 0,
    ]);
    $body = curl_exec($handle);
    $curlError = curl_error($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
    curl_close($handle);

    if (!is_string($body) || $body === '' || $curlError !== '' || $status < 200 || $status >= 300) {
        error_log('[i-feel tenant handovers] monday_transport_failed status=' . $status);
        throw new RuntimeException('לא ניתן לטעון כרגע נתונים מ-Monday. נסו שוב בעוד רגע.');
    }
    $decoded = json_decode($body, true);
    if (!is_array($decoded) || isset($decoded['errors']) || !isset($decoded['data'])) {
        error_log('[i-feel tenant handovers] monday_graphql_failed');
        throw new RuntimeException('Monday החזיר תשובה לא תקינה. לא בוצע שינוי בנתונים.');
    }
    return $decoded;
}

function portal_handover_session_cache(string $key, int $ttl, callable $loader, bool $fresh = false): array
{
    $cache = $_SESSION['portal_handover_cache'][$key] ?? null;
    if (!$fresh && is_array($cache) && (int) ($cache['expires_at'] ?? 0) >= time() && is_array($cache['value'] ?? null)) {
        return $cache['value'];
    }
    $value = $loader();
    $_SESSION['portal_handover_cache'][$key] = [
        'expires_at' => time() + $ttl,
        'value' => $value,
    ];
    return $value;
}

function portal_handover_projects(bool $fresh = false): array
{
    return portal_handover_session_cache('projects-dedicated-board', 60, static function (): array {
        $response = portal_handover_monday_request(
            'query HandoverProjects($boardIds: [ID!]) { boards(ids: $boardIds) { id groups { id title archived deleted } } }',
            ['boardIds' => [portal_handover_board_id()]]
        );
        $boards = $response['data']['boards'] ?? [];
        if (!is_array($boards) || !isset($boards[0]) || !is_array($boards[0])) {
            throw new RuntimeException('לוח מחלקת פרויקטים - דיירים לא נמצא ב-Monday.');
        }
        return portal_handover_merge_project_groups(is_array($boards[0]['groups'] ?? null) ? $boards[0]['groups'] : []);
    }, $fresh);
}

function portal_handover_column_text(array $item, string $columnId): string
{
    foreach (($item['column_values'] ?? []) as $column) {
        if (is_array($column) && (string) ($column['id'] ?? '') === $columnId) {
            return trim((string) ($column['text'] ?? ''));
        }
    }
    return '';
}

function portal_handover_linked_column_text(array $item, string $columnId): string
{
    foreach (($item['linked_items'] ?? []) as $linkedItem) {
        if (!is_array($linkedItem)) {
            continue;
        }
        $value = portal_handover_column_text($linkedItem, $columnId);
        if ($value !== '') {
            return $value;
        }
    }
    return '';
}

function portal_handover_normalize_resident(array $item, string $projectId, string $projectTitle, string $sourceGroupId = ''): ?array
{
    $itemId = trim((string) ($item['id'] ?? ''));
    $name = trim((string) ($item['name'] ?? ''));
    $apartment = portal_handover_column_text($item, 'lookup_mm0m2n3j');
    if ($apartment === '') {
        $apartment = portal_handover_linked_column_text($item, 'numbers21');
    }
    if (!preg_match('/^\d{1,20}$/', $itemId) || $name === '' || $apartment === '') {
        return null;
    }
    $phoneText = portal_handover_column_text($item, 'phone2');
    if ($phoneText === '') {
        $phoneText = portal_handover_linked_column_text($item, 'phone');
    }
    $emailText = strtolower(portal_handover_column_text($item, 'email'));
    if ($emailText === '') {
        $emailText = strtolower(portal_handover_linked_column_text($item, '_____3'));
    }
    $phoneDigits = preg_replace('/\D+/', '', $phoneText) ?? '';
    $email = filter_var($emailText, FILTER_VALIDATE_EMAIL) !== false ? $emailText : '';
    $building = portal_handover_column_text($item, 'text_mm0w7c0j');
    if ($building === '') {
        $building = portal_handover_linked_column_text($item, 'text8');
    }
    $location = portal_handover_column_text($item, 'mirror3');
    if ($location === '') {
        $location = portal_handover_linked_column_text($item, 'location7');
    }
    return [
        'item_id' => $itemId,
        'project_id' => $projectId,
        'source_group_id' => $sourceGroupId !== '' ? $sourceGroupId : $projectId,
        'project_title' => portal_substr($projectTitle, 0, 255),
        'name' => portal_substr($name, 0, 180),
        'apartment' => portal_substr($apartment, 0, 40),
        'building' => portal_substr($building, 0, 80),
        'phone' => portal_substr($phoneText, 0, 80),
        'phone_digits' => portal_substr($phoneDigits, 0, 30),
        'email' => portal_substr($email, 0, 160),
        'location' => portal_substr($location, 0, 300),
    ];
}

function portal_handover_parse_residents(array $items, string $projectId, string $projectTitle, string $sourceGroupId = ''): array
{
    $residents = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $resident = portal_handover_normalize_resident($item, $projectId, $projectTitle, $sourceGroupId);
        if ($resident !== null) {
            $residents[$resident['item_id']] = $resident;
        }
    }
    uasort($residents, static function (array $a, array $b): int {
        $building = strnatcasecmp((string) $a['building'], (string) $b['building']);
        return $building !== 0 ? $building : strnatcasecmp((string) $a['apartment'], (string) $b['apartment']);
    });
    return $residents;
}

function portal_handover_residents_for_projects(array $projects, bool $fresh = false): array
{
    $sourceProjects = [];
    foreach ($projects as $projectId => $project) {
        if (!is_array($project) || !is_string($projectId) || !preg_match('/^[A-Za-z0-9_-]{1,128}$/', $projectId)) {
            continue;
        }
        $sourceGroupIds = is_array($project['group_ids'] ?? null) ? $project['group_ids'] : [$projectId];
        foreach (array_unique($sourceGroupIds) as $sourceGroupId) {
            if (!is_string($sourceGroupId) || !preg_match('/^[A-Za-z0-9_-]{1,128}$/', $sourceGroupId)) {
                continue;
            }
            $sourceProjects[$sourceGroupId] = [
                'id' => $projectId,
                'title' => (string) ($project['title'] ?? ''),
            ];
        }
    }
    if ($sourceProjects === []) {
        return [];
    }
    ksort($sourceProjects, SORT_NATURAL | SORT_FLAG_CASE);
    $cacheKey = 'residents-batch-' . hash('sha256', implode("\n", array_keys($sourceProjects)));
    return portal_handover_session_cache($cacheKey, 30, static function () use ($sourceProjects): array {
        $sourceGroupIds = array_keys($sourceProjects);
        $query = <<<'GRAPHQL'
query HandoverResidents($boardIds: [ID!], $groupIds: [String], $salesBoardId: ID!) {
  boards(ids: $boardIds) {
    groups(ids: $groupIds) {
      id
      title
      items_page(limit: 500) {
        cursor
        items {
          id
          name
          column_values(ids: ["lookup_mm0m2n3j", "text_mm0w7c0j", "phone2", "email", "mirror3"]) { id text }
          linked_items(link_to_item_column_id: "connect_boards", linked_board_id: $salesBoardId) {
            id
            column_values(ids: ["numbers21", "text8", "phone", "_____3", "location7"]) { id text }
          }
        }
      }
    }
  }
}
GRAPHQL;
        $response = portal_handover_monday_request($query, [
            'boardIds' => [portal_handover_board_id()],
            'groupIds' => $sourceGroupIds,
            'salesBoardId' => portal_handover_sales_board_id(),
        ]);
        $groups = $response['data']['boards'][0]['groups'] ?? null;
        if (!is_array($groups) || $groups === []) {
            throw new RuntimeException('קבוצת הפרויקט לא נמצאה ב-Monday.');
        }
        $expectedGroups = array_fill_keys($sourceGroupIds, true);
        $residents = [];
        foreach ($groups as $sourceGroup) {
            if (!is_array($sourceGroup)) {
                continue;
            }
            $sourceGroupId = trim((string) ($sourceGroup['id'] ?? ''));
            if (!isset($expectedGroups[$sourceGroupId])) {
                continue;
            }
            $project = $sourceProjects[$sourceGroupId];
            $page = is_array($sourceGroup['items_page'] ?? null) ? $sourceGroup['items_page'] : [];
            $items = is_array($page['items'] ?? null) ? $page['items'] : [];
            $cursor = is_string($page['cursor'] ?? null) ? $page['cursor'] : null;
            $pages = 1;
            while ($cursor !== null && $cursor !== '' && $pages < 20) {
                $next = portal_handover_monday_request(
                    'query HandoverResidentsNext($cursor: String!, $salesBoardId: ID!) { next_items_page(limit: 500, cursor: $cursor) { cursor items { id name column_values(ids: ["lookup_mm0m2n3j", "text_mm0w7c0j", "phone2", "email", "mirror3"]) { id text } linked_items(link_to_item_column_id: "connect_boards", linked_board_id: $salesBoardId) { id column_values(ids: ["numbers21", "text8", "phone", "_____3", "location7"]) { id text } } } } }',
                    ['cursor' => $cursor, 'salesBoardId' => portal_handover_sales_board_id()]
                );
                $nextPage = $next['data']['next_items_page'] ?? null;
                if (!is_array($nextPage)) {
                    break;
                }
                $nextItems = is_array($nextPage['items'] ?? null) ? $nextPage['items'] : [];
                $items = array_merge($items, $nextItems);
                $cursor = is_string($nextPage['cursor'] ?? null) ? $nextPage['cursor'] : null;
                $pages++;
            }
            foreach (portal_handover_parse_residents($items, (string) $project['id'], (string) $project['title'], $sourceGroupId) as $itemId => $resident) {
                $residents[$itemId] = $resident;
            }
        }
        uasort($residents, static function (array $a, array $b): int {
            $project = strnatcasecmp((string) $a['project_title'], (string) $b['project_title']);
            if ($project !== 0) {
                return $project;
            }
            $building = strnatcasecmp((string) $a['building'], (string) $b['building']);
            return $building !== 0 ? $building : strnatcasecmp((string) $a['apartment'], (string) $b['apartment']);
        });
        return $residents;
    }, $fresh);
}

function portal_handover_residents(string $groupId, bool $fresh = false): array
{
    if (!preg_match('/^[A-Za-z0-9_-]{1,128}$/', $groupId)) {
        throw new InvalidArgumentException('הפרויקט שנבחר אינו תקין.');
    }
    $projects = portal_handover_projects($fresh);
    if (!isset($projects[$groupId])) {
        throw new RuntimeException('הפרויקט שנבחר אינו קיים או אינו פעיל.');
    }
    return portal_handover_residents_for_projects([$groupId => $projects[$groupId]], $fresh);
}

function portal_handover_resident(string $groupId, string $itemId, bool $fresh = false): array
{
    if (!preg_match('/^\d{1,20}$/', $itemId)) {
        throw new InvalidArgumentException('הדייר שנבחר אינו תקין.');
    }
    $residents = portal_handover_residents($groupId, $fresh);
    if (!isset($residents[$itemId])) {
        throw new RuntimeException('הדייר שנבחר אינו משויך לפרויקט או אינו מוכן להעברה.');
    }
    return $residents[$itemId];
}

function portal_handover_search_term(string $value): string
{
    $value = trim((string) (preg_replace('/\s+/u', ' ', $value) ?? $value));
    return portal_substr($value, 0, 100);
}

function portal_handover_text_contains(string $value, string $term): bool
{
    if ($term === '') {
        return true;
    }
    if (function_exists('mb_stripos')) {
        return mb_stripos($value, $term, 0, 'UTF-8') !== false;
    }
    return stripos($value, $term) !== false;
}

function portal_handover_search_projects(array $projects, string $projectTerm): array
{
    $projectTerm = portal_handover_search_term($projectTerm);
    if ($projectTerm === '') {
        return $projects;
    }
    return array_filter($projects, static function ($project) use ($projectTerm): bool {
        return is_array($project) && portal_handover_text_contains((string) ($project['title'] ?? ''), $projectTerm);
    });
}

function portal_handover_search_resident_matches(array $residents, string $residentTerm): array
{
    $residentTerm = portal_handover_search_term($residentTerm);
    if ($residentTerm === '') {
        return $residents;
    }
    return array_filter($residents, static function ($resident) use ($residentTerm): bool {
        return is_array($resident) && portal_handover_text_contains((string) ($resident['name'] ?? ''), $residentTerm);
    });
}

function portal_handover_search_monday(array $projects, string $residentTerm, bool $fresh = false): array
{
    $sourceProjects = [];
    foreach ($projects as $projectId => $project) {
        if (!is_array($project) || !is_string($projectId) || !preg_match('/^[A-Za-z0-9_-]{1,128}$/', $projectId)) {
            continue;
        }
        $sourceGroupIds = is_array($project['group_ids'] ?? null) ? $project['group_ids'] : [$projectId];
        foreach (array_unique($sourceGroupIds) as $sourceGroupId) {
            if (is_string($sourceGroupId) && preg_match('/^[A-Za-z0-9_-]{1,128}$/', $sourceGroupId)) {
                $sourceProjects[$sourceGroupId] = ['id' => $projectId, 'title' => (string) ($project['title'] ?? '')];
            }
        }
    }
    if ($sourceProjects === []) {
        return [];
    }
    ksort($sourceProjects, SORT_NATURAL | SORT_FLAG_CASE);
    $residentTerm = portal_handover_search_term($residentTerm);
    $cacheKey = 'resident-search-' . hash('sha256', implode("\n", array_keys($sourceProjects)) . "\n" . $residentTerm);
    return portal_handover_session_cache($cacheKey, 30, static function () use ($sourceProjects, $residentTerm): array {
        $rules = [
            ['column_id' => 'group', 'compare_value' => array_keys($sourceProjects), 'operator' => 'any_of'],
        ];
        if ($residentTerm !== '') {
            $rules[] = ['column_id' => 'name', 'compare_value' => [$residentTerm], 'operator' => 'contains_text'];
        }
        $query = <<<'GRAPHQL'
query HandoverSearch($boardIds: [ID!], $queryParams: ItemsQuery, $salesBoardId: ID!) {
  boards(ids: $boardIds) {
    items_page(limit: 500, query_params: $queryParams) {
      cursor
      items {
        id
        name
        group { id title }
        column_values(ids: ["lookup_mm0m2n3j", "text_mm0w7c0j", "phone2", "email", "mirror3"]) { id text }
        linked_items(link_to_item_column_id: "connect_boards", linked_board_id: $salesBoardId) {
          id
          column_values(ids: ["numbers21", "text8", "phone", "_____3", "location7"]) { id text }
        }
      }
    }
  }
}
GRAPHQL;
        $response = portal_handover_monday_request($query, [
            'boardIds' => [portal_handover_board_id()],
            'queryParams' => ['rules' => $rules, 'operator' => 'and'],
            'salesBoardId' => portal_handover_sales_board_id(),
        ]);
        $page = $response['data']['boards'][0]['items_page'] ?? null;
        if (!is_array($page)) {
            throw new RuntimeException('לא התקבלו תוצאות חיפוש תקינות מ-Monday.');
        }
        $items = is_array($page['items'] ?? null) ? $page['items'] : [];
        $cursor = is_string($page['cursor'] ?? null) ? $page['cursor'] : null;
        $pages = 1;
        while ($cursor !== null && $cursor !== '' && $pages < 20) {
            $next = portal_handover_monday_request(
                'query HandoverSearchNext($cursor: String!, $salesBoardId: ID!) { next_items_page(limit: 500, cursor: $cursor) { cursor items { id name group { id title } column_values(ids: ["lookup_mm0m2n3j", "text_mm0w7c0j", "phone2", "email", "mirror3"]) { id text } linked_items(link_to_item_column_id: "connect_boards", linked_board_id: $salesBoardId) { id column_values(ids: ["numbers21", "text8", "phone", "_____3", "location7"]) { id text } } } } }',
                ['cursor' => $cursor, 'salesBoardId' => portal_handover_sales_board_id()]
            );
            $nextPage = $next['data']['next_items_page'] ?? null;
            if (!is_array($nextPage)) {
                break;
            }
            $items = array_merge($items, is_array($nextPage['items'] ?? null) ? $nextPage['items'] : []);
            $cursor = is_string($nextPage['cursor'] ?? null) ? $nextPage['cursor'] : null;
            $pages++;
        }
        $residents = [];
        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }
            $sourceGroupId = trim((string) ($item['group']['id'] ?? ''));
            if (!isset($sourceProjects[$sourceGroupId])) {
                continue;
            }
            $project = $sourceProjects[$sourceGroupId];
            $resident = portal_handover_normalize_resident($item, (string) $project['id'], (string) $project['title'], $sourceGroupId);
            if ($resident !== null && ($residentTerm === '' || portal_handover_text_contains((string) $resident['name'], $residentTerm))) {
                $residents[$resident['item_id']] = $resident;
            }
        }
        uasort($residents, static function (array $a, array $b): int {
            $project = strnatcasecmp((string) $a['project_title'], (string) $b['project_title']);
            if ($project !== 0) {
                return $project;
            }
            $name = strnatcasecmp((string) $a['name'], (string) $b['name']);
            return $name !== 0 ? $name : strnatcasecmp((string) $a['apartment'], (string) $b['apartment']);
        });
        return $residents;
    }, $fresh);
}

function portal_handover_search_residents(array $projects, string $projectTerm, string $residentTerm, bool $fresh = false): array
{
    $projectTerm = portal_handover_search_term($projectTerm);
    $residentTerm = portal_handover_search_term($residentTerm);
    if ($projectTerm === '' && $residentTerm === '') {
        return ['results' => [], 'total' => 0, 'truncated' => false];
    }
    $matchingProjects = portal_handover_search_projects($projects, $projectTerm);
    if ($matchingProjects === []) {
        return ['results' => [], 'total' => 0, 'truncated' => false];
    }
    $matches = portal_handover_search_resident_matches(
        portal_handover_search_monday($matchingProjects, $residentTerm, $fresh),
        $residentTerm
    );
    $total = count($matches);
    return [
        'results' => array_slice($matches, 0, 100, true),
        'total' => $total,
        'truncated' => $total > 100,
    ];
}

function portal_handover_search_state(): array
{
    $active = trim((string) ($_GET['handover_search'] ?? '')) === '1';
    $state = is_array($_SESSION['portal_handover_search'] ?? null) ? $_SESSION['portal_handover_search'] : [];
    if (!$active || (int) ($state['created_at'] ?? 0) < time() - 900) {
        if ($state !== [] && (int) ($state['created_at'] ?? 0) < time() - 900) {
            unset($_SESSION['portal_handover_search']);
        }
        return ['active' => false, 'project' => '', 'resident' => ''];
    }
    return [
        'active' => true,
        'project' => portal_handover_search_term((string) ($state['project'] ?? '')),
        'resident' => portal_handover_search_term((string) ($state['resident'] ?? '')),
    ];
}

function portal_handle_tenant_handover_search_post(array $user): never
{
    portal_verify_csrf();
    if (portal_post('handover_search_clear', 10) === '1') {
        unset($_SESSION['portal_handover_search']);
        portal_redirect(['tab' => 'handovers']);
    }
    $projectTerm = portal_handover_search_term(portal_post('handover_project_search', 100));
    $residentTerm = portal_handover_search_term(portal_post('handover_resident_search', 100));
    if ($projectTerm === '' && $residentTerm === '') {
        unset($_SESSION['portal_handover_search']);
        portal_flash_set('error', 'יש להזין שם פרויקט, שם דייר או את שניהם.');
        portal_redirect(['tab' => 'handovers']);
    }
    $_SESSION['portal_handover_search'] = [
        'project' => $projectTerm,
        'resident' => $residentTerm,
        'created_at' => time(),
    ];
    portal_audit('tenant_handover_search', [
        'project_filter' => $projectTerm !== '',
        'resident_filter' => $residentTerm !== '',
        'actor' => hash('sha256', strtolower((string) ($user['email'] ?? ''))),
    ]);
    portal_redirect(['tab' => 'handovers', 'handover_search' => '1']);
}

function portal_handover_credentials(array $resident): array
{
    $email = trim((string) ($resident['email'] ?? ''));
    $password = preg_replace('/\D+/', '', (string) ($resident['phone'] ?? '')) ?? '';
    return [
        'username' => $email !== '' ? $email : 'support@i-feel.co.il',
        'password' => $password,
    ];
}

function portal_handover_internal_recipients(array $user): array
{
    $values = ['sagiv@i-feel.co.il', 'support@i-feel.co.il'];
    $configured = portal_handover_config('TENANT_HANDOVER_INTERNAL_RECIPIENTS', 'TENANT_HANDOVER_INTERNAL_RECIPIENTS');
    if ($configured !== '') {
        $values = array_merge($values, preg_split('/[\s,;]+/', $configured) ?: []);
    }
    $values[] = (string) ($user['email'] ?? '');
    $recipients = [];
    foreach ($values as $value) {
        $email = portal_normalize_company_email((string) $value);
        if ($email !== null) {
            $recipients[$email] = true;
        }
    }
    return array_keys($recipients);
}

function portal_new_handover_id(): string
{
    return 'THO-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(6));
}

function portal_handover_dir(string $handoverId): string
{
    if (!preg_match('/^THO-(\d{4})(\d{2})\d{2}-\d{6}-[a-f0-9]{12}$/', $handoverId, $match)) {
        throw new InvalidArgumentException('מספר המסירה אינו תקין.');
    }
    return portal_storage_root()
        . DIRECTORY_SEPARATOR . 'tenant-handovers'
        . DIRECTORY_SEPARATOR . $match[1]
        . DIRECTORY_SEPARATOR . $match[2]
        . DIRECTORY_SEPARATOR . $handoverId;
}

function portal_handover_file(string $handoverId): string
{
    return portal_handover_dir($handoverId) . DIRECTORY_SEPARATOR . 'metadata.json';
}

function portal_save_handover(array $handover): void
{
    portal_json_write(portal_handover_file((string) ($handover['id'] ?? '')), $handover);
}

function portal_load_handover(string $handoverId): ?array
{
    try {
        $record = portal_json_read(portal_handover_file($handoverId));
        return $record === [] ? null : $record;
    } catch (InvalidArgumentException $error) {
        return null;
    }
}

function portal_all_handovers(): array
{
    $pattern = portal_storage_root()
        . DIRECTORY_SEPARATOR . 'tenant-handovers'
        . DIRECTORY_SEPARATOR . '*'
        . DIRECTORY_SEPARATOR . '*'
        . DIRECTORY_SEPARATOR . '*'
        . DIRECTORY_SEPARATOR . 'metadata.json';
    $records = [];
    foreach (glob($pattern) ?: [] as $path) {
        $record = portal_json_read($path);
        if ($record !== [] && isset($record['id'])) {
            $records[] = $record;
        }
    }
    usort($records, static fn(array $a, array $b): int => strcmp((string) ($b['created_at'] ?? ''), (string) ($a['created_at'] ?? '')));
    return $records;
}

function portal_handovers_for_user(array $user): array
{
    if (($user['role'] ?? '') === 'admin') {
        return portal_all_handovers();
    }
    $email = portal_normalize_company_email((string) ($user['email'] ?? '')) ?? '';
    return array_values(array_filter(portal_all_handovers(), static function (array $handover) use ($email): bool {
        $technician = portal_normalize_company_email((string) ($handover['technician']['email'] ?? '')) ?? '';
        return $email !== '' && $technician !== '' && hash_equals($email, $technician);
    }));
}

function portal_handover_save_photo(string $recordDir, array $file, string $label): array
{
    $items = portal_normalize_files_array($file);
    if (count($items) !== 1 || (int) ($items[0]['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        throw new RuntimeException('חובה לצרף ' . $label . '.');
    }
    $saved = portal_save_uploads($recordDir, $file);
    if (count($saved) !== 1 || !str_starts_with((string) ($saved[0]['mime'] ?? ''), 'image/')) {
        throw new RuntimeException($label . ' חייב להיות קובץ תמונה.');
    }
    return $saved[0];
}

function portal_handover_submission_token(): string
{
    $token = $_SESSION['portal_handover_submission_token'] ?? '';
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) {
        $token = bin2hex(random_bytes(32));
        $_SESSION['portal_handover_submission_token'] = $token;
    }
    return $token;
}

function portal_handover_verify_submission_token(string $token): void
{
    $expected = (string) ($_SESSION['portal_handover_submission_token'] ?? '');
    if ($expected === '' || !preg_match('/^[a-f0-9]{64}$/', $token) || !hash_equals($expected, $token)) {
        throw new RuntimeException('טופס המסירה פג תוקף או כבר נשלח. יש לטעון אותו מחדש.');
    }
}

function portal_handover_attachment_path(array $handover, string $key): ?array
{
    $attachment = $handover['photos'][$key] ?? null;
    if (!is_array($attachment)) {
        return null;
    }
    $storageName = basename((string) ($attachment['storage_name'] ?? ''));
    if ($storageName === '' || $storageName !== (string) ($attachment['storage_name'] ?? '')) {
        return null;
    }
    $path = portal_handover_dir((string) ($handover['id'] ?? '')) . DIRECTORY_SEPARATOR . 'files' . DIRECTORY_SEPARATOR . $storageName;
    if (!is_file($path)) {
        return null;
    }
    return [
        'path' => $path,
        'name' => (string) ($attachment['original_name'] ?? 'handover-photo'),
        'mime' => (string) ($attachment['mime'] ?? 'application/octet-stream'),
        'size' => (int) ($attachment['size'] ?? filesize($path)),
    ];
}

function portal_handover_email_attachments(array $handover): array
{
    $attachments = [];
    foreach (['controller', 'switch'] as $key) {
        $attachment = portal_handover_attachment_path($handover, $key);
        if ($attachment !== null) {
            $attachments[] = $attachment;
        }
    }
    return $attachments;
}

function portal_handover_protected_url(array $handover, string $key): string
{
    return rtrim(portal_public_origin(), '/') . portal_url([
        'action' => 'handover_download',
        'handover_id' => (string) ($handover['id'] ?? ''),
        'file' => $key,
    ]);
}

function portal_handover_internal_email_body(array $handover): string
{
    $resident = is_array($handover['resident'] ?? null) ? $handover['resident'] : [];
    $technician = is_array($handover['technician'] ?? null) ? $handover['technician'] : [];
    $credentials = is_array($handover['credentials'] ?? null) ? $handover['credentials'] : [];
    $details = is_array($handover['details'] ?? null) ? $handover['details'] : [];
    return implode("\r\n", array_merge([
        'מסירת דייר הושלמה ונשמרה במערכת העובדים.',
        '',
        'מספר מסירה: ' . (string) ($handover['id'] ?? ''),
        'פרויקט: ' . (string) ($resident['project_title'] ?? ''),
        'בניין: ' . ((string) ($resident['building'] ?? '') ?: 'לא רלוונטי'),
        'דירה: ' . (string) ($resident['apartment'] ?? ''),
        'דייר: ' . (string) ($resident['name'] ?? ''),
        'טלפון: ' . (string) ($resident['phone'] ?? ''),
        'דוא״ל: ' . ((string) ($resident['email'] ?? '') ?: 'לא קיים'),
        'כתובת: ' . (string) ($resident['location'] ?? ''),
        '',
        'שם משתמש: ' . (string) ($credentials['username'] ?? ''),
        'סיסמה ראשונית: ' . (string) ($credentials['password'] ?? ''),
        '',
        'סטטוס המסירה: ' . portal_handover_ready_label((string) ($details['ready'] ?? '')),
        'תאריך מסירה: ' . (string) ($details['date'] ?? ''),
        'מיקום קונטרולר: ' . (string) ($details['controller_location'] ?? ''),
        'קונטרולר: ' . portal_handover_controller_label((string) ($details['controller'] ?? '')),
        'אייקונים במפסק: ' . portal_handover_icons_label((string) ($details['icons'] ?? '')),
    ], portal_handover_switch_9_email_lines($details), [
        'כמות מפסקי תאורה: ' . (string) ($details['light_switch_count'] ?? '-'),
        'מיקומי מפסקי תאורה: ' . ((string) ($details['light_switch_location'] ?? '') ?: '-'),
        'כמות מפסקי תריס: ' . (string) ($details['shutter_switch_count'] ?? '-'),
        'מיקומי מפסקי תריס: ' . ((string) ($details['shutter_switch_location'] ?? ($details['blinds'] ?? '')) ?: '-'),
        'מפסק 24V לתריס כלוא: ' . portal_handover_captive_shutter_24v_label((string) ($details['captive_shutter_24v'] ?? '')),
        'חיבור למזגן: ' . portal_handover_hvac_connection_label((string) ($details['hvac_connection'] ?? '')),
        'דוד: ' . portal_handover_boiler_label((string) ($details['boiler'] ?? '')),
        'הערות: ' . (string) ($details['notes'] ?? ''),
        '',
        'טכנאי: ' . (string) ($technician['name'] ?? ''),
        'דוא״ל טכנאי: ' . (string) ($technician['email'] ?? ''),
        '',
        'צילום קונטרולר (דורש כניסה לאזור העובדים):',
        portal_handover_protected_url($handover, 'controller'),
        'צילום מפסק 9:',
        portal_handover_protected_url($handover, 'switch'),
        '',
        'התמונות מצורפות גם להודעה זו.',
    ]));
}

function portal_handover_resident_email_body(array $handover): string
{
    $resident = is_array($handover['resident'] ?? null) ? $handover['resident'] : [];
    $credentials = is_array($handover['credentials'] ?? null) ? $handover['credentials'] : [];
    $building = trim((string) ($resident['building'] ?? ''));
    $location = $building !== '' ? ' (בניין ' . $building . ')' : '';
    return implode("\r\n", [
        'שלום ' . (string) ($resident['name'] ?? '') . ',',
        '',
        'צוות I Feel סיים את מסירת מערכת הבית החכם בדירה ' . (string) ($resident['apartment'] ?? '') . $location . ', בפרויקט ' . (string) ($resident['project_title'] ?? '') . '.',
        '',
        'פרטי הכניסה שלך לאפליקציה:',
        'שם משתמש: ' . (string) ($credentials['username'] ?? ''),
        'סיסמה ראשונית: ' . (string) ($credentials['password'] ?? ''),
        '',
        'מומלץ להחליף את הסיסמה לאחר הכניסה הראשונה, אם האפליקציה מאפשרת זאת.',
        '',
        'תודה שבחרתם ב-I Feel!',
        '03-508-9553',
    ]);
}

function portal_handover_send_internal(array $handover, array $user): array
{
    $recipients = portal_handover_internal_recipients($user);
    if ((string) getenv('IFEEL_PORTAL_TEST_MODE') === '1') {
        return ['recipients' => $recipients, 'sent' => $recipients, 'failed' => []];
    }
    $attachments = portal_handover_email_attachments($handover);
    $batches = portal_attachment_batches($attachments);
    $sent = [];
    $failed = [];
    foreach ($recipients as $recipient) {
        $recipientOk = true;
        foreach ($batches as $index => $batch) {
            $subject = 'מסירה הושלמה — ' . (string) ($handover['resident']['project_title'] ?? '')
                . ' · דירה ' . (string) ($handover['resident']['apartment'] ?? '')
                . (count($batches) > 1 ? ' · קבצים ' . ($index + 1) . '/' . count($batches) : '');
            if (!portal_send_mail_with_attachments($recipient, $subject, portal_handover_internal_email_body($handover), $batch)) {
                $recipientOk = false;
                break;
            }
        }
        if ($recipientOk) {
            $sent[] = $recipient;
        } else {
            $failed[] = $recipient;
        }
    }
    return ['recipients' => $recipients, 'sent' => $sent, 'failed' => $failed];
}

function portal_handover_send_resident(array $handover): array
{
    $email = strtolower(trim((string) ($handover['resident']['email'] ?? '')));
    if ($email === '' || $email === 'support@i-feel.co.il' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        return ['recipient' => '', 'status' => 'skipped'];
    }
    if ((string) getenv('IFEEL_PORTAL_TEST_MODE') === '1') {
        return ['recipient' => $email, 'status' => 'sent'];
    }
    $subject = 'סיום מסירה — מערכת בית חכם I Feel · דירה ' . (string) ($handover['resident']['apartment'] ?? '');
    $sent = portal_send_mail_with_attachments($email, $subject, portal_handover_resident_email_body($handover));
    return ['recipient' => $email, 'status' => $sent ? 'sent' : 'failed'];
}

function portal_handover_ready_label(string $value): string
{
    return [
        'delivered_with_app_link' => 'נמסר עם קישור לאפליקציה',
        'completed_without_app_link' => 'הסתיים ללא קישור לאפליקציה',
        'ready_for_delivery' => 'מוכן למסירה',
        'not_ready_return_required' => 'לא מוכן — יש לחזור',
        // Backward-compatible labels for handovers stored before the status list was expanded.
        'ready' => 'מוכן',
        'not_ready' => 'לא מוכן',
        'delivered' => 'נמסר',
    ][$value] ?? '-';
}

function portal_handover_controller_label(string $value): string
{
    return ['raspberry_pi' => 'רספברי פיי', 'ava_hab' => 'AVA-HAB'][$value] ?? '-';
}

function portal_handover_icons_label(string $value): string
{
    return ['done' => 'בוצע', 'not_done' => 'לא בוצע', 'partial' => 'חלקי'][$value] ?? '-';
}

function portal_handover_switch_9_label(string $value): string
{
    return [
        'light_9' => '9 לתאורה בלבד',
        'shutter_1_light_4' => 'תריס אחד ו-4 תאורות',
        'shutter_2_light_2' => '2 תריסים ו-2 תאורות',
        'shutter_3' => '3 תריסים',
    ][$value] ?? '-';
}

function portal_handover_switch_9_email_lines(array $details): array
{
    $units = is_array($details['switch_9_units'] ?? null) ? $details['switch_9_units'] : [];
    if ($units !== []) {
        $lines = ['כמות מפסקי 9: ' . (string) ($details['switch_9_count'] ?? count($units))];
        foreach ($units as $index => $unit) {
            if (!is_array($unit)) {
                continue;
            }
            $lines[] = 'מפסק 9 מס׳ ' . ((int) $index + 1) . ': '
                . portal_handover_switch_9_label((string) ($unit['configuration'] ?? ''))
                . ' | מיקום: ' . ((string) ($unit['location'] ?? '') ?: '-');
        }
        return $lines;
    }

    $legacyConfiguration = isset($details['switch_9_configuration'])
        ? portal_handover_switch_9_label((string) $details['switch_9_configuration'])
        : (string) ($details['switch_9'] ?? '-');
    return [
        'כמות מפסקי 9: ' . (isset($details['switch_9_configuration']) || isset($details['switch_9']) ? '1' : '-'),
        'מפסק 9 מס׳ 1: ' . $legacyConfiguration . ' | מיקום: ' . (string) ($details['switch_9_location'] ?? '-'),
    ];
}

function portal_handover_captive_shutter_24v_label(string $value): string
{
    return [
        'installed_activated' => 'יש והופעל',
        'installed_not_activated' => 'יש ולא הופעל',
        'not_in_project' => 'אין בפרויקט',
    ][$value] ?? '-';
}

function portal_handover_hvac_connection_label(string $value): string
{
    return [
        'none' => 'אין חיבור למזגן',
        'ir' => 'חיבור באמצעות IR',
        'dry_contact_panel_9' => 'חיבור באמצעות מגע יבש מפאנל 9',
        'micromodule' => 'חיבור באמצעות מיקרומודול',
    ][$value] ?? '-';
}

function portal_handover_boiler_label(string $value): string
{
    return [
        'avatto' => 'AVATTO',
        'domex' => 'DOMEX',
        'none' => 'אין',
        'switcher' => 'סוויטשר',
    ][$value] ?? ($value !== '' ? $value : '-');
}

function portal_handover_controller_location(string $value, string $other): string
{
    $labels = [
        'communications_cabinet' => 'ארון תקשורת',
        'developer_rep' => 'אחראי הפרויקט מטעם היזם',
        'ifeel' => 'בחברת I Feel',
    ];
    if (isset($labels[$value])) {
        return $labels[$value];
    }
    if ($value === 'other' && $other !== '') {
        return 'אחר: ' . portal_substr($other, 0, 300);
    }
    return '';
}

function portal_handle_tenant_handover_post(array $user): void
{
    portal_verify_csrf();
    portal_handover_verify_submission_token(portal_post('handover_submission_token', 64));
    $groupId = portal_post('handover_project_id', 128);
    $itemId = portal_post('handover_resident_id', 20);
    $resident = portal_handover_resident($groupId, $itemId, true);
    $credentials = portal_handover_credentials($resident);
    if ($credentials['password'] === '') {
        throw new RuntimeException('לדייר אין מספר טלפון תקין ב-Monday ולכן לא ניתן להפיק סיסמה.');
    }

    $ready = portal_post('handover_ready', 30);
    $date = portal_post('handover_date', 20);
    $controllerLocationKey = portal_post('handover_controller_location', 40);
    $controllerLocation = portal_handover_controller_location(
        $controllerLocationKey,
        portal_post('handover_controller_location_other', 300)
    );
    $controller = portal_post('handover_controller', 40);
    $icons = portal_post('handover_icons', 40);
    $switch9CountRaw = portal_post('handover_switch_9_count', 10);
    $lightSwitchCountRaw = portal_post('handover_light_switch_count', 10);
    $shutterSwitchCountRaw = portal_post('handover_shutter_switch_count', 10);
    $lightSwitchLocation = portal_post('handover_light_switch_location', 300);
    $shutterSwitchLocation = portal_post('handover_shutter_switch_location', 300);
    $captiveShutter24v = portal_post('handover_captive_shutter_24v', 40);
    $hvacConnection = portal_post('handover_hvac_connection', 40);
    $boiler = portal_post('handover_boiler', 500);
    $notes = portal_post('handover_notes', 3000);
    if (!in_array($ready, ['delivered_with_app_link', 'completed_without_app_link', 'ready_for_delivery', 'not_ready_return_required'], true)) {
        throw new RuntimeException('יש לבחור סטטוס מסירה תקין.');
    }
    if (!portal_valid_date($date)) {
        throw new RuntimeException('תאריך המסירה אינו תקין.');
    }
    if (!in_array($controllerLocationKey, ['communications_cabinet', 'developer_rep', 'ifeel', 'other'], true) || $controllerLocation === '') {
        throw new RuntimeException('יש לבחור ולפרט את מיקום הקונטרולר.');
    }
    if (!in_array($controller, ['raspberry_pi', 'ava_hab'], true)) {
        throw new RuntimeException('יש לבחור סוג קונטרולר תקין.');
    }
    if (!in_array($icons, ['done', 'not_done', 'partial'], true)) {
        throw new RuntimeException('יש לבחור סטטוס אייקונים תקין.');
    }
    if (!ctype_digit($switch9CountRaw) || (int) $switch9CountRaw < 1 || (int) $switch9CountRaw > 50) {
        throw new RuntimeException('יש להזין כמות תקינה של מפסקי 9 (1 עד 50).');
    }
    $switch9Count = (int) $switch9CountRaw;
    $switch9Units = [];
    for ($index = 1; $index <= $switch9Count; $index++) {
        $configuration = portal_post('handover_switch_9_configuration_' . $index, 40);
        $location = portal_post('handover_switch_9_location_' . $index, 300);
        if (!in_array($configuration, ['light_9', 'shutter_1_light_4', 'shutter_2_light_2', 'shutter_3'], true)) {
            throw new RuntimeException('יש לבחור את סוג מפסק 9 מס׳ ' . $index . '.');
        }
        if ($location === '') {
            throw new RuntimeException('יש לפרט את מיקום מפסק 9 מס׳ ' . $index . '.');
        }
        $switch9Units[] = ['configuration' => $configuration, 'location' => $location];
    }
    if (!ctype_digit($lightSwitchCountRaw) || (int) $lightSwitchCountRaw > 99) {
        throw new RuntimeException('יש להזין כמות תקינה של מפסקי תאורה (0 עד 99).');
    }
    $lightSwitchCount = (int) $lightSwitchCountRaw;
    if ($lightSwitchCount > 0 && $lightSwitchLocation === '') {
        throw new RuntimeException('יש לפרט את מיקומי מפסקי התאורה.');
    }
    if (!ctype_digit($shutterSwitchCountRaw) || (int) $shutterSwitchCountRaw > 99) {
        throw new RuntimeException('יש להזין כמות תקינה של מפסקי תריס (0 עד 99).');
    }
    $shutterSwitchCount = (int) $shutterSwitchCountRaw;
    if ($shutterSwitchCount > 0 && $shutterSwitchLocation === '') {
        throw new RuntimeException('יש לפרט את מיקומי מפסקי התריס.');
    }
    if (!in_array($captiveShutter24v, ['installed_activated', 'installed_not_activated', 'not_in_project'], true)) {
        throw new RuntimeException('יש לבחור את מצב מפסק 24V לתריס הכלוא.');
    }
    if (!in_array($hvacConnection, ['none', 'ir', 'dry_contact_panel_9', 'micromodule'], true)) {
        throw new RuntimeException('יש לבחור את סוג החיבור למזגן.');
    }
    if (!in_array($boiler, ['avatto', 'domex', 'none', 'switcher'], true)) {
        throw new RuntimeException('יש לבחור אפשרות תקינה בשדה הדוד.');
    }
    if ($notes === '') {
        throw new RuntimeException('יש למלא את שדה ההערות. אם אין הערות, ניתן לכתוב "אין".');
    }

    $profile = portal_employee_profile($user);
    $technicianEmail = portal_normalize_company_email((string) ($user['email'] ?? ''));
    if ($technicianEmail === null) {
        throw new RuntimeException('לא ניתן לזהות את כתובת הדוא״ל הארגונית של הטכנאי.');
    }
    $technicianName = trim((string) ($profile['name'] ?? $user['display_name'] ?? ''));
    if ($technicianName === '') {
        $technicianName = $technicianEmail;
    }

    $handoverId = portal_new_handover_id();
    $recordDir = portal_handover_dir($handoverId);
    portal_ensure_directory($recordDir);
    try {
        $controllerPhoto = portal_handover_save_photo($recordDir, $_FILES['handover_controller_photo'] ?? [], 'צילום הקונטרולר');
        $switchPhoto = portal_handover_save_photo($recordDir, $_FILES['handover_switch_photo'] ?? [], 'צילום מפסק 9 עם האייקונים');
        $handover = [
            'id' => $handoverId,
            'created_at' => gmdate('c'),
            'updated_at' => gmdate('c'),
            'source' => [
                'system' => 'monday',
                'board_id' => portal_handover_board_id(),
                'project_id' => $groupId,
                'group_id' => (string) ($resident['source_group_id'] ?? $groupId),
                'item_id' => $itemId,
            ],
            'resident' => $resident,
            'credentials' => $credentials,
            'details' => [
                'ready' => $ready,
                'date' => $date,
                'controller_location' => $controllerLocation,
                'controller' => $controller,
                'icons' => $icons,
                'switch_9_count' => $switch9Count,
                'switch_9_units' => $switch9Units,
                'light_switch_count' => $lightSwitchCount,
                'light_switch_location' => $lightSwitchLocation,
                'shutter_switch_count' => $shutterSwitchCount,
                'shutter_switch_location' => $shutterSwitchLocation,
                'captive_shutter_24v' => $captiveShutter24v,
                'hvac_connection' => $hvacConnection,
                'boiler' => $boiler,
                'notes' => $notes,
            ],
            'technician' => [
                'name' => portal_substr($technicianName, 0, 180),
                'email' => $technicianEmail,
            ],
            'photos' => [
                'controller' => $controllerPhoto,
                'switch' => $switchPhoto,
            ],
            'notifications' => [
                'internal' => ['recipients' => portal_handover_internal_recipients($user), 'sent' => [], 'failed' => []],
                'resident' => ['recipient' => (string) ($resident['email'] ?? ''), 'status' => 'pending'],
            ],
        ];
        portal_save_handover($handover);
        unset($_SESSION['portal_handover_submission_token']);

        try {
            $handover['notifications']['internal'] = portal_handover_send_internal($handover, $user);
        } catch (Throwable $error) {
            error_log('[i-feel tenant handovers] internal_email_failed handover=' . $handoverId);
            $handover['notifications']['internal']['failed'] = $handover['notifications']['internal']['recipients'];
        }
        try {
            $handover['notifications']['resident'] = portal_handover_send_resident($handover);
        } catch (Throwable $error) {
            error_log('[i-feel tenant handovers] resident_email_failed handover=' . $handoverId);
            $handover['notifications']['resident']['status'] = 'failed';
        }
        $handover['updated_at'] = gmdate('c');
        portal_save_handover($handover);

        $internalFailed = $handover['notifications']['internal']['failed'] ?? [];
        $residentStatus = (string) ($handover['notifications']['resident']['status'] ?? 'failed');
        $allSent = $internalFailed === [] && in_array($residentStatus, ['sent', 'skipped'], true);
        portal_audit('tenant_handover_submitted', [
            'handover_id' => $handoverId,
            'monday_item_hash' => hash('sha256', $itemId),
            'photos' => 2,
            'internal_email_ok' => $internalFailed === [],
            'resident_email_status' => $residentStatus,
        ]);
        portal_flash_set(
            $allSent ? 'success' : 'error',
            $allSent
                ? 'המסירה נשמרה, התמונות אובטחו וההודעות נשלחו. מספר מסירה: ' . $handoverId
                : 'המסירה והתמונות נשמרו, אך לפחות הודעת דוא״ל אחת דורשת טיפול ידני. מספר מסירה: ' . $handoverId
        );
        portal_redirect(['tab' => 'handovers', 'submitted' => $handoverId]);
    } catch (Throwable $error) {
        if (!is_file(portal_handover_file($handoverId))) {
            portal_remove_tree($recordDir);
        }
        throw $error;
    }
}

function portal_handle_handover_download(array $user): void
{
    portal_require_login();
    $handoverId = trim((string) ($_GET['handover_id'] ?? ''));
    $key = trim((string) ($_GET['file'] ?? ''));
    if (!in_array($key, ['controller', 'switch'], true)) {
        throw new RuntimeException('קובץ המסירה המבוקש אינו תקין.');
    }
    $handover = portal_load_handover($handoverId);
    if ($handover === null) {
        throw new RuntimeException('המסירה המבוקשת לא נמצאה.');
    }
    $attachment = portal_handover_attachment_path($handover, $key);
    if ($attachment === null) {
        throw new RuntimeException('צילום המסירה לא נמצא.');
    }
    portal_audit('tenant_handover_photo_downloaded', ['handover_id' => $handoverId, 'file' => $key]);
    header('Content-Type: ' . $attachment['mime']);
    header('Content-Length: ' . (string) filesize($attachment['path']));
    header('Content-Disposition: inline; filename="handover-' . $key . '.' . pathinfo($attachment['path'], PATHINFO_EXTENSION) . '"');
    readfile($attachment['path']);
    exit;
}

function portal_render_tenant_handover_search(array $search, array $outcome): void
{
    $active = (bool) ($search['active'] ?? false);
    $projectTerm = (string) ($search['project'] ?? '');
    $residentTerm = (string) ($search['resident'] ?? '');
    $results = is_array($outcome['results'] ?? null) ? $outcome['results'] : [];
    $total = (int) ($outcome['total'] ?? 0);
    ?>
    <details class="detail-card handover-search-shell" data-handover-search-shell<?= $active ? ' open' : '' ?>>
        <summary class="handover-search-toggle">
            <span class="handover-search-toggle__icon" aria-hidden="true">⌕</span>
            <span class="handover-search-toggle__text">
                <strong>חיפוש פרויקט או דייר</strong>
                <small>לפי שם הפרויקט, שם הדייר או שניהם</small>
            </span>
            <span class="handover-search-toggle__action" aria-hidden="true"></span>
        </summary>
        <form method="post" class="handover-search" data-handover-search>
            <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
            <input type="hidden" name="action" value="search_tenant_handovers">
            <p class="handover-search__intro">החיפוש מוגבל למסירות דיירים ואינו מחפש בשאר האתר.</p>
            <div class="form-grid handover-search__fields">
                <label class="field">
                    <span>שם הפרויקט</span>
                    <input type="search" name="handover_project_search" value="<?= portal_h($projectTerm) ?>" maxlength="100" autocomplete="off" placeholder="לדוגמה: הראשונים 15">
                </label>
                <label class="field">
                    <span>שם הדייר</span>
                    <input type="search" name="handover_resident_search" value="<?= portal_h($residentTerm) ?>" maxlength="100" autocomplete="off" placeholder="שם פרטי או שם מלא">
                </label>
                <div class="field field--actions handover-search__actions">
                    <button type="submit" class="button button--primary">חיפוש</button>
                    <?php if ($active): ?><button type="submit" name="handover_search_clear" value="1" class="button button--secondary" formnovalidate>ניקוי</button><?php endif; ?>
                </div>
            </div>
            <p class="form-note">שמות הדיירים נשלחים לשרת בלבד, אינם נכתבים בכתובת העמוד ואינם מצטרפים למנוע החיפוש של האתר.</p>
        </form>
    </details>

    <?php if ($active && isset($outcome['error'])): ?>
        <div class="alert alert--error" role="alert"><?= portal_h((string) $outcome['error']) ?></div>
    <?php elseif ($active): ?>
        <section class="detail-card handover-search-results" aria-live="polite">
            <div class="handover-search-results__heading">
                <div><p class="eyebrow">תוצאות החיפוש</p><h2><?= portal_h((string) $total) ?> תוצאות</h2></div>
                <?php if (!empty($outcome['truncated'])): ?><span class="status-pill status-pending">מוצגות 100 הראשונות — מומלץ לצמצם את החיפוש</span><?php endif; ?>
            </div>
            <?php if ($results === []): ?>
                <div class="empty-cell">לא נמצאו דיירים התואמים לחיפוש.</div>
            <?php else: ?>
                <div class="table-wrap"><table class="records-table">
                    <thead><tr><th>פרויקט</th><th>בניין</th><th>דירה</th><th>שם הדייר</th><th></th></tr></thead>
                    <tbody>
                    <?php foreach ($results as $candidate): ?>
                        <?php
                        $params = [
                            'tab' => 'handovers',
                            'handover_project' => (string) ($candidate['project_id'] ?? ''),
                            'handover_resident' => (string) ($candidate['item_id'] ?? ''),
                        ];
                        if ((string) ($candidate['building'] ?? '') !== '') {
                            $params['handover_building'] = (string) $candidate['building'];
                        }
                        ?>
                        <tr>
                            <td><?= portal_h($candidate['project_title'] ?? '') ?></td>
                            <td><?= portal_h($candidate['building'] ?? '—') ?></td>
                            <td><?= portal_h($candidate['apartment'] ?? '') ?></td>
                            <td><strong><?= portal_h($candidate['name'] ?? '') ?></strong></td>
                            <td><a class="button button--secondary button--small" href="<?= portal_h(portal_url($params)) ?>">פתיחת טופס המסירה</a></td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table></div>
            <?php endif; ?>
        </section>
    <?php endif;
}

function portal_render_tenant_handover_form(array $user, array $projects, string $projectId, array $residents, string $building, ?array $resident, array $search, array $searchOutcome): void
{
    $buildings = [];
    foreach ($residents as $candidate) {
        $candidateBuilding = trim((string) ($candidate['building'] ?? ''));
        if ($candidateBuilding !== '') {
            $buildings[$candidateBuilding] = true;
        }
    }
    $buildings = array_keys($buildings);
    usort($buildings, 'strnatcasecmp');
    if ($building !== '' && !in_array($building, $buildings, true)) {
        $building = '';
    }
    $residentId = (string) ($resident['item_id'] ?? '');
    ?>
    <section class="page-heading page-heading--compact">
        <div>
            <p class="eyebrow">מסירה מהשטח</p>
            <h1>מסירת מערכת בית חכם לדייר</h1>
            <p>הדיירים נטענים בזמן אמת מ-Monday. פרטי לקוח ותמונות נשמרים רק באחסון הפרטי של אזור העובדים.</p>
        </div>
    </section>

    <?php portal_render_tenant_handover_search($search, $searchOutcome); ?>

    <form method="get" class="detail-card form-grid handover-selector" data-handover-selector autocomplete="off">
        <input type="hidden" name="tab" value="handovers">
        <label class="field">
            <span>פרויקט <b>*</b></span>
            <select name="handover_project" data-handover-autosubmit required>
                <option value="">בחירת קבוצה מ-Monday</option>
                <?php foreach ($projects as $project): ?>
                    <option value="<?= portal_h($project['id']) ?>" <?= $projectId === $project['id'] ? 'selected' : '' ?>><?= portal_h($project['title']) ?></option>
                <?php endforeach; ?>
            </select>
        </label>
        <?php if ($projectId !== '' && $buildings !== []): ?>
            <label class="field">
                <span>בניין (סינון)</span>
                <select name="handover_building" data-handover-autosubmit>
                    <option value="">כל הבניינים</option>
                    <?php foreach ($buildings as $option): ?><option value="<?= portal_h($option) ?>" <?= $building === $option ? 'selected' : '' ?>>בניין <?= portal_h($option) ?></option><?php endforeach; ?>
                </select>
            </label>
        <?php endif; ?>
        <?php if ($projectId !== '' && $residents !== []): ?>
            <label class="field">
                <span>דייר / דירה <b>*</b></span>
                <select name="handover_resident" data-handover-autosubmit required>
                    <option value="">בחירת דייר</option>
                    <?php foreach ($residents as $candidate): ?>
                        <?php if ($building !== '' && (string) $candidate['building'] !== $building) { continue; } ?>
                        <option value="<?= portal_h($candidate['item_id']) ?>" <?= $residentId === $candidate['item_id'] ? 'selected' : '' ?>><?= $building === '' && (string) $candidate['building'] !== '' ? 'בניין ' . portal_h($candidate['building']) . ' · ' : '' ?>דירה <?= portal_h($candidate['apartment']) ?> · <?= portal_h($candidate['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </label>
            <div class="field field--actions"><button type="submit" class="button button--secondary">טעינת טופס המסירה</button></div>
        <?php endif; ?>
    </form>

    <?php if ($projectId !== '' && $residents === []): ?>
        <div class="alert alert--info">לא נמצאו בקבוצת הפרויקט דיירים עם מספר דירה מקושר.</div>
    <?php endif; ?>

    <?php if ($resident === null): ?>
        <section class="detail-card handover-awaiting-card" aria-live="polite">
            <p class="eyebrow">שלב 2</p>
            <h2>פרטי המסירה למילוי הטכנאי</h2>
            <p>לאחר בחירת פרויקט, בניין ודירה ייפתח כאן מיד הטופס המלא. אין צורך ללחוץ על כפתור נוסף.</p>
            <div class="handover-field-preview" aria-label="השדות שיופיעו בטופס">
                <span>סטטוס המסירה</span><span>תאריך מסירה</span><span>מיקום וסוג קונטרולר</span>
                <span>כמויות, סוגים ומיקומי מפסקים</span><span>מפסק 24V לתריס כלוא</span><span>חיבור למזגן</span>
                <span>דוד והערות</span>
                <span>פרטי הטכנאי</span><span>שני צילומי חובה</span><span>סיום ושליחה</span>
            </div>
        </section>
        <?php return; ?>
    <?php endif; ?>
    <?php $credentials = portal_handover_credentials($resident); $profile = portal_employee_profile($user); ?>
    <section class="detail-card handover-resident-card">
        <h2>פרטי הדייר ופרטי הכניסה</h2>
        <div class="detail-grid">
            <div class="detail-item"><span>דייר</span><strong><?= portal_h($resident['name']) ?></strong></div>
            <div class="detail-item"><span>בניין ודירה</span><strong><?= portal_h($resident['building'] !== '' ? 'בניין ' . $resident['building'] . ' · דירה ' . $resident['apartment'] : 'דירה ' . $resident['apartment']) ?></strong></div>
            <div class="detail-item"><span>טלפון</span><strong dir="ltr"><?= portal_h($resident['phone'] ?: 'חסר ב-Monday') ?></strong></div>
            <div class="detail-item"><span>דוא״ל</span><strong dir="ltr"><?= portal_h($resident['email'] ?: 'חסר — פרטי הכניסה ינותבו לתמיכה') ?></strong></div>
            <div class="detail-item credential-item"><span>שם משתמש</span><strong dir="ltr"><?= portal_h($credentials['username']) ?></strong></div>
            <div class="detail-item credential-item"><span>סיסמה ראשונית</span><strong dir="ltr"><?= portal_h($credentials['password'] ?: 'חסר מספר טלפון') ?></strong></div>
        </div>
        <p class="form-note">הפרטים נשלפו בצד השרת ואינם נכתבים בכתובת העמוד. אין להעביר אותם לגורם שאינו הדייר.</p>
    </section>

    <form method="post" enctype="multipart/form-data" class="detail-card form-grid" id="tenant-handover-form" data-handover-form>
        <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
        <input type="hidden" name="action" value="submit_tenant_handover">
        <input type="hidden" name="handover_submission_token" value="<?= portal_h(portal_handover_submission_token()) ?>">
        <input type="hidden" name="handover_project_id" value="<?= portal_h($projectId) ?>">
        <input type="hidden" name="handover_resident_id" value="<?= portal_h($resident['item_id']) ?>">
        <div class="field--full handover-form-heading"><p class="eyebrow">שלב 2</p><h2>פרטי המסירה למילוי הטכנאי</h2><p>כל השדות בטופס הם שדות חובה. מלאו את מצב ההתקנה, צרפו את שני הצילומים וסיימו בפעולת שמירה ושליחה אחת.</p></div>
        <label class="field">
            <span>סטטוס המסירה <b>*</b></span>
            <select name="handover_ready" required>
                <option value="">בחירה</option>
                <option value="delivered_with_app_link">נמסר עם קישור לאפליקציה</option>
                <option value="completed_without_app_link">הסתיים ללא קישור לאפליקציה</option>
                <option value="ready_for_delivery">מוכן למסירה</option>
                <option value="not_ready_return_required">לא מוכן — יש לחזור</option>
            </select>
        </label>
        <label class="field"><span>תאריך מסירה <b>*</b></span><input type="date" name="handover_date" value="<?= portal_h(date('Y-m-d')) ?>" required></label>
        <label class="field">
            <span>מיקום קונטרולר <b>*</b></span>
            <select name="handover_controller_location" data-handover-location required>
                <option value="">בחירה</option><option value="communications_cabinet">ארון תקשורת</option><option value="developer_rep">אחראי הפרויקט מטעם היזם</option><option value="ifeel">בחברת I Feel</option><option value="other">אחר</option>
            </select>
        </label>
        <label class="field" data-handover-location-other hidden><span>מיקום אחר <b>*</b></span><input type="text" name="handover_controller_location_other" maxlength="300"></label>
        <label class="field"><span>קונטרולר <b>*</b></span><select name="handover_controller" required><option value="">בחירה</option><option value="raspberry_pi">רספברי פיי</option><option value="ava_hab">AVA-HAB</option></select></label>
        <label class="field"><span>אייקונים במפסק <b>*</b></span><select name="handover_icons" required><option value="">בחירה</option><option value="done">בוצע</option><option value="not_done">לא בוצע</option><option value="partial">חלקי</option></select></label>
        <label class="field">
            <span>כמות מפסקי 9 <b>*</b></span>
            <input type="number" name="handover_switch_9_count" value="1" min="1" max="50" step="1" inputmode="numeric" data-handover-switch-9-count required>
        </label>
        <div class="field--full handover-switch-9-units" data-handover-switch-9-units>
            <fieldset class="handover-switch-9-unit" data-handover-switch-9-unit>
                <legend data-handover-switch-9-legend>מפסק 9 מס׳ 1</legend>
                <div class="handover-switch-9-unit__fields">
                    <label class="field"><span>סוג מפסק 9 <b>*</b></span><select name="handover_switch_9_configuration_1" data-handover-switch-9-configuration required><option value="">בחירה</option><option value="light_9">9 לתאורה בלבד</option><option value="shutter_1_light_4">תריס אחד ו-4 תאורות</option><option value="shutter_2_light_2">2 תריסים ו-2 תאורות</option><option value="shutter_3">3 תריסים</option></select></label>
                    <label class="field"><span>מיקום מפסק 9 <b>*</b></span><input type="text" name="handover_switch_9_location_1" maxlength="300" data-handover-switch-9-location required></label>
                </div>
            </fieldset>
        </div>
        <template data-handover-switch-9-template>
            <fieldset class="handover-switch-9-unit" data-handover-switch-9-unit>
                <legend data-handover-switch-9-legend></legend>
                <div class="handover-switch-9-unit__fields">
                    <label class="field"><span>סוג מפסק 9 <b>*</b></span><select data-handover-switch-9-configuration required><option value="">בחירה</option><option value="light_9">9 לתאורה בלבד</option><option value="shutter_1_light_4">תריס אחד ו-4 תאורות</option><option value="shutter_2_light_2">2 תריסים ו-2 תאורות</option><option value="shutter_3">3 תריסים</option></select></label>
                    <label class="field"><span>מיקום מפסק 9 <b>*</b></span><input type="text" maxlength="300" data-handover-switch-9-location required></label>
                </div>
            </fieldset>
        </template>
        <label class="field">
            <span>כמות מפסקי תאורה <b>*</b></span>
            <input type="number" name="handover_light_switch_count" min="0" max="99" step="1" inputmode="numeric" data-handover-component-count="light" required>
        </label>
        <label class="field" data-handover-component-location="light" hidden><span>מיקומי מפסקי תאורה <b>*</b></span><input type="text" name="handover_light_switch_location" maxlength="300"></label>
        <label class="field">
            <span>כמות מפסקי תריס <b>*</b></span>
            <input type="number" name="handover_shutter_switch_count" min="0" max="99" step="1" inputmode="numeric" data-handover-component-count="shutter" required>
        </label>
        <label class="field" data-handover-component-location="shutter" hidden><span>מיקומי מפסקי תריס <b>*</b></span><input type="text" name="handover_shutter_switch_location" maxlength="300"></label>
        <label class="field">
            <span>מפסק 24V לתריס כלוא <b>*</b></span>
            <select name="handover_captive_shutter_24v" required>
                <option value="">בחירה</option>
                <option value="installed_activated">יש והופעל</option>
                <option value="installed_not_activated">יש ולא הופעל</option>
                <option value="not_in_project">אין בפרויקט</option>
            </select>
        </label>
        <label class="field">
            <span>חיבור למזגן <b>*</b></span>
            <select name="handover_hvac_connection" required>
                <option value="">בחירה</option>
                <option value="none">אין חיבור למזגן</option>
                <option value="ir">חיבור באמצעות IR</option>
                <option value="dry_contact_panel_9">חיבור באמצעות מגע יבש מפאנל 9</option>
                <option value="micromodule">חיבור באמצעות מיקרומודול</option>
            </select>
        </label>
        <label class="field">
            <span>דוד <b>*</b></span>
            <select name="handover_boiler" required>
                <option value="">בחירה</option>
                <option value="avatto">AVATTO</option>
                <option value="domex">DOMEX</option>
                <option value="none">אין</option>
                <option value="switcher">סוויטשר</option>
            </select>
        </label>
        <label class="field field--full"><span>הערות <b>*</b></span><textarea name="handover_notes" rows="4" maxlength="3000" placeholder="אם אין הערות, יש לכתוב: אין" required></textarea></label>
        <div class="field"><span>שם הטכנאי <b>*</b></span><input type="text" value="<?= portal_h($profile['name'] ?? $user['display_name'] ?? '') ?>" readonly></div>
        <div class="field"><span>דוא״ל הטכנאי <b>*</b></span><input type="email" value="<?= portal_h($user['email'] ?? '') ?>" readonly dir="ltr"></div>
        <div class="field field--full">
            <span>שני צילומי חובה <b>*</b></span>
            <div class="receipt-actions">
                <label class="receipt-action receipt-action--camera"><span class="receipt-action__icon" aria-hidden="true">📷</span><strong>צילום הקונטרולר *</strong><input class="receipt-input" type="file" name="handover_controller_photo" accept="image/*" capture="environment" required></label>
                <label class="receipt-action receipt-action--camera"><span class="receipt-action__icon" aria-hidden="true">📷</span><strong>צילום מפסק 9 עם האייקונים *</strong><input class="receipt-input" type="file" name="handover_switch_photo" accept="image/*" capture="environment" required></label>
            </div>
            <p class="form-note">התמונות נשמרות מחוץ ל-public_html ומצורפות רק למייל הפנימי.</p>
        </div>
        <div class="field--full submit-bar"><div><strong>פעולה אחת: שמירה ושליחה</strong><span>הנתונים ייטענו שוב מ-Monday לפני השמירה.</span></div><button type="submit" class="button button--primary" data-handover-submit <?= $credentials['password'] === '' ? 'disabled' : '' ?>>סיום ושליחה</button></div>
    </form>
    <?php
}

function portal_render_tenant_handovers(array $user, ?array $flash): void
{
    portal_render_flash($flash);
    $projectId = trim((string) ($_GET['handover_project'] ?? ''));
    $building = trim((string) ($_GET['handover_building'] ?? ''));
    $residentId = trim((string) ($_GET['handover_resident'] ?? ''));
    $projects = [];
    $residents = [];
    $resident = null;
    $search = portal_handover_search_state();
    $searchOutcome = ['results' => [], 'total' => 0, 'truncated' => false];
    try {
        $projects = portal_handover_projects();
        if ($projectId !== '') {
            $residents = portal_handover_residents($projectId);
            if ($residentId !== '') {
                $resident = portal_handover_resident($projectId, $residentId);
                if ($building !== '' && (string) $resident['building'] !== $building) {
                    $building = (string) $resident['building'];
                }
            }
        }
    } catch (Throwable $error) {
        error_log('[i-feel tenant handovers] render_failed');
        ?><div class="alert alert--error" role="alert"><?= portal_h($error->getMessage()) ?></div><?php
    }
    if (!empty($search['active']) && $projects !== []) {
        try {
            $searchOutcome = portal_handover_search_residents(
                $projects,
                (string) ($search['project'] ?? ''),
                (string) ($search['resident'] ?? '')
            );
        } catch (Throwable $error) {
            error_log('[i-feel tenant handovers] search_failed');
            $searchOutcome = [
                'results' => [],
                'total' => 0,
                'truncated' => false,
                'error' => 'לא ניתן להשלים כרגע את החיפוש ב-Monday. נסו שוב בעוד רגע.',
            ];
        }
    }

    portal_render_tenant_handover_form($user, $projects, $projectId, $residents, $building, $resident, $search, $searchOutcome);
    $history = portal_handovers_for_user($user);
    ?>
    <section class="detail-card">
        <h2><?= ($user['role'] ?? '') === 'admin' ? 'מסירות אחרונות' : 'המסירות שלי' ?></h2>
        <div class="table-wrap"><table class="records-table">
            <thead><tr><th>מספר</th><th>תאריך</th><th>פרויקט</th><th>דירה</th><th>טכנאי</th><th>דוא״ל</th></tr></thead>
            <tbody>
            <?php if ($history === []): ?><tr><td colspan="6" class="empty-cell">עדיין לא נשמרו מסירות.</td></tr><?php endif; ?>
            <?php foreach (array_slice($history, 0, 20) as $handover): ?>
                <tr>
                    <td><code><?= portal_h($handover['id'] ?? '') ?></code></td>
                    <td><?= portal_h($handover['details']['date'] ?? '') ?></td>
                    <td><?= portal_h($handover['resident']['project_title'] ?? '') ?></td>
                    <td><?= portal_h($handover['resident']['apartment'] ?? '') ?></td>
                    <td><?= portal_h($handover['technician']['name'] ?? '') ?></td>
                    <td><?= (($handover['notifications']['resident']['status'] ?? '') === 'sent') ? 'נשלח לדייר' : ((($handover['notifications']['resident']['status'] ?? '') === 'skipped') ? 'אין דוא״ל' : 'דורש טיפול') ?></td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table></div>
    </section>
    <?php
}
