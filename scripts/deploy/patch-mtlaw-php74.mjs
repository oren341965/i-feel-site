import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const target = path.resolve(process.argv[2] ?? "public/mt-law/_bootstrap.php");
let source = await readFile(target, "utf8");

const php8Signature = "function mtlaw_h(mixed $value): string";
const php74Signature = "function mtlaw_h($value): string";

if (source.includes(php8Signature)) {
  source = source.replace(php8Signature, php74Signature);
  await writeFile(target, source, "utf8");
  console.log(`Removed PHP 8 mixed type from ${target}.`);
} else if (source.includes(php74Signature)) {
  console.log(`MT-Law helper is already PHP 7.4 compatible: ${target}.`);
} else {
  throw new Error(`Expected MT-Law helper signature was not found in ${target}.`);
}

if (/\bmixed\s+\$/.test(source)) {
  throw new Error(`PHP 8 mixed parameter type still exists in ${target}.`);
}
