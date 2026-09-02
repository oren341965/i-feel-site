import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const skillUrl = new URL('../.claude/skills/daily-seo-crawl/SKILL.md', import.meta.url);
const publisherUrl = new URL('../scripts/deploy/seo-autopublish.mjs', import.meta.url);
const deployWorkflowUrl = new URL('../.github/workflows/deploy.yml', import.meta.url);

test('daily SEO skill is discoverable and keeps merge and sends behind explicit gates', async () => {
  const skill = await readFile(skillUrl, 'utf8');
  assert.match(skill, /^---\r?\nname: daily-seo-crawl\r?\n/);
  assert.match(skill, /Draft PR/);
  assert.match(skill, /אישור מפורש/);
  assert.match(skill, /Scheduler רשום ומאומת במערכת הניהול/);
  assert.doesNotMatch(skill, /מפעיל auto-merge/);
  assert.doesNotMatch(skill, /\.env\.local.*IFEEL_GH_TOKEN/);
  assert.doesNotMatch(skill, /Make\.com/);
  assert.doesNotMatch(skill, /מסלול ה־auto-publish/);
});

test('legacy SEO publisher delegates to the safe workstation flow and cannot auto-merge', async () => {
  const publisher = await readFile(publisherUrl, 'utf8');
  assert.match(publisher, /publish-work\.ps1/);
  assert.match(publisher, /--draft|Draft PR/i);
  assert.doesNotMatch(publisher, /IFEEL_GH_TOKEN/);
  assert.doesNotMatch(publisher, /enablePullRequestAutoMerge/);
  assert.doesNotMatch(publisher, /x-access-token/);
  assert.doesNotMatch(publisher, /git\(\["push"/);
});

test('the SEO publication helper is treated as control-plane configuration, not a website deploy trigger', async () => {
  const workflow = await readFile(deployWorkflowUrl, 'utf8');
  assert.match(workflow, /scripts\/deploy\/seo-autopublish\.mjs/);
});
