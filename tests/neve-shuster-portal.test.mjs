import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portalDir = path.join(root, 'public', 'neve-shuster');
const index = readFileSync(path.join(portalDir, 'index.php'), 'utf8');
const bootstrap = readFileSync(path.join(portalDir, '_bootstrap.php'), 'utf8');
const lead = readFileSync(path.join(portalDir, '_lead.php'), 'utf8');

test('Neve Shuster hero uses the approved content and project facts', () => {
  const hero = index.slice(index.indexOf('<div class="shell hero">'), index.indexOf('</header>'));
  assert.match(hero, /<strong>בכל דירה בפרויקט כבר מותקנת מערכת בית חכם\.<\/strong>/);
  assert.match(hero, /ליד הכניסה מותקן מפסק מעוצב, עם שליטה בתאורה ובתריס הוויטרינה/);
  assert.match(hero, /מכאן אפשר להמשיך ולהרחיב את הבית החכם לפי הצרכים שלכם/);
  assert.match(hero, /כניסה משוערת/);
  assert.match(hero, /<strong>2027<\/strong>/);
  assert.match(hero, /<strong>195<\/strong><span>דירות בפרויקט<\/span>/);
  assert.match(hero, /<strong>9,000\+<\/strong><span>לקוחות<\/span>/);
  assert.doesNotMatch(hero, /2008|דוד/iu);
});

test('standard, audio and activation copy stays within the approved technology stack', () => {
  assert.match(index, /מפסק מעוצב ליד הכניסה<\/strong><span>שליטה בתאורה ובתריס הוויטרינה\.<\/span>/);
  assert.match(index, /שליטה מהטלפון<\/strong><span>שליטה במערכת החכמה באמצעות אפליקציית TouchWand\.<\/span>/);
  assert.match(index, /אודיו לבית<\/h3>/);
  assert.match(index, /רמקולים שקועים בתקרה, סאונדבר לסלון או מערכת אודיו מלאה\./);
  assert.match(index, /איך מפעילים את הבית החכם\?/);
  assert.match(index, /למדריך SmartSphere/);
  assert.doesNotMatch(index, /Home\s*Assistant|Schneider|\bKNX\b|G9yoryz8T9A|מכירים את המסך/iu);
});

test('Neve Shuster uses the rectangular TouchWand switch artwork', () => {
  assert.equal((index.match(/touchwand-panel-9-rectangular\.webp/g) || []).length, 2);
  assert.match(index, /'panel9-rectangular\.webp'/);
  assert.doesNotMatch(index, /touchwand-panel-9\.jpg|'panel9\.jpg'/);
});

test('price list matches the approved 2.7.26 project price sheet', () => {
  const priceList = index.slice(index.indexOf('$priceGroups = ['), index.indexOf('$contacts = ['));
  const expectedPrices = [
    ['TW601090-916-R-WA', '1,225'],
    ['Glasswand 1-b w', '550'],
    ['Glasswand 2-b w', '563'],
    ['Glasswand 3-b w', '575'],
    ['Glasswand 2-shut w', '575'],
    ['129020', '580'],
    ['TW303100-916-E', '463'],
    ['IFW008', '562'],
    ['TW303200-916-E', '550'],
    ['זוג רמקולים קדמיים סטליטיים', '5,620'],
    ['סאונדבר אלחוטי איכותי', '1,500 עד 3,750'],
    ['גלאי מגנט או גלאי נפח אלחוטי', '460'],
    ['גלאי עשן אלחוטי', '480'],
    ['גלאי הצפה אלחוטי', '430'],
    ['מערכת אזעקה אלחוטית עם גלאי מגנט בדלת וגלאי נפח פנימי', '3,000'],
  ];

  for (const [label, price] of expectedPrices) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedPrice = price.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(priceList, new RegExp(`${escapedLabel}[^\\r\\n]*'${escapedPrice}'`), `wrong price for ${label}`);
  }

  assert.doesNotMatch(priceList, /16A GLASS|IFW-ICON|IFW-BLACK|WiComm Pro|6,744|4,500|3,600/);
  assert.match(priceList, /בעלות 220 ש"ח בתוספת מע"מ/);
  assert.match(index, /התשלום אינו כולל את עבודת החשמלאי מטעם קבלן החשמל בפרויקט/);
});

test('quote form collects the requested building, apartment and interest fields', () => {
  assert.match(index, /<select name="building"[^>]*required>/);
  assert.match(index, /\$buildingNumber = 1; \$buildingNumber <= 5; \$buildingNumber\+\+/);
  assert.match(index, /<option value="<\?= \$buildingNumber \?>">בניין <\?= \$buildingNumber \?><\/option>/);
  assert.match(index, /name="apartment"[^>]*required/);
  assert.match(index, /name="apartment_type"/);
  assert.match(index, /name="name"/);
  assert.match(index, /name="phone"/);

  for (const label of [
    'תריסים נוספים',
    'אודיו',
    'אזעקה ומצלמות',
    'רשת תקשורת',
    'מצב שבת וחגים',
    'שינויים בתכניות הדירה',
    'חבילת שדרוג מלאה',
    'אחר',
  ]) {
    assert.ok(lead.includes(`'${label}'`), `missing interest option: ${label}`);
  }
});

test('personal-link profile supports safe automatic form completion', () => {
  assert.match(bootstrap, /email\|building\|apartment\|apartment_type\|name\|phone\|proposal_url/);
  assert.match(bootstrap, /function nsh_normalize_building/);
  assert.match(bootstrap, /function nsh_normalize_proposal_url/);
  assert.match(index, /זוהה לפי הקישור האישי/);
  assert.match(index, /לצפייה בהצעה לשינויי הדיירים/);
});

test('private resident data is denied and excluded from Git', () => {
  const htaccess = readFileSync(path.join(portalDir, '.htaccess'), 'utf8');
  const gitignore = readFileSync(path.join(portalDir, '.gitignore'), 'utf8');
  assert.match(htaccess, /FilesMatch "\^residents\\\.txt\$"[\s\S]*Require all denied/);
  assert.match(gitignore, /^residents\.txt$/m);
  assert.equal(existsSync(path.join(portalDir, 'residents.txt')), false);
});

test('all portal-local images, scripts and styles referenced by the page exist', () => {
  const references = [...index.matchAll(/(?:src|href)="(\/neve-shuster\/[^"?#]+)(?:[?#][^"]*)?"/g)]
    .map((match) => match[1])
    .filter((reference) => !reference.includes('<'));
  assert.ok(references.length > 0);
  for (const reference of references) {
    const localPath = path.join(root, 'public', ...reference.split('/').filter(Boolean));
    assert.ok(existsSync(localPath), `missing portal asset: ${reference}`);
  }
});
