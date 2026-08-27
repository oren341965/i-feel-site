<?php
declare(strict_types=1);

/**
 * I Feel · אזור עובדים · טופס פיקוח באתר
 * ---------------------------------------------------------------
 * טופס שדה לביקורת פיקוח בפרויקט: תשתיות, ביצוע וגמר/מסירה.
 * כל דוח נשמר בתיק הלקוח לפי מפתח לקוח, נשלח למחלקת פרויקטים
 * ובאופן אופציונלי גם ללקוח עצמו.
 */

const IFEEL_SUPERVISION_MAX_FINDINGS = 8;

function portal_supervision_internal_recipients(): array
{
    $configured = trim((string) getenv('EXPENSE_PORTAL_SUPERVISION_RECIPIENTS'));
    if ($configured === '') {
        $candidates = ['cheyne@i-feel.co.il'];
    } else {
        $split = preg_split('/[\s,;]+/', $configured);
        $candidates = is_array($split) ? $split : [];
    }
    $recipients = [];
    foreach ($candidates as $candidate) {
        $email = portal_normalize_company_email((string) $candidate);
        if ($email !== null) {
            $recipients[$email] = true;
        }
    }
    if ($recipients === []) {
        $recipients['cheyne@i-feel.co.il'] = true;
    }
    return array_keys($recipients);
}

function portal_supervision_types(): array
{
    return [
        'infrastructure' => 'פיקוח תשתיות',
        'execution' => 'פיקוח ביצוע והתקנה',
        'completion' => 'פיקוח גמר ומסירה',
        'follow_up' => 'ביקורת חוזרת (מעקב ליקויים)',
    ];
}

function portal_supervision_type_label(string $type): string
{
    return portal_supervision_types()[$type] ?? 'ביקורת פיקוח';
}

function portal_supervision_status_labels(): array
{
    return [
        'not_checked' => 'לא נבדק',
        'ok' => 'תקין',
        'fix' => 'דורש תיקון',
        'na' => 'לא רלוונטי',
    ];
}

function portal_supervision_status_label(string $status): string
{
    return portal_supervision_status_labels()[$status] ?? 'לא נבדק';
}

function portal_supervision_severity_labels(): array
{
    return [
        'low' => 'נמוכה',
        'medium' => 'בינונית',
        'high' => 'גבוהה',
        'blocker' => 'חוסם המשך עבודה',
    ];
}

function portal_supervision_severity_label(string $severity): string
{
    return portal_supervision_severity_labels()[$severity] ?? 'בינונית';
}

function portal_supervision_result_labels(): array
{
    return [
        'approved' => 'אושר להמשך עבודה',
        'approved_with_remarks' => 'אושר בהערות',
        'not_approved' => 'לא אושר — נדרש תיקון וביקורת חוזרת',
    ];
}

function portal_supervision_result_label(string $result): string
{
    return portal_supervision_result_labels()[$result] ?? 'אושר בהערות';
}

/**
 * הצ'קליסט המלא, מסודר לפי עולמות מערכת ולא לפי סוג ביקורת — כך שאותו טופס
 * משרת פיקוח תשתיות, פיקוח ביצוע וביקורת גמר. כל פריט מקבל מפתח קבוע שנשמר
 * בארכיון, כדי שדוחות ישנים יישארו קריאים גם אחרי שינוי נוסח.
 * הסעיפים מבוססים על הליקויים החוזרים שנמצאו בפיקוחים בשטח.
 */
function portal_supervision_checklist(): array
{
    $groups = portal_supervision_checklist_source();
    $normalized = [];
    foreach ($groups as $title => $group) {
        $normalized[$title] = [
            'track' => (string) ($group['track'] ?? 'all'),
            'items' => is_array($group['items'] ?? null) ? $group['items'] : [],
        ];
    }
    return $normalized;
}

function portal_supervision_track_labels(): array
{
    return [
        'knx' => 'KNX קווי (Siemens)',
        'zwave' => 'אלחוטי — Z-Wave',
        'hybrid' => 'משולב — KNX + אלחוטי',
    ];
}

function portal_supervision_track_label(string $track): string
{
    return portal_supervision_track_labels()[$track] ?? 'לא נקבע';
}

function portal_supervision_as_made_url(): string
{
    return 'https://i-feel.co.il/as-made/';
}

function portal_supervision_protocol_url(): string
{
    return 'https://i-feel.co.il/right-infrastructure-for-a-smart-home/';
}

function portal_supervision_choice_labels(): array
{
    return [
        'intercom_color' => [
            '' => 'לא נקבע',
            'black' => 'שחור',
            'silver' => 'כסף',
            'other' => 'אחר — ראה הערות',
        ],
        'switch_color' => [
            '' => 'לא נקבע',
            'white' => 'לבן (סטנדרט)',
            'black' => 'שחור',
            'silver' => 'כסף',
            'change' => 'דורש שינוי מהתכנית',
        ],
        'speaker_color' => [
            '' => 'לא נקבע',
            'white' => 'לבן (סטנדרט)',
            'black' => 'שחור',
            'change' => 'דורש שינוי מהתכנית',
        ],
        'boxes_status' => [
            '' => 'לא נבדק',
            'supplied' => 'סופקו על ידי i-feel',
            'ordered' => 'הוזמנו וממתינות',
            'needed' => 'נדרש להזמין',
            'wrong' => 'הותקנו קופסאות לא מתאימות',
        ],
        'knx_detector' => [
            '' => 'לא נבדק',
            'installed' => 'קיים באתר',
            'missing' => 'לא קיים',
            'required' => 'נדרש להוסיף',
        ],
    ];
}

function portal_supervision_choice_label(string $field, string $value): string
{
    $map = portal_supervision_choice_labels()[$field] ?? [];
    return $map[$value] ?? 'לא נקבע';
}

function portal_supervision_valid_choice(string $field, string $value): bool
{
    return array_key_exists($value, portal_supervision_choice_labels()[$field] ?? []);
}

function portal_supervision_dropbox_link(string $value): string
{
    $value = trim($value);
    if ($value === '') {
        return '';
    }
    if (filter_var($value, FILTER_VALIDATE_URL) === false || !str_starts_with(portal_lower($value), 'https://')) {
        throw new RuntimeException('קישור התכניות חייב להיות כתובת https תקינה.');
    }
    return portal_substr($value, 0, 500);
}

function portal_supervision_checklist_source(): array
{
    return [
        'גבהים ומיקומי אביזרים' => ['track' => 'all', 'items' => [
            'height_switches_140' => 'כל המפסקים בבית בגובה 140 ס״מ (למעט אביזרי הכניסה הייעודיים)',
            'height_smart_center' => 'מרכז חשמל חכם / מסך 10 אינץ׳ בכניסה — 140 ס״מ',
            'height_intercom' => 'מרכז אינטרקום — 120 ס״מ',
            'height_underfloor' => 'מרכז חימום תת-רצפתי — 100 ס״מ',
            'height_stairwell' => 'מפסק חדר מדרגות — 80 ס״מ',
            'height_alarm_keypad' => 'הכנה לקיבורד אזעקה ליד דלת הכניסה, בגובה הנכון',
            'height_uniform' => 'המפסקים מיושרים בגובה אחיד ובקו אחד',
        ]],
        'קופסאות שקיעה ומפסקים' => ['track' => 'all', 'items' => [
            'box_round_55' => 'קופסאות עגולות 55 מ״מ למפסקי KNX',
            'box_screen_flush' => 'קופסת שקיעה ייעודית למסך KNX, מותקנת בקו אפס עם הקיר',
            'box_screen_lead_time' => 'קופסת המסך הוזמנה מ-i-feel לפחות שבוע מראש',
            'box_no_extra_switch' => 'אין מפסק מיותר ליד מסך KNX (המסך משמש כמפסק)',
            'box_stairwell_2btn' => 'מפסק 2 לחצנים בעלייה למדרגות',
            'box_type_per_zone' => 'סוג המפסק בכל אזור (KNX קווי / אלחוטי) תואם לתכנית',
            'box_depth' => 'עומק הקופסאות מאפשר התקנת מפסק KNX עם המודול מאחור',
        ]],
        'חשמל חכם — לוח ובקרים' => ['track' => 'all', 'items' => [
            'panel_all_loads' => 'כל ההפעלות מגיעות ללוח החשמל ולא נעצרות במפסק מקומי',
            'panel_shutters_to_board' => 'התריסים מגיעים ללוח (כולל תריסים בחדרי ילדים)',
            'panel_lighting_circuits' => 'מספר מעגלי התאורה בכל חדר תואם לתכנית',
            'panel_controller_space' => 'נשמר מקום לבקר KNX — בקר 24 הפעלות = 18 ס״מ / 12 מקומות',
            'panel_free_space' => 'יש מקום פנוי ומרווח אוורור למודולים בלוח',
            'panel_feed_earth' => 'הזנות, מפסקים ראשיים והארקה תקינים',
            'panel_marking' => 'הלוח מסומן, הקווים מזוהים והמודולים מקובעים',
            'panel_boiler_heater' => 'דוד, תנור אמבטיה וחימום תת-רצפתי מגיעים ללוח ומסומנים',
        ]],
        'כבילת KNX ותשתית בוס' => ['track' => 'knx', 'items' => [
            'knx_green_continuous' => 'כבל KNX ירוק רציף מהלוח לכל נקודת מפסק',
            'knx_daisy_chain' => 'המפסקים משורשרים בכבל KNX ירוק (ללא חיבורי ביניים חשופים)',
            'knx_screen_cables' => 'לכל נקודת מסך הוכנו כבל KNX ירוק וכבל רשת',
            'knx_separation' => 'הפרדה מלאה בין חשמל לתקשורת ולבוס',
            'knx_conduits' => 'שרוולים וצנרת לפי תכנית i-feel וניתנים למשיכה',
            'knx_plan_match' => 'נקודות החשמל והמפסקים תואמות לתכנית ולמקרא הסמלים',
        ]],
        'ארון תקשורת וריכוזים' => ['track' => 'all', 'items' => [
            'rack_depth' => 'עומק ארון התקשורת מספיק לציוד + מקום לכבלים מאחור',
            'rack_ventilation' => 'לארון התקשורת יש אוורור מספק',
            'rack_power_network' => 'נקודת חשמל ונקודת רשת פעילות בארון',
            'rack_floor_link' => 'חיבור בין ריכוזי התקשורת בקומות השונות בוצע (צנרת וכבילה)',
            'rack_all_cables' => 'כל כבילות האודיו, הרשת, הטלוויזיות והמצלמות מגיעות לריכוז המתוכנן',
            'rack_arm_location' => 'מיקום ARM / בקר מרכזי מתואם, נגיש ומאוורר',
            'rack_labeling' => 'הכבילה בריכוז מסומנת לפי חדרים ומערכות',
        ]],
        'אודיו, טלוויזיות ומולטירום' => ['track' => 'all', 'items' => [
            'audio_ceiling_prep' => 'הכנות לרמקולי תקרה בוצעו בכל אזור לפני סגירת גבס',
            'audio_dining_kitchen' => 'הכנות לרמקולים בפינת האוכל ובמטבח',
            'audio_bath_speaker' => 'הכנה לרמקול באמבטיה לפני סגירת התקרה',
            'audio_sub_prep' => 'ההכנה לסאב וופר אומתה (ולא הכנה אחרת)',
            'audio_outdoor' => 'רמקולי חוץ — גובה ומיקום היציאות נכונים',
            'audio_pool_speakers' => 'הכנות לרמקולי בריכה / רמקולי סלע אומתו מול התכנית',
            'audio_to_rack' => 'כל כבילות הרמקולים מגיעות לריכוז / ארון התקשורת',
            'av_niche_depth' => 'נישה או מזנון AV — עומק פנימי נטו של 50 ס״מ לפחות לציוד',
            'av_niche_ventilation' => 'למזנון AV יש פתחי אוורור וגישה לשירות עתידי',
            'tv_two_conduits' => 'מכל נקודת טלוויזיה הועברו שני צינורות עד לריכוז',
            'tv_extender' => 'כשלא ניתן למשוך HDMI/קוברה עד לריכוז — תוכנן פתרון Extender מתאים',
            'av_float_prep' => 'הכנות מיוחדות (עגלה צפה, בריכה, פרגולה) אומתו בשטח',
        ]],
        'מצלמות ואזעקה' => ['track' => 'all', 'items' => [
            'sec_entry_detector' => 'הכנה לגלאי בכניסה לבית',
            'sec_entry_camera' => 'הכנה למצלמה מחוץ לדלת הכניסה',
            'sec_outdoor_cameras' => 'הכנות למצלמות חוץ ובריכה לפי התכנית',
            'sec_alarm_wiring' => 'כבילת אזעקה, גלאים וסירנה לפי התכנית',
            'sec_to_rack' => 'כבילת המצלמות והאזעקה מגיעה לריכוז',
        ]],
        'תקשורת ורשת' => ['track' => 'all', 'items' => [
            'net_tv_point' => 'נקודת רשת ייעודית לכל טלוויזיה',
            'net_ap_point' => 'נקודת רשת נפרדת לכל Access Point (בנוסף לנקודת הטלוויזיה)',
            'net_coverage' => 'פריסת נקודות ה-AP מכסה את כל הקומות',
            'net_cat_marking' => 'כבילת CAT מסומנת ומגיעה לפאנל בארון',
        ]],
        'אינטרקום' => ['track' => 'all', 'items' => [
            'intercom_prep' => 'הכנה לאינטרקום פנים וחוץ לפי התכנית',
            'intercom_center' => 'מרכז האינטרקום בגובה 120 ס״מ',
            'intercom_to_rack' => 'כבילת האינטרקום מגיעה לריכוז',
        ]],
        'מיזוג וחימום' => ['track' => 'all', 'items' => [
            'hvac_control_points' => 'נקודות בקרה ותקשורת לכל יחידת מיזוג',
            'hvac_underfloor' => 'חימום תת-רצפתי — הפעלות מגיעות ללוח ומרכז בגובה הנכון',
            'hvac_access' => 'גישה לשירות ליחידות ולמדפי הבקרה',
        ]],
        'שינויים מהתכנית ותיעוד' => ['track' => 'all', 'items' => [
            'change_documented' => 'כל שינוי מהתכנית המקורית תועד ונמסר ל-i-feel',
            'change_conduits' => 'בוצעה צנרת נוספת לכל שינוי שאושר',
            'change_asmade' => 'תכנית מעודכנת / AS-MADE נמסרה בסיום השלב',
            'change_owner_approval' => 'הלקוח או האדריכל אישרו את השינוי',
        ]],
        'מסלול אלחוטי — Z-Wave' => ['track' => 'zwave', 'items' => [
            'zw_deep_boxes' => 'קופסאות שקיעה עמוקות בכל נקודת מפסק — מקום למודול מאחורי המפסק',
            'zw_neutral' => 'חוט אפס (0) הגיע לכל קופסת מפסק — בלעדיו המודול האלחוטי לא עובד',
            'zw_neutral_shutters' => 'אפס גם בקופסאות התריסים ובנקודות המיוחדות',
            'zw_box_width' => 'קופסאות רחבות / כפולות היכן שנדרשים שני מודולים',
            'zw_protocol' => 'הביצוע תואם לפרוטוקול התשתית של i-feel שפורסם באתר',
            'zw_hub_location' => 'מיקום ההאב / הראוטר מרכזי ומאוורר, לא בארון מתכת סגור',
            'zw_coverage' => 'כיסוי אלחוטי נבדק בקצוות הבית — קומות, ממ״ד, חוץ',
            'zw_loads' => 'סוגי העומסים (LED, שנאים, מנועים) מתאימים למודולים שנבחרו',
        ]],
        'ביקורת חוזרת ומעקב' => ['track' => 'all', 'items' => [
            'follow_previous' => 'ליקויים מהביקורת הקודמת תוקנו',
            'follow_quality' => 'איכות התיקון תקינה',
            'follow_new' => 'לא נוצרו ליקויים חדשים בעקבות התיקון',
            'follow_schedule' => 'עמידה בלוח הזמנים שנקבע',
        ]],
    ];
}

function portal_supervision_checklist_labels(): array
{
    $labels = [];
    foreach (portal_supervision_checklist() as $group) {
        foreach (($group['items'] ?? []) as $key => $label) {
            $labels[$key] = $label;
        }
    }
    return $labels;
}

function portal_supervision_customer_key_slug(string $key): string
{
    $slug = preg_replace('/[^A-Za-z0-9_-]+/', '-', $key) ?? '';
    $slug = trim((string) $slug, '-');
    $slug = portal_substr($slug, 0, 48);
    if ($slug === '' || $slug === '-') {
        return 'k' . substr(hash('sha256', $key), 0, 16);
    }
    return $slug;
}

function portal_new_supervision_id(): string
{
    return 'SV-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(6));
}

function portal_supervision_valid_id(string $reportId): bool
{
    return preg_match('/^SV-\d{8}-\d{6}-[a-f0-9]{12}$/', $reportId) === 1;
}

function portal_supervision_root(): string
{
    return portal_storage_root() . DIRECTORY_SEPARATOR . 'supervision';
}

function portal_supervision_dir(string $customerSlug, string $reportId): string
{
    if (!portal_supervision_valid_id($reportId)) {
        throw new InvalidArgumentException('מספר דוח הפיקוח אינו תקין.');
    }
    if (preg_match('/^[A-Za-z0-9_-]{1,48}$/', $customerSlug) !== 1) {
        throw new InvalidArgumentException('מפתח הלקוח אינו תקין.');
    }
    return portal_supervision_root()
        . DIRECTORY_SEPARATOR . $customerSlug
        . DIRECTORY_SEPARATOR . $reportId;
}

function portal_supervision_file(string $customerSlug, string $reportId): string
{
    return portal_supervision_dir($customerSlug, $reportId) . DIRECTORY_SEPARATOR . 'metadata.json';
}

function portal_save_supervision(array $report): void
{
    portal_json_write(
        portal_supervision_file(
            (string) ($report['customer_key_slug'] ?? ''),
            (string) ($report['id'] ?? '')
        ),
        $report
    );
}

function portal_all_supervisions(): array
{
    $pattern = portal_supervision_root()
        . DIRECTORY_SEPARATOR . '*'
        . DIRECTORY_SEPARATOR . '*'
        . DIRECTORY_SEPARATOR . 'metadata.json';
    $reports = [];
    foreach (glob($pattern) ?: [] as $path) {
        $report = portal_json_read($path);
        if ($report !== [] && isset($report['id'])) {
            $reports[] = $report;
        }
    }
    usort($reports, static fn(array $a, array $b): int =>
        strcmp((string) ($b['created_at'] ?? ''), (string) ($a['created_at'] ?? '')));
    return $reports;
}

function portal_load_supervision(string $reportId): ?array
{
    if (!portal_supervision_valid_id($reportId)) {
        return null;
    }
    foreach (portal_all_supervisions() as $report) {
        if ((string) ($report['id'] ?? '') === $reportId) {
            return $report;
        }
    }
    return null;
}

function portal_supervisions_for_user(array $user): array
{
    if (($user['role'] ?? '') === 'admin') {
        return portal_all_supervisions();
    }
    $email = portal_normalize_company_email((string) ($user['email'] ?? '')) ?? '';
    return array_values(array_filter(
        portal_all_supervisions(),
        static fn(array $report): bool =>
            $email !== ''
            && hash_equals($email, portal_normalize_company_email((string) ($report['inspector']['email'] ?? '')) ?? '')
    ));
}

function portal_supervision_email_attachments(array $report): array
{
    $attachments = [];
    $slug = (string) ($report['customer_key_slug'] ?? '');
    $reportId = (string) ($report['id'] ?? '');
    $items = $report['attachments'] ?? [];
    if (is_array($report['signature'] ?? null)) {
        $items[] = $report['signature'];
    }
    foreach ($items as $attachment) {
        if (!is_array($attachment)) {
            continue;
        }
        $storageName = basename((string) ($attachment['storage_name'] ?? ''));
        if ($storageName === '' || $storageName !== (string) ($attachment['storage_name'] ?? '')) {
            continue;
        }
        $path = portal_supervision_dir($slug, $reportId)
            . DIRECTORY_SEPARATOR . 'files'
            . DIRECTORY_SEPARATOR . $storageName;
        if (!is_file($path)) {
            continue;
        }
        $attachments[] = [
            'path' => $path,
            'name' => (string) ($attachment['original_name'] ?? 'supervision-photo'),
            'mime' => (string) ($attachment['mime'] ?? 'application/octet-stream'),
            'size' => (int) ($attachment['size'] ?? filesize($path)),
        ];
    }
    return $attachments;
}

function portal_supervision_findings_lines(array $report): array
{
    $lines = [];
    $index = 0;
    foreach (($report['findings'] ?? []) as $finding) {
        if (!is_array($finding)) {
            continue;
        }
        $index++;
        $lines[] = $index . '. ' . (string) ($finding['description'] ?? '')
            . ' | חומרה: ' . portal_supervision_severity_label((string) ($finding['severity'] ?? 'medium'))
            . ' | אחראי: ' . ((string) ($finding['owner'] ?? '') !== '' ? (string) $finding['owner'] : 'לא שויך')
            . ' | יעד: ' . ((string) ($finding['due_date'] ?? '') !== '' ? (string) $finding['due_date'] : 'לא נקבע');
    }
    if ($lines === []) {
        $lines[] = 'לא נרשמו ליקויים בביקורת זו.';
    }
    return $lines;
}

function portal_supervision_checklist_lines(array $report): array
{
    $labels = portal_supervision_checklist_labels();
    $lines = [];
    foreach (($report['checklist'] ?? []) as $key => $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $status = (string) ($entry['status'] ?? 'not_checked');
        if ($status === 'not_checked') {
            continue;
        }
        $note = trim((string) ($entry['note'] ?? ''));
        $lines[] = '· ' . ($labels[(string) $key] ?? (string) $key)
            . ' — ' . portal_supervision_status_label($status)
            . ($note !== '' ? ' (' . $note . ')' : '');
    }
    if ($lines === []) {
        $lines[] = 'לא סומנו סעיפים בצ׳קליסט.';
    }
    return $lines;
}

function portal_supervision_internal_body(array $report): string
{
    $inspector = is_array($report['inspector'] ?? null) ? $report['inspector'] : [];
    $electrician = is_array($report['electrician'] ?? null) ? $report['electrician'] : [];
    $finish = is_array($report['finish'] ?? null) ? $report['finish'] : [];
    return implode("\r\n", array_merge([
        'נשמר דוח פיקוח חדש באזור עובדי I Feel.',
        '',
        'מספר דוח: ' . (string) ($report['id'] ?? ''),
        'מפתח לקוח: ' . (string) ($report['customer_key'] ?? ''),
        'לקוח / פרויקט: ' . (string) ($report['customer_name'] ?? ''),
        'כתובת האתר: ' . (string) ($report['site_address'] ?? ''),
        'סוג ביקורת: ' . portal_supervision_type_label((string) ($report['type'] ?? '')),
        'מסלול מערכת: ' . portal_supervision_track_label((string) ($report['track'] ?? '')),
        'תאריך ביקורת: ' . (string) ($report['visit_date'] ?? ''),
        'שלב הפרויקט: ' . (string) ($report['project_stage'] ?? ''),
        'נוכחים: ' . (string) ($report['attendees'] ?? ''),
        'תוצאת הביקורת: ' . portal_supervision_result_label((string) ($report['result'] ?? '')),
        'ביקורת חוזרת: ' . ((string) ($report['next_visit'] ?? '') !== '' ? (string) $report['next_visit'] : 'לא נקבעה'),
        'מפקח: ' . (string) ($inspector['name'] ?? '') . ' · ' . (string) ($inspector['email'] ?? '') . ' · ' . (string) ($inspector['phone'] ?? ''),
        'חשמלאי: ' . (string) ($electrician['name'] ?? 'לא נרשם') . ' · ' . (string) ($electrician['phone'] ?? '') . ' · ' . (string) ($electrician['email'] ?? ''),
        'מפקח בנייה / נציג יזם: ' . ((string) ($report['site_supervisor'] ?? '') !== '' ? (string) $report['site_supervisor'] : 'לא נכח'),
        'הדרכה לחשמלאי: ' . (!empty($electrician['training_given']) ? 'ניתנה' : 'לא ניתנה'),
        'מסירת תכניות לחשמלאי: ' . (!empty($electrician['plans_handed']) ? 'נמסרו' : 'לא נמסרו'),
        'חתימת החשמלאי: ' . (!empty($electrician['signed']) ? 'נחתם (' . (string) ($electrician['signature_name'] ?? '') . ')' : 'לא נחתם'),
        'תיקיית Dropbox של הלקוח: ' . ((string) ($report['plans_link'] ?? '') !== '' ? (string) $report['plans_link'] : 'לא צורפה'),
        'כרטיס הלקוח ב-Monday: ' . ((string) ($report['monday']['customer_url'] ?? '') !== '' ? (string) $report['monday']['customer_url'] : 'לא קושר'),
        '',
        'גימור ואביזרים:',
        '· צבע אינטרקום: ' . portal_supervision_choice_label('intercom_color', (string) ($finish['intercom_color'] ?? '')),
        '· צבע מפסקים: ' . portal_supervision_choice_label('switch_color', (string) ($finish['switch_color'] ?? '')),
        '· צבע רמקולים: ' . portal_supervision_choice_label('speaker_color', (string) ($finish['speaker_color'] ?? '')),
        '· קופסאות שקיעה: ' . portal_supervision_choice_label('boxes_status', (string) ($finish['boxes_status'] ?? ''))
            . ((string) ($finish['boxes_count'] ?? '') !== '' ? ' (' . (string) $finish['boxes_count'] . ' יחידות)' : ''),
        '· גלאי KNX באתר: ' . portal_supervision_choice_label('knx_detector', (string) ($finish['knx_detector'] ?? '')),
        '· הערות גימור: ' . ((string) ($finish['notes'] ?? '') !== '' ? (string) $finish['notes'] : 'אין'),
        '',
        'תיקוני תכנית מהשטח:',
        ((string) ($report['plan_corrections'] ?? '') !== '' ? (string) $report['plan_corrections'] : 'אין תיקונים.'),
        '',
        'ממצאי הצ׳קליסט:',
    ], portal_supervision_checklist_lines($report), [
        '',
        'ליקויים לטיפול:',
    ], portal_supervision_findings_lines($report), [
        '',
        'שינויים מהתכנית המקורית:',
        ((string) ($report['changes'] ?? '') !== '' ? (string) $report['changes'] : 'לא דווחו שינויים.'),
        '',
        'סיכום והנחיות:',
        (string) ($report['summary'] ?? ''),
        '',
        'מספר תמונות מצורפות: ' . count($report['attachments'] ?? []),
        '',
        'I Feel · מחלקת פרויקטים',
    ]));
}

function portal_supervision_customer_body(array $report): string
{
    return implode("\r\n", array_merge([
        'שלום ' . (string) ($report['customer_name'] ?? '') . ',',
        '',
        'מצורף סיכום ביקורת הפיקוח שביצענו באתר בתאריך ' . (string) ($report['visit_date'] ?? '') . '.',
        '',
        'סוג ביקורת: ' . portal_supervision_type_label((string) ($report['type'] ?? '')),
        'כתובת האתר: ' . (string) ($report['site_address'] ?? ''),
        'תוצאת הביקורת: ' . portal_supervision_result_label((string) ($report['result'] ?? '')),
        '',
        'נושאים לטיפול:',
    ], portal_supervision_findings_lines($report), [
        '',
        ((string) ($report['changes'] ?? '') !== '' ? "שינויים מהתכנית:\r\n" . (string) $report['changes'] . "\r\n" : ''),
        'סיכום:',
        (string) ($report['summary'] ?? ''),
        '',
        ((string) ($report['next_visit'] ?? '') !== ''
            ? 'ביקורת המשך מתוכננת לתאריך ' . (string) $report['next_visit'] . '.'
            : 'ביקורת ההמשך תתואם מולכם.'),
        '',
        'בכל שאלה אנחנו זמינים.',
        'I Feel · מחלקת פרויקטים',
        'sales@i-feel.co.il · 03-5089553',
    ]));
}

function portal_supervision_customer_html(array $report): string
{
    $rows = '';
    foreach (portal_supervision_findings_lines($report) as $line) {
        $rows .= '<li style="margin-bottom:6px">' . portal_h($line) . '</li>';
    }
    return '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"></head>'
        . '<body style="margin:0;background:#f4f7fb;font-family:Arial,Heebo,sans-serif;color:#10233f">'
        . '<div style="max-width:640px;margin:24px auto;background:#fff;border-radius:16px;padding:28px">'
        . '<h1 style="font-size:22px;margin:0 0 6px">סיכום ביקורת פיקוח באתר</h1>'
        . '<p style="font-size:15px;color:#52657d;margin:0 0 18px">'
        . portal_h(portal_supervision_type_label((string) ($report['type'] ?? '')))
        . ' · ' . portal_h((string) ($report['visit_date'] ?? '')) . '</p>'
        . '<table style="width:100%;font-size:15px;border-collapse:collapse">'
        . '<tr><td style="padding:6px 0;color:#52657d">לקוח / פרויקט</td><td style="padding:6px 0"><strong>' . portal_h((string) ($report['customer_name'] ?? '')) . '</strong></td></tr>'
        . '<tr><td style="padding:6px 0;color:#52657d">כתובת האתר</td><td style="padding:6px 0">' . portal_h((string) ($report['site_address'] ?? '')) . '</td></tr>'
        . '<tr><td style="padding:6px 0;color:#52657d">תוצאת הביקורת</td><td style="padding:6px 0">' . portal_h(portal_supervision_result_label((string) ($report['result'] ?? ''))) . '</td></tr>'
        . '</table>'
        . '<h2 style="font-size:17px;margin:22px 0 8px">נושאים לטיפול</h2>'
        . '<ul style="font-size:15px;line-height:1.6;padding-inline-start:20px;margin:0">' . $rows . '</ul>'
        . '<h2 style="font-size:17px;margin:22px 0 8px">סיכום</h2>'
        . '<p style="font-size:15px;line-height:1.7;white-space:pre-line;margin:0">' . portal_h((string) ($report['summary'] ?? '')) . '</p>'
        . '<hr style="border:0;border-top:1px solid #e3e9f0;margin:24px 0">'
        . '<p style="font-size:13px;color:#6b7b90;margin:0">I Feel · מחלקת פרויקטים · sales@i-feel.co.il · 03-5089553</p>'
        . '</div></body></html>';
}

function portal_supervision_send_internal(array $report): array
{
    $recipients = portal_supervision_internal_recipients();
    $batches = portal_attachment_batches(portal_supervision_email_attachments($report));
    $subjectBase = 'דוח פיקוח · ' . (string) ($report['customer_name'] ?? '')
        . ' · ' . portal_supervision_type_label((string) ($report['type'] ?? ''));
    $body = portal_supervision_internal_body($report);
    $result = ['recipients' => $recipients, 'sent' => [], 'failed' => []];

    if ((string) getenv('IFEEL_PORTAL_TEST_MODE') === '1') {
        $result['sent'] = $recipients;
        return $result;
    }

    foreach ($recipients as $recipient) {
        $ok = true;
        foreach ($batches as $index => $batch) {
            $subject = count($batches) > 1
                ? $subjectBase . ' — תמונות ' . ($index + 1) . '/' . count($batches)
                : $subjectBase;
            if (!portal_send_mail_with_attachments($recipient, $subject, $body, $batch)) {
                $ok = false;
                break;
            }
        }
        if ($ok) {
            $result['sent'][] = $recipient;
        } else {
            $result['failed'][] = $recipient;
        }
    }
    return $result;
}

function portal_supervision_send_customer(array $report): array
{
    $email = (string) ($report['customer_email'] ?? '');
    if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        return ['recipient' => $email, 'status' => 'skipped'];
    }
    if ((string) getenv('IFEEL_PORTAL_TEST_MODE') === '1') {
        return ['recipient' => $email, 'status' => 'sent'];
    }
    $sent = portal_send_mail_with_attachments(
        $email,
        'I Feel · סיכום ביקורת פיקוח באתר — ' . (string) ($report['customer_name'] ?? ''),
        portal_supervision_customer_body($report),
        [],
        portal_supervision_customer_html($report)
    );
    return ['recipient' => $email, 'status' => $sent ? 'sent' : 'failed'];
}

function portal_supervision_save_signature(string $reportDir, string $payload): ?array
{
    $payload = trim($payload);
    if ($payload === '') {
        return null;
    }
    $prefix = 'data:image/png;base64,';
    if (!str_starts_with($payload, $prefix)) {
        throw new RuntimeException('חתימת החשמלאי לא נקלטה כראוי. יש לחתום שוב.');
    }
    $binary = base64_decode(substr($payload, strlen($prefix)), true);
    if ($binary === false || $binary === '' || strlen($binary) > 900000) {
        throw new RuntimeException('חתימת החשמלאי לא נקלטה כראוי. יש לחתום שוב.');
    }
    if (substr($binary, 0, 8) !== "\x89PNG\r\n\x1a\n") {
        throw new RuntimeException('חתימת החשמלאי לא נקלטה כראוי. יש לחתום שוב.');
    }
    $filesDir = $reportDir . DIRECTORY_SEPARATOR . 'files';
    portal_ensure_directory($filesDir);
    $storageName = bin2hex(random_bytes(16)) . '.png';
    if (file_put_contents($filesDir . DIRECTORY_SEPARATOR . $storageName, $binary) === false) {
        throw new RuntimeException('לא ניתן לשמור את חתימת החשמלאי.');
    }
    @chmod($filesDir . DIRECTORY_SEPARATOR . $storageName, 0600);
    return [
        'original_name' => 'signature.png',
        'storage_name' => $storageName,
        'mime' => 'image/png',
        'size' => strlen($binary),
    ];
}

function portal_supervision_electrician_body(array $report): string
{
    $electrician = is_array($report['electrician'] ?? null) ? $report['electrician'] : [];
    return implode("\r\n", array_merge([
        'שלום ' . (string) ($electrician['name'] ?? '') . ',',
        '',
        'מצורף סיכום ביקורת הפיקוח שביצענו באתר ' . (string) ($report['customer_name'] ?? '')
            . ' בתאריך ' . (string) ($report['visit_date'] ?? '') . '.',
        'מסלול המערכת: ' . portal_supervision_track_label((string) ($report['track'] ?? '')),
        '',
        'פרוטוקול התשתית המלא של i-feel:',
        portal_supervision_protocol_url(),
        '',
        ((string) ($report['plans_link'] ?? '') !== ''
            ? "התכניות המעודכנות:\r\n" . (string) $report['plans_link']
            : 'התכניות יישלחו בנפרד.'),
        '',
        'תיקונים ועדכונים מהשטח:',
        ((string) ($report['plan_corrections'] ?? '') !== '' ? (string) $report['plan_corrections'] : 'אין תיקונים לתכנית.'),
        '',
        'מה נדרש ממך:',
    ], portal_supervision_findings_lines($report), [
        '',
        'בסיום העבודה יש למלא את טופס ה-AS-MADE של i-feel — פירוט ההפעלות בכל בקר בלוח.',
        'הטופס ממולא אונליין ונשלח אלינו אוטומטית:',
        portal_supervision_as_made_url(),
        '',
        'בלי טופס AS-MADE מלא לא ניתן להתחיל בתכנות המערכת.',
        '',
        'I Feel · מחלקת פרויקטים',
        'sales@i-feel.co.il · 03-5089553',
    ]));
}

function portal_supervision_send_electrician(array $report): array
{
    $email = (string) ($report['electrician']['email'] ?? '');
    if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        return ['recipient' => $email, 'status' => 'skipped'];
    }
    if ((string) getenv('IFEEL_PORTAL_TEST_MODE') === '1') {
        return ['recipient' => $email, 'status' => 'sent'];
    }
    $sent = portal_send_mail_with_attachments(
        $email,
        'I Feel · סיכום פיקוח וטופס AS-MADE — ' . (string) ($report['customer_name'] ?? ''),
        portal_supervision_electrician_body($report)
    );
    return ['recipient' => $email, 'status' => $sent ? 'sent' : 'failed'];
}


/* ===================== חיבור Monday ===================== */

const IFEEL_SUPERVISION_SALES_BOARD = '2732725332';
const IFEEL_SUPERVISION_PROJECTS_BOARD = '4010423265';
const IFEEL_SUPERVISION_CUSTOMER_KEY_COLUMN = '______9';

function portal_supervision_monday_board(string $constant, string $fallback): string
{
    $value = portal_handover_config($constant, $constant, $fallback);
    return preg_match('/^\d{1,20}$/', $value) === 1 ? $value : $fallback;
}

function portal_supervision_monday_available(): bool
{
    if ((string) getenv('IFEEL_PORTAL_TEST_MODE') === '1') {
        return false;
    }
    return portal_handover_monday_token() !== '' && function_exists('curl_init');
}

function portal_supervision_monday_column(array $item, string $columnId): string
{
    foreach (($item['column_values'] ?? []) as $column) {
        if (is_array($column) && (string) ($column['id'] ?? '') === $columnId) {
            return trim((string) ($column['text'] ?? ''));
        }
    }
    return '';
}

function portal_supervision_monday_linked_ids(array $item, string $columnId): array
{
    foreach (($item['column_values'] ?? []) as $column) {
        if (is_array($column) && (string) ($column['id'] ?? '') === $columnId) {
            $ids = $column['linked_item_ids'] ?? [];
            return is_array($ids) ? array_values(array_filter(array_map('strval', $ids), static fn(string $id): bool => preg_match('/^\d{1,20}$/', $id) === 1)) : [];
        }
    }
    return [];
}

function portal_supervision_inspector_name(array $user): string
{
    $name = trim((string) ($user['display_name'] ?? ''));
    if ($name === '') {
        $name = trim((string) ($user['username'] ?? ''));
    }
    return portal_substr($name, 0, 180);
}

function portal_supervision_normalize_customer_name(string $name): string
{
    $normalized = preg_replace('/\s+/u', ' ', trim($name));
    $normalized = is_string($normalized) ? $normalized : trim($name);
    return function_exists('mb_strtolower') ? mb_strtolower($normalized, 'UTF-8') : strtolower($normalized);
}

function portal_supervision_customer_name_matches(string $candidate, string $searchTerm): bool
{
    return portal_supervision_normalize_customer_name($candidate) === portal_supervision_normalize_customer_name($searchTerm);
}

function portal_supervision_monday_customer_fields(array $item): array
{
    return [
        'id' => (string) ($item['id'] ?? ''),
        'customer_key' => portal_supervision_monday_column($item, IFEEL_SUPERVISION_CUSTOMER_KEY_COLUMN),
        'name' => (string) ($item['name'] ?? ''),
        'address' => portal_supervision_monday_column($item, 'location7'),
        'phone' => portal_supervision_monday_column($item, 'phone'),
        'email' => portal_supervision_monday_column($item, '_____3'),
        'dropbox' => portal_supervision_monday_column($item, 'link'),
        'dwg' => portal_supervision_monday_column($item, 'link_dwg_mkn6qzrx'),
        'supervisor' => portal_supervision_monday_column($item, 'text80'),
        'supervisor_email' => portal_supervision_monday_column($item, 'email7'),
        'architect' => portal_supervision_monday_column($item, 'text828'),
    ];
}

/** חיפוש לקוח בלוח המכירות לפי שם או כתובת. */
function portal_supervision_monday_search(string $term): array
{
    $term = trim($term);
    if ($term === '' || portal_strlen($term) < 2 || !portal_supervision_monday_available()) {
        return [];
    }
    $query = <<<'GRAPHQL'
query SupervisionCustomerSearch($boardIds: [ID!], $queryParams: ItemsQuery) {
  boards(ids: $boardIds) {
    items_page(limit: 25, query_params: $queryParams) {
      items {
        id
        name
        group { title }
        column_values(ids: ["______9", "location7", "phone", "_____3", "link", "link_dwg_mkn6qzrx", "text80", "email7", "text828", "email5"]) {
          id
          text
        }
      }
    }
  }
}
GRAPHQL;
    $response = portal_handover_monday_request($query, [
        'boardIds' => [portal_supervision_monday_board('SUPERVISION_MONDAY_SALES_BOARD_ID', IFEEL_SUPERVISION_SALES_BOARD)],
        'queryParams' => [
            'rules' => [
                ['column_id' => 'name', 'compare_value' => [$term], 'operator' => 'contains_text'],
            ],
        ],
    ]);
    $items = $response['data']['boards'][0]['items_page']['items'] ?? [];
    $customers = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $customer = portal_supervision_monday_customer_fields($item);
        $customer['group'] = (string) ($item['group']['title'] ?? '');
        $customers[] = $customer;
    }
    return $customers;
}

/** טעינת כרטיס לקוח מלא + כרטיס מחלקת פרויקטים המקושר אליו. */
function portal_supervision_monday_customer(string $itemId): ?array
{
    if (preg_match('/^\d{1,20}$/', $itemId) !== 1 || !portal_supervision_monday_available()) {
        return null;
    }
    $query = <<<'GRAPHQL'
query SupervisionCustomer($itemIds: [ID!]) {
  items(ids: $itemIds) {
    id
    name
    column_values(ids: ["______9", "location7", "phone", "_____3", "link", "link_dwg_mkn6qzrx", "text80", "email7", "text828", "email5", "link_to_______________________"]) {
      id
      text
      ... on BoardRelationValue { linked_item_ids }
    }
  }
}
GRAPHQL;
    $response = portal_handover_monday_request($query, ['itemIds' => [$itemId]]);
    $item = $response['data']['items'][0] ?? null;
    if (!is_array($item)) {
        return null;
    }
    $customer = portal_supervision_monday_customer_fields($item);
    $customer['project'] = null;
    $linkedProjects = portal_supervision_monday_linked_ids($item, 'link_to_______________________');
    $customer['project'] = $linkedProjects !== []
        ? portal_supervision_monday_project_by_id($linkedProjects[0])
        : null;
    if ($customer['project'] === null) {
        $customer['project'] = portal_supervision_monday_project($customer['name']);
    }
    return $customer;
}

/** כרטיס מחלקת פרויקטים לפי מזהה מקושר — הדרך המדויקת להגיע לחשמלאי ולקבלן. */
function portal_supervision_monday_project_by_id(string $itemId): ?array
{
    if (preg_match('/^\d{1,20}$/', $itemId) !== 1 || !portal_supervision_monday_available()) {
        return null;
    }
    $query = <<<'GRAPHQL'
query SupervisionProjectById($itemIds: [ID!]) {
  items(ids: $itemIds) {
    id
    name
    column_values(ids: ["mirror148", "email_16", "mirror14", "mirror69", "email_17", "mirror63", "email_1", "mirror31", "date_1", "date_17", "date_14"]) {
      id
      text
    }
  }
}
GRAPHQL;
    try {
        $response = portal_handover_monday_request($query, ['itemIds' => [$itemId]]);
    } catch (Throwable $error) {
        error_log('[i-feel supervision] monday_project_by_id_failed');
        return null;
    }
    $item = $response['data']['items'][0] ?? null;
    return is_array($item) ? portal_supervision_monday_project_fields($item) : null;
}

function portal_supervision_monday_project_fields(array $item): array
{
    return [
        'id' => (string) ($item['id'] ?? ''),
        'name' => (string) ($item['name'] ?? ''),
        'electrician' => portal_supervision_monday_column($item, 'mirror148'),
        'electrician_email' => portal_supervision_monday_column($item, 'email_16'),
        'electrician_phone' => portal_supervision_monday_column($item, 'mirror14'),
        'contractor' => portal_supervision_monday_column($item, 'mirror69'),
        'supervisor' => portal_supervision_monday_column($item, 'mirror63'),
        'supervisor_email' => portal_supervision_monday_column($item, 'email_1'),
        'architect' => portal_supervision_monday_column($item, 'mirror31'),
        'visit_1' => portal_supervision_monday_column($item, 'date_1'),
        'visit_2' => portal_supervision_monday_column($item, 'date_17'),
        'visit_3' => portal_supervision_monday_column($item, 'date_14'),
    ];
}

/** איתור כרטיס מחלקת פרויקטים לפי שם הלקוח — גיבוי כשאין קישור בכרטיס. */
function portal_supervision_monday_project(string $customerName): ?array
{
    $customerName = trim($customerName);
    if ($customerName === '' || !portal_supervision_monday_available()) {
        return null;
    }
    $query = <<<'GRAPHQL'
query SupervisionProjectCard($boardIds: [ID!], $queryParams: ItemsQuery) {
  boards(ids: $boardIds) {
    items_page(limit: 3, query_params: $queryParams) {
      items {
        id
        name
        column_values(ids: ["mirror148", "email_16", "mirror14", "mirror69", "email_17", "mirror63", "email_1", "mirror31", "date_1", "date_17", "date_14"]) {
          id
          text
        }
      }
    }
  }
}
GRAPHQL;
    try {
        $response = portal_handover_monday_request($query, [
            'boardIds' => [portal_supervision_monday_board('SUPERVISION_MONDAY_PROJECTS_BOARD_ID', IFEEL_SUPERVISION_PROJECTS_BOARD)],
            'queryParams' => [
                'rules' => [
                    ['column_id' => 'name', 'compare_value' => [$customerName], 'operator' => 'contains_text'],
                ],
            ],
        ]);
    } catch (Throwable $error) {
        error_log('[i-feel supervision] monday_project_lookup_failed');
        return null;
    }
    $item = $response['data']['boards'][0]['items_page']['items'][0] ?? null;
    return is_array($item) ? portal_supervision_monday_project_fields($item) : null;
}

function portal_supervision_monday_update_body(array $report): string
{
    $lines = [
        '<b>דוח פיקוח באתר — ' . portal_h(portal_supervision_type_label((string) ($report['type'] ?? ''))) . '</b>',
        'תאריך ביקורת: ' . portal_h((string) ($report['visit_date'] ?? '')),
        'מסלול: ' . portal_h(portal_supervision_track_label((string) ($report['track'] ?? ''))),
        'תוצאה: ' . portal_h(portal_supervision_result_label((string) ($report['result'] ?? ''))),
        'מפקח: ' . portal_h((string) ($report['inspector']['name'] ?? '')),
        'חשמלאי: ' . portal_h((string) ($report['electrician']['name'] ?? 'לא נרשם'))
            . (!empty($report['electrician']['signed']) ? ' (חתם על קבלת הדרכה ותכניות)' : ''),
        '',
        '<b>ליקויים:</b>',
    ];
    foreach (portal_supervision_findings_lines($report) as $line) {
        $lines[] = portal_h($line);
    }
    $lines[] = '';
    $lines[] = '<b>סיכום:</b> ' . portal_h((string) ($report['summary'] ?? ''));
    if ((string) ($report['plan_corrections'] ?? '') !== '') {
        $lines[] = '<b>תיקוני תכנית:</b> ' . portal_h((string) $report['plan_corrections']);
    }
    $lines[] = 'מספר דוח: ' . portal_h((string) ($report['id'] ?? '')) . ' · נשמר בתיק הלקוח באזור העובדים.';
    return implode('<br>', $lines);
}

/** רישום הדוח ככרטיס עדכון על כרטיס הלקוח ועל כרטיס מחלקת פרויקטים. */
function portal_supervision_monday_publish(array $report): array
{
    $result = ['customer_item' => 'skipped', 'project_item' => 'skipped'];
    if (!portal_supervision_monday_available()) {
        return $result;
    }
    $body = portal_supervision_monday_update_body($report);
    $targets = [
        'customer_item' => (string) ($report['monday']['customer_item_id'] ?? ''),
        'project_item' => (string) ($report['monday']['project_item_id'] ?? ''),
    ];
    $mutation = <<<'GRAPHQL'
mutation SupervisionUpdate($itemId: ID!, $body: String!) {
  create_update(item_id: $itemId, body: $body) { id }
}
GRAPHQL;
    foreach ($targets as $key => $itemId) {
        if (preg_match('/^\d{1,20}$/', $itemId) !== 1) {
            continue;
        }
        try {
            portal_handover_monday_request($mutation, ['itemId' => $itemId, 'body' => $body]);
            $result[$key] = 'posted';
        } catch (Throwable $error) {
            error_log('[i-feel supervision] monday_update_failed target=' . $key);
            $result[$key] = 'failed';
        }
    }
    return $result;
}

/** העברת הדוח לארכוב בתיקיית הלקוח (Make / Dropbox) — פעיל רק כשמוגדר webhook. */
function portal_supervision_archive_webhook(): string
{
    $url = trim((string) getenv('EXPENSE_PORTAL_SUPERVISION_ARCHIVE_WEBHOOK'));
    if ($url === '' || !str_starts_with(portal_lower($url), 'https://')) {
        return '';
    }
    return $url;
}

function portal_supervision_archive(array $report): string
{
    $url = portal_supervision_archive_webhook();
    if ($url === '' || !function_exists('curl_init') || (string) getenv('IFEEL_PORTAL_TEST_MODE') === '1') {
        return 'skipped';
    }
    $payload = json_encode([
        'report_id' => (string) ($report['id'] ?? ''),
        'customer_key' => (string) ($report['customer_key'] ?? ''),
        'customer_name' => (string) ($report['customer_name'] ?? ''),
        'monday' => $report['monday'] ?? [],
        'dropbox_folder' => (string) ($report['plans_link'] ?? ''),
        'visit_date' => (string) ($report['visit_date'] ?? ''),
        'type' => (string) ($report['type'] ?? ''),
        'track' => (string) ($report['track'] ?? ''),
        'result' => (string) ($report['result'] ?? ''),
        'summary' => (string) ($report['summary'] ?? ''),
        'plan_corrections' => (string) ($report['plan_corrections'] ?? ''),
        'findings' => $report['findings'] ?? [],
        'checklist' => $report['checklist'] ?? [],
        'finish' => $report['finish'] ?? [],
        'electrician' => $report['electrician'] ?? [],
        'inspector' => $report['inspector'] ?? [],
        'files' => array_map(
            static fn(array $file): array => [
                'name' => (string) ($file['name'] ?? ''),
                'url' => 'https://i-feel.co.il/staff-expenses/?' . http_build_query([
                    'action' => 'supervision_download',
                    'report_id' => (string) ($report['id'] ?? ''),
                    'file' => (string) ($file['index'] ?? '0'),
                ]),
            ],
            portal_supervision_archive_file_index($report)
        ),
    ], JSON_UNESCAPED_UNICODE);
    if ($payload === false) {
        return 'failed';
    }
    $handle = curl_init($url);
    curl_setopt_array($handle, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_FOLLOWLOCATION => false,
    ]);
    $body = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
    curl_close($handle);
    if (!is_string($body) || $status < 200 || $status >= 300) {
        error_log('[i-feel supervision] archive_webhook_failed status=' . $status);
        return 'failed';
    }
    return 'sent';
}

function portal_supervision_archive_file_index(array $report): array
{
    $files = [];
    foreach (portal_supervision_email_attachments($report) as $index => $attachment) {
        $files[] = ['index' => $index, 'name' => (string) ($attachment['name'] ?? '')];
    }
    return $files;
}

function portal_supervision_post_array(string $key, int $max, int $limit): array
{
    $raw = $_POST[$key] ?? null;
    if (!is_array($raw)) {
        return [];
    }
    $values = [];
    foreach ($raw as $index => $value) {
        if (count($values) >= $limit) {
            break;
        }
        if (is_array($value)) {
            continue;
        }
        $values[(string) $index] = portal_substr(trim((string) $value), 0, $max);
    }
    return $values;
}

function portal_supervision_collect_checklist(): array
{
    $statuses = portal_supervision_post_array('sv_status', 20, 200);
    $notes = portal_supervision_post_array('sv_note', 300, 200);
    $allowed = portal_supervision_checklist_labels();
    $validStatuses = array_keys(portal_supervision_status_labels());
    $checklist = [];
    foreach ($allowed as $key => $label) {
        $status = (string) ($statuses[$key] ?? 'not_checked');
        if (!in_array($status, $validStatuses, true)) {
            $status = 'not_checked';
        }
        $note = (string) ($notes[$key] ?? '');
        if ($status === 'not_checked' && $note === '') {
            continue;
        }
        $checklist[$key] = ['status' => $status, 'note' => $note];
    }
    return $checklist;
}

function portal_supervision_collect_findings(): array
{
    $descriptions = portal_supervision_post_array('sv_finding_description', 500, IFEEL_SUPERVISION_MAX_FINDINGS);
    $severities = portal_supervision_post_array('sv_finding_severity', 20, IFEEL_SUPERVISION_MAX_FINDINGS);
    $owners = portal_supervision_post_array('sv_finding_owner', 120, IFEEL_SUPERVISION_MAX_FINDINGS);
    $dueDates = portal_supervision_post_array('sv_finding_due', 20, IFEEL_SUPERVISION_MAX_FINDINGS);
    $validSeverities = array_keys(portal_supervision_severity_labels());
    $findings = [];
    foreach ($descriptions as $index => $description) {
        if ($description === '') {
            continue;
        }
        $severity = (string) ($severities[$index] ?? 'medium');
        if (!in_array($severity, $validSeverities, true)) {
            $severity = 'medium';
        }
        $due = (string) ($dueDates[$index] ?? '');
        if ($due !== '' && !portal_valid_date($due)) {
            throw new RuntimeException('תאריך יעד לתיקון ליקוי אינו תקין.');
        }
        $findings[] = [
            'description' => $description,
            'severity' => $severity,
            'owner' => (string) ($owners[$index] ?? ''),
            'due_date' => $due,
        ];
    }
    return $findings;
}

function portal_handle_supervision_post(array $user): never
{
    portal_verify_csrf();

    $customerKey = portal_post('sv_customer_key', 60);
    $customerName = portal_post('sv_customer_name', 180);
    $siteAddress = portal_post('sv_site_address', 240);
    $type = portal_post('sv_type', 40);
    $visitDate = portal_post('sv_visit_date', 20);
    $projectStage = portal_post('sv_project_stage', 180);
    $attendees = portal_post('sv_attendees', 300);
    $result = portal_post('sv_result', 40);
    $summary = portal_post('sv_summary', 3000);
    $changes = portal_post('sv_changes', 2000);
    $nextVisit = portal_post('sv_next_visit', 20);
    $inspectorName = portal_supervision_inspector_name($user);
    $inspectorPhone = portal_substr(trim((string) ($user['phone'] ?? '')), 0, 40);
    $siteContact = portal_post('sv_site_contact', 180);
    $customerEmail = portal_post('sv_customer_email', 160);
    $sendCustomer = portal_post('sv_send_customer', 10) === '1';

    $track = portal_post('sv_track', 20);
    $mondayCustomerId = portal_post('sv_monday_customer_id', 20);
    $mondayProjectId = portal_post('sv_monday_project_id', 20);
    if ($mondayCustomerId !== '' && preg_match('/^\d{1,20}$/', $mondayCustomerId) !== 1) {
        $mondayCustomerId = '';
    }
    if ($mondayProjectId !== '' && preg_match('/^\d{1,20}$/', $mondayProjectId) !== 1) {
        $mondayProjectId = '';
    }
    $electricianName = portal_post('sv_electrician_name', 180);
    $electricianPhone = portal_post('sv_electrician_phone', 40);
    $electricianEmail = portal_post('sv_electrician_email', 160);
    $siteSupervisorName = portal_post('sv_site_supervisor', 180);
    $plansLink = portal_supervision_dropbox_link(portal_post('sv_plans_link', 500));
    $planCorrections = portal_post('sv_plan_corrections', 3000);
    $trainingGiven = portal_post('sv_training_given', 10) === '1';
    $plansHanded = portal_post('sv_plans_handed', 10) === '1';
    $signatureName = portal_post('sv_signature_name', 180);
    $signatureData = (string) ($_POST['sv_signature'] ?? '');
    $sendElectrician = portal_post('sv_send_electrician', 10) === '1';
    $intercomColor = portal_post('sv_intercom_color', 20);
    $switchColor = portal_post('sv_switch_color', 20);
    $speakerColor = portal_post('sv_speaker_color', 20);
    $boxesStatus = portal_post('sv_boxes_status', 20);
    $boxesCount = portal_post('sv_boxes_count', 10);
    $knxDetector = portal_post('sv_knx_detector', 20);
    $finishNotes = portal_post('sv_finish_notes', 1000);

    if ($mondayCustomerId !== '' && portal_supervision_monday_available()) {
        try {
            $trustedCustomer = portal_supervision_monday_customer($mondayCustomerId);
            if ($trustedCustomer !== null) {
                $trustedKey = trim((string) ($trustedCustomer['customer_key'] ?? ''));
                $trustedName = trim((string) ($trustedCustomer['name'] ?? ''));
                $trustedAddress = trim((string) ($trustedCustomer['address'] ?? ''));
                $trustedEmail = trim((string) ($trustedCustomer['email'] ?? ''));
                $trustedPlans = trim((string) (($trustedCustomer['dropbox'] ?? '') ?: ($trustedCustomer['dwg'] ?? '')));
                $trustedProjectId = trim((string) ($trustedCustomer['project']['id'] ?? ''));

                if ($trustedKey !== '') {
                    $customerKey = portal_substr($trustedKey, 0, 60);
                }
                if ($trustedName !== '') {
                    $customerName = portal_substr($trustedName, 0, 180);
                }
                if ($trustedAddress !== '') {
                    $siteAddress = portal_substr($trustedAddress, 0, 240);
                }
                if ($customerEmail === '' && filter_var($trustedEmail, FILTER_VALIDATE_EMAIL) !== false) {
                    $customerEmail = portal_substr($trustedEmail, 0, 160);
                }
                if ($plansLink === '' && $trustedPlans !== '') {
                    $plansLink = portal_supervision_dropbox_link($trustedPlans);
                }
                if (preg_match('/^\d{1,20}$/', $trustedProjectId) === 1) {
                    $mondayProjectId = $trustedProjectId;
                }
            }
        } catch (Throwable $error) {
            error_log('[i-feel supervision] monday_customer_refresh_failed');
        }
    }

    if ($customerKey === '') {
        throw new RuntimeException('חובה להזין מפתח לקוח — לפיו נשמר הדוח בתיק הלקוח.');
    }
    if ($customerName === '') {
        throw new RuntimeException('חובה להזין שם לקוח או פרויקט.');
    }
    if (!array_key_exists($type, portal_supervision_types())) {
        throw new RuntimeException('יש לבחור סוג ביקורת.');
    }
    if (!portal_valid_date($visitDate)) {
        throw new RuntimeException('תאריך הביקורת אינו תקין.');
    }
    if ($nextVisit !== '' && !portal_valid_date($nextVisit)) {
        throw new RuntimeException('תאריך הביקורת החוזרת אינו תקין.');
    }
    if (!array_key_exists($track, portal_supervision_track_labels())) {
        throw new RuntimeException('יש לבחור מסלול מערכת — KNX קווי, אלחוטי או משולב.');
    }
    foreach ([
        'intercom_color' => $intercomColor,
        'switch_color' => $switchColor,
        'speaker_color' => $speakerColor,
        'boxes_status' => $boxesStatus,
        'knx_detector' => $knxDetector,
    ] as $choiceField => $choiceValue) {
        if (!portal_supervision_valid_choice($choiceField, $choiceValue)) {
            throw new RuntimeException('אחת מבחירות הגימור אינה תקינה.');
        }
    }
    if ($boxesCount !== '' && preg_match('/^\d{1,4}$/', $boxesCount) !== 1) {
        throw new RuntimeException('כמות קופסאות השקיעה חייבת להיות מספר.');
    }
    if (($trainingGiven || $plansHanded) && $electricianName === '') {
        throw new RuntimeException('כדי לתעד הדרכה או מסירת תכניות חובה להזין את שם החשמלאי.');
    }
    if ($sendElectrician && filter_var($electricianEmail, FILTER_VALIDATE_EMAIL) === false) {
        throw new RuntimeException('כדי לשלוח לחשמלאי את טופס ה-AS-MADE יש להזין כתובת דוא״ל תקינה.');
    }
    if (!array_key_exists($result, portal_supervision_result_labels())) {
        throw new RuntimeException('יש לבחור את תוצאת הביקורת.');
    }
    if ($summary === '') {
        throw new RuntimeException('חובה להזין סיכום והנחיות להמשך.');
    }
    if ($inspectorName === '') {
        throw new RuntimeException('חובה להזין את שם המפקח.');
    }
    if ($sendCustomer && filter_var($customerEmail, FILTER_VALIDATE_EMAIL) === false) {
        throw new RuntimeException('כדי לשלוח עותק ללקוח יש להזין כתובת דוא״ל תקינה.');
    }

    $findings = portal_supervision_collect_findings();
    $checklist = portal_supervision_collect_checklist();

    if ($result === 'not_approved' && $findings === []) {
        throw new RuntimeException('כאשר הביקורת לא אושרה חובה לפרט לפחות ליקוי אחד.');
    }

    $customerSlug = portal_supervision_customer_key_slug($customerKey);
    $reportId = portal_new_supervision_id();
    $reportDir = portal_supervision_dir($customerSlug, $reportId);
    portal_ensure_directory($reportDir);

    try {
        $attachments = [];
        if (isset($_FILES['sv_photos'])) {
            $attachments = portal_save_uploads($reportDir, $_FILES['sv_photos']);
        }
        $signature = portal_supervision_save_signature($reportDir, $signatureData);

        $report = [
            'id' => $reportId,
            'created_at' => gmdate('c'),
            'updated_at' => gmdate('c'),
            'customer_key' => $customerKey,
            'customer_key_slug' => $customerSlug,
            'customer_name' => $customerName,
            'customer_email' => $sendCustomer ? $customerEmail : '',
            'site_address' => $siteAddress,
            'type' => $type,
            'visit_date' => $visitDate,
            'project_stage' => $projectStage,
            'attendees' => $attendees,
            'site_contact' => $siteContact,
            'result' => $result,
            'summary' => $summary,
            'changes' => $changes,
            'next_visit' => $nextVisit,
            'track' => $track,
            'monday' => [
                'customer_item_id' => $mondayCustomerId,
                'project_item_id' => $mondayProjectId,
                'customer_url' => $mondayCustomerId !== ''
                    ? 'https://i-feel.monday.com/boards/' . IFEEL_SUPERVISION_SALES_BOARD . '/pulses/' . $mondayCustomerId
                    : '',
            ],
            'plans_link' => $plansLink,
            'plan_corrections' => $planCorrections,
            'electrician' => [
                'name' => $electricianName,
                'phone' => $electricianPhone,
                'email' => $electricianEmail,
                'training_given' => $trainingGiven,
                'plans_handed' => $plansHanded,
                'signature_name' => $signatureName,
                'signed' => $signature !== null,
            ],
            'site_supervisor' => $siteSupervisorName,
            'signature' => $signature,
            'finish' => [
                'intercom_color' => $intercomColor,
                'switch_color' => $switchColor,
                'speaker_color' => $speakerColor,
                'boxes_status' => $boxesStatus,
                'boxes_count' => $boxesCount,
                'knx_detector' => $knxDetector,
                'notes' => $finishNotes,
            ],
            'checklist' => $checklist,
            'findings' => $findings,
            'attachments' => $attachments,
            'inspector' => [
                'name' => $inspectorName,
                'email' => portal_normalize_company_email((string) ($user['email'] ?? '')) ?? (string) ($user['email'] ?? ''),
                'phone' => $inspectorPhone,
            ],
            'notifications' => [
                'internal' => ['recipients' => portal_supervision_internal_recipients(), 'sent' => [], 'failed' => []],
                'customer' => ['recipient' => $sendCustomer ? $customerEmail : '', 'status' => 'pending'],
                'electrician' => ['recipient' => $sendElectrician ? $electricianEmail : '', 'status' => 'pending'],
            ],
        ];
        portal_save_supervision($report);

        try {
            $report['notifications']['internal'] = portal_supervision_send_internal($report);
        } catch (Throwable $error) {
            error_log('[i-feel supervision] internal_email_failed report=' . $reportId);
            $report['notifications']['internal']['failed'] = $report['notifications']['internal']['recipients'];
        }
        try {
            $report['notifications']['customer'] = $sendCustomer
                ? portal_supervision_send_customer($report)
                : ['recipient' => '', 'status' => 'skipped'];
        } catch (Throwable $error) {
            error_log('[i-feel supervision] customer_email_failed report=' . $reportId);
            $report['notifications']['customer'] = ['recipient' => $customerEmail, 'status' => 'failed'];
        }
        try {
            $report['notifications']['electrician'] = $sendElectrician
                ? portal_supervision_send_electrician($report)
                : ['recipient' => '', 'status' => 'skipped'];
        } catch (Throwable $error) {
            error_log('[i-feel supervision] electrician_email_failed report=' . $reportId);
            $report['notifications']['electrician'] = ['recipient' => $electricianEmail, 'status' => 'failed'];
        }
        $report['notifications']['monday'] = portal_supervision_monday_publish($report);
        $report['notifications']['archive'] = portal_supervision_archive($report);
        $report['updated_at'] = gmdate('c');
        portal_save_supervision($report);

        $internalFailed = $report['notifications']['internal']['failed'] ?? [];
        $customerStatus = (string) ($report['notifications']['customer']['status'] ?? 'failed');
        $electricianStatus = (string) ($report['notifications']['electrician']['status'] ?? 'failed');
        $allSent = $internalFailed === []
            && in_array($customerStatus, ['sent', 'skipped'], true)
            && in_array($electricianStatus, ['sent', 'skipped'], true);

        portal_audit('supervision_submitted', [
            'report_id' => $reportId,
            'monday_customer_item' => $mondayCustomerId,
            'monday_update' => (string) ($report['notifications']['monday']['customer_item'] ?? 'skipped'),
            'archive' => (string) ($report['notifications']['archive'] ?? 'skipped'),
            'customer_key_hash' => hash('sha256', $customerKey),
            'type' => $type,
            'findings' => count($findings),
            'photos' => count($attachments),
            'internal_email_ok' => $internalFailed === [],
            'customer_email_status' => $customerStatus,
        ]);

        portal_flash_set(
            $allSent ? 'success' : 'error',
            $allSent
                ? 'דוח הפיקוח נשמר בתיק הלקוח ונשלח למחלקת פרויקטים. מספר דוח: ' . $reportId
                : 'דוח הפיקוח נשמר בתיק הלקוח, אך לפחות הודעת דוא״ל אחת דורשת טיפול ידני. מספר דוח: ' . $reportId
        );
        portal_redirect(['tab' => 'supervision', 'customer' => $customerKey]);
    } catch (Throwable $error) {
        if (!is_file(portal_supervision_file($customerSlug, $reportId))) {
            portal_remove_tree($reportDir);
        }
        throw $error;
    }
}

function portal_handle_supervision_download(array $user): void
{
    portal_require_login();
    $reportId = trim((string) ($_GET['report_id'] ?? ''));
    $index = (int) ($_GET['file'] ?? -1);
    $report = portal_load_supervision($reportId);
    if ($report === null) {
        throw new RuntimeException('דוח הפיקוח המבוקש לא נמצא.');
    }
    if (($user['role'] ?? '') !== 'admin') {
        $email = portal_normalize_company_email((string) ($user['email'] ?? '')) ?? '';
        $owner = portal_normalize_company_email((string) ($report['inspector']['email'] ?? '')) ?? '';
        if ($email === '' || $owner === '' || !hash_equals($owner, $email)) {
            throw new RuntimeException('אין הרשאה לצפות בקובץ זה.');
        }
    }
    $attachments = portal_supervision_email_attachments($report);
    if ($index < 0 || !isset($attachments[$index])) {
        throw new RuntimeException('הקובץ המבוקש לא נמצא.');
    }
    $attachment = $attachments[$index];
    portal_audit('supervision_photo_downloaded', ['report_id' => $reportId, 'file' => $index]);
    header('Content-Type: ' . $attachment['mime']);
    header('Content-Length: ' . (string) filesize($attachment['path']));
    header('Content-Disposition: inline; filename="supervision-' . $index . '.'
        . pathinfo($attachment['path'], PATHINFO_EXTENSION) . '"');
    readfile($attachment['path']);
    exit;
}

function portal_render_supervision_checklist_fields(): void
{
    $statusLabels = portal_supervision_status_labels();
    $index = 0;
    foreach (portal_supervision_checklist() as $groupTitle => $group) {
        $index++;
        $items = $group['items'];
        $track = (string) $group['track'];
        ?>
        <details class="detail-card field--full supervision-group" data-supervision-track="<?= portal_h($track) ?>" <?= $index === 1 ? 'open' : '' ?>>
            <summary class="supervision-group__title">
                <?= portal_h($groupTitle) ?>
                <span class="supervision-group__count">(<?= count($items) ?>)</span>
                <?php if ($track !== 'all'): ?>
                    <span class="supervision-group__badge"><?= portal_h($track === 'knx' ? 'KNX' : 'Z-Wave') ?></span>
                <?php endif; ?>
            </summary>
            <div class="supervision-group__tools">
                <button type="button" class="button button--secondary button--small" data-supervision-mark-all="<?= $index ?>">סימון הכל כתקין</button>
            </div>
            <?php foreach ($items as $key => $label): ?>
                <div class="supervision-check" data-supervision-group="<?= $index ?>">
                    <span class="supervision-check__label"><?= portal_h($label) ?></span>
                    <div class="supervision-check__options" role="radiogroup" aria-label="<?= portal_h($label) ?>">
                        <?php foreach ($statusLabels as $value => $statusLabel): ?>
                            <label class="supervision-opt supervision-opt--<?= portal_h($value) ?>">
                                <input type="radio" name="sv_status[<?= portal_h($key) ?>]" value="<?= portal_h($value) ?>" <?= $value === 'not_checked' ? 'checked' : '' ?>>
                                <span><?= portal_h($statusLabel) ?></span>
                            </label>
                        <?php endforeach; ?>
                    </div>
                    <input type="text" name="sv_note[<?= portal_h($key) ?>]" maxlength="300" placeholder="הערה (לא חובה)">
                </div>
            <?php endforeach; ?>
        </details>
        <?php
    }
}

function portal_render_supervision_findings_fields(): void
{
    $severities = portal_supervision_severity_labels();
    ?>
    <div class="detail-card field--full supervision-findings">
        <h2>ליקויים לטיפול</h2>
        <p class="form-note">יש למלא רק את השורות הרלוונטיות. שורה ללא תיאור לא תישמר.</p>
        <?php for ($i = 0; $i < IFEEL_SUPERVISION_MAX_FINDINGS; $i++): ?>
            <div class="supervision-finding">
                <label class="field field--full">
                    <span>ליקוי <?= $i + 1 ?></span>
                    <input type="text" name="sv_finding_description[<?= $i ?>]" maxlength="500" placeholder="תיאור הליקוי והמיקום באתר">
                </label>
                <label class="field">
                    <span>חומרה</span>
                    <select name="sv_finding_severity[<?= $i ?>]">
                        <?php foreach ($severities as $value => $label): ?>
                            <option value="<?= portal_h($value) ?>" <?= $value === 'medium' ? 'selected' : '' ?>><?= portal_h($label) ?></option>
                        <?php endforeach; ?>
                    </select>
                </label>
                <label class="field">
                    <span>אחראי לתיקון</span>
                    <input type="text" name="sv_finding_owner[<?= $i ?>]" maxlength="120" placeholder="קבלן / חשמלאי / צוות i-feel">
                </label>
                <label class="field">
                    <span>תאריך יעד</span>
                    <input type="date" name="sv_finding_due[<?= $i ?>]">
                </label>
            </div>
        <?php endfor; ?>
    </div>
    <?php
}

function portal_render_supervision_history(array $user, string $customerFilter): void
{
    $reports = portal_supervisions_for_user($user);
    if ($customerFilter !== '') {
        $slug = portal_supervision_customer_key_slug($customerFilter);
        $reports = array_values(array_filter(
            $reports,
            static fn(array $report): bool => (string) ($report['customer_key_slug'] ?? '') === $slug
        ));
    }
    $reports = array_slice($reports, 0, 25);
    ?>
    <section class="detail-card supervision-history">
        <h2>תיק הפיקוח<?= $customerFilter !== '' ? ' — מפתח לקוח ' . portal_h($customerFilter) : '' ?></h2>
        <form method="get" class="supervision-form supervision-form--filter">
            <input type="hidden" name="tab" value="supervision">
            <label class="field">
                <span>חיפוש לפי מפתח לקוח</span>
                <input type="text" name="customer" maxlength="60" value="<?= portal_h($customerFilter) ?>" placeholder="לדוגמה 2732725332-1187">
            </label>
            <div class="field field--actions"><button type="submit" class="button button--secondary">הצגת תיק הלקוח</button></div>
        </form>
        <?php if ($reports === []): ?>
            <p class="form-note">אין עדיין דוחות פיקוח להצגה.</p>
        <?php else: ?>
            <div class="table-wrap"><table class="records-table">
                <thead>
                <tr><th>תאריך</th><th>לקוח / פרויקט</th><th>סוג</th><th>תוצאה</th><th>ליקויים</th><th>תמונות</th></tr>
                </thead>
                <tbody>
                <?php foreach ($reports as $report): ?>
                    <tr>
                        <td><?= portal_h((string) ($report['visit_date'] ?? '')) ?></td>
                        <td><?= portal_h((string) ($report['customer_name'] ?? '')) ?></td>
                        <td><?= portal_h(portal_supervision_type_label((string) ($report['type'] ?? ''))) ?></td>
                        <td><?= portal_h(portal_supervision_result_label((string) ($report['result'] ?? ''))) ?></td>
                        <td><?= count($report['findings'] ?? []) ?></td>
                        <td>
                            <?php $count = count($report['attachments'] ?? []); ?>
                            <?php if ($count === 0): ?>—<?php else: ?>
                                <?php for ($i = 0; $i < $count; $i++): ?>
                                    <a href="<?= portal_h(portal_url([
                                        'action' => 'supervision_download',
                                        'report_id' => (string) ($report['id'] ?? ''),
                                        'file' => (string) $i,
                                    ])) ?>" target="_blank" rel="noopener"><?= $i + 1 ?></a>
                                <?php endfor; ?>
                            <?php endif; ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table></div>
        <?php endif; ?>
    </section>
    <?php
}

function portal_render_supervision(array $user, ?array $flash): void
{
    $customerFilter = portal_substr(trim((string) ($_GET['customer'] ?? '')), 0, 60);
    $inspectorName = portal_supervision_inspector_name($user);
    $searchTerm = portal_substr(trim((string) ($_GET['sv_q'] ?? '')), 0, 80);
    $selectedId = portal_substr(trim((string) ($_GET['sv_item'] ?? '')), 0, 20);
    $customer = null;
    $results = [];
    $mondayError = '';
    if (portal_supervision_monday_available()) {
        try {
            if ($selectedId !== '') {
                $customer = portal_supervision_monday_customer($selectedId);
            } elseif ($searchTerm !== '') {
                $results = portal_supervision_monday_search($searchTerm);
                $exactMatches = array_values(array_filter(
                    $results,
                    static fn(array $candidate): bool => portal_supervision_customer_name_matches((string) ($candidate['name'] ?? ''), $searchTerm)
                ));
                if (count($exactMatches) === 1) {
                    $customer = portal_supervision_monday_customer((string) $exactMatches[0]['id']);
                    $results = [];
                }
            }
        } catch (Throwable $error) {
            $mondayError = $error->getMessage();
        }
    }
    $project = is_array($customer['project'] ?? null) ? $customer['project'] : [];
    $prefillKey = $customer !== null ? (string) ($customer['customer_key'] ?? '') : $customerFilter;
    $prefillName = $customer !== null ? (string) $customer['name'] : '';
    $prefillAddress = $customer !== null ? (string) $customer['address'] : '';
    $prefillEmail = $customer !== null ? (string) $customer['email'] : '';
    $prefillPlans = $customer !== null ? (string) ($customer['dropbox'] !== '' ? $customer['dropbox'] : $customer['dwg']) : '';
    $prefillSupervisor = trim((string) ($project['supervisor'] ?? ($customer['supervisor'] ?? '')));
    portal_render_flash($flash);
    ?>
    <section class="page-heading page-heading--compact">
        <div>
            <p class="eyebrow">פיקוח מהשטח</p>
            <h1>טופס פיקוח באתר</h1>
            <p>הדוח נשמר בתיק הלקוח לפי מפתח לקוח, נשלח למחלקת פרויקטים, ואפשר לשלוח עותק מסודר גם ללקוח.</p>
        </div>
    </section>

    <?php if (portal_supervision_monday_available()): ?>
        <section class="detail-card supervision-monday">
            <h2>בחירת לקוח מ-Monday</h2>
            <p class="form-note">בחירת הלקוח מביאה אוטומטית את מפתח הלקוח, הכתובת, תיקיית ה-Dropbox של התכניות ופרטי החשמלאי מכרטיס מחלקת פרויקטים. בסיום הדוח נרשם עדכון על כרטיס הלקוח.</p>
            <?php if ($mondayError !== ''): ?>
                <div class="alert alert--error" role="alert"><?= portal_h($mondayError) ?></div>
            <?php endif; ?>
            <form method="get" class="supervision-form supervision-form--filter">
                <input type="hidden" name="tab" value="supervision">
                <label class="field">
                    <span>חיפוש לפי שם לקוח או פרויקט</span>
                    <input type="text" name="sv_q" maxlength="80" value="<?= portal_h($searchTerm) ?>" placeholder="לדוגמה: יגאל שמיע">
                </label>
                <div class="field field--actions"><button type="submit" class="button button--secondary">חיפוש ב-Monday</button></div>
            </form>
            <?php if ($results !== []): ?>
                <ul class="supervision-results">
                    <?php foreach ($results as $candidate): ?>
                        <li>
                            <a href="<?= portal_h(portal_url(['tab' => 'supervision', 'sv_item' => $candidate['id']])) ?>">
                                <strong><?= portal_h($candidate['name']) ?></strong>
                                <span><?= portal_h(trim($candidate['address'] . ' · ' . $candidate['group'], ' ·')) ?></span>
                            </a>
                        </li>
                    <?php endforeach; ?>
                </ul>
            <?php elseif ($searchTerm !== '' && $customer === null): ?>
                <div class="alert alert--info">לא נמצאו לקוחות תואמים בלוח המכירות.</div>
            <?php endif; ?>
            <?php if ($customer !== null): ?>
                <div class="detail-grid">
                    <div class="detail-item"><span>לקוח</span><strong><?= portal_h($customer['name']) ?></strong></div>
                    <div class="detail-item"><span>מפתח חשבשבת</span><strong dir="ltr"><?= portal_h(trim((string) ($customer['customer_key'] ?? '')) ?: 'חסר ב-Monday') ?></strong></div>
                    <div class="detail-item"><span>כתובת</span><strong><?= portal_h($customer['address'] ?: 'חסר ב-Monday') ?></strong></div>
                    <div class="detail-item"><span>תיקיית Dropbox</span><strong><?= $prefillPlans !== '' ? '<a href="' . portal_h($prefillPlans) . '" target="_blank" rel="noopener">פתיחת התכניות</a>' : 'לא מקושרת' ?></strong></div>
                    <div class="detail-item"><span>חשמלאי מהפרויקט</span><strong><?= portal_h(trim((string) ($project['electrician'] ?? '')) ?: 'לא מקושר') ?></strong></div>
                    <div class="detail-item"><span>מפקח / קבלן</span><strong><?= portal_h(trim(($prefillSupervisor ?: '—') . ' · ' . (string) ($project['contractor'] ?? ''), ' ·')) ?></strong></div>
                </div>
            <?php endif; ?>
        </section>
    <?php endif; ?>

    <section class="detail-card supervision-links">
        <h2>מסמכים לשימוש בסיור</h2>
        <ul>
            <li><a href="<?= portal_h(portal_supervision_protocol_url()) ?>" target="_blank" rel="noopener">פרוטוקול התשתית של i-feel</a> — מה החשמלאי חייב להכין לפני הבטון, לפי מסלול KNX או אלחוטי.</li>
            <li><a href="<?= portal_h(portal_supervision_as_made_url()) ?>" target="_blank" rel="noopener">טופס AS-MADE</a> — החשמלאי ממלא בסיום את פירוט ההפעלות בכל בקר. בלעדיו אין תכנות.</li>
        </ul>
    </section>

    <form method="post" enctype="multipart/form-data" class="detail-card supervision-form" id="supervision-form">
        <input type="hidden" name="csrf" value="<?= portal_h(portal_csrf_token()) ?>">
        <input type="hidden" name="action" value="submit_supervision">
        <input type="hidden" name="sv_monday_customer_id" value="<?= portal_h($customer !== null ? (string) $customer['id'] : '') ?>">
        <input type="hidden" name="sv_monday_project_id" value="<?= portal_h((string) ($project['id'] ?? '')) ?>">

        <div class="field--full"><h2>פרטי הביקורת</h2></div>
        <?php if ($customer !== null): ?>
            <div class="alert alert--success field--full">פרטי הלקוח מולאו אוטומטית מ-Monday. אין צורך להקליד שוב את השם, מפתח חשבשבת או הכתובת.</div>
        <?php endif; ?>
        <?php if ($customer !== null && $prefillKey !== ''): ?>
            <input type="hidden" name="sv_customer_key" value="<?= portal_h($prefillKey) ?>">
        <?php else: ?>
            <label class="field">
                <span>מפתח חשבשבת <b>*</b></span>
                <input type="text" name="sv_customer_key" maxlength="60" required value="<?= portal_h($prefillKey) ?>" placeholder="מפתח הלקוח בחשבשבת">
                <small class="form-note"><?= $customer !== null ? 'המפתח חסר בכרטיס Monday; יש להזין אותו פעם אחת.' : 'בחירת לקוח מ-Monday ממלאת את המפתח אוטומטית.' ?></small>
            </label>
        <?php endif; ?>
        <?php if ($customer !== null && $prefillName !== ''): ?>
            <input type="hidden" name="sv_customer_name" value="<?= portal_h($prefillName) ?>">
        <?php else: ?>
            <label class="field">
                <span>לקוח / פרויקט <b>*</b></span>
                <input type="text" name="sv_customer_name" maxlength="180" required value="<?= portal_h($prefillName) ?>">
            </label>
        <?php endif; ?>
        <?php if ($customer !== null && $prefillAddress !== ''): ?>
            <input type="hidden" name="sv_site_address" value="<?= portal_h($prefillAddress) ?>">
        <?php else: ?>
            <label class="field field--full">
                <span>כתובת האתר</span>
                <input type="text" name="sv_site_address" maxlength="240" value="<?= portal_h($prefillAddress) ?>">
                <?php if ($customer !== null): ?><small class="form-note">הכתובת חסרה בכרטיס Monday.</small><?php endif; ?>
            </label>
        <?php endif; ?>
        <label class="field">
            <span>סוג ביקורת <b>*</b></span>
            <select name="sv_type" required>
                <option value="">בחירה</option>
                <?php foreach (portal_supervision_types() as $value => $label): ?>
                    <option value="<?= portal_h($value) ?>"><?= portal_h($label) ?></option>
                <?php endforeach; ?>
            </select>
        </label>
        <label class="field">
            <span>תאריך ביקורת <b>*</b></span>
            <input type="date" name="sv_visit_date" value="<?= portal_h(date('Y-m-d')) ?>" required>
        </label>
        <label class="field">
            <span>שלב הפרויקט</span>
            <input type="text" name="sv_project_stage" maxlength="180" placeholder="שלד / גמרים / מסירה">
        </label>
        <label class="field">
            <span>נוכחים בביקורת</span>
            <input type="text" name="sv_attendees" maxlength="300" placeholder="קבלן, חשמלאי, אדריכל, נציג יזם">
        </label>
        <label class="field">
            <span>איש קשר באתר</span>
            <input type="text" name="sv_site_contact" maxlength="180">
        </label>

        <div class="field--full"><h2>מסלול המערכת</h2><p class="form-note">הבחירה קובעת אילו סעיפים מוצגים בצ׳קליסט. במסלול אלחוטי חובה לוודא קופסאות עומק ואפס בכל נקודה, לפי <a href="<?= portal_h(portal_supervision_protocol_url()) ?>" target="_blank" rel="noopener">פרוטוקול התשתית באתר</a>.</p></div>
        <div class="field field--full supervision-track" role="radiogroup" aria-label="מסלול המערכת">
            <?php foreach (portal_supervision_track_labels() as $value => $label): ?>
                <label class="supervision-track__opt">
                    <input type="radio" name="sv_track" value="<?= portal_h($value) ?>" data-supervision-track-input required>
                    <span><?= portal_h($label) ?></span>
                </label>
            <?php endforeach; ?>
        </div>

        <div class="field--full"><h2>תכניות ומסמכים</h2></div>
        <label class="field field--full">
            <span>קישור לתכניות ב-Dropbox</span>
            <input type="url" name="sv_plans_link" maxlength="500" dir="ltr" value="<?= portal_h($prefillPlans) ?>" placeholder="https://www.dropbox.com/...">
            <small class="form-note">הקישור נשמר בתיק הלקוח ונשלח לחשמלאי יחד עם טופס ה-AS-MADE.</small>
        </label>
        <label class="field field--full">
            <span>תיקוני תכנית מהשטח</span>
            <textarea name="sv_plan_corrections" rows="4" maxlength="3000" placeholder="מה שונה מול התכנית אחרי המעבר בשטח — נקודות שהוזזו, תוספות, ביטולים"></textarea>
        </label>

        <div class="field--full"><h2>חשמלאי, הדרכה וחתימה</h2><p class="form-note">בסיום הסיור מחתימים את החשמלאי שקיבל הדרכה ואת התכניות. בסימון אחד הוא מקבל מייל עם הפרוטוקול, התכניות וקישור לטופס AS-MADE.</p></div>
        <label class="field">
            <span>שם החשמלאי</span>
            <input type="text" name="sv_electrician_name" maxlength="180" value="<?= portal_h((string) ($project['electrician'] ?? '')) ?>">
        </label>
        <label class="field">
            <span>טלפון החשמלאי</span>
            <input type="tel" name="sv_electrician_phone" maxlength="40" dir="ltr" value="<?= portal_h((string) ($project['electrician_phone'] ?? '')) ?>">
        </label>
        <label class="field">
            <span>דוא״ל החשמלאי</span>
            <input type="email" name="sv_electrician_email" maxlength="160" dir="ltr" value="<?= portal_h((string) ($project['electrician_email'] ?? '')) ?>">
        </label>
        <label class="field">
            <span>מפקח בנייה / נציג יזם שנכח</span>
            <input type="text" name="sv_site_supervisor" maxlength="180" value="<?= portal_h($prefillSupervisor) ?>">
        </label>
        <label class="field">
            <span>ניתנה הדרכה לחשמלאי</span>
            <select name="sv_training_given">
                <option value="0">לא</option>
                <option value="1">כן</option>
            </select>
        </label>
        <label class="field">
            <span>נמסרו לחשמלאי התכניות</span>
            <select name="sv_plans_handed">
                <option value="0">לא</option>
                <option value="1">כן</option>
            </select>
        </label>
        <label class="field">
            <span>שליחת AS-MADE ופרוטוקול לחשמלאי</span>
            <select name="sv_send_electrician">
                <option value="0">לא לשלוח כרגע</option>
                <option value="1">לשלוח מייל לחשמלאי</option>
            </select>
        </label>
        <label class="field">
            <span>שם החותם</span>
            <input type="text" name="sv_signature_name" maxlength="180" placeholder="שם החשמלאי החותם">
        </label>
        <div class="field field--full supervision-signature">
            <span>חתימת החשמלאי</span>
            <canvas id="supervision-signature-pad" class="supervision-signature__pad" width="900" height="220" aria-label="אזור חתימה"></canvas>
            <input type="hidden" name="sv_signature" id="supervision-signature-data">
            <div class="supervision-signature__tools">
                <button type="button" class="button button--secondary button--small" id="supervision-signature-clear">ניקוי החתימה</button>
                <small class="form-note">החתימה נשמרת בתיק הלקוח ומצורפת לדוח שנשלח למחלקת פרויקטים.</small>
            </div>
        </div>

        <div class="field--full"><h2>גימור, אביזרים וציוד</h2></div>
        <label class="field">
            <span>צבע אינטרקום</span>
            <select name="sv_intercom_color">
                <?php foreach (portal_supervision_choice_labels()['intercom_color'] as $value => $label): ?>
                    <option value="<?= portal_h((string) $value) ?>"><?= portal_h($label) ?></option>
                <?php endforeach; ?>
            </select>
        </label>
        <label class="field">
            <span>צבע מפסקים</span>
            <select name="sv_switch_color">
                <?php foreach (portal_supervision_choice_labels()['switch_color'] as $value => $label): ?>
                    <option value="<?= portal_h((string) $value) ?>"><?= portal_h($label) ?></option>
                <?php endforeach; ?>
            </select>
        </label>
        <label class="field">
            <span>צבע רמקולים</span>
            <select name="sv_speaker_color">
                <?php foreach (portal_supervision_choice_labels()['speaker_color'] as $value => $label): ?>
                    <option value="<?= portal_h((string) $value) ?>"><?= portal_h($label) ?></option>
                <?php endforeach; ?>
            </select>
        </label>
        <label class="field">
            <span>קופסאות שקיעה</span>
            <select name="sv_boxes_status">
                <?php foreach (portal_supervision_choice_labels()['boxes_status'] as $value => $label): ?>
                    <option value="<?= portal_h((string) $value) ?>"><?= portal_h($label) ?></option>
                <?php endforeach; ?>
            </select>
        </label>
        <label class="field">
            <span>כמות קופסאות שקיעה</span>
            <input type="text" name="sv_boxes_count" maxlength="4" inputmode="numeric" dir="ltr">
        </label>
        <label class="field">
            <span>גלאי KNX באתר</span>
            <select name="sv_knx_detector">
                <?php foreach (portal_supervision_choice_labels()['knx_detector'] as $value => $label): ?>
                    <option value="<?= portal_h((string) $value) ?>"><?= portal_h($label) ?></option>
                <?php endforeach; ?>
            </select>
        </label>
        <label class="field field--full">
            <span>הערות גימור ואביזרים</span>
            <input type="text" name="sv_finish_notes" maxlength="1000" placeholder="דגמים, גוונים מיוחדים, שינויים שהלקוח ביקש">
        </label>

        <div class="field--full"><h2>צ׳קליסט הביקורת</h2><p class="form-note">יש לסמן רק את הסעיפים שנבדקו. סעיף שנשאר "לא נבדק" וללא הערה לא יופיע בדוח.</p></div>
        <?php portal_render_supervision_checklist_fields(); ?>

        <?php portal_render_supervision_findings_fields(); ?>

        <div class="field--full"><h2>סיכום וסגירה</h2></div>
        <label class="field">
            <span>תוצאת הביקורת <b>*</b></span>
            <select name="sv_result" required>
                <option value="">בחירה</option>
                <?php foreach (portal_supervision_result_labels() as $value => $label): ?>
                    <option value="<?= portal_h($value) ?>"><?= portal_h($label) ?></option>
                <?php endforeach; ?>
            </select>
        </label>
        <label class="field">
            <span>ביקורת חוזרת בתאריך</span>
            <input type="date" name="sv_next_visit">
        </label>
        <label class="field field--full">
            <span>סיכום והנחיות להמשך <b>*</b></span>
            <textarea name="sv_summary" rows="5" maxlength="3000" required></textarea>
        </label>
        <label class="field field--full">
            <span>שינויים מהתכנית המקורית</span>
            <textarea name="sv_changes" rows="3" maxlength="2000" placeholder="לדוגמה: נוסף זוג רמקולים חיצוניים ליד הטלוויזיה; נוספה טלוויזיה ליד הבריכה — שני צינורות עד לריכוז"></textarea>
        </label>
        <label class="field field--full">
            <span>תמונות מהאתר</span>
            <input type="file" name="sv_photos[]" accept="image/*,application/pdf" multiple capture="environment">
            <small class="form-note">עד <?= (int) IFEEL_PORTAL_MAX_FILES ?> קבצים, כל קובץ עד 12MB.</small>
        </label>

        <div class="field--full">
            <h2>שליחה ללקוח</h2>
            <p class="form-note">המפקח בדוח: <strong><?= portal_h($inspectorName) ?></strong> — נקבע אוטומטית לפי המשתמש המחובר לפורטל.</p>
        </div>
        <label class="field">
            <span>דוא״ל הלקוח</span>
            <input type="email" name="sv_customer_email" maxlength="160" dir="ltr" value="<?= portal_h($prefillEmail) ?>">
        </label>
        <label class="field">
            <span>שליחת עותק ללקוח</span>
            <select name="sv_send_customer">
                <option value="1" selected>לשלוח סיכום ללקוח</option>
                <option value="0">לא לשלוח כרגע</option>
            </select>
            <small class="form-note">ברירת המחדל — הלקוח מקבל סיכום נקי, בלי ההערות הפנימיות.</small>
        </label>

        <div class="field field--full field--actions">
            <button type="submit" class="button button--primary button--wide">שמירת דוח הפיקוח ושליחה</button>
        </div>
    </form>

    <?php portal_render_supervision_history($user, $customerFilter); ?>
    <?php
}
