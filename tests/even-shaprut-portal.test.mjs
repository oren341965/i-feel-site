import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portalDir = path.join(root, 'public', 'even-shaprut');
const index = readFileSync(path.join(portalDir, 'index.php'), 'utf8');
const bootstrap = readFileSync(path.join(portalDir, '_bootstrap.php'), 'utf8');

test('Even Shaprut access is authorized server-side by the exact Monday project group', () => {
  assert.match(bootstrap, /ESP_DEFAULT_BOARD_ID = '2732725332'/);
  assert.match(bootstrap, /ESP_MONDAY_GROUP_ID = 'group_mm15570j'/);
  assert.match(bootstrap, /ESP_MONDAY_GROUP_TITLE = 'אבן שפרוט'/);
  assert.match(bootstrap, /groups\(ids: \$groupIds\)/);
  assert.match(bootstrap, /column_values\(ids: \["numbers21", "text8", "_____3", "location7"\]\)/);
  assert.match(bootstrap, /CUSTOMER_PORTAL_MONDAY_TOKEN/);
  assert.doesNotMatch(bootstrap, /STRICT_ALLOWLIST|residents\.txt/);
  assert.doesNotMatch(index, /\?email=|monday_item_id/);
});

test('project standard matches the supplied specification', () => {
  for (const fact of [
    'מתג מעוצב בכניסה לשליטה על התאורה בחלל המרכזי',
    'מתג זכוכית לתאורת המסדרון',
    'מתג זכוכית לתאורת המרפסת',
    'שני תריסים חשמליים במטבח ובסלון',
    'דוד חכם',
    'נדרש מגע יבש מקבלן המיזוג',
    'תרחישים, תזמונים ושעוני שבת מובנים',
  ]) {
    assert.ok(index.includes(fact), `missing project fact: ${fact}`);
  }
});

test('customer prices are calculated with 18 percent VAT and labelled as VAT-inclusive', () => {
  assert.match(index, /const ESP_VAT_RATE = 0\.18/);
  assert.match(index, /מחירון שדרוגים כולל מע״מ/);
  assert.match(index, /כוללים 18% מע״מ/);
  assert.match(index, /esp_price_with_vat\(1180\)/);
  assert.match(index, /esp_price_with_vat\(498\)/);
  assert.match(index, /esp_price_range_with_vat\(1200, 3350\)/);
  assert.match(index, /esp_price_with_vat\(2460\)/);
  assert.doesNotMatch(index, /אינם כוללים מע״מ|לא כולל מע״מ/);
});

test('pricing and project documents render only inside the authenticated branch', () => {
  const gate = index.indexOf('<?php if ($user === null): ?>');
  const authenticated = index.indexOf('<?php else: ?>', gate);
  const prices = index.indexOf('id="pricelist"');
  const flyer = index.indexOf('ifeel-even-shaprut-flyer.pdf');
  assert.ok(gate >= 0 && authenticated > gate && prices > authenticated && flyer > authenticated);
});

test('all portal-local assets referenced by the page exist', () => {
  const references = [...index.matchAll(/(?:src|href)="(\/even-shaprut\/[^"?#]+)(?:[?#][^"]*)?"/g)]
    .map((match) => match[1])
    .filter((reference) => !reference.includes('<'));
  assert.ok(references.length > 0);
  for (const reference of references) {
    const localPath = path.join(root, 'public', ...reference.split('/').filter(Boolean));
    assert.ok(existsSync(localPath), `missing portal asset: ${reference}`);
  }
});

test('private PHP bootstrap is denied by Apache', () => {
  const htaccess = readFileSync(path.join(portalDir, '.htaccess'), 'utf8');
  assert.match(htaccess, /FilesMatch "\^_bootstrap\\\.php\$"[\s\S]*Require all denied/);
});
