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
  handler?.({ target: { closest: () => ({ closest: () => tagged, getAttribute: () => href }) } });
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
test('tagged links, external contacts, phones and non-sales pages are excluded', () => {
  assert.equal(click('/smart-home-villa/', '/contactus/', true).length, 0);
  assert.equal(click('/smart-home-villa/', 'https://elsewhere.example/contactus/').length, 0);
  assert.equal(click('/smart-home-villa/', 'tel:035089553').length, 0);
  assert.equal(click('/articles/', '/contactus/').length, 0);
  assert.equal(click('/smart-home-villa/', '/contactus/', false, false).length, 0);
});
