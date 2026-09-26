import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const commerce = new URL('../public/customer-portal/_commerce.php', import.meta.url);
const store = new URL('../public/customer-portal/store.php', import.meta.url);
const webmcp = new URL('../public/customer-portal/commerce-webmcp.js', import.meta.url);
const importer = new URL('../scripts/import-hashavshevet-catalog.mjs', import.meta.url);

test('commerce recalculates prices server-side and never trusts browser price', async()=>{
  const s=await readFile(commerce,'utf8');
  assert.match(s,/cp_customer_product/);
  assert.match(s,/cp_cart_summary/);
  assert.match(s,/cp_create_order/);
  assert.match(s,/CUSTOMER_PORTAL_PAYMENT_URL_TEMPLATE/);
  assert.doesNotMatch(s,/\$_POST\[['"]price/);
});

test('store requires authenticated customer', async()=>{
  const s=await readFile(store,'utf8');
  assert.match(s,/cp_current_user\(\)/);
  assert.match(s,/header\('Location: ' \. CP_BASE_PATH/);
  assert.match(s,/cp_verify_csrf\(\)/);
});

test('commerce WebMCP is read only', async()=>{
  const s=await readFile(webmcp,'utf8');
  assert.match(s,/get_ifeel_online_catalog/);
  assert.match(s,/get_ifeel_cart/);
  assert.match(s,/readOnlyHint:true/);
  assert.doesNotMatch(s,/create_order|checkout|payment/i);
});

test('Hashavshevet importer defaults online=false without explicit flag', async()=>{
  const s=await readFile(importer,'utf8');
  assert.match(s,/idx\.online>=0/);
  assert.match(s,/:false/);
});