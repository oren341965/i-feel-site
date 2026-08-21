<?php
/**
 * I FEEL · AS-MADE · קליטת טופס בקרי לוח מהאתר
 * ------------------------------------------------------------------
 * מקבל JSON מדף המילוי, בונה קובץ .xlsx אמיתי, שולח מייל לצוות
 * ועותק לחשמלאי, ושומר ארכיון JSON על השרת.
 *
 * התקנה ב-cPanel:
 *   1. להעלות ל-public_html/as-made/submit.php
 *   2. mkdir public_html/as-made/_submissions  (chmod 750)  + .htaccess חוסם
 *   3. לוודא ש-ZipArchive ו-mail() פעילים (PHP 7.4+)
 */

// ==================== הגדרות ====================
const TEAM = [
    'cheyne@i-feel.co.il' => 'שיין אבנס — מנהל פרויקטים',
    'kiril@i-feel.co.il'  => 'קיריל — בקרת מבנה',
    'ora@i-feel.co.il'    => 'אורה — תכנות',
    'oren@i-feel.co.il'   => 'אורן לוי — מנכ"ל',
];
const FROM_MAIL = 'noreply@i-feel.co.il';
const FROM_NAME = 'I FEEL · טפסי AS-MADE';
const ARCHIVE   = __DIR__ . '/_submissions';
const MAX_BYTES = 900000;      // ~900KB — יותר מזה זה לא טופס
const MIN_SECS  = 8;           // מהירות מילוי מינימלית (אנטי-בוט)

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function fail($msg, $code = 400) {
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('שיטה לא נתמכת', 405);

$raw = file_get_contents('php://input', false, null, 0, MAX_BYTES + 1);
if ($raw === false || strlen($raw) > MAX_BYTES) fail('הטופס גדול מדי');
$d = json_decode($raw, true);
if (!is_array($d) || empty($d['rows']) || !is_array($d['rows'])) fail('לא התקבלו נתונים');

// ---- הגנות ----
if (!empty($d['hp'])) { echo json_encode(['ok' => true]); exit; }   // מלכודת ספאם
$ip  = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
$thr = sys_get_temp_dir() . '/ifeel_asmade_' . md5($ip);
if (file_exists($thr) && (time() - filemtime($thr)) < MIN_SECS) fail('נא להמתין רגע ולנסות שוב', 429);
@touch($thr);

$head  = is_array($d['head'] ?? null) ? $d['head'] : [];
$cols  = is_array($d['cols'] ?? null) ? $d['cols'] : [];
$rows  = $d['rows'];
$title = mb_substr((string)($d['title'] ?? 'בקר'), 0, 80);
$code  = preg_replace('/[^a-z0-9\-]/', '', (string)($d['code'] ?? 'controller'));
if (count($rows) > 400 || count($cols) > 30) fail('הטופס חורג מהגודל המותר');

$clean = function ($v) { return trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', (string)$v)); };
$hdrOk = function ($v) { return trim(str_replace(["\r", "\n", "\0"], '', (string)$v)); };

$project = $clean($head['project'] ?? '') ?: 'ללא שם פרויקט';
$elec    = $clean($head['elec'] ?? '')    ?: 'חשמלאי לא מזוהה';
$phone   = $clean($head['phone'] ?? '');
$mail    = filter_var($clean($head['email'] ?? ''), FILTER_VALIDATE_EMAIL) ?: '';
$custMail = filter_var($clean($head['custmail'] ?? ''), FILTER_VALIDATE_EMAIL) ?: '';
if ($project === 'ללא שם פרויקט' || $elec === 'חשמלאי לא מזוהה' || $mail === '')
    fail('חסרים פרטי פרויקט / חשמלאי / דוא"ל');

// ==================== בניית XLSX ====================
function xesc($s) { return htmlspecialchars((string)$s, ENT_QUOTES | ENT_XML1, 'UTF-8'); }
function colLetter($i) {                       // 1 => A
    $s = '';
    while ($i > 0) { $m = ($i - 1) % 26; $s = chr(65 + $m) . $s; $i = intdiv($i - 1 - $m, 26); }
    return $s;
}

/** @return string נתיב לקובץ xlsx זמני */
function build_xlsx(array $cols, array $rows, array $head, string $title): string {
    $sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        . '<sheetViews><sheetView rightToLeft="1" workbookViewId="0" tabSelected="1">'
        . '<pane ySplit="' . (count($head) + 4) . '" topLeftCell="A' . (count($head) + 5)
        . '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>';
    $n = count($cols);
    for ($i = 1; $i <= $n; $i++)
        $sheet .= '<col min="' . $i . '" max="' . $i . '" width="' . ($i <= 4 ? 12 : 22) . '" customWidth="1"/>';
    $sheet .= '</cols><sheetData>';

    $r = 0;
    $cell = function ($col, $row, $val, $style) {
        if ($val === '' || $val === null) return '<c r="' . colLetter($col) . $row . '" s="' . $style . '"/>';
        return '<c r="' . colLetter($col) . $row . '" s="' . $style . '" t="inlineStr">'
             . '<is><t xml:space="preserve">' . xesc($val) . '</t></is></c>';
    };

    // כותרת
    $r++;
    $sheet .= '<row r="1" ht="26" customHeight="1">' . $cell(1, 1, 'טופס AS-MADE · ' . $title . ' · I FEEL', 1);
    for ($i = 2; $i <= $n; $i++) $sheet .= $cell($i, 1, '', 1);
    $sheet .= '</row>';

    // פרטי הפרויקט
    $labels = ['project' => 'שם הפרויקט / לקוח', 'address' => 'כתובת האתר',
               'quote' => "מס' הצעה / הזמנה", 'panel' => 'מספר הלוח',
               'custmail' => 'דוא"ל הלקוח', 'elec' => 'שם החשמלאי',
               'phone' => 'טלפון', 'email' => 'דוא"ל', 'date' => 'תאריך מילוי'];
    foreach ($labels as $k => $lab) {
        $r++;
        $sheet .= '<row r="' . $r . '">' . $cell(1, $r, $lab, 2) . $cell(2, $r, $head[$k] ?? '', 0);
        for ($i = 3; $i <= $n; $i++) $sheet .= $cell($i, $r, '', 0);
        $sheet .= '</row>';
    }
    $r++;                                             // שורת רווח
    $sheet .= '<row r="' . $r . '"/>';

    // כותרות עמודות (עברית + ערבית)
    $r++;
    $sheet .= '<row r="' . $r . '" ht="30" customHeight="1">';
    foreach ($cols as $i => $c) $sheet .= $cell($i + 1, $r, $c['he'] ?? '', 3);
    $sheet .= '</row>';
    $r++;
    $sheet .= '<row r="' . $r . '" ht="22" customHeight="1">';
    foreach ($cols as $i => $c) $sheet .= $cell($i + 1, $r, $c['ar'] ?? '', 4);
    $sheet .= '</row>';

    // נתונים
    foreach ($rows as $row) {
        if (!is_array($row)) continue;
        $r++;
        $sheet .= '<row r="' . $r . '">';
        foreach ($cols as $i => $c) {
            $type = $c['type'] ?? 'text';
            if ($type === 'lock') { $sheet .= $cell($i + 1, $r, 'ימולא ע"י I FEEL', 5); continue; }
            $key = $c['key'] ?? '';
            $val = $key !== '' && isset($row[$key]) ? (string)$row[$key] : '';
            $sheet .= $cell($i + 1, $r, $val, $type === 'auto' ? 2 : 0);
        }
        $sheet .= '</row>';
    }
    $sheet .= '</sheetData><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>';

    $styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      . '<fonts count="5">'
      . '<font><sz val="10"/><name val="Arial"/></font>'
      . '<font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>'
      . '<font><b/><sz val="10"/><name val="Arial"/></font>'
      . '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>'
      . '<font><i/><sz val="8"/><color rgb="FF6B7280"/><name val="Arial"/></font>'
      . '</fonts>'
      . '<fills count="6"><fill><patternFill patternType="none"/></fill>'
      . '<fill><patternFill patternType="gray125"/></fill>'
      . '<fill><patternFill patternType="solid"><fgColor rgb="FF1F3A5F"/></patternFill></fill>'
      . '<fill><patternFill patternType="solid"><fgColor rgb="FFEAF1F8"/></patternFill></fill>'
      . '<fill><patternFill patternType="solid"><fgColor rgb="FF35597F"/></patternFill></fill>'
      . '<fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/></patternFill></fill>'
      . '</fills>'
      . '<borders count="2"><border/><border><left style="thin"/><right style="thin"/>'
      . '<top style="thin"/><bottom style="thin"/></border></borders>'
      . '<cellStyleXfs count="1"><xf/></cellStyleXfs>'
      . '<cellXfs count="6">'
      . '<xf fontId="0" fillId="0" borderId="1" applyBorder="1"><alignment vertical="center" readingOrder="2" wrapText="1"/></xf>'
      . '<xf fontId="1" fillId="2" borderId="0" applyFill="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf>'
      . '<xf fontId="2" fillId="3" borderId="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center" readingOrder="2"/></xf>'
      . '<xf fontId="3" fillId="2" borderId="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1" readingOrder="2"/></xf>'
      . '<xf fontId="3" fillId="4" borderId="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1" readingOrder="2"/></xf>'
      . '<xf fontId="4" fillId="5" borderId="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf>'
      . '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

    $tmp = tempnam(sys_get_temp_dir(), 'asmade') . '.xlsx';
    $z = new ZipArchive();
    if ($z->open($tmp, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true)
        throw new RuntimeException('zip');
    $z->addFromString('[Content_Types].xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      . '<Default Extension="xml" ContentType="application/xml"/>'
      . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      . '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      . '</Types>');
    $z->addFromString('_rels/.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      . '</Relationships>');
    $z->addFromString('xl/workbook.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
      . 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      . '<sheets><sheet name="AS-MADE" sheetId="1" r:id="rId1"/></sheets></workbook>');
    $z->addFromString('xl/_rels/workbook.xml.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      . '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      . '</Relationships>');
    $z->addFromString('xl/styles.xml', $styles);
    $z->addFromString('xl/worksheets/sheet1.xml', $sheet);
    $z->close();
    return $tmp;
}

// ---- ניקוי הנתונים לפני בנייה ----
$safeRows = [];
foreach ($rows as $row) {
    if (!is_array($row)) continue;
    $o = [];
    foreach ($row as $k => $v) {
        if (!is_scalar($v)) continue;
        $o[preg_replace('/[^a-zA-Z_]/', '', (string)$k)] = mb_substr($clean($v), 0, 300);
    }
    $safeRows[] = $o;
}
$safeHead = [];
foreach ($head as $k => $v) if (is_scalar($v)) $safeHead[$k] = mb_substr($clean($v), 0, 200);

try { $xlsx = build_xlsx($cols, $safeRows, $safeHead, $title); }
catch (Throwable $e) { fail('שגיאה בבניית הקובץ', 500); }

// ==================== ארכיון ====================
$stamp = date('Ymd-His');
$slug  = preg_replace('/[^\p{L}\p{N}\-_]+/u', '-', $project);
$slug  = mb_substr(trim($slug, '-'), 0, 40);
$base  = "AS-MADE_{$slug}_{$code}_{$stamp}";
// תיקיית הארכיון מגינה על עצמה: נוצרת עם .htaccess חוסם עוד לפני שנכתב אליה מידע.
// אם לא הצלחנו לכתוב את ההגנה — לא שומרים כלום. המייל יוצא בכל מקרה.
$archiveOk = false;
if (is_dir(ARCHIVE) || @mkdir(ARCHIVE, 0750, true)) {
    $ht = ARCHIVE . '/.htaccess';
    if (!is_file($ht)) {
        @file_put_contents($ht,
            "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n" .
            "<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n" .
            "Options -Indexes\n");
    }
    if (!is_file(ARCHIVE . '/index.html')) @file_put_contents(ARCHIVE . '/index.html', '');
    $archiveOk = is_file($ht);
}
if ($archiveOk) {
    @file_put_contents(ARCHIVE . "/{$base}.json",
        json_encode(['ip' => $ip, 'head' => $safeHead, 'code' => $code, 'title' => $title,
                     'rows' => $safeRows], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    @copy($xlsx, ARCHIVE . "/{$base}.xlsx");
}

// ==================== מייל ====================
$filled = count(array_filter($safeRows, function ($r) {
    foreach (['room','desc','load','motor','power','travel','action','notes'] as $k)
        if (!empty($r[$k])) return true;
    return false;
}));
$panels = count(array_unique(array_map(function ($r) { return $r['pnl'] ?? ''; }, $safeRows)));

$rowsHtml = '';
foreach ($safeRows as $r) {
    $rowsHtml .= '<tr>'
        . '<td>' . htmlspecialchars($r['pnl'] ?? '') . '</td>'
        . '<td>' . htmlspecialchars($r['out'] ?? '') . '</td>'
        . '<td>' . htmlspecialchars($r['room'] ?? '') . '</td>'
        . '<td>' . htmlspecialchars($r['desc'] ?? '') . '</td>'
        . '<td>' . htmlspecialchars($r['load'] ?? ($r['motor'] ?? '')) . '</td>'
        . '<td>' . htmlspecialchars($r['action'] ?? '') . '</td>'
        . '<td>' . htmlspecialchars($r['notes'] ?? '') . '</td></tr>';
}

$body = '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;color:#1a2330">'
  . '<h2 style="color:#1f3a5f;margin:0 0 4px">טופס AS-MADE חדש התקבל מהאתר</h2>'
  . '<p style="margin:0 0 14px;color:#6b7280">' . htmlspecialchars($title) . '</p>'
  . '<table cellpadding="6" style="border-collapse:collapse;font-size:14px">'
  . '<tr><td><b>פרויקט / לקוח</b></td><td>' . htmlspecialchars($project) . '</td></tr>'
  . '<tr><td><b>כתובת האתר</b></td><td>' . htmlspecialchars($safeHead['address'] ?? '') . '</td></tr>'
  . '<tr><td><b>מס\' הצעה</b></td><td>' . htmlspecialchars($safeHead['quote'] ?? '') . '</td></tr>'
  . '<tr><td><b>מספר הלוח</b></td><td>' . htmlspecialchars($safeHead['panel'] ?? '') . '</td></tr>'
  . '<tr><td><b>דוא"ל הלקוח</b></td><td>' . ($custMail
        ? '<a href="mailto:' . htmlspecialchars($custMail) . '">' . htmlspecialchars($custMail)
          . '</a> — נשלח אליו עותק'
        : '<span style="color:#b42318">לא מולא — הלקוח לא קיבל עותק</span>') . '</td></tr>'
  . '<tr><td><b>חשמלאי</b></td><td>' . htmlspecialchars($elec) . ' · ' . htmlspecialchars($phone)
  . ' · <a href="mailto:' . htmlspecialchars($mail) . '">' . htmlspecialchars($mail) . '</a></td></tr>'
  . '<tr><td><b>בקרים בטופס</b></td><td>' . $panels . '</td></tr>'
  . '<tr><td><b>ערוצים שמולאו</b></td><td>' . $filled . '</td></tr>'
  . '<tr><td><b>התקבל</b></td><td>' . date('d/m/Y H:i') . '</td></tr>'
  . '</table>'
  . '<p style="margin:16px 0 6px"><b>הקובץ המלא מצורף כ-Excel.</b> להלן תצוגה מקדימה:</p>'
  . '<table cellpadding="5" border="1" style="border-collapse:collapse;font-size:12.5px;border-color:#d7dee7">'
  . '<tr style="background:#1f3a5f;color:#fff"><th>בקר</th><th>יציאה</th><th>חדר</th>'
  . '<th>תיאור</th><th>סוג</th><th>פעולה</th><th>הערות</th></tr>' . $rowsHtml . '</table>'
  . '<p style="color:#6b7280;font-size:12px;margin-top:18px">נשלח אוטומטית מטופס AS-MADE באתר i-feel.co.il</p></div>';

$fname   = $base . '.xlsx';
$content = chunk_split(base64_encode(file_get_contents($xlsx)));
$bnd     = '=_ifeel_' . bin2hex(random_bytes(10));

$msg = "--{$bnd}\r\n"
     . "Content-Type: text/html; charset=UTF-8\r\n"
     . "Content-Transfer-Encoding: 8bit\r\n\r\n{$body}\r\n"
     . "--{$bnd}\r\n"
     . "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; "
     . "name=\"{$fname}\"\r\n"
     . "Content-Transfer-Encoding: base64\r\n"
     . "Content-Disposition: attachment; filename=\"{$fname}\"\r\n\r\n{$content}\r\n"
     . "--{$bnd}--";

$subject = '=?UTF-8?B?' . base64_encode("AS-MADE · {$project} · {$title}") . '?=';
$fromHdr = '=?UTF-8?B?' . base64_encode(FROM_NAME) . '?= <' . FROM_MAIL . '>';
$headers = "MIME-Version: 1.0\r\n"
         . "From: {$fromHdr}\r\n"
         . "Reply-To: " . $hdrOk($mail) . "\r\n"
         . "Content-Type: multipart/mixed; boundary=\"{$bnd}\"\r\n";

$sent = @mail(implode(', ', array_keys(TEAM)), $subject, $msg, $headers, '-f' . FROM_MAIL);

// עותק לחשמלאי
$ackBody = '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px">'
  . '<p>שלום ' . htmlspecialchars($elec) . ',</p>'
  . '<p>קיבלנו את טופס ה-AS-MADE שמילאת עבור <b>' . htmlspecialchars($project) . '</b> '
  . '(' . htmlspecialchars($title) . ', ' . $filled . ' ערוצים). מצורף עותק לתיעוד שלך.</p>'
  . '<p>مرحباً، استلمنا نموذج AS-MADE الذي عبّأته. مرفقة نسخة لأرشيفك.</p>'
  . '<p>מנהל הפרויקט יחזור אליך אם נצטרך השלמות.<br>תודה,<br><b>I FEEL</b> · 03-508-9553 · i-feel.co.il</p></div>';
$ackMsg = "--{$bnd}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n{$ackBody}\r\n"
        . "--{$bnd}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; "
        . "name=\"{$fname}\"\r\nContent-Transfer-Encoding: base64\r\n"
        . "Content-Disposition: attachment; filename=\"{$fname}\"\r\n\r\n{$content}\r\n--{$bnd}--";
@mail($hdrOk($mail), '=?UTF-8?B?' . base64_encode('אישור קבלה · טופס AS-MADE · I FEEL') . '?=',
      $ackMsg, "MIME-Version: 1.0\r\nFrom: {$fromHdr}\r\n"
      . "Content-Type: multipart/mixed; boundary=\"{$bnd}\"\r\n", '-f' . FROM_MAIL);

// ---------- עותק ללקוח ----------
if ($custMail !== '' && strcasecmp($custMail, $mail) !== 0) {
    $custBody = '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;color:#1a2330">'
      . '<p>שלום,</p>'
      . '<p>מצורף טופס ה-<b>AS-MADE</b> של לוח החשמל ב<b>' . htmlspecialchars($project) . '</b>.</p>'
      . '<p>זה המסמך שמתאר בדיוק מה מחובר לכל ערוץ בבקר: איזה חדר, איזה מעגל ואיזו פעולה. '
      . 'החשמלאי ' . htmlspecialchars($elec) . ' מילא אותו בשטח, ועל פיו צוות I FEEL מתכנת את המערכת שלכם.</p>'
      . '<p><b>שווה לשמור את הקובץ.</b> בכל שינוי עתידי בבית — הוספת גוף תאורה, החלפת תריס, '
      . 'או קריאת שירות — זה המסמך שחוסך את הבירורים.</p>'
      . '<p style="background:#f0f7f7;border-right:4px solid #0e9a97;padding:11px 14px;margin:18px 0">'
      . 'שימו לב: העמודות האפורות בקובץ ריקות בכוונה — הן מתמלאות אצלנו בשלב התכנות.</p>'
      . '<p>יש שאלה על משהו בטופס? השיבו למייל הזה או חייגו <b>03-508-9553</b>.</p>'
      . '<p>תודה,<br><b>I FEEL</b> · מערכות בית חכם ובקרת מבנה<br>i-feel.co.il</p></div>';
    $custMsg = "--{$bnd}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n{$custBody}\r\n"
             . "--{$bnd}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; "
             . "name=\"{$fname}\"\r\nContent-Transfer-Encoding: base64\r\n"
             . "Content-Disposition: attachment; filename=\"{$fname}\"\r\n\r\n{$content}\r\n--{$bnd}--";
    @mail($hdrOk($custMail),
          '=?UTF-8?B?' . base64_encode('טופס AS-MADE של לוח החשמל · ' . $project . ' · I FEEL') . '?=',
          $custMsg,
          "MIME-Version: 1.0\r\nFrom: {$fromHdr}\r\nReply-To: sales@i-feel.co.il\r\n"
          . "Content-Type: multipart/mixed; boundary=\"{$bnd}\"\r\n", '-f' . FROM_MAIL);
}

@unlink($xlsx);

if (!$sent) fail('הטופס נשמר אצלנו אך שליחת המייל נכשלה — נא ליצור קשר 03-508-9553', 500);
echo json_encode(['ok' => true, 'channels' => $filled, 'file' => $fname,
                  'copies' => $custMail ? 3 : 2], JSON_UNESCAPED_UNICODE);
