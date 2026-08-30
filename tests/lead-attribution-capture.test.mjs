import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const attributionKeys = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'ttclid',
];

test('both public layouts load the shared attribution capture component', async () => {
  const [baseLayout, landingLayout] = await Promise.all([
    read('src/layouts/BaseLayout.astro'),
    read('src/layouts/LandingLayout.astro'),
  ]);

  for (const layout of [baseLayout, landingLayout]) {
    assert.match(layout, /LeadAttributionCapture/);
    assert.match(layout, /<LeadAttributionCapture\s*\/>/);
  }
});

test('the shared browser capture keeps first-touch attribution and covers every lead form', async () => {
  const capture = await read('src/components/LeadAttributionCapture.astro');

  for (const key of attributionKeys) assert.match(capture, new RegExp(`['\"]${key}['\"]`));
  assert.match(capture, /if \(!stored\)/);
  assert.match(capture, /sessionStorage\.setItem\(storageKey, current\)/);
  assert.match(capture, /form\[action="\/api\/lead\.php"\]/);
  assert.match(capture, /document\.addEventListener\('submit'/);
});

test('lead.php accepts and maps every paid-platform click id to Monday', async () => {
  const leadPhp = await read('public/api/lead.php');

  const mondayMappings = {
    gclid: 'short_textr4lgm1qe',
    fbclid: 'short_textbvepdnis',
    ttclid: 'short_textbggao9rl',
  };

  for (const [key, columnId] of Object.entries(mondayMappings)) {
    assert.match(leadPhp, new RegExp(`['\"]${key}['\"]\\s*=>\\s*field\\(['\"]${key}['\"]`));
    assert.match(leadPhp, new RegExp(`['\"]${key}['\"]\\s*=>\\s*['\"]${columnId}['\"]`));
  }
});
