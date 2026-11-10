import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('catalogs visible count matches the complete structured ItemList', async () => {
  const [copy, page] = await Promise.all([
    readFile(new URL('../src/page-html/page-05.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/catalogs.astro', import.meta.url), 'utf8'),
  ]);

  const visibleCount = copy.match(/(\d+)\s+קטלוגים/);
  const structuredCount = page.match(/name:\s*'קטלוגי i-feel',[\s\S]*?numberOfItems:\s*(\d+)/);

  assert.ok(visibleCount, 'visible catalog count is missing');
  assert.ok(structuredCount, 'catalog ItemList count is missing');
  assert.equal(Number(visibleCount[1]), Number(structuredCount[1]));
});
