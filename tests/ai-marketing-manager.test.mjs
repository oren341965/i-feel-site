import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const REPO = resolve(import.meta.dirname, '..');

test('AI Marketing Manager optimizes qualified pipeline and preserves worker authority', async () => {
  const manager = await readFile(resolve(REPO, '.claude/skills/ai-marketing-manager/SKILL.md'), 'utf8');
  const contract = await readFile(resolve(REPO, '.claude/skills/ai-marketing-manager/references/growth-contract.md'), 'utf8');

  assert.match(manager, /qualified leads that can become proposals, wins and revenue/i);
  assert.match(manager, /`ai-sales-manager` remains the source of truth/i);
  assert.match(manager, /Route Google Ads and Meta analysis through `ai-sales-manager`/i);
  assert.match(manager, /Maturity 0 permits read-only audits/i);
  assert.match(manager, /requires action-specific approval/i);
  assert.match(manager, /capability slug `ai-marketing-manager`/i);
  assert.match(contract, /Evidence freshness/);
  assert.match(contract, /Tracking trust/);
  assert.match(contract, /Attribution confidence/);
  assert.match(contract, /Sales capacity/);
  assert.match(contract, /NEEDS_APPROVAL/);
});
