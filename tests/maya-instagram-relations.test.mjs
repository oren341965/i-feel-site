import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Maya social relations is Monday-sourced, monthly, approval-gated, and non-mutating when scheduled', async () => {
  const skill = await readFile(new URL('../.claude/skills/maya-instagram-relations/SKILL.md', import.meta.url), 'utf8');
  const discovery = await readFile(new URL('../.claude/skills/maya-instagram-relations/references/monday-social-discovery.md', import.meta.url), 'utf8');
  const scheduledTask = await readFile(new URL('../agent-config/maya-scheduled-tasks/maya-instagram-relations/SKILL.md', import.meta.url), 'utf8');
  const parent = await readFile(new URL('../.claude/skills/ai-marketing-manager/SKILL.md', import.meta.url), 'utf8');
  const governance = await readFile(new URL('../.claude/skills/ai-marketing-manager/references/instagram-relations-program.md', import.meta.url), 'utf8');

  assert.match(skill, /`ai-marketing-manager` is the parent/);
  assert.match(skill, /`ai-sales-manager` supplies the reconciled Monday candidate roster/);
  assert.match(skill, /does not set marketing strategy, expand the audience, change the skill or approve her own outreach/);
  assert.match(skill, /at most once per Israeli calendar month/);
  assert.match(skill, /approved watchlist/);
  assert.match(skill, /no more than one consolidated note per professional across Instagram and Facebook per calendar month/);
  assert.match(skill, /Require explicit approval for the exact batch/);
  assert.match(skill, /no more than two consecutive unanswered outreach messages/);
  assert.match(skill, /EXTERNAL_ACTIONS=0/);

  for (const boardId of ['3040781819', '2732725332', '3249720207', '4010423265', '18399467324']) {
    assert.match(discovery, new RegExp(`\\b${boardId}\\b`));
  }
  assert.match(discovery, /Never infer profession from a person's name, company name, project style or free text alone/);
  assert.match(discovery, /sales transfer statuses[\s\S]*are a signal to look for project evidence; they are not proof/);
  assert.match(discovery, /PROJECT_ACTIVE_VERIFIED/);
  assert.match(discovery, /PROJECT_COMPLETED_VERIFIED/);
  assert.match(discovery, /TRANSFERRED_UNCONFIRMED/);
  assert.match(discovery, /VERIFIED_OFFICIAL_LINK/);
  assert.match(discovery, /VERIFIED_MULTI_SIGNAL/);
  assert.match(discovery, /Do not inspect, map or contact a private personal profile/);
  assert.match(discovery, /Never contact the same person on both platforms for the same update/);
  assert.match(discovery, /For `PROJECT_ACTIVE_VERIFIED`, use present tense/);
  assert.match(discovery, /For `PROJECT_COMPLETED_VERIFIED`, past tense is allowed/);
  assert.match(discovery, /Do not write social URLs, relationship states or outreach results back to Monday without a separate exact approval/);

  assert.match(scheduledTask, /first Sunday of each month at 10:00/);
  assert.match(scheduledTask, /PROGRAM_OWNER=ai-marketing-manager/);
  assert.match(scheduledTask, /Do not send a direct message/);
  assert.match(scheduledTask, /Do not browse suggested accounts or add recipients/);
  assert.match(scheduledTask, /across both platforms/);
  assert.match(scheduledTask, /MONDAY_WRITES=0/);
  assert.match(scheduledTask, /SENDS=0/);
  assert.match(scheduledTask, /NEXT_ELIGIBLE_MONTH/);

  assert.match(parent, /references\/instagram-relations-program\.md/);
  assert.match(parent, /Govern the professional Instagram\/Facebook relationship program/);
  assert.match(governance, /Program idea, backlog, voice and contact policy.*ai-marketing-manager/s);
  assert.match(governance, /Monday candidate roster and project evidence.*ai-sales-manager/s);
  assert.match(governance, /Maya through `maya-instagram-relations`/);
  assert.match(governance, /repository work branch and Pull Request/);
  assert.match(governance, /cannot authorize its own external action/);
  assert.match(governance, /same reason is never messaged on both platforms/);
});
