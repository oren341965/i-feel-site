<?php
declare(strict_types=1);

function portal_closeout_data(): array
{
    return portal_json_read(portal_storage_root() . '/installation-closeout.json');
}

function portal_closeout_email(array $user): ?string
{
    $method = $user['auth_method'] ?? '';
    if (!in_array($method, ['company_email_code', 'company_email_magic_link', 'remembered_device'], true)) {
        return null;
    }
    return portal_normalize_company_email((string) ($user['email'] ?? ''));
}

function portal_closeout_is_manager(array $user): bool
{
    return ($user['role'] ?? '') === 'admin' && portal_closeout_email($user) !== null;
}

function portal_closeout_projects(array $user): array
{
    $email = portal_closeout_email($user);
    if ($email === null) {
        return [];
    }
    $projects = portal_closeout_data()['projects'] ?? [];
    return array_filter($projects, static fn(array $project): bool =>
        portal_closeout_is_manager($user) || in_array($email, $project['viewers'] ?? [], true)
    );
}

function portal_closeout_can_view(array $user): bool
{
    return portal_closeout_is_manager($user) || portal_closeout_projects($user) !== [];
}

function portal_closeout_url_is_allowed(string $url): bool
{
    return parse_url($url, PHP_URL_SCHEME) === 'https' &&
        in_array(parse_url($url, PHP_URL_HOST), [
            'i-feel.monday.com', 'www.dropbox.com', 'docs.google.com', 'mail.google.com', 'chatgpt.com',
        ], true);
}

function portal_closeout_merge_snapshot(array $current, array $snapshot): array
{
    $projects = $snapshot['projects'] ?? null;
    $date = $snapshot['snapshot_date'] ?? null;
    if (!is_string($date) || !portal_valid_date($date) || !is_array($projects) || $projects === []) {
        throw new InvalidArgumentException('קובץ תמונת המצב אינו תקין.');
    }

    $current['projects'] = array_values($current['projects'] ?? []);
    $positions = array_column($current['projects'], 'monday');
    $seen = [];
    foreach ($projects as $project) {
        if (!is_array($project) || !is_string($project['monday'] ?? null) ||
            !preg_match('~^https://i-feel\.monday\.com/boards/[0-9]+/pulses/[0-9]+$~D', $project['monday']) ||
            isset($seen[$project['monday']])) {
            throw new InvalidArgumentException('כרטיס Monday חסר, כפול או לא תקין.');
        }
        $seen[$project['monday']] = true;
        foreach (['name', 'date', 'schedule', 'evidence'] as $field) {
            if (!is_string($project[$field] ?? null) || trim($project[$field]) === '') {
                throw new InvalidArgumentException('חסר תיאור בכרטיס פרויקט.');
            }
        }
        foreach (['tasks' => 3, 'docs' => 2, 'equipment' => 3, 'checks' => 2] as $field => $width) {
            if (!is_array($project[$field] ?? null)) {
                throw new InvalidArgumentException('חסרה רשימת בקרה בכרטיס.');
            }
            foreach ($project[$field] as $row) {
                if (!is_array($row) || array_keys($row) !== range(0, $width - 1) ||
                    count(array_filter($row, 'is_string')) !== $width ||
                    ($field === 'docs' && !portal_closeout_url_is_allowed($row[1]))) {
                    throw new InvalidArgumentException('שורת בקרה או קישור מקור אינם תקינים.');
                }
            }
        }
        $index = array_search($project['monday'], $positions, true);
        if ($index === false) {
            $index = count($current['projects']);
            $current['projects'][] = ['viewers' => []];
        }
        $existing = $current['projects'][$index];
        if (($existing['snapshot_date'] ?? '') > $date) {
            throw new InvalidArgumentException('הקובץ ישן מהגרסה הקיימת של אחד הפרויקטים.');
        }
        foreach (['monday', 'name', 'date', 'schedule', 'evidence', 'tasks', 'docs', 'equipment', 'checks'] as $field) {
            $existing[$field] = $project[$field];
        }
        if (array_key_exists('economics', $project)) {
            if (!is_array($project['economics'])) {
                throw new InvalidArgumentException('נתוני כלכליות אינם תקינים.');
            }
            $existing['economics'] = portal_closeout_validate_economics($project['economics']);
        }
        $existing['snapshot_date'] = $date;
        $current['projects'][$index] = $existing;
    }
    return $current;
}

function portal_closeout_import(array $user): void
{
    portal_verify_csrf();
    if (!portal_closeout_is_manager($user)) {
        http_response_code(403);
        exit;
    }
    try {
        $file = $_FILES['closeout_snapshot'] ?? [];
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK ||
            !is_string($file['tmp_name'] ?? null) || !is_uploaded_file($file['tmp_name']) ||
            ($file['size'] ?? 0) > 512 * 1024) {
            throw new InvalidArgumentException('יש לבחור קובץ JSON תקין עד 512 ק״ב.');
        }
        $raw = file_get_contents($file['tmp_name']);
        $snapshot = $raw === false ? null : json_decode($raw, true);
        if (!is_array($snapshot)) {
            throw new InvalidArgumentException('לא ניתן לקרוא את קובץ ה־JSON.');
        }
        $path = portal_storage_root() . '/installation-closeout.json';
        portal_ensure_directory(dirname($path));
        $lock = fopen($path . '.lock', 'c');
        if ($lock === false) {
            throw new RuntimeException('לא ניתן לנעול את תמונת המצב.');
        }
        try {
            if (!flock($lock, LOCK_EX)) {
                throw new RuntimeException('לא ניתן לנעול את תמונת המצב.');
            }
            $current = portal_closeout_data();
            if (is_file($path) && !isset($current['projects'])) {
                throw new RuntimeException('תמונת המצב הקיימת דורשת בדיקה.');
            }
            portal_json_write($path, portal_closeout_merge_snapshot($current, $snapshot));
        } finally {
            fclose($lock);
        }
        $_SESSION['closeout_notice'] = 'תמונת המצב עודכנה.';
    } catch (InvalidArgumentException $error) {
        $_SESSION['closeout_notice'] = $error->getMessage();
    } catch (RuntimeException $error) {
        $_SESSION['closeout_notice'] = 'השמירה נכשלה. יש לבדוק את אחסון הפורטל.';
    }
    portal_redirect(['tab' => 'closeout']);
}

function portal_render_closeout(array $user): void
{
    $projects = portal_closeout_projects($user);
    $selected = (string) ($_GET['project'] ?? '');
    $notice = $_SESSION['closeout_notice'] ?? '';
    unset($_SESSION['closeout_notice']);
    ?>
    <section class="page-heading"><div>
        <h1>השלמות התקנה</h1>
        <p>תמונת מצב ידנית · העדכון וקישורי המקור מוצגים בכל כרטיס</p>
    </div></section>
    <?php if ($notice !== ''): ?><p role="status"><?= portal_h($notice) ?></p><?php endif; ?>
    <?php if (portal_closeout_is_manager($user)): ?>
        <details class="detail-card">
            <summary>טעינת תמונת מצב למנהלים</summary>
            <form method="post" enctype="multipart/form-data" action="<?= portal_h(portal_url(['tab' => 'closeout'])) ?>">
                <input type="hidden" name="action" value="import_closeout_snapshot">
                <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
                <label for="closeout-snapshot">קובץ תמונת מצב (JSON)</label>
                <input id="closeout-snapshot" type="file" name="closeout_snapshot" accept=".json,application/json" required>
                <button type="submit">טעינת תמונת מצב</button>
            </form>
        </details>
    <?php endif; ?>
    <details class="detail-card">
        <summary>מתי אפשר לשבץ ולסגור?</summary>
        <ol>
            <li>מאמתים היקף והקצאה ב־Monday.</li>
            <li>מאמתים מוכנות אתר, ציוד, גישה ומתקין לפני השיבוץ.</li>
            <li>מצרפים דוח ביקור עם ביצוע ובדיקות.</li>
            <li>מתעדים מסירה ומאשר סגירה. חסם פתוח נשאר במעקב.</li>
        </ol>
    </details>
    <?php if ($projects === []): ?>
        <p>טרם נטענה תמונת מצב לפרויקטים.</p>
    <?php else: ?>
        <form method="get" class="detail-card closeout-picker">
            <input type="hidden" name="tab" value="closeout">
            <label for="closeout-project">בחירת לקוח</label>
            <select id="closeout-project" name="project">
                <option value="">כל הלקוחות (<?= count($projects) ?>)</option>
                <?php foreach ($projects as $index => $project): ?>
                    <option value="<?= portal_h((string) $index) ?>"<?= $selected === (string) $index ? ' selected' : '' ?>><?= portal_h($project['name']) ?></option>
                <?php endforeach; ?>
            </select>
            <button type="submit">הצגה</button>
        </form>
    <?php endif; ?>
    <?php foreach ($projects as $index => $project): ?>
        <?php if ($selected !== '' && $selected !== (string) $index) { continue; } ?>
        <details class="detail-card closeout-project"<?= $selected !== '' ? ' open' : '' ?>>
            <summary>
                <strong><?= portal_h($project['name']) ?></strong>
                <span><?= count($project['tasks'] ?? []) ?> משימות ובדיקות</span>
            </summary>
            <p><?= portal_h($project['date'] ?? '') ?></p>
            <p><strong>ביקור:</strong> <?= portal_h($project['schedule'] ?? 'טרם אומת') ?></p>
            <p><strong>מה ידוע:</strong> <?= portal_h($project['evidence'] ?? 'טרם אומת') ?></p>
            <p><strong>תמונת מצב:</strong> <?= portal_h($project['snapshot_date'] ?? 'מועד לא ידוע') ?></p>
            <?php if (portal_closeout_is_manager($user)): ?>
                <?php portal_render_closeout_economics($project['economics'] ?? []); ?>
            <?php endif; ?>
            <h3>משימות ופעולות הבאות</h3>
            <ul class="closeout-rows">
                <?php foreach ($project['tasks'] ?? [] as [$owner, $task, $status]): ?>
                    <li><strong><?= portal_h($task) ?></strong><span><?= portal_h($owner) ?> (מוצע) · <?= portal_h($status) ?></span></li>
                <?php endforeach; ?>
            </ul>
            <details>
                <summary>ציוד ואימות אספקה</summary>
                <?php if (empty($project['equipment'])): ?><p>טרם אומתה רשימת ציוד נפרדת. ראו משימות ומסמכי מקור.</p><?php endif; ?>
                <ul class="closeout-rows">
                    <?php foreach ($project['equipment'] ?? [] as [$item, $quantity, $state]): ?>
                        <li><strong><?= portal_h($item) ?></strong><span>נדרש: <?= portal_h($quantity) ?> · <?= portal_h($state) ?></span></li>
                    <?php endforeach; ?>
                </ul>
            </details>
            <details>
                <summary>אימות ומסירה</summary>
                <ul class="closeout-rows">
                    <?php foreach ($project['checks'] ?? [] as [$check, $state]): ?>
                        <li><strong><?= portal_h($check) ?></strong><span><?= portal_h($state) ?></span></li>
                    <?php endforeach; ?>
                </ul>
            </details>
            <details>
                <summary>מסמכים ומקורות</summary>
                <?php
                $links = $project['docs'] ?? [];
                array_unshift($links, ['כרטיס ב־Monday', $project['monday'] ?? '']);
                foreach ($links as [$label, $url]):
                    if (!portal_closeout_url_is_allowed($url)) { continue; }
                    ?><a class="closeout-link" href="<?= portal_h($url) ?>" target="_blank" rel="noopener noreferrer"><?= portal_h($label) ?></a><?php
                endforeach;
                ?>
            </details>
        </details>
    <?php endforeach; ?>
    <?php if ($selected !== '' && !array_key_exists($selected, $projects)): ?><p>הכרטיס המבוקש אינו זמין.</p><?php endif; ?>
    <?php
}

const IFEEL_CLOSEOUT_WORKDAY_COST = 2400;

function portal_closeout_validate_economics(array $data): array
{
    $clean = [];
    foreach (['contract_reported', 'receipts_reported', 'balance_reported', 'contract_net',
        'delivered_equipment_cost', 'actual_worker_days', 'remaining_equipment_cost',
        'planned_worker_days', 'other_cost', 'remaining_other_cost'] as $field) {
        if (isset($data[$field])) {
            $value = portal_project_verified_cost($data[$field]);
            if ($value === null) {
                throw new InvalidArgumentException('סכום או ימי עבודה אינם תקינים.');
            }
            $clean[$field] = $value;
        }
    }

    foreach (['payment_note', 'schedule_note'] as $field) {
        if (isset($data[$field])) {
            if (!is_string($data[$field]) || strlen($data[$field]) > 2000) {
                throw new InvalidArgumentException('הערת כלכליות אינה תקינה.');
            }
            $clean[$field] = $data[$field];
        }
    }

    foreach (['payment_url', 'schedule_url', 'equipment_cost_url', 'actual_work_url', 'remaining_cost_url', 'other_cost_url'] as $field) {
        if (isset($data[$field])) {
            if (!is_string($data[$field]) || !portal_closeout_url_is_allowed($data[$field])) {
                throw new InvalidArgumentException('קישור כלכליות אינו תקין.');
            }
            $clean[$field] = $data[$field];
        }
    }

    return $clean;
}

function portal_closeout_economics(array $data): array
{
    $verified = static fn(string $field, string $source): ?float =>
        portal_closeout_url_is_allowed((string) ($data[$source] ?? ''))
            ? portal_project_verified_cost($data[$field] ?? null)
            : null;
    $contract = $verified('contract_net', 'payment_url');
    $equipment = $verified('delivered_equipment_cost', 'equipment_cost_url');
    $days = $verified('actual_worker_days', 'actual_work_url');
    $labor = $days === null ? null : $days * IFEEL_CLOSEOUT_WORKDAY_COST;
    $actual = portal_project_cost_total([$equipment, $labor, $verified('other_cost', 'other_cost_url')]);
    $remainingDays = $verified('planned_worker_days', 'schedule_url');
    $plannedLabor = $remainingDays === null ? null : $remainingDays * IFEEL_CLOSEOUT_WORKDAY_COST;
    $forecast = portal_project_cost_total([
        $actual, $plannedLabor, $verified('remaining_equipment_cost', 'remaining_cost_url'),
        $verified('remaining_other_cost', 'remaining_cost_url'),
    ]);
    return [
        'equipment' => $equipment, 'days' => $days, 'labor' => $labor, 'actual' => $actual,
        'planned_labor' => $plannedLabor,
        'margin' => $contract !== null && $actual !== null ? round($contract - $actual, 2) : null,
        'forecast_margin' => $contract !== null && $forecast !== null ? round($contract - $forecast, 2) : null,
    ];
}

function portal_render_closeout_economics(array $data): void
{
    $result = portal_closeout_economics($data);
    $money = static fn($n): string => $n === null ? 'חסר אימות' : number_format((float) $n, 2) . ' ₪';
    ?>
    <details>
        <summary>כלכליות הפרויקט</summary>
        <p>2,400 ₪ ליום עובד, כולל העמסות, עלויות היקפיות ורכב. שיבוץ מתוכנן מוצג בנפרד מביצוע.</p>
        <ul class="closeout-rows">
            <?php foreach ([
                'סכום פרויקט לפי סיכום תשלום' => $data['contract_reported'] ?? null,
                'תקבולים לפי הסיכום' => $data['receipts_reported'] ?? null,
                'יתרה לפי הסיכום' => $data['balance_reported'] ?? null,
                'הכנסה מאומתת לפני מע״מ' => $data['contract_net'] ?? null,
                'עלות ציוד שסופק' => $result['equipment'],
                'עלות ימי עבודה שבוצעו' => $result['labor'],
                'עלות כוללת עד כה' => $result['actual'],
                'עלות עבודה מתוכננת להשלמה' => $result['planned_labor'],
                'יתרת הכנסה חוזית לאחר עלות עד כה' => $result['margin'],
                'רווח או הפסד חזוי בסיום' => $result['forecast_margin'],
            ] as $label => $amount): ?>
                <li><strong><?= portal_h($label) ?></strong><span><?= portal_h($money($amount)) ?></span></li>
            <?php endforeach; ?>
        </ul>
        <?php if ($result['days'] !== null): ?><p><?= portal_h((string) $result['days']) ?> ימי עובד מאומתים</p><?php endif; ?>
        <?php if (!empty($data['payment_note'])): ?><p><?= portal_h($data['payment_note']) ?></p><?php endif; ?>
        <?php if (!empty($data['schedule_note'])): ?><p><?= portal_h($data['schedule_note']) ?></p><?php endif; ?>
        <?php foreach (['payment_url' => 'סיכום לתשלום', 'schedule_url' => 'שיבוץ בלו״ז',
            'equipment_cost_url' => 'עלות ציוד מאומתת', 'actual_work_url' => 'דיווחי ביצוע',
            'remaining_cost_url' => 'עלויות להשלמה', 'other_cost_url' => 'עלויות נוספות'] as $field => $label): ?>
            <?php if (portal_closeout_url_is_allowed((string) ($data[$field] ?? ''))): ?>
                <a class="closeout-link" href="<?= portal_h($data[$field]) ?>" target="_blank" rel="noopener noreferrer"><?= portal_h($label) ?></a>
            <?php endif; ?>
        <?php endforeach; ?>
    </details>
    <?php
}

function portal_project_verified_cost($value): ?float
{
    return is_numeric($value) && is_finite((float) $value) && (float) $value >= 0 ? (float) $value : null;
}

function portal_project_cost_total(array $amounts): ?float
{
    $costs = array_map('portal_project_verified_cost', $amounts);
    return in_array(null, $costs, true) ? null : array_sum($costs);
}

function portal_render_project_economics(array $reports): void
{
    $projects = portal_closeout_data()['projects'] ?? [];
    ?>
    <section class="detail-card">
        <h2>כלכליות פרויקטים</h2>
        <p>ימי התקנה הם תאריכים ייחודיים בדיווחים ששויכו לפרויקט. נתון חסר מסומן בנפרד.</p>
        <div class="table-wrap"><table class="records-table">
            <thead><tr><th>פרויקט</th><th>ימי התקנה מדווחים</th><th>קריאות בשנה הראשונה</th><th>תקציב עלות</th><th>עלות ישירה</th><th>עלות עקיפה</th><th>סטייה תפעולית</th><th>עלות מימון</th><th>תקבולים בפועל</th><th>רווח לאחר מימון</th></tr></thead>
            <tbody>
            <?php foreach ($projects as $project):
                $days = [];
                $calls = [];
                $unmatchedService = false;
                $handover = (string) ($project['verified_handover_date'] ?? '');
                $yearEnd = portal_valid_date($handover) ? (new DateTimeImmutable($handover))->modify('+1 year')->format('Y-m-d') : null;
                foreach ($reports as $report) {
                    $name = trim((string) ($report['customer_project'] ?? ''));
                    $date = (string) ($report['work_date'] ?? '');
                    if (!portal_valid_date($date) || !in_array($name, $project['verified_report_names'] ?? [], true)) {
                        continue;
                    }
                    if (($report['type'] ?? '') === 'installation') {
                        $days[$date] = true;
                    }
                    if (($report['type'] ?? '') === 'service' && $yearEnd !== null && $date >= $handover && $date < $yearEnd) {
                        $callId = $project['verified_service_call_ids'][$report['id'] ?? ''] ?? null;
                        if (is_string($callId) && $callId !== '') {
                            $calls[$callId] = true;
                        } else {
                            $unmatchedService = true;
                        }
                    }
                }
                $budget = $project['approved_cost_budget'] ?? null;
                $direct = $project['verified_direct_cost'] ?? null;
                $visitOverhead = $project['verified_visit_overhead_by_visit_id'] ?? null;
                $support = $project['verified_support_labor_cost'] ?? [];
                $indirect = portal_project_cost_total([
                    is_array($visitOverhead) && ($project['visit_overhead_coverage_verified'] ?? false) === true
                        ? portal_project_cost_total($visitOverhead)
                        : null,
                    $support['ora'] ?? null,
                    $support['eli'] ?? null,
                    $support['sales'] ?? null,
                    $project['verified_allocated_fixed_cost'] ?? null,
                ]);
                $operatingCost = portal_project_cost_total([$direct, $indirect]);
                $finance = $project['verified_financing_cost'] ?? null;
                $fullCost = portal_project_cost_total([$operatingCost, $finance]);
                $revenue = $project['verified_revenue'] ?? null;
                $receipts = $project['verified_customer_receipts'] ?? null;
                $coverageVerified = ($project['first_year_coverage_verified'] ?? false) === true;
                $callCount = $yearEnd !== null && !$unmatchedService && $coverageVerified ? count($calls) : null;
                $money = static fn($amount): string => is_numeric($amount) ? number_format((float) $amount, 2) . ' ₪' : 'חסר';
                ?>
                <tr>
                    <td><?= portal_h($project['name']) ?></td>
                    <td><?= $days === [] ? 'אין דיווחים משויכים' : count($days) ?></td>
                    <td><?= $callCount ?? 'חסר אימות' ?></td>
                    <td><?= portal_h($money($budget)) ?></td>
                    <td><?= portal_h($money($direct)) ?></td>
                    <td><?= portal_h($money($indirect)) ?></td>
                    <td><?= portal_h($money($operatingCost !== null && is_numeric($budget) ? $operatingCost - $budget : null)) ?></td>
                    <td><?= portal_h($money($finance)) ?></td>
                    <td><?= portal_h($money($receipts)) ?></td>
                    <td><?= portal_h($money($fullCost !== null && is_numeric($revenue) ? $revenue - $fullCost : null)) ?></td>
                </tr>
            <?php endforeach; ?>
            <?php if ($projects === []): ?><tr><td colspan="10">טרם נטענו פרויקטים.</td></tr><?php endif; ?>
            </tbody>
        </table></div>
    </section>
    <?php
}
