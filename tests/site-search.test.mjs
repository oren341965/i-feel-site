import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import vm from 'node:vm';

const source = await readFile(new URL('../src/components/SiteSearch.astro', import.meta.url), 'utf8');
// Exercise the actual browser matching code, including its Hebrew normalization and ranking.
const matchingCode = source.slice(source.indexOf('  const normalize ='), source.indexOf('  const renderResults ='));
const { code } = await transform(`${matchingCode}\n({ normalize, getTermVariants, scoreRecord });`, { loader: 'ts' });
const { normalize, getTermVariants, scoreRecord } = vm.runInNewContext(code);

function prepare(record) {
  const prepared = { ...record };
  for (const key of ['title', 'description', 'headings', 'body']) {
    prepared[`normalized${key[0].toUpperCase()}${key.slice(1)}`] = normalize(record[key] || '');
  }
  prepared.compactSearch = ['title', 'description', 'headings', 'body'].map(key => normalize(record[key] || '')).join('').replace(/\s+/g, '');
  return prepared;
}
const records = [
  prepare({ url: '/knx-presence-motion-detectors/', title: 'גלאי KNX', description: 'פתרון תאורה למרלו״גים ולחניונים', headings: 'בקרת תאורה לחניונים ולמרלו״גים', body: 'חיסכון בחשמל עם גלאים במעברים ארוכים' }),
  prepare({ url: '/structure-control/dali-lighting-control/', title: 'בקרת DALI', body: 'תאורה למשרדים ולחניונים' }),
  prepare({ url: '/articles/siemens-switch/', title: 'בקר Siemens עם 8 יציאות', body: 'דגם 5WG1532-1DB51' }),
];
function search(query) {
  const normalized = normalize(query);
  const groups = normalized.split(/\s+/).map(getTermVariants);
  return records.map(record => ({ url: record.url, score: scoreRecord(record, normalized, normalized.replace(/\s+/g, ''), groups) }))
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
  assert.equal(search('80 יציאות').length, 0);
});
