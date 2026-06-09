import { mkdir, readdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonl } from "../core/jsonl.js";
import { dataPath, getTargetCorpusRoot, paths } from "../core/config.js";
import type { DatasetSet } from "../core/schema.js";
import { getDomainAdapter } from "../domains/domainAdapter.js";

const args = new Set(process.argv.slice(2));
const onlySet = valueAfter("--set") as DatasetSet | undefined;
const adapter = getDomainAdapter(valueAfter("--domain"));

async function seedTargetCorpus(): Promise<void> {
  if (adapter.targetSeedFormat !== "directory-lyrics") return;
  const sourceRoot = getTargetCorpusRoot();
  try {
    const dirs = await readdir(sourceRoot, { withFileTypes: true });
    await mkdir(dataPath(`raw/target/${adapter.rawSubdir}`), { recursive: true });
    for (const dir of dirs.filter((entry) => entry.isDirectory())) {
      const source = join(sourceRoot, dir.name, "lyrics.txt");
      const dest = join(dataPath(`raw/target/${adapter.rawSubdir}`), `${dir.name.replace(/[^\w-]+/g, "-").toLowerCase()}.txt`);
      await copyFile(source, dest).catch(() => undefined);
    }
  } catch {
    // Corpus seeding is best-effort; normal imports still work.
  }
}

async function importSet(set: DatasetSet) {
  const dir = set === "target" ? dataPath(`raw/target/${adapter.rawSubdir}`) : set === "background" ? dataPath(`raw/background/${adapter.rawSubdir}`) : dataPath(`raw/candidates/${adapter.rawSubdir}`);
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const parsed = await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith(".txt")).map((entry) => adapter.parseFile(join(dir, entry.name), set)));
  return {
    works: parsed.flatMap((item) => item.works),
    blocks: parsed.flatMap((item) => item.blocks),
    atoms: parsed.flatMap((item) => item.atoms)
  };
}

await seedTargetCorpus();
const sets: DatasetSet[] = onlySet ? [onlySet] : ["target", "background", "candidate"];
const parsed = await Promise.all(sets.map(importSet));
const works = parsed.flatMap((item) => item.works);
const blocks = parsed.flatMap((item) => item.blocks);
const atoms = parsed.flatMap((item) => item.atoms);
await writeJsonl(paths.works, works);
await writeJsonl(paths.blocks, blocks);
await writeJsonl(paths.atoms, atoms);
await writeJsonl(dataPath("features/atom_features.jsonl"), atoms.map(adapter.featureExtractors.atom));
await writeJsonl(dataPath("features/block_features.jsonl"), blocks.map((block) => adapter.featureExtractors.block(block, atoms)));
await writeJsonl(dataPath("features/work_features.jsonl"), works.map((work) => adapter.featureExtractors.work(work, blocks, atoms)));
console.log(`Imported ${works.length} ${adapter.name} works.`);

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
