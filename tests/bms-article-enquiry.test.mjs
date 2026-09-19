import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/articles/epbd-bacs-building-automation-desigo.astro', import.meta.url), 'utf8');

test('BMS acquisition CTA uses the existing commercial contact route', () => {
  assert.match(source, /href="\/contactus\/"[^>]*>בקשת אפיון ושדרוג BMS<\/a>/);
  assert.doesNotMatch(source, /href="\/service-request\/"/);
});

test('BMS article answers practical questions without changing page identity or schema type', () => {
  assert.equal((source.match(/<h1\b/g) || []).length, 1);
  assert.match(source, /האם צריך להחליף את כל הבקרים/);
  assert.match(source, /אין להסיק חיסכון מובטח/);
  assert.match(source, /href="\/structure-control\/projects\/"/);
  assert.match(source, /'@type': 'Article'/);
  assert.match(source, /const canonical = 'https:\/\/i-feel.co.il\/articles\/epbd-bacs-building-automation-desigo\/'/);
});
