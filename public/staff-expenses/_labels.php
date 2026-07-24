<?php
declare(strict_types=1);

function portal_format_datetime(string $value): string
{
    if ($value === '') {
        return '';
    }
    try {
        return (new DateTimeImmutable($value))->setTimezone(new DateTimeZone('Asia/Jerusalem'))->format('d/m/Y H:i');
    } catch (Throwable) {
        return $value;
    }
}

function payment_method_label(string $value): string
{
    return match ($value) {
        'company_card' => 'כרטיס חברה',
        'private_card' => 'כרטיס פרטי',
        'cash' => 'מזומן',
        'bank_transfer' => 'העברה בנקאית',
        'other' => 'אחר',
        default => $value,
    };
}

function travel_category_label(string $value): string
{
    return match ($value) {
        'flight' => 'טיסות וכרטיסי טיסה',
        'hotel' => 'מלון / לינה',
        'meals' => 'אוכל וארוחות',
        'car_rental' => 'השכרת רכב',
        'local_transport' => 'מוניות / תחבורה ציבורית / נסיעות',
        'parking' => 'חניה',
        'communications' => 'תקשורת / סלולר',
        'insurance_visa' => 'ביטוח / אשרה',
        'conference' => 'כנס / תערוכה',
        'purchases' => 'רכישות וקניות',
        'baggage' => 'כבודה ותוספות טיסה',
        'tips' => 'טיפים ושירות',
        'other' => 'אחר',
        default => $value,
    };
}

function vehicle_category_label(string $value): string
{
    return match ($value) {
        'fuel' => 'דלק',
        'service' => 'טיפול תקופתי',
        'repair' => 'תיקון',
        'parking' => 'חניה',
        'toll' => 'כבישי אגרה',
        'insurance' => 'ביטוח',
        'licensing' => 'רישוי / טסט',
        'washing' => 'שטיפה',
        'rental' => 'השכרת רכב',
        'transport' => 'מונית / תחבורה',
        'other' => 'אחר',
        default => $value,
    };
}

function general_category_label(string $value): string
{
    return match ($value) {
        'office' => 'משרד וציוד משרדי',
        'equipment' => 'ציוד וכלים',
        'supplier' => 'ספק / קבלן משנה',
        'hospitality' => 'אירוח וכיבוד',
        'shipping' => 'משלוח ושליחויות',
        'parking' => 'חניה ונסיעות',
        'software' => 'תוכנה ומנויים',
        'training' => 'הדרכה / כנס',
        'other' => 'אחר',
        default => $value,
    };
}

function portal_nav(string $tab, array $user): void
{
    ?>
    <nav class="tabs" aria-label="ניווט אזור עובדים">
        <a href="<?= portal_h(portal_url(['tab' => 'new'])) ?>" class="tab<?= $tab === 'new' ? ' is-active' : '' ?>">דיווח חדש</a>
        <a href="<?= portal_h(portal_url(['tab' => 'history'])) ?>" class="tab<?= $tab === 'history' ? ' is-active' : '' ?>">ההוצאות שלי</a>
        <a href="<?= portal_h(portal_url(['tab' => 'profile'])) ?>" class="tab<?= $tab === 'profile' ? ' is-active' : '' ?>">הפרטים והרכב שלי</a>
        <a href="<?= portal_h(portal_url(['tab' => 'work'])) ?>" class="tab<?= $tab === 'work' ? ' is-active' : '' ?>">סיום עבודה</a>
        <?php if (($user['role'] ?? '') === 'admin'): ?>
            <a href="<?= portal_h(portal_url(['tab' => 'reports'])) ?>" class="tab<?= $tab === 'reports' ? ' is-active' : '' ?>">דיווחים ומסמכים</a>
            <a href="<?= portal_h(portal_url(['tab' => 'employees'])) ?>" class="tab<?= $tab === 'employees' ? ' is-active' : '' ?>">עובדים וימי הולדת</a>
            <a href="<?= portal_h(portal_url(['tab' => 'vehicles'])) ?>" class="tab<?= $tab === 'vehicles' ? ' is-active' : '' ?>">רכבי עובדים</a>
            <a href="<?= portal_h(portal_url(['tab' => 'work_stats'])) ?>" class="tab<?= $tab === 'work_stats' ? ' is-active' : '' ?>">סטטיסטיקת עבודות</a>
        <?php endif; ?>
    </nav>
    <?php
}
