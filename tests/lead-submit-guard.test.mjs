import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('lead forms are protected from repeated submission in both layouts', async () => {
  const [guard, baseLayout, landingLayout] = await Promise.all([
    read('src/components/LeadSubmitGuard.astro'),
    read('src/layouts/BaseLayout.astro'),
    read('src/layouts/LandingLayout.astro'),
  ]);

  assert.match(guard, /form\[action="\/api\/lead\.php"\]/);
  assert.match(guard, /leadSubmitting === 'true'/);
  assert.match(guard, /event\.preventDefault\(\)/);
  assert.match(guard, /button\.disabled = true/);
  assert.match(guard, /addEventListener\('pageshow'/);
  assert.match(baseLayout, /<LeadSubmitGuard \/>/);
  assert.match(landingLayout, /<LeadSubmitGuard \/>/);
});
