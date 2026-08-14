import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const files = {
  lead: new URL('../public/api/lead.php', import.meta.url),
  consume: new URL('../public/api/consume-conversion.php', import.meta.url),
  landing: new URL('../src/layouts/LandingLayout.astro', import.meta.url),
  contact: new URL('../src/page-html/page-07.html', import.meta.url),
};

test('Monday success creates a server-side, expiring conversion proof', async () => {
  const source = await readFile(files.lead, 'utf8');
  assert.match(source, /\$itemId\s*=.*create_item.*id/s);
  assert.match(source, /ads_conversion_proof/);
  assert.match(source, /random_bytes\(32\)/);
  assert.match(source, /redirect_back\('sent',\s*\$conversionProof\)/);
  assert.match(source, /redirect_back\('sent-mail'\)/);
  assert.doesNotMatch(source, /redirect_back\('sent-mail',/);
});

test('conversion proof is session-bound and consumed once', async () => {
  const source = await readFile(files.consume, 'utf8');
  assert.match(source, /hash_equals/);
  assert.match(source, /monday_item_id/);
  assert.match(source, /unset\(\$_SESSION\['ads_conversion_proof'\]\)/);
  assert.match(source, /\['eligible'\s*=>\s*\$eligible\]/);
});

test('contact and landing clients require verifier eligibility before Ads conversion', async () => {
  const landing = await readFile(files.landing, 'utf8');
  const contact = await readFile(files.contact, 'utf8');
  assert.match(landing, /consume-conversion\.php/);
  assert.match(landing, /eligible\s*===\s*true[^}]+adsConversion\('form'\)/s);
  assert.match(contact, /consume-conversion\.php/);
  assert.match(contact, /eligible\s*===\s*true[^}]+gtag\('event', 'conversion'/s);
});
