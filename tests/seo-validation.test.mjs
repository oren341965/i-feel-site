import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const validator = path.resolve('scripts/validate-seo.mjs');
const good = '<title>Example</title><meta name="description" content="Example description"><link rel="canonical" href="https://i-feel.co.il/"><h1>Example</h1>';
async function run(html, sitemap = 'https://i-feel.co.il/', robots = 'User-agent: *\nDisallow: /old/\nDisallow: /shopengine-template/\nDisallow: /staff-expenses/') {
  const cwd = await mkdtemp(path.join(tmpdir(), 'ifeel-seo-test-'));
  try {
    await mkdir(path.join(cwd, 'dist'));
    for (const [name, content] of Object.entries({ 'index.html': html, 'sitemap.xml': `<urlset><url><loc>${sitemap}</loc></url></urlset>`, 'sitemap-siemens-knx.xml': '<urlset></urlset>', 'robots.txt': robots })) await writeFile(path.join(cwd, 'dist', name), content);
    return spawnSync(process.execPath, [validator], { cwd, encoding: 'utf8' });
  } finally {
    const relative = path.relative(path.resolve(tmpdir()), path.resolve(cwd));
    assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative) && relative.startsWith('ifeel-seo-test-'));
    await rm(cwd, { recursive: true, force: true });
  }
}
test('valid rendered page passes', async () => assert.equal((await run(good)).status, 0));
test('legacy www canonical is rejected', async () => assert.match((await run(good.replace('https://i-feel', 'https://www.i-feel'))).stderr, /canonical must/));
test('noindex route is rejected in sitemap', async () => assert.match((await run(good + '<meta name="robots" content="noindex,follow">')).stderr, /noindex URL in sitemap/));
test('missing sitemap page is rejected', async () => assert.match((await run(good, 'https://i-feel.co.il/other/')).stderr, /missing from both/));
test('unfinished copy is rejected', async () => assert.match((await run(good + '<p>[לאישור: פרטי הפרויקט]</p>')).stderr, /unfinished copy/));
test('multiple main headings are rejected', async () => assert.match((await run(good + '<h1>Second</h1>')).stderr, /one main heading/));
test('specific bot cannot lose wildcard exclusions', async () => assert.match((await run(good, undefined, 'User-agent: OAI-SearchBot\nAllow: /')).stderr, /missing \/old\//));
