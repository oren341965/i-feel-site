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

function portal_render_closeout(array $user): void
{
    ?>
    <section class="page-heading"><div><h1>השלמות התקנה</h1><p>תמונת מצב מתועדת ל־7.11.2026. שיבוץ בלו״ז מסמן תכנון, ודוח שטח מתעד ביצוע.</p></div></section>
    <?php
    $projects = portal_closeout_projects($user);
    if ($projects === []) {
        ?><p>טרם נטענה תמונת מצב לפרויקטים.</p><?php
    }
    foreach ($projects as $project) {
        ?>
        <section class="detail-card">
            <h2><?= portal_h($project['name']) ?></h2>
            <p><?= portal_h($project['date'] ?? '') ?></p>
            <p><?= portal_h($project['schedule'] ?? '') ?></p>
            <p><?= portal_h($project['evidence'] ?? '') ?></p>
            <ul>
            <?php foreach ($project['tasks'] ?? [] as [$owner, $task, $status]): ?>
                <li><strong><?= portal_h($owner) ?></strong> · <?= portal_h($task) ?> · <?= portal_h($status) ?></li>
            <?php endforeach; ?>
            </ul>
            <?php
            $links = $project['docs'] ?? [];
            $links[] = ['כרטיס ב־Monday', $project['monday'] ?? ''];
            foreach ($links as [$label, $url]):
                if (!in_array(parse_url($url, PHP_URL_HOST), ['i-feel.monday.com', 'www.dropbox.com'], true) ||
                    parse_url($url, PHP_URL_SCHEME) !== 'https') {
                    continue;
                }
                ?><p><a href="<?= portal_h($url) ?>" target="_blank" rel="noopener noreferrer"><?= portal_h($label) ?></a></p><?php
            endforeach;
            ?>
        </section>
        <?php
    }
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
