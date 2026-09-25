import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const webmcpPath = new URL('../public/assets/webmcp.js', import.meta.url);
const portalWebmcpPath = new URL('../public/customer-portal/portal-webmcp.js', import.meta.url);
const portalBootstrapPath = new URL('../public/customer-portal/_portal.php', import.meta.url);
const htaccessPath = new URL('../public/.htaccess', import.meta.url);

test('global WebMCP uses current document.modelContext API', async () => {
  const source = await readFile(webmcpPath, 'utf8');
  assert.match(source, /document\.modelContext/);
  assert.doesNotMatch(source, /navigator\.modelContext/);
  assert.match(source, /get_ifeel_customer_portal_status/);
});

test('authenticated portal WebMCP exposes read-only entitlement tools', async () => {
  const source = await readFile(portalWebmcpPath, 'utf8');
  assert.match(source, /get_ifeel_customer_entitlements/);
  assert.match(source, /get_ifeel_eligible_products/);
  assert.match(source, /readOnlyHint:\s*true/);
  assert.match(source, /credentials:\s*'same-origin'/);
});

test('customer portal keeps Monday token and OTP validation server-side', async () => {
  const source = await readFile(portalBootstrapPath, 'utf8');
  assert.match(source, /MONDAY_API_TOKEN/);
  assert.match(source, /CP_OTP_TTL/);
  assert.match(source, /hash_equals/);
  assert.match(source, /HttpOnly/);
  assert.doesNotMatch(source, /text_mm72mqmv/);
});

test('customer portal root is routed to PHP entry point', async () => {
  const source = await readFile(htaccessPath, 'utf8');
  assert.match(source, /RewriteRule \^customer-portal\/\?\$ \/customer-portal\/index\.php \[L\]/);
});
