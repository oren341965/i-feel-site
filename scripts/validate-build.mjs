import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const distRoot = path.join(root, 'dist');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(fullPath);
  }
  return files;
}

function attrContent(html, selector, value) {
  const first = html.match(new RegExp(`<${selector}[^>]+(?:property|name|rel)=["']${value}["'][^>]+(?:content|href)=["']([^"']+)["']`, 'i'))?.[1];
  return first ?? html.match(new RegExp(`<${selector}[^>]+(?:content|href)=["']([^"']+)["'][^>]+(?:property|name|rel)=["']${value}["']`, 'i'))?.[1] ?? '';
}

function stripHtml(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const htmlFiles = await walk(distRoot);
const errors = [];
const ogImages = new Set();
let jsonLdBlocks = 0;

for (const htmlPath of htmlFiles) {
  const html = await readFile(htmlPath, 'utf8');
  const relative = path.relative(distRoot, htmlPath);
  const isNotFoundPage = relative === '404.html';
  const robots = attrContent(html, 'meta', 'robots');
  const skipsSearchIndexing = isNotFoundPage || /\bnoindex\b/i.test(robots);
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? '';
  const canonical = attrContent(html, 'link', 'canonical');
  const ogImage = attrContent(html, 'meta', 'og:image');

  if (!title) errors.push(`${relative}: missing title`);
  if (!skipsSearchIndexing && !canonical) errors.push(`${relative}: missing canonical`);
  if (!skipsSearchIndexing && !ogImage) errors.push(`${relative}: missing og:image`);
  if (!skipsSearchIndexing && ogImage.includes('/assets/og-cover.jpg')) errors.push(`${relative}: legacy generic og:image`);
  if (ogImage) ogImages.add(ogImage);

  if (ogImage.startsWith('https://i-feel.co.il/') || ogImage.startsWith('https://www.i-feel.co.il/')) {
    const pathname = decodeURIComponent(new URL(ogImage).pathname).replace(/^\//, '');
    try {
      await access(path.join(distRoot, pathname));
    } catch {
      errors.push(`${relative}: local og:image is missing (${pathname})`);
    }
  }

  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    jsonLdBlocks += 1;
    try {
      JSON.parse(match[1]);
    } catch (error) {
      errors.push(`${relative}: invalid JSON-LD (${error.message})`);
    }
  }
}

const homepage = await readFile(path.join(distRoot, 'index.html'), 'utf8');
const homepageDescription = attrContent(homepage, 'meta', 'description');
if (homepageDescription.length < 120 || homepageDescription.length > 160) {
  errors.push(`index.html: meta description length is ${homepageDescription.length}, expected 120-160`);
}

const structure = await readFile(path.join(distRoot, 'structure-control/index.html'), 'utf8');
if (!structure.includes('id="featured-case-studies"')) errors.push('structure-control: featured case studies block is missing');
for (const expected of ['D-CITY', 'קמפוס רכבת קיסריה', 'הדסה נתיבות']) {
  if (!structure.includes(expected)) errors.push(`structure-control: missing case study ${expected}`);
}
const structureSchemas = [...structure.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((match) => JSON.parse(match[1]));
const faqNode = structureSchemas.flatMap((schema) => schema['@graph'] ?? [schema]).find((node) => node['@type'] === 'FAQPage');
if (!faqNode || faqNode.mainEntity?.length !== 7) errors.push(`structure-control: expected 7 FAQ schema questions, found ${faqNode?.mainEntity?.length ?? 0}`);

const article = await readFile(path.join(distRoot, 'articles/bms-retrofit-existing-building/index.html'), 'utf8');
if (/name=["']robots["'][^>]+noindex/i.test(article)) errors.push('new article: unexpectedly marked noindex');
const articleWords = stripHtml(article).split(/\s+/).filter(Boolean).length;
if (articleWords < 900) errors.push(`new article: only ${articleWords} rendered words`);

const sitemap = await readFile(path.join(distRoot, 'sitemap.xml'), 'utf8');
if (!sitemap.includes('https://i-feel.co.il/articles/bms-retrofit-existing-building/')) errors.push('sitemap: new article is missing');

const asMade = await readFile(path.join(distRoot, 'as-made/index.html'), 'utf8');
const asMadeRobots = attrContent(asMade, 'meta', 'robots');
if (/\bnoindex\b/i.test(asMadeRobots)) errors.push('as-made: hub must be indexable');
if (!asMade.includes('תוכנית העדות') || !asMade.includes('אס מייד')) errors.push('as-made: discoverability aliases are missing');
if (!sitemap.includes('https://i-feel.co.il/as-made/')) errors.push('sitemap: AS-MADE hub is missing');
if (!homepage.includes('href="/as-made/"')) errors.push('homepage: footer link to AS-MADE hub is missing');

const searchRecords = JSON.parse(await readFile(path.join(distRoot, 'search-index.json'), 'utf8'));
const asMadeSearchRecord = searchRecords.find((record) => record.url === '/as-made/');
if (!asMadeSearchRecord) errors.push('search index: AS-MADE hub is missing');
const indexedAsMadeForms = searchRecords.filter((record) => record.url.startsWith('/as-made/') && record.url !== '/as-made/');
if (indexedAsMadeForms.length > 0) errors.push(`search index: expected only the AS-MADE hub, found ${indexedAsMadeForms.length} indexed forms`);

console.log(`[build-qa] pages=${htmlFiles.length} searchRecords=${searchRecords.length} uniqueOgImages=${ogImages.size} jsonLdBlocks=${jsonLdBlocks} articleWords=${articleWords} homepageDescription=${homepageDescription.length}`);
if (errors.length > 0) {
  for (const error of errors) console.error(`[build-qa] ${error}`);
  process.exit(1);
}
console.log('[build-qa] All checks passed.');
