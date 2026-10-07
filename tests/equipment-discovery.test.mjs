import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the equipment catalogue is discoverable from global desktop and mobile navigation', async () => {
  const [header, footer] = await Promise.all([
    read('src/components/Header.astro'),
    read('src/components/Footer.astro'),
  ]);

  assert.match(header, /href="\/equipment\/"[^>]*>מאגר ציוד לפי דגם</);
  assert.equal((footer.match(/href="\/equipment\/"/g) || []).length, 2);
  assert.match(footer, />מאגר ציוד לפי דגם ומק״ט</);
});

test('site search classifies the equipment hub and product pages as product results', async () => {
  const search = await read('src/components/SiteSearch.astro');

  assert.match(search, /url === '\/equipment\/'/);
  assert.match(search, /url\.startsWith\('\/equipment\/'\)/);
  assert.match(search, /isProductHubUrl\(record\.url\)/);
});
