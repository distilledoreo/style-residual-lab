import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { inferFormat, loadRows } from "../core/tabular.js";

const source = valueAfter("--source");
const dest = valueAfter("--dest") ?? "private-corpus/licensed-works/modern-background";
const format = valueAfter("--format") ?? inferFormat(source);
const textColumn = valueAfter("--text-column") ?? "text";
const titleColumn = valueAfter("--title-column") ?? "title";
const authorColumn = valueAfter("--author-column") ?? "author";
const sourceType = valueAfter("--source-type") ?? "licensed";
const sourceDescription = valueAfter("--source-description") ?? "Local dataset import";
const limit = Number(valueAfter("--limit") ?? "0");
const includeAuthor = valueAfter("--include-author")?.toLowerCase();
const excludeAuthor = valueAfter("--exclude-author")?.toLowerCase();
const clearDest = process.argv.includes("--clear-dest");

if (!source) throw new Error("Usage: npm run import:local-dataset -- --source <file.csv|file.jsonl> [--dest <private-corpus/...>] [--text-column text] [--title-column title] [--author-column author]");
if (sourceType && !["user_supplied", "licensed", "public_domain", "openly_licensed", "api_authorized"].includes(sourceType)) {
  throw new Error("--source-type must be one of user_supplied, licensed, public_domain, openly_licensed, api_authorized");
}

const rows = await loadRows(source, format);
const imported = [];
if (clearDest) await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
for (const row of rows) {
  const author = String(row[authorColumn] ?? "Unknown Author").trim();
  const normalizedAuthor = author.toLowerCase();
  if (includeAuthor && normalizedAuthor !== includeAuthor) continue;
  if (excludeAuthor && normalizedAuthor === excludeAuthor) continue;
  const text = String(row[textColumn] ?? "").trim();
  if (!text) continue;
  const title = String(row[titleColumn] ?? `Untitled ${imported.length + 1}`).trim();
  const folder = slug(`${author}-${title}`);
  await mkdir(join(dest, folder), { recursive: true });
  await writeFile(join(dest, folder, "work.txt"), `Title: ${title}\nAuthor: ${author}\n\n${text}\n`, "utf8");
  imported.push({ title, author, localPath: `${folder}/work.txt`, permissionNote: sourceDescription });
  if (limit > 0 && imported.length >= limit) break;
}

await writeFile(join(dest, "manifest.json"), JSON.stringify({
  corpusName: `Imported text dataset: ${dest}`,
  sourceType,
  sourceDescription,
  redistribution: "do_not_redistribute",
  importedFrom: source,
  filters: {
    includeAuthor,
    excludeAuthor,
    limit: limit || undefined
  },
  works: imported
}, null, 2), "utf8");

console.log(`Imported ${imported.length} works into ${dest}.`);

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
}
