import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const distRoot = path.join(root, 'dist');
const outputRoot = path.join(distRoot, 'assets/og/pages');

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

function decodeHtml(value = '') {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function escapeXml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function metaContent(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1]
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'))?.[1]
    ?? '';
}

function stablePathHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function generatedOgImageUrl(pathname) {
  const readable = pathname
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, '-')
    .split('/')
    .filter(Boolean)
    .join('-')
    .replace(/-+/g, '-')
    .slice(0, 54) || 'page';
  return `https://i-feel.co.il/assets/og/pages/${readable}-${stablePathHash(pathname)}.jpg`;
}

async function localOgImageIsMissing(ogImage) {
  if (!/^https:\/\/(?:www\.)?i-feel\.co\.il\//i.test(ogImage)) return false;
  const relativePath = decodeURIComponent(new URL(ogImage).pathname).replace(/^\//, '');
  try {
    await access(path.join(distRoot, relativePath));
    return false;
  } catch {
    return true;
  }
}

function wrapTitle(title, maxChars = 31, maxLines = 3) {
  const words = title.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  let wordIndex = 0;
  for (; wordIndex < words.length; wordIndex += 1) {
    const word = words[wordIndex];
    const candidate = current ? `${current} ${word}` : word;
    if ([...candidate].length <= maxChars || current === '') current = candidate;
    else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) {
    const tail = [current, ...words.slice(wordIndex + 1)].join(' ');
    lines.push([...tail].length > maxChars ? `${[...tail].slice(0, maxChars - 1).join('')}…` : tail);
  }
  return lines.slice(0, maxLines);
}

function categoryFor(pathname) {
  const bms = /(?:structure-control|bms|siemens-desigo|green-building|what-is-(?:bms|ddc|dali|bacnet)|ddc-in-bms)/i.test(pathname);
  const smartHome = /(?:smart-home|knx|wireless|contractor|architect|akuvox|intercom|audio|cinema)/i.test(pathname);
  if (bms) return { key: 'bms', label: 'בקרת מבנה · BMS' };
  if (smartHome) return { key: 'smart-home', label: 'בית חכם · KNX' };
  return { key: 'general', label: 'i-feel · מערכות חכמות' };
}

function overlaySvg(title, description, label) {
  const lines = wrapTitle(title.replace(/\s*\|\s*i-feel.*$/i, '').trim());
  const tspans = lines.map((line, index) => `<tspan x="1080" dy="${index === 0 ? 0 : 70}">${escapeXml(line)}</tspan>`).join('');
  const summaryLines = wrapTitle(description.trim(), 55, 2);
  const summaryTspans = summaryLines.map((line, index) => `<tspan x="1080" dy="${index === 0 ? 0 : 34}">${escapeXml(line)}</tspan>`).join('');
  return Buffer.from(`
    <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#071527" stop-opacity="0.34"/>
          <stop offset="0.42" stop-color="#071527" stop-opacity="0.72"/>
          <stop offset="1" stop-color="#071527" stop-opacity="0.96"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#shade)"/>
      <rect x="1060" y="86" width="20" height="54" rx="10" fill="#f59e0b"/>
      <text x="1035" y="123" text-anchor="start" direction="rtl" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#fbbf24">${escapeXml(label)}</text>
      <text x="1080" y="245" text-anchor="start" direction="rtl" font-family="Arial, sans-serif" font-size="58" font-weight="800" fill="#ffffff">${tspans}</text>
      <text x="1080" y="480" text-anchor="start" direction="rtl" font-family="Arial, sans-serif" font-size="23" font-weight="400" fill="#dbeafe">${summaryTspans}</text>
      <text x="1080" y="572" text-anchor="end" font-family="Arial, sans-serif" font-size="30" font-weight="800" fill="#ffffff">i-feel.co.il</text>
    </svg>
  `);
}

await mkdir(outputRoot, { recursive: true });
const pages = await walk(distRoot);
let generated = 0;
let normalized = 0;

// A few legacy/static routes bypass BaseLayout. Normalize their social image
// metadata in the deployable build so every indexable page has a real asset.
for (const htmlPath of pages) {
  if (path.relative(distRoot, htmlPath) === '404.html') continue;

  let html = await readFile(htmlPath, 'utf8');
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1]
    ?? '';
  if (!canonical) continue;

  const currentOgImage = decodeHtml(metaContent(html, 'og:image'));
  const needsGeneratedImage = !currentOgImage
    || /\/assets\/og-cover\.jpg(?:$|\?)/.test(currentOgImage)
    || (!currentOgImage.includes('/assets/og/pages/') && await localOgImageIsMissing(currentOgImage));
  if (!needsGeneratedImage) continue;

  const pathname = decodeURIComponent(new URL(canonical).pathname);
  const replacement = generatedOgImageUrl(pathname);
  if (currentOgImage) {
    html = html.replace(
      /(<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["'])[^"']+(["'][^>]*>)/i,
      `$1${replacement}$2`,
    ).replace(
      /(<meta[^>]+content=["'])[^"']+(["'][^>]+(?:property|name)=["']og:image["'][^>]*>)/i,
      `$1${replacement}$2`,
    );
  } else {
    html = html.replace('</head>', `<meta property="og:image" content="${replacement}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"></head>`);
  }
  await writeFile(htmlPath, html, 'utf8');
  normalized += 1;
}

for (const htmlPath of pages) {
  const html = await readFile(htmlPath, 'utf8');
  const ogImage = decodeHtml(metaContent(html, 'og:image'));
  if (!ogImage.includes('/assets/og/pages/')) continue;

  const title = decodeHtml(metaContent(html, 'og:title') || html.match(/<title>([^<]+)<\/title>/i)?.[1] || 'i-feel');
  const description = decodeHtml(metaContent(html, 'og:description'));
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] || 'https://i-feel.co.il/';
  const pathname = decodeURIComponent(new URL(canonical).pathname);
  const category = categoryFor(pathname);
  const filename = path.basename(new URL(ogImage).pathname);
  const backdrop = path.join(root, `public/assets/og/backdrops/${category.key}.png`);

  await sharp(backdrop)
    .resize(1200, 630, { fit: 'cover', position: 'centre' })
    .composite([{ input: overlaySvg(title, description, category.label), top: 0, left: 0 }])
    .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
    .toFile(path.join(outputRoot, filename));
  generated += 1;
}

console.log(`[og-images] Normalized ${normalized} legacy pages and generated ${generated} unique page images in ${path.relative(root, outputRoot)}.`);
