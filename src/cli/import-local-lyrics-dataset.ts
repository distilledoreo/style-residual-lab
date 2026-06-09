import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const source = valueAfter("--source");
const dest = valueAfter("--dest") ?? "private-corpus/copyrighted-lyrics/modern-background";
const format = valueAfter("--format") ?? inferFormat(source);
const lyricsColumn = valueAfter("--lyrics-column") ?? "lyrics";
const titleColumn = valueAfter("--title-column") ?? "title";
const artistColumn = valueAfter("--artist-column") ?? "artist";
const sourceType = valueAfter("--source-type") ?? "licensed";
const sourceDescription = valueAfter("--source-description") ?? "Local dataset import";
const limit = Number(valueAfter("--limit") ?? "0");
const includeArtist = valueAfter("--include-artist")?.toLowerCase();
const excludeArtist = valueAfter("--exclude-artist")?.toLowerCase();
const clearDest = process.argv.includes("--clear-dest");

if (!source) throw new Error("Usage: npm run import:local-lyrics-dataset -- --source <file.csv|file.jsonl> [--dest <private-corpus/...>] [--lyrics-column lyrics] [--title-column title] [--artist-column artist]");
if (sourceType && !["user_supplied", "licensed", "public_domain", "openly_licensed", "api_authorized"].includes(sourceType)) {
  throw new Error("--source-type must be one of user_supplied, licensed, public_domain, openly_licensed, api_authorized");
}

const rows = await loadRows(source, format);
const imported = [];
if (clearDest) await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
for (const row of rows) {
  const artist = String(row[artistColumn] ?? "Unknown Artist").trim();
  const normalizedArtist = artist.toLowerCase();
  if (includeArtist && normalizedArtist !== includeArtist) continue;
  if (excludeArtist && normalizedArtist === excludeArtist) continue;
  const lyrics = String(row[lyricsColumn] ?? "").trim();
  if (!lyrics) continue;
  const title = String(row[titleColumn] ?? `Untitled ${imported.length + 1}`).trim();
  const folder = slug(`${artist}-${title}`);
  await mkdir(join(dest, folder), { recursive: true });
  await writeFile(join(dest, folder, "lyrics.txt"), `Title: ${title}\nArtist: ${artist}\n\n${lyrics}\n`, "utf8");
  imported.push({ title, artist, localPath: `${folder}/lyrics.txt`, permissionNote: sourceDescription });
  if (limit > 0 && imported.length >= limit) break;
}

await writeFile(join(dest, "manifest.json"), JSON.stringify({
  corpusName: `Imported lyrics dataset: ${dest}`,
  sourceType,
  sourceDescription,
  redistribution: "do_not_redistribute",
  importedFrom: source,
  filters: {
    includeArtist,
    excludeArtist,
    limit: limit || undefined
  },
  songs: imported
}, null, 2), "utf8");

console.log(`Imported ${imported.length} lyrics into ${dest}.`);

async function loadRows(path: string, selectedFormat: string): Promise<Array<Record<string, unknown>>> {
  const text = await readFile(path, "utf8");
  if (selectedFormat === "jsonl") {
    return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line));
  }
  if (selectedFormat === "json") {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("JSON imports must be an array of objects.");
    return parsed;
  }
  if (selectedFormat === "csv") return parseCsv(text);
  throw new Error(`Unsupported format: ${selectedFormat}`);
}

function parseCsv(text: string): Array<Record<string, string>> {
  const rows = csvRows(text);
  const header = rows.shift();
  if (!header) return [];
  return rows.map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""])));
}

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted && char === "\"" && next === "\"") {
      field += "\"";
      index++;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(field);
      field = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value.trim()));
}

function inferFormat(path: string | undefined): string {
  if (!path) return "csv";
  if (path.endsWith(".jsonl")) return "jsonl";
  if (path.endsWith(".json")) return "json";
  return "csv";
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
}
