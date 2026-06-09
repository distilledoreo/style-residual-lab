import { paths, getSeed } from "../core/config.js";
import { hashText } from "../core/ids.js";
import { readJsonl, writeJsonl } from "../core/jsonl.js";
import type { SplitRecord, Work } from "../core/schema.js";
import { splitForIndex } from "../core/split.js";

const seed = getSeed();
const works = await readJsonl<Work>(paths.works);
const records: SplitRecord[] = [];
for (const group of splitGroups(works)) {
  group
    .sort((a, b) => hashText(seed, a.id).localeCompare(hashText(seed, b.id)))
    .forEach((work, index) => {
      const split = splitForIndex(index, group.length);
      records.push({ workId: work.id, set: work.set, split, seed, sourcePath: work.sourcePath, title: work.title });
    });
}
await writeJsonl(paths.splits, records);
console.log(`Wrote deterministic splits for ${records.length} works with seed ${seed}.`);

function splitGroups(allWorks: Work[]): Work[][] {
  const target = allWorks.filter((work) => work.set === "target");
  const backgroundGroups = new Map<string, Work[]>();
  for (const work of allWorks.filter((item) => item.set === "background")) {
    const key = String(work.metadata?.syntheticControlType ?? "background");
    backgroundGroups.set(key, [...(backgroundGroups.get(key) ?? []), work]);
  }
  return [target, ...backgroundGroups.values()];
}
