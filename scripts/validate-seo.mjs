import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

// Validate the rendered artifact, including public/ legacy pages, not just Astro sources.
const root = path.resolve('dist');
async function walk(dir) {
  return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))).flat();
}
function attr(tag, key) {
  return tag.match(new RegExp(`\\b${key}=["']([^"']*)["']`, 'i'))?.[1] ?? '';
}
function metadata(html, name, tag = 'meta') {
  return [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'gi'))]
    .map(m => m[0]).filter(t => attr(t, tag === 'link' ? 'rel' : 'name') === name);
}
function countJsonLdType(value, targetType) {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countJsonLdType(item, targetType), 0);
  if (!value || typeof value !== 'object') return 0;
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']].filter(Boolean);
  let count = types.includes(targetType) ? 1 : 0;
  for (const child of Object.values(value)) count += countJsonLdType(child, targetType);
  return count;
}

function validateOfferExpiry(value, route, errors) {
  if (Array.isArray(value)) {
    for (const item of value) validateOfferExpiry(item, route, errors);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']].filter(Boolean);
  if (types.includes('Offer')) {
    const today = new Date().toISOString().slice(0, 10);
    if (typeof value.priceValidUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.priceValidUntil) && value.priceValidUntil < today) {
      errors.push(`${route}: expired Offer priceValidUntil ${value.priceValidUntil}`);
    }
    if (typeof value.validThrough === 'string') {
      const expiry = Date.parse(value.validThrough);
      if (Number.isFinite(expiry) && expiry < Date.now()) errors.push(`${route}: expired Offer validThrough ${value.validThrough}`);
    }
  }
  for (const child of Object.values(value)) validateOfferExpiry(child, route, errors);
}
const errors = [];

// A small set of public resources are intentionally maintained outside the Git build.
// Keep this list explicit and narrow so any new missing internal target fails the build.
const externalDeploymentAllowlist = new Set([
  '/contractor-customer-care/residential-buildings-smart-home/',
  '/contractor-customer-care/tenant-changes-smart-home/',
  '/structure-control/residential-building-bms/',
  '/projects/luxury-villa-petah-tikva/',
  '/projects/luxury-villa-petah-tikva/luxury-villa-petah-tikva-03.jpg',
  '/assets/siemens-knx/dwg/5WG1125-1AB22.dwg',
  '/assets/siemens-knx/dwg/5WG1567-1AB22.dwg',
  '/assets/siemens-knx/dwg/5WG1532-1DB51.dwg',
  '/assets/siemens-knx/dwg/5WG1532-1DB31.dwg',
  '/assets/siemens-knx/dwg/5WG1262-1DB51.dwg',
  '/assets/siemens-knx/dwg/5WG1543-1DB51.dwg',
  '/assets/siemens-knx/dwg/5WG1543-1DB31.dwg',
  '/assets/siemens-knx/dwg/5WG1554-1DB31.dwg',
  '/assets/siemens-knx/dwg/5WG1141-1AB03.dwg',
]);

async function internalTargetExists(pathname) {
  let decoded;
  try { decoded = decodeURI(pathname); } catch { decoded = pathname; }
  if (!decoded.startsWith('/')) return true;
  if (externalDeploymentAllowlist.has(decoded)) return true;
  const resolved = path.resolve(root, '.' + decoded);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
  const candidates = decoded.endsWith('/')
    ? [path.join(resolved, 'index.html'), path.join(resolved, 'index.php')]
    : [resolved, path.join(resolved, 'index.html'), path.join(resolved, 'index.php')];
  for (const candidate of candidates) {
    if (await stat(candidate).then(s => s.isFile()).catch(() => false)) return true;
  }
  return false;
}

async function validateInternalReferences(html, route) {
  // Script bodies may contain client-side templates rather than rendered URLs.
  // Keep script src attributes, but validate only actual rendered markup here.
  const markup = html.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script\s*>)/gi, '$1$2');
  const refs = [...markup.matchAll(/\b(?:href|src)=["']([^"'#]+)["']/gi)].map(m => m[1].trim());
  for (const ref of refs) {
    if (!ref || /^(?:mailto:|tel:|javascript:|data:)/i.test(ref)) continue;
    let url;
    try { url = new URL(ref, `https://i-feel.co.il${route}`); } catch { continue; }
    if (url.origin !== 'https://i-feel.co.il') continue;
    if (!(await internalTargetExists(url.pathname))) errors.push(`${route}: broken internal reference ${ref}`);
  }
}
const sitemapPaths = new Set();
for (const name of ['sitemap.xml', 'sitemap-siemens-knx.xml']) {
  const xml = await readFile(path.join(root, name), 'utf8');
  const seen = new Set();
  for (const [, value] of xml.matchAll(/<loc>(.*?)<\/loc>/g)) {
    const url = new URL(value);
    if (url.origin !== 'https://i-feel.co.il' || url.search || url.hash) errors.push(`${name}: noncanonical URL ${value}`);
    if (seen.has(value)) errors.push(`${name}: duplicate ${value}`);
    seen.add(value);
    sitemapPaths.add(decodeURI(url.pathname));
  }
}
let pages = 0;
let indexable = 0;
// PHP entry points are copied to dist without being rendered by Astro. Check
// their declared indexing policy too, rather than assuming every sitemap URL
// is an indexable HTML page. Never execute PHP or follow its private includes.
for (const route of sitemapPaths) {
  const resolved = path.resolve(root, '.' + route);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    errors.push(`${route}: sitemap target outside build`);
    continue;
  }
  const candidates = route.endsWith('/')
    ? [path.join(resolved, 'index.html'), path.join(resolved, 'index.php')]
    : [resolved];
  let target;
  for (const candidate of candidates) {
    if (await stat(candidate).then(s => s.isFile()).catch(() => false)) {
      target = candidate;
      break;
    }
  }
  if (!target) {
    errors.push(`${route}: sitemap target missing from build`);
    continue;
  }
  if (!target.endsWith('.php')) continue;
  const source = (await readFile(target, 'utf8')).replace(/<!--[\s\S]*?-->/g, '');
  const noindex = metadata(source, 'robots').some(t => /\bnoindex\b/i.test(attr(t, 'content')))
    || /header\s*\(\s*['"]X-Robots-Tag:[^'"\r\n]*\bnoindex\b/i.test(source);
  if (noindex) errors.push(`${route}: noindex PHP URL in sitemap`);
}
for (const file of (await walk(root)).filter(f => f.endsWith('.html'))) {
  pages++;
  const html = (await readFile(file, 'utf8')).replace(/<!--[\s\S]*?-->/g, '');
  const route = '/' + path.relative(root, file).replaceAll('\\', '/').replace(/index\.html$/, '');
  const noindex = route === '/404.html' || metadata(html, 'robots').some(t => /\bnoindex\b/.test(attr(t, 'content')));
  if (noindex) {
    if (sitemapPaths.has(route)) errors.push(`${route}: noindex URL in sitemap`);
    continue;
  }
  await validateInternalReferences(html, route);
  indexable++;
  const canonicalTags = metadata(html, 'canonical', 'link');
  if (canonicalTags.length !== 1 || attr(canonicalTags[0], 'href') !== `https://i-feel.co.il${route}`) errors.push(`${route}: canonical must identify this HTTPS non-www page`);
  if (!sitemapPaths.has(route)) errors.push(`${route}: missing from both sitemaps`);
  if ((html.match(/<h1\b/gi) || []).length !== 1) errors.push(`${route}: expected one main heading`);
  const descriptions = metadata(html, 'description');
  if (descriptions.length !== 1 || !attr(descriptions[0], 'content').trim()) errors.push(`${route}: missing/duplicate description`);
  let faqPageCount = 0;
  for (const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(script[1]);
      validateOfferExpiry(parsed, route, errors);
      faqPageCount += countJsonLdType(parsed, 'FAQPage');
    } catch { /* Existing JSON-LD validity is handled by page generation/tests. */ }
  }
  if (faqPageCount > 1) errors.push(`${route}: duplicate FAQPage structured data (${faqPageCount})`);
  for (const forbidden of ['[לאישור', 'היי פיל סיסטמס', 'פאל וינטק', 'בית חולים הדסה', 'מגדל אשפוז', '053-348', 'G-XXXXXXXXXX']) {
    if (html.includes(forbidden)) errors.push(`${route}: prohibited or unfinished copy (${forbidden})`);
  }
  if (/href=["']\/contact\/["']/.test(html)) errors.push(`${route}: broken /contact/ link`);
}
const robots = await readFile(path.join(root, 'robots.txt'), 'utf8');
for (const group of robots.split(/(?=^User-agent:)/m).filter(s => s.startsWith('User-agent:'))) {
  for (const excluded of ['/old/', '/shopengine-template/', '/staff-expenses/']) {
    if (!group.includes(`Disallow: ${excluded}`)) errors.push(`${group.split(/\r?\n/)[0]}: missing ${excluded} exclusion`);
  }
}
console.log(`[seo-qa] pages=${pages} indexable=${indexable} sitemapUrls=${sitemapPaths.size}`);
if (errors.length) {
  for (const error of errors) console.error(`[seo-qa] ${error}`);
  process.exit(1);
}
console.log('[seo-qa] Canonical, sitemap coverage, headings, metadata, content and crawler checks passed.');
