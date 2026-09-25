import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/assets/webmcp.js', import.meta.url), 'utf8');
const profile = JSON.parse(await readFile(new URL('../src/data/agent-profile.json', import.meta.url), 'utf8'));

async function setup({ supported = true, fetchImpl } = {}) {
  const tools = new Map();
  const calls = [];
  const events = new Map();
  const warnings = [];
  const context = {
    AbortController, URL,
    document: supported ? { modelContext: {
      registerTool(tool, options) { tools.set(tool.name, { ...tool, options }); }
    } } : {},
    window: { location: { origin: 'https://i-feel.co.il', assign(url) { calls.push(['navigate', url]); } },
      addEventListener(name, callback) { events.set(name, callback); } },
    console: { warn(...args) { warnings.push(args); } },
    fetch: async (url, options) => {
      calls.push([url, options]);
      return fetchImpl ? fetchImpl(url, options) : { ok: true, json: async () => profile };
    }
  };
  vm.runInNewContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  return { tools, calls, events, warnings };
}

test('unsupported browsers have no registration, network calls or failures', async () => {
  const { tools, calls, warnings } = await setup({ supported: false });
  assert.equal(tools.size, 0);
  assert.equal(calls.length, 0);
  assert.equal(warnings.length, 0);
});

test('existing tools coexist with the contact route and clean up on pagehide', async () => {
  const { tools, events, calls, warnings } = await setup();
  for (const name of ['get_ifeel_company_capabilities', 'find_ifeel_page',
    'get_ifeel_customer_portal_status', 'open_ifeel_customer_portal', 'get_ifeel_contact_path']) {
    assert.ok(tools.has(name), name);
  }
  assert.equal(tools.size, 5);
  assert.equal(calls.length, 0);
  assert.equal(warnings.length, 0);
  const company = tools.get('get_ifeel_company_capabilities').execute();
  assert.equal(company.contact.phone, profile.contact.phone);
  assert.equal(company.contact.whatsappUrl, profile.contact.whatsappUrl);
  assert.equal(company.bms.separateService, true);
  events.get('pagehide')();
  for (const tool of tools.values()) assert.equal(tool.options.signal.aborted, true);
});

test('all contact routes only read public data and never report completion', async () => {
  const { tools, calls } = await setup();
  const tool = tools.get('get_ifeel_contact_path');
  assert.equal(tool.annotations.readOnlyHint, true);
  const controller = new AbortController();
  for (const intent of ['quote', 'plans', 'meeting', 'bms']) {
    const result = await tool.execute({ intent }, { signal: controller.signal });
    assert.equal(result.url, profile.actions[intent].url);
    assert.equal(result.completed, false);
    assert.equal(result.userReviewRequired, true);
  }
  assert.equal(calls.length, 4);
  for (const [url, options] of calls) {
    assert.equal(url, '/agent-info.json');
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.signal, controller.signal);
  }
  assert.equal(profile.actions.plans.directWebsiteUpload, false);
  assert.equal(profile.actions.meeting.instantBooking, false);
});

test('unknown and prototype keys cannot select routes or initiate network calls', async () => {
  const { tools, calls } = await setup();
  const tool = tools.get('get_ifeel_contact_path');
  for (const intent of ['', '__proto__', 'constructor', 'https://example.org', null]) {
    assert.equal((await tool.execute({ intent })).found, false);
  }
  assert.equal((await tool.execute()).found, false);
  assert.equal(calls.length, 0);
});

test('failed metadata lookup never returns a false success', async () => {
  const { tools } = await setup({ fetchImpl: async () => ({ ok: false }) });
  await assert.rejects(tools.get('get_ifeel_contact_path').execute({ intent: 'quote' }), /unavailable/);
});

test('existing search and portal navigation retain their behavior', async () => {
  const { tools, calls } = await setup({ fetchImpl: async () => ({ ok: true, json: async () => [
    { title: 'KNX בישראל', description: 'תכנון ותכנות', url: '/knx-smart-home/' }
  ] }) });
  const search = await tools.get('find_ifeel_page').execute({ topic: 'KNX' });
  assert.equal(search.found, true);
  assert.equal(search.results[0].url, 'https://i-feel.co.il/knx-smart-home/');
  assert.equal(calls[0][0], '/search-index.json');
  const portal = tools.get('open_ifeel_customer_portal').execute();
  assert.equal(portal.opened, true);
  assert.deepEqual(calls[1], ['navigate', '/customer-portal/index.php']);
});
