import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const bootstrapPath = path.resolve(process.argv[2] ?? "public/mt-law/_bootstrap.php");
const portalDirectory = path.dirname(bootstrapPath);

async function readUtf8(filePath) {
  return readFile(filePath, "utf8");
}

async function writeIfChanged(filePath, previous, next, message) {
  if (previous === next) {
    console.log(`${message}: already up to date.`);
    return;
  }
  await writeFile(filePath, next, "utf8");
  console.log(`${message}: updated ${filePath}.`);
}

function replaceRequired(source, { marker, before, after, label }) {
  if (source.includes(marker)) {
    console.log(`${label}: already applied.`);
    return source;
  }
  if (!source.includes(before)) {
    throw new Error(`${label}: expected source block was not found.`);
  }
  return source.replace(before, after);
}

const originalBootstrap = await readUtf8(bootstrapPath);
let bootstrap = originalBootstrap;
const php8Signature = "function mtlaw_h(mixed $value): string";
const php74Signature = "function mtlaw_h($value): string";

if (bootstrap.includes(php8Signature)) {
  bootstrap = bootstrap.replace(php8Signature, php74Signature);
} else if (!bootstrap.includes(php74Signature)) {
  throw new Error(`Expected MT-Law helper signature was not found in ${bootstrapPath}.`);
}

if (/\bmixed\s+\$/.test(bootstrap)) {
  throw new Error(`PHP 8 mixed parameter type still exists in ${bootstrapPath}.`);
}
await writeIfChanged(bootstrapPath, originalBootstrap, bootstrap, "PHP 7.4 compatibility");

const productImagePath = path.join(portalDirectory, "product-image.php");
const originalProductImage = await readUtf8(productImagePath);
let productImage = originalProductImage;
if (!productImage.includes("function mtlaw_product_image_is_image_type")) {
  const php8ImageChecks = [
    ["str_starts_with($cachedType, 'image/')", "strpos($cachedType, 'image/') === 0"],
    ["str_starts_with($contentType, 'image/')", "strpos($contentType, 'image/') === 0"],
    ["str_starts_with($staleType, 'image/')", "strpos($staleType, 'image/') === 0"],
  ];
  for (const [before, after] of php8ImageChecks) {
    if (productImage.includes(before)) {
      productImage = productImage.replace(before, after);
    } else if (!productImage.includes(after)) {
      throw new Error(`Turntable image compatibility patch was not found: ${before}`);
    }
  }
} else {
  console.log("Turntable image endpoint compatibility: helper already present.");
}
if (productImage.includes("str_starts_with(")) {
  throw new Error(`PHP 8 str_starts_with remains in ${productImagePath}.`);
}
await writeIfChanged(productImagePath, originalProductImage, productImage, "Turntable image endpoint compatibility");

const indexPath = path.join(portalDirectory, "index.php");
const originalIndex = await readUtf8(indexPath);
let index = originalIndex;

index = replaceRequired(index, {
  label: "Turntable printable product image",
  marker: 'data-mtlaw-enhancement="turntable-print-image"',
  before: `      <h1>Argon Audio TT MK2, Earth Grey</h1>\n      <p>מפרט מקומי לעובדי MT-Law. כל המידע מוצג באתר I Feel ללא מעבר לאתר חיצוני.</p>\n      <div class="print-banner">`,
  after: `      <h1>Argon Audio TT MK2, Earth Grey</h1>\n      <p>מפרט מקומי לעובדי MT-Law. כל המידע מוצג באתר I Feel ללא מעבר לאתר חיצוני.</p>\n      <figure data-mtlaw-enhancement="turntable-print-image" style="margin:24px 0;border:1px solid #dce1e7;border-radius:18px;padding:18px;background:#f4f5f6;text-align:center;break-inside:avoid;">\n        <img src="/mt-law/product-image.php?v=3" alt="פטיפון Argon Audio TT MK2 בגוון Earth Grey" style="display:block;width:100%;max-width:720px;max-height:430px;margin:0 auto;object-fit:contain;" loading="eager">\n        <figcaption style="margin-top:10px;color:#4d5968;font-size:.9rem;">Argon Audio TT MK2, Earth Grey</figcaption>\n      </figure>\n      <div class="print-banner">`,
});

index = replaceRequired(index, {
  label: "Turntable real image in benefit card",
  marker: 'data-mtlaw-enhancement="turntable-card-image"',
  before: `          <div class="gift-visual"><div class="turntable-art" role="img" aria-label="איור פטיפון בגוון אפור"></div></div>`,
  after: `          <div class="gift-visual" data-mtlaw-enhancement="turntable-card-image"><img src="/mt-law/product-image.php?v=3" alt="פטיפון Argon Audio TT MK2 בגוון Earth Grey" style="display:block;width:min(360px,100%);max-height:260px;object-fit:contain;" loading="lazy"></div>`,
});

index = replaceRequired(index, {
  label: "TC4 product image in benefit card",
  marker: 'data-mtlaw-enhancement="tc4-card-image"',
  before: `          <div class="gift-visual"><div class="tc4-art" role="img" aria-label="איור מסך מגע Siemens TC4"><div><strong>TC4</strong><span>Siemens KNX Touch Control</span></div></div></div>`,
  after: `          <div class="gift-visual" data-mtlaw-enhancement="tc4-card-image"><img src="/assets/knx-advisor/siemens-tc4.webp" alt="מסך המגע Siemens Touch Control TC4" style="display:block;width:100%;height:260px;object-fit:contain;border-radius:12px;background:#fff;padding:12px;" loading="lazy"></div>`,
});

index = replaceRequired(index, {
  label: "TC4 catalog and I Feel information links",
  marker: 'data-mtlaw-enhancement="tc4-resources"',
  before: `            <p class="gift-condition">לבונים בית ורוכשים מערכת בית חכם קווית מלאה, בכפוף להתאמה טכנית.</p>\n          </div>`,
  after: `            <p class="gift-condition">לבונים בית ורוכשים מערכת בית חכם קווית מלאה, בכפוף להתאמה טכנית.</p>\n            <div class="button-row" data-mtlaw-enhancement="tc4-resources" style="margin-top:15px">\n              <a class="secondary-button" href="/assets/catalogs/siemens-touch-control-tc4-tc5-he.pdf" target="_blank" rel="noopener">מפרט TC4 ו-TC5 בעברית, PDF</a>\n              <a class="ghost-button" href="/catalogs/#siemens-tc4-tc5">מידע נוסף באתר I Feel</a>\n            </div>\n          </div>`,
});

index = replaceRequired(index, {
  label: "TC4 resources in printable benefit view",
  marker: 'data-mtlaw-enhancement="tc4-print-resources"',
  before: `          <h2>חלופה 2, Siemens TC4</h2>\n          <p>מסך מגע KNX בגודל 4 אינץ׳ בכניסה לבית, לבונים בית ורוכשים מערכת בית חכם קווית מלאה, בכפוף להתאמה טכנית.</p>`,
  after: `          <h2>חלופה 2, Siemens TC4</h2>\n          <p>מסך מגע KNX בגודל 4 אינץ׳ בכניסה לבית, לבונים בית ורוכשים מערכת בית חכם קווית מלאה, בכפוף להתאמה טכנית.</p>\n          <p data-mtlaw-enhancement="tc4-print-resources"><a href="/assets/catalogs/siemens-touch-control-tc4-tc5-he.pdf" target="_blank" rel="noopener">מדריך TC4 ו-TC5 בעברית, PDF</a><br><a href="/catalogs/#siemens-tc4-tc5">קטלוגים ומידע נוסף באתר I Feel</a></p>`,
});

for (const expected of [
  'data-mtlaw-enhancement="turntable-print-image"',
  'data-mtlaw-enhancement="turntable-card-image"',
  'data-mtlaw-enhancement="tc4-card-image"',
  'data-mtlaw-enhancement="tc4-resources"',
  '/assets/catalogs/siemens-touch-control-tc4-tc5-he.pdf',
  '/mt-law/product-image.php?v=3',
]) {
  if (!index.includes(expected)) {
    throw new Error(`MT-Law gift enhancement is missing expected marker: ${expected}`);
  }
}

await writeIfChanged(indexPath, originalIndex, index, "MT-Law gift presentation");
