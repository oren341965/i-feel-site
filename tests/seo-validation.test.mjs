import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const validator = path.resolve('scripts/validate-seo.mjs');
const good = '<title>Example</title><meta name="description" content="Example description"><link rel="canonical" href="https://i-feel.co.il/"><h1>Example</h1>';
async function run(html, sitemap = 'https://i-feel.co.il/', robots = 'User-agent: *\nDisallow: /old/\nDisallow: /shopengine-template/\nDisallow: /staff-expenses/', extraFiles = {}) {
  const cwd = await mkdtemp(path.join(tmpdir(), 'ifeel-seo-test-'));
  try {
    await mkdir(path.join(cwd, 'dist'));
    const urls = Array.isArray(sitemap) ? sitemap : [sitemap];
    for (const [name, content] of Object.entries({ 'index.html': html, 'sitemap.xml': `<urlset>${urls.map(url => `<url><loc>${url}</loc></url>`).join('')}</urlset>`, 'sitemap-siemens-knx.xml': '<urlset></urlset>', 'robots.txt': robots, ...extraFiles })) {
      const file = path.join(cwd, 'dist', name);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content);
    }
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
test('sitemap URL must have a deployable build target', async () => assert.match((await run(good, ['https://i-feel.co.il/', 'https://i-feel.co.il/missing/'])).stderr, /sitemap target missing from build/));
test('PHP robots noindex page cannot be submitted in sitemap', async () => assert.match((await run(good, ['https://i-feel.co.il/', 'https://i-feel.co.il/residents/'], undefined, { 'residents/index.php': '<meta name="robots" content="noindex,nofollow">' })).stderr, /noindex PHP URL in sitemap/));
test('PHP X-Robots-Tag noindex page cannot be submitted in sitemap', async () => assert.match((await run(good, ['https://i-feel.co.il/', 'https://i-feel.co.il/residents/'], undefined, { 'residents/index.php': '<?php header("X-Robots-Tag: noindex, nofollow"); ?>' })).stderr, /noindex PHP URL in sitemap/));
test('PHP with noindex remains valid outside sitemap', async () => assert.equal((await run(good, undefined, undefined, { 'residents/index.php': '<meta name="robots" content="noindex,nofollow">' })).status, 0));
test('public PHP sitemap target without noindex remains valid', async () => assert.equal((await run(good, ['https://i-feel.co.il/', 'https://i-feel.co.il/public/'], undefined, { 'public/index.php': '<h1>Public resource</h1>' })).status, 0));
