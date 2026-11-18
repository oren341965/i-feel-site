import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTITY_MAP = {
  amp: '&', apos: "'", gt: '>', hellip: '…', laquo: '«', ldquo: '“', lsquo: '‘',
  lt: '<', mdash: '—', nbsp: ' ', ndash: '–', quot: '"', raquo: '»', rdquo: '”', rsquo: '’',
};

function decodeEntities(value) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code) => {
    if (code[0] === '#') {
      const hex = code[1]?.toLowerCase() === 'x';
      const number = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return number >= 0 && number <= 0x10ffff ? String.fromCodePoint(number) : entity;
    }
    return ENTITY_MAP[code.toLowerCase()] ?? entity;
  });
}

function toPlainText(html) {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?\s*>/gi, ' ')
      .replace(/<\/(p|div|section|article|li|h[1-6]|tr|details|summary)>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
}

function getTag(html, tagName) {
  return html.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'))?.[1] ?? '';
}

function getMetaContent(html, name) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const nameMatch = tag.match(/\bname\s*=\s*["']([^"']+)["']/i);
    if (nameMatch?.[1].toLowerCase() !== name.toLowerCase()) continue;
    return tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] ?? '';
  }
  return '';
}

function routeFromFile(relativeFile) {
  const normalized = relativeFile.split(path.sep).join('/');
  if (normalized === 'index.html') return '/';
  if (normalized.endsWith('/index.html')) return `/${normalized.slice(0, -'index.html'.length)}`;
  return `/${normalized}`;
}

async function findHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await findHtmlFiles(target)));
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(target);
  }
  return files;
}

function pdfLinks(html) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].flatMap(([, attributes, content]) => {
    const href = decodeEntities(attributes.match(/\shref\s*=\s*["']([^"']+)["']/i)?.[1] ?? '');
    const url = href.replace(/^https:\/\/(?:www\.)?i-feel\.co\.il(?=\/)/i, '').split(/[?#]/, 1)[0];
    if (!/^\/(?:assets\/(?:catalogs|siemens-bms)|gp9\/assets)\/[\w.-]+\.pdf$/i.test(url)) return [];
    return [{ url, label: toPlainText(content) }];
  });
}

function getProductIdentifiers(html) {
  const identifiers = new Set();
  for (const [, content] of html.matchAll(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let schema;
    try { schema = JSON.parse(content); } catch { continue; }
    const nodes = schema?.['@graph'] ?? schema;
    for (const node of [nodes].flat()) {
      if (![node?.['@type']].flat().includes('Product')) continue;
      for (const value of [node.sku, node.mpn, node.model, node.alternateName].flat()) {
        if (typeof value === 'string' && value.trim()) identifiers.add(value.trim());
      }
    }
  }
  return [...identifiers].join(' · ');
}

export async function buildSearchIndex(outputDirectory) {
  const files = await findHtmlFiles(outputDirectory);
  const records = [];
  const documents = new Map();
  for (const file of files) {
    const html = await readFile(file, 'utf8');
    const relativeFile = path.relative(outputDirectory, file);
    const url = routeFromFile(relativeFile);
    const robots = getMetaContent(html, 'robots').toLowerCase();
    if (url === '/search/' || robots.includes('noindex')) continue;

    const mainStart = html.search(/<main\b[^>]*>/i);
    const mainEnd = html.toLowerCase().lastIndexOf('</main>');
    const mainHtml = mainStart >= 0 && mainEnd > mainStart ? html.slice(mainStart, mainEnd) : getTag(html, 'body');
    const browserTitle = toPlainText(getTag(html, 'title'));
    const pageTitle = toPlainText(getTag(mainHtml, 'h1')) || browserTitle;
    const description = toPlainText(getMetaContent(html, 'description'));
    const headings = [...mainHtml.matchAll(/<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]>/gi)]
      .map((match) => toPlainText(match[1]))
      .filter(Boolean)
      .join(' · ');
    const body = toPlainText(mainHtml).slice(0, 24000);
    if (!pageTitle || body.length < 20) continue;
    const identifiers = getProductIdentifiers(html);
    records.push({ url, title: pageTitle.slice(0, 180), description, headings, body, ...(identifiers && { identifiers }) });

    for (const { url: pdfUrl, label } of pdfLinks(mainHtml)) {
      if (documents.has(pdfUrl)) continue;
      const title = label.length > 5 ? `${pageTitle} · ${label}` : pageTitle;
      documents.set(pdfUrl, { url: pdfUrl, title: title.slice(0, 180), description, headings: '', body: '', type: 'pdf' });
    }
    if (url !== '/catalogs/') continue;
    for (const [card] of mainHtml.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi)) {
      const title = toPlainText(getTag(card, 'h3'));
      if (!title) continue;
      const description = [...card.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
        .map(([, content]) => toPlainText(content)).join(' ');
      for (const { url: pdfUrl } of pdfLinks(card)) {
        documents.set(pdfUrl, { url: pdfUrl, title, description, headings: '', body: '', type: 'pdf' });
      }
    }
  }

  const publishedDocuments = await Promise.all([...documents.values()].map(async (record) => {
    const file = await stat(path.join(outputDirectory, record.url.slice(1))).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    return file?.isFile() ? record : null;
  }));
  records.push(...publishedDocuments.filter(Boolean));
  records.sort((left, right) => left.url.localeCompare(right.url, 'he'));
  await writeFile(path.join(outputDirectory, 'search-index.json'), JSON.stringify(records), 'utf8');
  return records.length;
}

export default function searchIndex() {
  return {
    name: 'ifeel-search-index',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const count = await buildSearchIndex(fileURLToPath(dir));
        logger.info(`Indexed ${count} pages and documents for site search.`);
      },
    },
  };
}
