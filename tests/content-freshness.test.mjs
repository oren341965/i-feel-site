import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('../scripts/check-content-freshness.mjs', import.meta.url));

async function checkPage(source) {
  const root = await mkdtemp(path.join(tmpdir(), 'ifeel-freshness-'));
  try {
    await mkdir(path.join(root, 'src/data'), { recursive: true });
    await mkdir(path.join(root, 'src/pages/articles'), { recursive: true });
    await writeFile(path.join(root, 'src/data/articles.ts'), 'export const articles = [];');
    await writeFile(path.join(root, 'src/pages/articles/example.astro'), source);
    const result = spawnSync(process.execPath, [script], {
      cwd: root, encoding: 'utf8', env: { ...process.env, STRICT_CONTENT_FRESHNESS: '0' },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout + result.stderr, /Latest public article: example \(2026-10-15\)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

for (const [name, source] of [
  ['unquoted property and single-quoted date', "const article = { datePublished: '2026-10-15' };"],
  ['unquoted property and double-quoted date', 'const article = { datePublished: "2026-10-15" };'],
  ['JSON-LD double-quoted property and date', '{ "datePublished": "2026-10-15" }'],
  ['single-quoted property and date', "{ 'datePublished': '2026-10-15' }"],
]) {
  test(`content freshness recognizes ${name}`, () => checkPage(source));
}
