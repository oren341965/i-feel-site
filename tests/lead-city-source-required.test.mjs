import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('shared lead capture requires city and self-reported source on every website lead form', async () => {
  const capture = await read('src/components/LeadAttributionCapture.astro');

  assert.match(capture, /form\[action="\/api\/lead\.php"\]/);
  assert.match(capture, /name="city"/);
  assert.match(capture, /autocomplete="address-level2"/);
  assert.match(capture, /name="heard_from"/);
  assert.match(capture, /איך שמעתם עלינו\?/);
  assert.match(capture, /city\.required = true/);
  assert.match(capture, /heardFrom\.required = true/);
  assert.match(capture, /form\.checkValidity\(\)/);
});

test('shared capture preserves first referrer and first entry page for attribution', async () => {
  const capture = await read('src/components/LeadAttributionCapture.astro');

  assert.match(capture, /ifeel_first_referrer/);
  assert.match(capture, /ifeel_entry_page/);
  assert.match(capture, /document\.referrer/);
  assert.match(capture, /window\.location\.pathname \+ window\.location\.search/);
  assert.match(capture, /setHiddenValue\(form, 'first_referrer'/);
  assert.match(capture, /setHiddenValue\(form, 'entry_page'/);
});

test('lead endpoint rejects missing city or source and stores city in Monday', async () => {
  const leadPhp = await read('public/api/lead.php');

  assert.match(leadPhp, /'city'\s*=>\s*field\('city'/);
  assert.match(leadPhp, /'heard_from'\s*=>\s*field\('heard_from'/);
  assert.match(leadPhp, /\$lead\['city'\]\s*===\s*''/);
  assert.match(leadPhp, /\$lead\['heard_from'\]\s*===\s*''/);
  assert.match(leadPhp, /'location7'\s*=>\s*\$lead\['city'\]/);
  assert.match(leadPhp, /How heard about us:/);
});

test('lead endpoint derives automatic acquisition source from first-touch signals', async () => {
  const leadPhp = await read('public/api/lead.php');

  assert.match(leadPhp, /function attribution_source/);
  assert.match(leadPhp, /Google Ads/);
  assert.match(leadPhp, /Meta \/ Facebook \/ Instagram/);
  assert.match(leadPhp, /TikTok/);
  assert.match(leadPhp, /Google organic/);
  assert.match(leadPhp, /Direct \/ unknown/);
  assert.match(leadPhp, /'first_referrer'\s*=>\s*field\('first_referrer'/);
  assert.match(leadPhp, /'entry_page'\s*=>\s*field\('entry_page'/);
  assert.match(leadPhp, /Automatic source:/);
});
