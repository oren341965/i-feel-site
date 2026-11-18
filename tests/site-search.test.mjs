import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { transform } from 'esbuild';
import vm from 'node:vm';
import { buildSearchIndex } from '../src/integrations/search-index.mjs';

const source = await readFile(new URL('../src/components/SiteSearch.astro', import.meta.url), 'utf8');
// Exercise the actual browser matching code, including its Hebrew normalization and ranking.
const matchingCode = source.slice(source.indexOf('  const normalize ='), source.indexOf('  const renderResults ='));
const { code } = await transform(`${matchingCode}\n({ normalize, getTermVariants, getQueryTerms, getModelPattern, prepareRecord, scoreRecord });`, { loader: 'ts' });
const { normalize, getTermVariants, getQueryTerms, getModelPattern, prepareRecord, scoreRecord } = vm.runInNewContext(code);

function prepare(record) {
  return prepareRecord({ description: '', headings: '', body: '', ...record });
}
const records = [
  prepare({ url: '/knx-presence-motion-detectors/', title: 'גלאי KNX', description: 'פתרון תאורה למרלו״גים ולחניונים', headings: 'בקרת תאורה לחניונים ולמרלו״גים', body: 'חיסכון בחשמל עם גלאים במעברים ארוכים' }),
  prepare({ url: '/structure-control/dali-lighting-control/', title: 'בקרת DALI', body: 'תאורה למשרדים ולחניונים' }),
  prepare({ url: '/articles/siemens-switch/', title: 'בקר Siemens עם 8 יציאות', body: 'דגם 5WG1532-1DB51' }),
  prepare({ url: '/assets/catalogs/zwave-glass-dimmer-spec.pdf', title: 'מפסק זכוכית דימר Z-Wave', description: 'מפרט עומסים וסכמת חיבורים', type: 'pdf' }),
  prepare({ url: '/catalogs/', title: 'קטלוגים', body: 'מפסק זכוכית דימר Z-Wave ומדריכים נוספים' }),
  prepare({ url: '/av/origin-acoustics-os55/', title: 'רמקול חוץ Origin Acoustics OS55' }),
  prepare({ url: '/av/origin-acoustics-os65/', title: 'רמקול חוץ Origin Acoustics OS65' }),
];
function search(query, index = records) {
  const normalized = normalize(query);
  const groups = getQueryTerms(normalized).map(getTermVariants);
  return index.map(record => ({ url: record.url, score: scoreRecord(record, normalized, getModelPattern(normalized), groups) }))
    .filter(record => record.score > 0).sort((a, b) => b.score - a.score);
}
test('parking and logistics queries find the dedicated lighting result first', () => {
  for (const query of ['מרלוג', 'מרלוגים', 'מרלו״ג', 'מרלו"ג', 'מרלו״גים', 'למרלוג', 'חניון', 'חניונים', 'תאורה לחניון', 'תאורה למרלוג']) {
    assert.equal(search(query)[0]?.url, '/knx-presence-motion-detectors/', query);
  }
});
test('Hebrew abbreviation quote styles match while word boundaries remain distinct', () => {
  for (const value of ['מרלו״ג', 'מרלו"ג', 'מרלו“ג']) assert.equal(normalize(value), normalize('מרלוג'));
  assert.equal(normalize('מרכז לוגיסטי'), 'מרכז לוגיסטי');
});
test('product and numeric searches keep working without partial numeric matches', () => {
  assert.equal(search('8 יציאות')[0]?.url, '/articles/siemens-switch/');
  assert.equal(search('5WG1532-1DB51')[0]?.url, '/articles/siemens-switch/');
  assert.equal(search('5WG15321DB51')[0]?.url, '/articles/siemens-switch/');
  assert.equal(search('בקר 5WG15321DB51')[0]?.url, '/articles/siemens-switch/');
  assert.equal(search('80 יציאות').length, 0);
});

test('the dimmer PDF leads the catalog page for Hebrew, English and a typo', () => {
  for (const query of ['דימר Z-Wave', 'מפסק זכוכית', 'glass dimmer zwave', 'מפרט עומסים', 'דמיר זי וייב', 'איפה המפרט של הדימר']) {
    assert.equal(search(query)[0]?.url, '/assets/catalogs/zwave-glass-dimmer-spec.pdf', query);
  }
});

test('model punctuation and spaces work without substituting another model', () => {
  for (const query of ['OS55', 'OS 55', 'רמקול OS-55']) {
    assert.deepEqual(search(query).map(({ url }) => url), ['/av/origin-acoustics-os55/'], query);
  }
});

test('the index includes public linked PDFs and product identifiers while respecting noindex', async (t) => {
  const output = await mkdtemp(path.join(tmpdir(), 'ifeel-search-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  await Promise.all(['catalogs', 'assets/catalogs', 'private'].map((dir) => mkdir(path.join(output, dir), { recursive: true })));
  await Promise.all([
    writeFile(path.join(output, 'catalogs/index.html'), `
      <script type="application/ld+json">{"@type":"Product","sku":"TC-4"}</script>
      <main><main><h1>קטלוג מוצרים</h1></main>
      <article><h3>מפרט דימר</h3><p>עומסים וסכמת חיבורים</p>
      <a href="/assets/catalogs/dimmer.pdf">להורדה</a>
      <a href="/assets/catalogs/missing.pdf">חסר</a>
      <a href="https://example.org/assets/catalogs/external.pdf">חיצוני</a></article></main>`),
    writeFile(path.join(output, 'private/index.html'), `
      <meta name="robots" content="noindex"><main><h1>מסמכים פנימיים</h1>
      <a href="/assets/catalogs/internal.pdf">מסמך פנימי שאסור לאנדקס</a></main>`),
    writeFile(path.join(output, 'assets/catalogs/dimmer.pdf'), '%PDF'),
    writeFile(path.join(output, 'assets/catalogs/internal.pdf'), '%PDF'),
  ]);
  await buildSearchIndex(output);
  const index = JSON.parse(await readFile(path.join(output, 'search-index.json'), 'utf8'));
  assert.equal(index.length, 2);
  assert.equal(index.find(({ url }) => url === '/catalogs/').identifiers, 'TC-4');
  const document = index.find(({ type }) => type === 'pdf');
  assert.equal(document.url, '/assets/catalogs/dimmer.pdf');
  assert.equal(document.title, 'מפרט דימר');
  assert.equal(document.description, 'עומסים וסכמת חיבורים');
});
