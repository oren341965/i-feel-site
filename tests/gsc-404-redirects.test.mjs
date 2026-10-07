import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const htaccess = fs.readFileSync(new URL('../public/.htaccess', import.meta.url), 'utf8');
const rules = [...htaccess.matchAll(/^\s*RewriteRule (\S+) (\S+) \[([^\]]+)\]/gm)]
  // These canonical HTTPS paths do not meet the host or encoded-license conditions
  // attached to the two catch-all '^' rules.
  .filter(([, pattern]) => pattern !== '^')
  .map(([, pattern, target, flags]) => ({ pattern: new RegExp(pattern), target, flags }));
const migrated = [
  ['articles/smart-home', '/articles/what-is-smart-home/'],
  ['articles/existing-', '/articles/existing-home-smart-upgrade/'],
  ['תאורה-חכמה-לבית-המדריך-המלא-לעיצוב-מוש', '/smart-lighting/'],
  ['gallery/הכי-מודרנית-בכפר-קרע', '/projects/#kfar-kare'],
  ['gallery/haneviim22', '/contractor-customer-care/projects/#haneviim22'],
];

for (const [source, target] of migrated) {
  test(`${source} has a permanent redirect to matching built content`, () => {
    for (const suffix of ['', '/']) {
      const rule = rules.find(rule => rule.pattern.test(source + suffix) && rule.flags.includes('R='));
      assert.equal(rule?.target, target);
      assert.match(rule.flags, /R=301/);
      assert.match(rule.flags, /(?:^|,)L(?:,|$)/);
    }
    const [path, anchor] = target.split('#');
    const html = fs.readFileSync(new URL(`../dist${path}index.html`, import.meta.url), 'utf8');
    assert.ok(html.includes(`https://i-feel.co.il${path}`), 'destination has its own canonical URL');
    if (anchor) assert.ok(html.includes(`id="${anchor}"`), 'project anchor exists');
    assert.ok(!rules.some(rule => rule.pattern.test(path.slice(1)) && rule.flags.includes('R=')), 'no redirect chain');
    assert.ok(!rules.some(rule => rule.pattern.test(`${source}/unrelated`) && rule.target === target), 'no broad prefix redirect');
  });
}

test('unmatched content and asset paths are not sent to unrelated pages', () => {
  for (const path of ['articles/knx-ai-era-', 'smart-home-arabic/', 'assets/structure-projects/img/', 'articles/unknown-article']) {
    assert.ok(!rules.some(rule => rule.pattern.test(path) && rule.flags.includes('R=')));
  }
});

test('retired routes and PHP handler remain intact in the build', () => {
  for (const path of ['legend/', 'תקנון-אתר/']) {
    assert.ok(rules.some(rule => rule.pattern.test(path) && rule.flags === 'G'));
  }
  const built = fs.readFileSync(new URL('../dist/.htaccess', import.meta.url), 'utf8');
  assert.equal(built, htaccess);
  assert.match(built, /AddHandler application\/x-httpd-ea-php83/);
});
