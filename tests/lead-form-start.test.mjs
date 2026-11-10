import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function browser({ analytics = true } = {}) {
  const source = (await readFile(new URL('../src/components/LeadAttributionCapture.astro', import.meta.url), 'utf8'))
    .replace(/^<script is:inline>\s*/, '').replace(/<\/script>\s*$/, '');
  const listeners = new Map();
  const events = [];
  const window = { location: { search: '', origin: 'https://i-feel.co.il', pathname: '/contactus/' } };
  const enableAnalytics = () => { window.gtag = (...args) => events.push(JSON.parse(JSON.stringify(args))); };
  if (analytics) enableAnalytics();
  vm.runInNewContext(source, {
    URL, URLSearchParams, window,
    sessionStorage: { getItem: () => null, setItem() {} },
    document: { referrer: '', readyState: 'complete', querySelectorAll: () => [],
      addEventListener(name, callback) {
        listeners.set(name, [...(listeners.get(name) || []), callback]);
      } },
  });
  return { events, enableAnalytics,
    edit(form, properties = {}, kind = 'input', isTrusted = true) {
      const target = { form, tagName: 'INPUT', type: 'text', name: 'name',
        value: 'PRIVATE CUSTOMER VALUE', ...properties };
      for (const callback of listeners.get(kind) || []) callback({ target, isTrusted });
    } };
}

function form(action = '/api/lead.php', source = '/lp/smart-home/') {
  return {
    matches: selector => selector === `form[action="${action}"]`,
    querySelector: selector => selector === 'input[name="source_page"]' ? { value: source } : null,
  };
}

test('first real edit emits one start event per form without field values or contact details', async () => {
  const b = await browser();
  const f = form();
  b.edit(f);
  b.edit(f, { name: 'phone', type: 'tel', value: '0501234567' });
  b.edit(f, { name: 'lead_type', tagName: 'SELECT' }, 'change');
  assert.deepEqual(b.events, [['event', 'lead_form_start', { form_path: '/lp/smart-home/' }]]);
});

test('newsletter, hidden, honeypot, disabled and synthetic changes do not mark a lead start', async () => {
  const b = await browser();
  const f = form();
  b.edit(form('/api/newsletter.php'));
  b.edit(f, { type: 'hidden' });
  b.edit(f, { name: 'website' });
  b.edit(f, { disabled: true });
  b.edit(f, {}, 'input', false);
  b.edit(null);
  assert.deepEqual(b.events, []);
  b.edit(f, { tagName: 'TEXTAREA', name: 'message' });
  assert.equal(b.events.length, 1);
});

test('forms added after load each get their own start and input/change share deduplication', async () => {
  const b = await browser();
  const first = form('/api/lead.php', '/lp/bms/');
  const second = form('/api/lead.php', '/lp/smart-home/');
  b.edit(first, { tagName: 'SELECT', name: 'lead_type' }, 'change');
  b.edit(first);
  b.edit(second);
  assert.deepEqual(b.events.map(e => e[2].form_path), ['/lp/bms/', '/lp/smart-home/']);
  assert.ok(b.events.every(e => e[1] === 'lead_form_start'), 'starting a form is never a lead conversion');
});

test('analytics unavailable is harmless and does not suppress a later measurable edit', async () => {
  const b = await browser({ analytics: false });
  const f = form('/api/lead.php', '/contactus/?private=value');
  assert.doesNotThrow(() => b.edit(f));
  assert.deepEqual(b.events, []);
  b.enableAnalytics();
  b.edit(f);
  assert.deepEqual(b.events, [['event', 'lead_form_start', { form_path: '/contactus/' }]]);
});
