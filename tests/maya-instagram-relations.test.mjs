import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Maya Instagram relations is monthly, approval-gated, and non-mutating when scheduled', async () => {
  const skill = await readFile(new URL('../.claude/skills/maya-instagram-relations/SKILL.md', import.meta.url), 'utf8');
  const scheduledTask = await readFile(new URL('../agent-config/maya-scheduled-tasks/maya-instagram-relations/SKILL.md', import.meta.url), 'utf8');

  assert.match(skill, /at most once per Israeli calendar month/);
  assert.match(skill, /approved watchlist/);
  assert.match(skill, /no more than one consolidated note per professional per calendar month/);
  assert.match(skill, /Require explicit approval for the exact batch/);
  assert.match(skill, /no more than two consecutive unanswered outreach messages/);
  assert.match(skill, /EXTERNAL_ACTIONS=0/);

  assert.match(scheduledTask, /first Sunday of each month at 10:00/);
  assert.match(scheduledTask, /Do not send a direct message/);
  assert.match(scheduledTask, /SENDS=0/);
  assert.match(scheduledTask, /NEXT_ELIGIBLE_MONTH/);
});
