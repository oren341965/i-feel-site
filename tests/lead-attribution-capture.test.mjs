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
  'wbraid',
  'gbraid',
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
  assert.match(capture, /ifeel_first_tagged_touch_v1/);
  assert.match(capture, /sessionStorage\.setItem\(touchKey, JSON\.stringify/);
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

// Execute the real inline script with inert forms: no request or CRM side effect.
import vm from 'node:vm';
async function visit(storage, search) {
  const source = (await read('src/components/LeadAttributionCapture.astro')).replace(/^<script is:inline>\s*/, '').replace(/<\/script>\s*$/, '');
  const inputs = {};
  const form = {
    querySelector(selector) {
      const name = selector.match(/name="([^"\]]+)"/);
      if (name && ['city', 'heard_from'].includes(name[1])) return { required: false };
      if (name) return inputs[name[1]] || null;
      return { required: false };
    },
    appendChild(input) { inputs[input.name] = input; },
  };
  const context = {
    URL, URLSearchParams,
    window: { location: { search, origin: 'https://i-feel.co.il', pathname: '/contactus/' } },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    document: { referrer: '', readyState: 'complete', addEventListener() {}, createElement: () => ({}),
      querySelectorAll: selector => selector.includes('newsletter') ? [] : [form] },
  };
  vm.runInNewContext(source, context);
  return Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, input.value]));
}

test('a later click ID never attaches to an earlier campaign', async () => {
  const storage = new Map();
  await visit(storage, '?utm_source=google&utm_campaign=first');
  const later = await visit(storage, '?utm_campaign=second&gclid=later-click');
  assert.equal(later.utm_campaign, 'first');
  assert.equal(later.gclid, undefined);
});

test('an untagged entry does not prevent the first tagged touch', async () => {
  const storage = new Map();
  await visit(storage, '');
  const paid = await visit(storage, '?utm_campaign=bms&gclid=first-click');
  assert.equal(paid.utm_campaign, 'bms');
  assert.equal(paid.gclid, 'first-click');
  const direct = await visit(storage, '');
  assert.equal(direct.gclid, 'first-click');
});

test('legacy partial attribution is not mixed with new touch evidence', async () => {
  const storage = new Map([['ifeel_utm_campaign', 'old-campaign']]);
  const paid = await visit(storage, '?utm_campaign=new&gclid=new-click');
  assert.equal(paid.utm_campaign, 'new');
  assert.equal(paid.gclid, 'new-click');
});


test('privacy-preserving Google click IDs stay on the same captured touch', async () => {
  const storage = new Map();
  const first = await visit(storage, '?utm_source=google&utm_campaign=bms&wbraid=web-click&gbraid=app-click');
  assert.equal(first.wbraid, 'web-click');
  assert.equal(first.gbraid, 'app-click');
  const later = await visit(storage, '?utm_campaign=other&gclid=other-click');
  assert.equal(later.wbraid, 'web-click');
  assert.equal(later.gclid, undefined);
});
