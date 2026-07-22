import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const articleSource = await readFile(path.join(root, 'src/data/articles.ts'), 'utf8');
const starts = [...articleSource.matchAll(/\n  \{\n    slug: '([^']+)'/g)];
const publicDates = [];

for (let index = 0; index < starts.length; index += 1) {
  const start = starts[index].index;
  const end = starts[index + 1]?.index ?? articleSource.length;
  const block = articleSource.slice(start, end);
  if (/\bhidden:\s*true\b/.test(block) || /\bnoindex:\s*true\b/.test(block)) continue;
  const updated = block.match(/\bupdated:\s*'(\d{4}-\d{2}-\d{2})'/)?.[1];
  if (updated) publicDates.push({ slug: starts[index][1], date: updated });
}

const articlePagesDir = path.join(root, 'src/pages/articles');
for (const entry of await readdir(articlePagesDir, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.astro') || entry.name.startsWith('[') || entry.name === 'index.astro') continue;
  const source = await readFile(path.join(articlePagesDir, entry.name), 'utf8');
  const date = source.match(/datePublished:\s*'(\d{4}-\d{2}-\d{2})'/)?.[1];
  if (date) publicDates.push({ slug: entry.name.replace(/\.astro$/, ''), date });
}

if (publicDates.length === 0) {
  console.warn('[content-freshness] No public article dates were found.');
  if (process.env.STRICT_CONTENT_FRESHNESS === '1') process.exitCode = 1;
} else {
  publicDates.sort((a, b) => b.date.localeCompare(a.date));
  const latest = publicDates[0];
  const ageDays = Math.floor((Date.now() - Date.parse(`${latest.date}T00:00:00Z`)) / 86_400_000);
  const message = `[content-freshness] Latest public article: ${latest.slug} (${latest.date}), ${ageDays} day(s) old.`;
  if (ageDays > 13) {
    console.warn(`${message} Publishing cadence is stale.`);
    if (process.env.STRICT_CONTENT_FRESHNESS === '1') process.exitCode = 1;
  } else {
    console.log(message);
  }
}
