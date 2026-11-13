import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/components/SalesPageCtaTracking.astro', import.meta.url), 'utf8').replace(/<\/?script[^>]*>/g, '');
function click(path, href, tagged = false, analytics = true) {
  const calls = [];
  let handler;
  const location = { pathname: path, origin: 'https://i-feel.co.il', href: 'https://i-feel.co.il' + path };
  const window = { location, ...(analytics ? { gtag: (...args) => calls.push(args) } : {}) };
  vm.runInNewContext(source, { window, URL, document: { addEventListener: (_, fn) => { handler = fn; } } });
  const link = { closest: () => tagged, getAttribute: () => href };
  handler?.({ target: { closest: selector => selector === 'a[href]' ? link : tagged } });
  return calls;
}
test('all five sales pages track internal contact transitions with path-only evidence', () => {
  for (const path of ['/smart-home-villa/', '/knx-smart-home/', '/smart-home-system-upgrade/', '/structure-control/', '/bms-retrofit/']) {
    const calls = click(path, '/contactus/?email=private@example.com#contact-form-wrapper');
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1], 'cta_click');
    assert.equal(calls[0][2].sales_page, path);
    assert.equal(calls[0][2].destination_path, '/contactus/');
    assert.ok(!JSON.stringify(calls).includes('private'));
  }
});

test('shared and fallback trackers together emit exactly once for tagged descendants', () => {
  const layout = fs.readFileSync(new URL('../src/layouts/BaseLayout.astro', import.meta.url), 'utf8');
  const shared = layout.match(/document\.addEventListener\('click', function \(e\) \{\s*var el = e\.target\.closest[\s\S]*?\n      \}\);/)[0];
  for (const placement of ['none', 'anchor', 'ancestor', 'descendant']) {
    const calls = [], handlers = [];
    const location = { pathname: '/knx-smart-home/', origin: 'https://i-feel.co.il', href: 'https://i-feel.co.il/knx-smart-home/' };
    const gtag = (...args) => calls.push(args);
    const context = { URL, location, gtag, window: { location, gtag }, document: { addEventListener: (_, fn) => handlers.push(fn) } };
    vm.runInNewContext(shared, context);
    vm.runInNewContext(source, context);
    const tagged = { getAttribute: name => name === 'data-ga-event' ? 'cta_click' : '{"cta_id":"existing_contact"}' };
    const link = { getAttribute: () => '/contactus/?private=excluded#project-enquiry', closest: () => ['anchor', 'ancestor'].includes(placement) ? tagged : null };
    const target = { closest: selector => selector === 'a[href]' ? link : placement === 'none' ? null : tagged };
    for (const handler of handlers) handler({ target });
    assert.equal(calls.length, 1, placement);
    assert.equal(calls[0][1], 'cta_click');
    assert.equal(calls[0][2].cta_id, placement === 'none' ? 'sales_page_contact' : 'existing_contact');
    assert.ok(!JSON.stringify(calls).includes('private'));
  }
});
test('tagged links, external contacts, phones and non-sales pages are excluded', () => {
  assert.equal(click('/smart-home-villa/', '/contactus/', true).length, 0);
  assert.equal(click('/smart-home-villa/', 'https://elsewhere.example/contactus/').length, 0);
  assert.equal(click('/smart-home-villa/', 'tel:035089553').length, 0);
  assert.equal(click('/articles/', '/contactus/').length, 0);
  assert.equal(click('/smart-home-villa/', '/contactus/', false, false).length, 0);
});
test('slash variants identify one sales page without exposing query or fragment', () => {
  for (const path of ['/smart-home-villa', '/knx-smart-home', '/smart-home-system-upgrade', '/structure-control', '/bms-retrofit']) {
    const calls = click(path, '/contactus?phone=private#project-enquiry');
    assert.equal(calls.length, 1);
    assert.equal(calls[0][2].sales_page, path + '/');
    assert.equal(calls[0][2].page_path, path + '/');
    assert.equal(calls[0][2].destination_path, '/contactus/');
    assert.ok(!JSON.stringify(calls).includes('private'));
  }
});
