<?php
declare(strict_types=1);

function portal_format_datetime(string $value): string
{
    if ($value === '') {
        return '';
    }
    try {
        return (new DateTimeImmutable($value))->setTimezone(new DateTimeZone('Asia/Jerusalem'))->format('d/m/Y H:i');
    } catch (Throwable $error) {
        return $value;
    }
}

function payment_method_label(string $value): string
{
    $labels = [
        'company_card' => '׳›׳¨׳˜׳™׳¡ ׳—׳‘׳¨׳”',
        'private_card' => '׳›׳¨׳˜׳™׳¡ ׳₪׳¨׳˜׳™',
        'cash' => '׳׳–׳•׳׳',
        'bank_transfer' => '׳”׳¢׳‘׳¨׳” ׳‘׳ ׳§׳׳™׳×',
        'other' => '׳׳—׳¨',
    ];
    return $labels[$value] ?? $value;
}

function travel_category_label(string $value): string
{
    $labels = [
        'flight' => '׳˜׳™׳¡׳•׳× ׳•׳›׳¨׳˜׳™׳¡׳™ ׳˜׳™׳¡׳”',
        'hotel' => '׳׳׳•׳ / ׳׳™׳ ׳”',
        'meals' => '׳׳•׳›׳ ׳•׳׳¨׳•׳—׳•׳×',
        'car_rental' => '׳”׳©׳›׳¨׳× ׳¨׳›׳‘',
        'local_transport' => '׳׳•׳ ׳™׳•׳× / ׳×׳—׳‘׳•׳¨׳” ׳¦׳™׳‘׳•׳¨׳™׳× / ׳ ׳¡׳™׳¢׳•׳×',
        'parking' => '׳—׳ ׳™׳”',
        'communications' => '׳×׳§׳©׳•׳¨׳× / ׳¡׳׳•׳׳¨',
        'insurance_visa' => '׳‘׳™׳˜׳•׳— / ׳׳©׳¨׳”',
        'conference' => '׳›׳ ׳¡ / ׳×׳¢׳¨׳•׳›׳”',
        'purchases' => '׳¨׳›׳™׳©׳•׳× ׳•׳§׳ ׳™׳•׳×',
        'baggage' => '׳›׳‘׳•׳“׳” ׳•׳×׳•׳¡׳₪׳•׳× ׳˜׳™׳¡׳”',
        'tips' => '׳˜׳™׳₪׳™׳ ׳•׳©׳™׳¨׳•׳×',
        'other' => '׳׳—׳¨',
    ];
    return $labels[$value] ?? $value;
}

function vehicle_category_label(string $value): string
{
    $labels = [
        'fuel' => '׳“׳׳§',
        'service' => '׳˜׳™׳₪׳•׳ ׳×׳§׳•׳₪׳×׳™',
        'repair' => '׳×׳™׳§׳•׳',
        'parking' => '׳—׳ ׳™׳”',
        'toll' => '׳›׳‘׳™׳©׳™ ׳׳’׳¨׳”',
        'insurance' => '׳‘׳™׳˜׳•׳—',
        'licensing' => '׳¨׳™׳©׳•׳™ / ׳˜׳¡׳˜',
        'washing' => '׳©׳˜׳™׳₪׳”',
        'rental' => '׳”׳©׳›׳¨׳× ׳¨׳›׳‘',
        'transport' => '׳׳•׳ ׳™׳× / ׳×׳—׳‘׳•׳¨׳”',
        'other' => '׳׳—׳¨',
    ];
    return $labels[$value] ?? $value;
}

function general_category_label(string $value): string
{
    $labels = [
        'office' => '׳׳©׳¨׳“ ׳•׳¦׳™׳•׳“ ׳׳©׳¨׳“׳™',
        'equipment' => '׳¦׳™׳•׳“ ׳•׳›׳׳™׳',
        'supplier' => '׳¡׳₪׳§ / ׳§׳‘׳׳ ׳׳©׳ ׳”',
        'hospitality' => '׳׳™׳¨׳•׳— ׳•׳›׳™׳‘׳•׳“',
        'shipping' => '׳׳©׳׳•׳— ׳•׳©׳׳™׳—׳•׳™׳•׳×',
        'parking' => '׳—׳ ׳™׳” ׳•׳ ׳¡׳™׳¢׳•׳×',
        'software' => '׳×׳•׳›׳ ׳” ׳•׳׳ ׳•׳™׳™׳',
        'training' => '׳”׳“׳¨׳›׳” / ׳›׳ ׳¡',
        'other' => '׳׳—׳¨',
    ];
    return $labels[$value] ?? $value;
}

function portal_nav(string $tab, array $user): void
{
    ?>
    <nav class="tabs" aria-label="׳ ׳™׳•׳•׳˜ ׳׳–׳•׳¨ ׳¢׳•׳‘׳“׳™׳">
        <a href="<?= portal_h(portal_url(['tab' => 'new'])) ?>" class="tab<?= $tab === 'new' ? ' is-active' : '' ?>">׳“׳™׳•׳•׳— ׳—׳“׳©</a>
        <a href="<?= portal_h(portal_url(['tab' => 'history'])) ?>" class="tab<?= $tab === 'history' ? ' is-active' : '' ?>">׳”׳”׳•׳¦׳׳•׳× ׳©׳׳™</a>
        <a href="<?= portal_h(portal_url(['tab' => 'profile'])) ?>" class="tab<?= $tab === 'profile' ? ' is-active' : '' ?>">׳”׳₪׳¨׳˜׳™׳ ׳•׳”׳¨׳›׳‘ ׳©׳׳™</a>
        <?php if (portal_vehicles_for_employee($user) !== []): ?>
            <a href="<?= portal_h(portal_url(['tab' => 'my_vehicle'])) ?>" class="tab tab--vehicle<?= $tab === 'my_vehicle' ? ' is-active' : '' ?>">נ™ ׳”׳¨׳›׳‘ ׳©׳׳™</a>
        <?php endif; ?>
        <a href="<?= portal_h(portal_installation_form_url()) ?>" class="tab" target="_blank" rel="noopener noreferrer">׳¡׳™׳•׳ ׳”׳×׳§׳ ׳” ג†—</a>
        <?php if (($user['role'] ?? '') === 'admin'): ?>
            <a href="<?= portal_h(portal_url(['tab' => 'reports'])) ?>" class="tab<?= $tab === 'reports' ? ' is-active' : '' ?>">׳“׳™׳•׳•׳—׳™׳ ׳•׳׳¡׳׳›׳™׳</a>
            <a href="<?= portal_h(portal_url(['tab' => 'employees'])) ?>" class="tab<?= $tab === 'employees' ? ' is-active' : '' ?>">׳¢׳•׳‘׳“׳™׳ ׳•׳™׳׳™ ׳”׳•׳׳“׳×</a>
            <a href="<?= portal_h(portal_url(['tab' => 'vehicles'])) ?>" class="tab<?= $tab === 'vehicles' ? ' is-active' : '' ?>">׳¨׳›׳‘׳™ ׳¢׳•׳‘׳“׳™׳</a>
            <a href="<?= portal_h(portal_url(['tab' => 'work_stats'])) ?>" class="tab<?= $tab === 'work_stats' ? ' is-active' : '' ?>">׳¡׳˜׳˜׳™׳¡׳˜׳™׳§׳× ׳¢׳‘׳•׳“׳•׳×</a>
        <?php endif; ?>
    </nav>
    <?php
}

