import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const skillText = readFileSync(
  new URL('../.claude/skills/upload-delivery-notes-to-dropbox/SKILL.md', import.meta.url),
  'utf8',
);

test('delivery-note worker forbids email staging for ready Dropbox records', () => {
  assert.match(skillText, /Gmail is never a staging, relay, queue, or transport substitute/i);
  assert.match(skillText, /AUTO INTAKE/);
  assert.match(skillText, /מוכנות להעלאה/);
  assert.match(skillText, /TRANSPORT_BLOCKED/);
  assert.match(skillText, /staging\/handoff emails created for routine ready records must always be zero/i);
});
