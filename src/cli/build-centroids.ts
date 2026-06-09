import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createId } from "../core/ids.js";
import { paths } from "../core/config.js";
import { readJsonl } from "../core/jsonl.js";
import type { CentroidRecord, ResidualRecord, SplitRecord, Work } from "../core/schema.js";
import { meanVector, normalize } from "../core/vector.js";
import { getDomainAdapter } from "../domains/domainAdapter.js";

const splitArg = valueAfter("--split") ?? "train";
const works = await readJsonl<Work>(paths.works);
const adapter = getDomainAdapter(works[0]?.domain);
const splits = await readJsonl<SplitRecord>(paths.splits);
const residuals = await readJsonl<ResidualRecord>(paths.residualEmbeddings);
const workById = new Map(works.map((work) => [work.id, work]));
const allowed = new Set(splits.filter((split) => split.split === splitArg).map((split) => split.workId));

function build(set: "target" | "background"): CentroidRecord[] {
  const setResiduals = residuals.filter((residual) => workById.get(residual.workId)?.set === set && (allowed.size === 0 || allowed.has(residual.workId)));
  const groups = new Map<string, ResidualRecord[]>();
  for (const residual of setResiduals) {
    const key = [residual.ownerType, residual.scope, residual.blockType ?? ""].join("|");
    groups.set(key, [...(groups.get(key) ?? []), residual]);
  }
  return [...groups.entries()].map(([key, records]) => {
    const [ownerType, scope, blockType] = key.split("|");
    return {
      id: createId("centroid", set, key),
      set,
      domain: adapter.name,
      ownerType: ownerType as "work" | "block",
      scope,
      blockType: blockType || undefined,
      count: records.length,
      vector: normalize(meanVector(records.map((record) => record.vector)))
    };
  });
}

await writeJson(paths.targetCentroids, build("target"));
await writeJson(paths.backgroundCentroids, build("background"));
console.log(`Built train centroids for target and background.`);

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
