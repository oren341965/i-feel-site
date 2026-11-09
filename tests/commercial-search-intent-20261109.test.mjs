import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('commercial smart-home intent has a dedicated early decision section and conversion route', async () => {
  const page = await read('src/pages/smart-home.astro');
  const base = await read('src/page-html/page-16.html');
  assert.match(page, /חברת בית חכם בישראל \| תכנון, התקנה ו-KNX/);
  assert.match(page, /id="choosing-a-smart-home-company"/);
  assert.match(page, /<section id="smart-panel-video"/);
  assert.match(base, /<section id="smart-panel-video"/);
  assert.match(page, /href="\/projects\/private-homes\/"/);
  assert.match(page, /href="\/knx-smart-home\/"/);
  assert.match(page, /href="\/contactus\/\?intent=quote"/);
  assert.match(page, /const smartHomeContent = enrichedContent/);
});

test('homepage links directly to KNX integration and BMS service destinations', async () => {
  const html = await read('src/page-html/index.html');
  assert.match(html, /aria-label="שירותי בית חכם, KNX ובקרת מבנה"/);
  for (const url of ['/smart-home/', '/knx-smart-home/', '/ddc-controllers-bms/', '/bms-industry/']) {
    assert.ok(html.includes('href="' + url + '"'), 'Missing direct homepage link ' + url);
  }
});

test('BMS hub points to DDC and industrial BMS before the deep content', async () => {
  const html = await read('src/page-html/page-18.html');
  const heroEnd = html.indexOf('</section>');
  const routing = html.indexOf('id="bms-professional-routes"');
  assert.ok(heroEnd >= 0 && routing > heroEnd && routing < 4000);
  assert.match(html, /href="\/ddc-controllers-bms\/"/);
  assert.match(html, /href="\/bms-industry\/"/);
});

test('DDC brief uses existing BMS contact flow, with no invented quote pricing', async () => {
  const html = await read('src/page-html/ddc-controllers-bms.html');
  assert.match(html, /id="ddc-project-documents"/);
  assert.match(html, /רשימת נקודות I\/O לפי ציוד ומערכת/);
  assert.match(html, /href="\/contactus\/\?intent=bms"/);
});

test('sitemap marks only materially changed pages with the current date', async () => {
  const sitemap = await read('public/sitemap.xml');
  for (const suffix of ['', 'smart-home/', 'structure-control/', 'ddc-controllers-bms/']) {
    const entry = '<loc>https://i-feel.co.il/' + suffix + '</loc>\n    <lastmod>2026-11-09</lastmod>';
    assert.ok(sitemap.includes(entry), 'Missing sitemap lastmod ' + suffix);
  }
});
