import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const webmcpPath = new URL('../public/assets/webmcp.js', import.meta.url);
const portalWebmcpPath = new URL('../public/customer-portal/portal-webmcp.js', import.meta.url);
const portalBootstrapPath = new URL('../public/customer-portal/_portal.php', import.meta.url);
const portalIndexPath = new URL('../public/customer-portal/index.php', import.meta.url);
const baseLayoutPath = new URL('../src/layouts/BaseLayout.astro', import.meta.url);
const landingLayoutPath = new URL('../src/layouts/LandingLayout.astro', import.meta.url);
const htaccessPath = new URL('../public/.htaccess', import.meta.url);

function originTrialToken(source) {
  return source.match(/<meta\s+http-equiv=["']origin-trial["']\s+content=["']([^"']+)["']/i)?.[1] ?? '';
}

test('global WebMCP uses current document.modelContext API', async () => {
  const source = await readFile(webmcpPath, 'utf8');
  assert.match(source, /document\.modelContext/);
  assert.doesNotMatch(source, /navigator\.modelContext/);
  assert.match(source, /get_ifeel_customer_portal_status/);
  assert.match(source, /fetch\('\/search-index\.json'/);
  assert.doesNotMatch(source, /\?s=/);
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
  assert.match(source, /cp_issue_decoy_code/);
  assert.match(source, /items_page_by_column_values/);
  assert.match(source, /column_id:\s*"_____3"/);
  assert.doesNotMatch(source, /next_items_page/);
  assert.doesNotMatch(source, /items_page\(limit:\s*500\)/);
});

test('customer portal root is routed to PHP entry point', async () => {
  const source = await readFile(htaccessPath, 'utf8');
  assert.match(source, /RewriteRule \^customer-portal\/\?\$ \/customer-portal\/index\.php \[L\]/);
});

test('Google WebMCP origin-trial token is installed on public and portal entry points', async () => {
  const [baseLayout, landingLayout, portalIndex] = await Promise.all([
    readFile(baseLayoutPath, 'utf8'),
    readFile(landingLayoutPath, 'utf8'),
    readFile(portalIndexPath, 'utf8')
  ]);
  const tokens = [baseLayout, landingLayout, portalIndex].map(originTrialToken);
  assert.ok(tokens.every(Boolean));
  assert.equal(new Set(tokens).size, 1);
  assert.match(tokens[0], /^[A-Za-z0-9+/]+={0,2}$/);
});
