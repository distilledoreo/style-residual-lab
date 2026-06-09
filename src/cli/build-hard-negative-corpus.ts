import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataPath, paths } from "../core/config.js";
import { readJsonl, writeJsonl } from "../core/jsonl.js";
import type { Atom, Block, EmbeddingRecord, SplitRecord, TopicProfile, Work } from "../core/schema.js";
import { cosine, meanVector, normalize } from "../core/vector.js";

const perTarget = Number(valueAfter("--per-target") ?? process.env.HARD_NEGATIVES_PER_TARGET ?? "5");
const maxBackground = Number(valueAfter("--max-background") ?? process.env.HARD_NEGATIVES_MAX_BACKGROUND ?? "0");
const splitAware = process.argv.includes("--split-aware") || process.env.HARD_NEGATIVES_SPLIT_AWARE === "1";
const strategy = valueAfter("--strategy") ?? process.env.HARD_NEGATIVES_STRATEGY ?? "per-target-nearest";

const works = await readJsonl<Work>(paths.works);
const blocks = await readJsonl<Block>(paths.blocks);
const atoms = await readJsonl<Atom>(paths.atoms);
const topics = await readJsonl<TopicProfile>(paths.topics);
const workEmbeddings = await readJsonl<EmbeddingRecord>(paths.workEmbeddings);
const blockEmbeddings = await readJsonl<EmbeddingRecord>(paths.blockEmbeddings);
const atomEmbeddings = await readJsonl<EmbeddingRecord>(paths.atomEmbeddings);
const topicEmbeddings = await readJsonl<EmbeddingRecord>(paths.topicEmbeddings);
const splits = await readJsonl<SplitRecord>(paths.splits).catch(() => []);
const splitByWorkId = new Map(splits.map((record) => [record.workId, record.split]));

const rawWorkVectors = new Map(workEmbeddings.filter((record) => record.ownerType === "work" && record.scope === "work").map((record) => [record.ownerId, record.vector]));
const targets = works.filter((work) => work.set === "target");
const backgrounds = works.filter((work) => work.set === "background");
const selectedBackgroundIds = new Set<string>();
const nearestRows: Array<{ targetId: string; targetTitle: string; backgroundId: string; backgroundTitle: string; split: string; rawSimilarity: number }> = [];

if (strategy === "target-centroid") selectByTargetCentroid();
else selectPerTargetNearest();

let selectedBackgrounds = backgrounds.filter((work) => selectedBackgroundIds.has(work.id));
if (maxBackground > 0) {
  const maxSimilarityByBackground = new Map<string, number>();
  for (const row of nearestRows) {
    maxSimilarityByBackground.set(row.backgroundId, Math.max(maxSimilarityByBackground.get(row.backgroundId) ?? Number.NEGATIVE_INFINITY, row.rawSimilarity));
  }
  selectedBackgrounds = selectedBackgrounds
    .sort((a, b) => (maxSimilarityByBackground.get(b.id) ?? 0) - (maxSimilarityByBackground.get(a.id) ?? 0))
    .slice(0, maxBackground);
}
const keptWorkIds = new Set([...targets.map((work) => work.id), ...selectedBackgrounds.map((work) => work.id)]);
const keptBlockIds = new Set(blocks.filter((block) => keptWorkIds.has(block.workId)).map((block) => block.id));

await writeJsonl(paths.works, works.filter((work) => keptWorkIds.has(work.id)));
await writeJsonl(paths.blocks, blocks.filter((block) => keptWorkIds.has(block.workId)));
await writeJsonl(paths.atoms, atoms.filter((atom) => keptWorkIds.has(atom.workId)));
await writeJsonl(paths.topics, topics.filter((topic) => keptWorkIds.has(topic.workId)));
if (splits.length) await writeJsonl(paths.splits, splits.filter((split) => keptWorkIds.has(split.workId)));
await writeJsonl(paths.workEmbeddings, workEmbeddings.filter((record) => keptWorkIds.has(record.ownerId)));
await writeJsonl(paths.blockEmbeddings, blockEmbeddings.filter((record) => keptBlockIds.has(record.ownerId)));
await writeJsonl(paths.atomEmbeddings, atomEmbeddings.filter((record) => keptWorkIds.has(atomWorkId(record.ownerId, atoms) ?? "")));
await writeJsonl(paths.topicEmbeddings, topicEmbeddings.filter((record) => keptWorkIds.has(record.ownerId)));

const selectedRows = nearestRows.filter((row) => keptWorkIds.has(row.backgroundId));
interface HardNegativeReport {
  perTarget: number;
  splitAware: boolean;
  strategy: string;
  maxBackground: number | null;
  targetCount: number;
  originalBackgroundCount: number;
  selectedBackgroundCount: number;
  meanSelectedRawSimilarity: number;
  nearestRows: Array<{ targetId: string; targetTitle: string; backgroundId: string; backgroundTitle: string; split: string; rawSimilarity: number }>;
}

const report: HardNegativeReport = {
  perTarget,
  splitAware,
  strategy,
  maxBackground: maxBackground || null,
  targetCount: targets.length,
  originalBackgroundCount: backgrounds.length,
  selectedBackgroundCount: selectedBackgrounds.length,
  meanSelectedRawSimilarity: selectedRows.reduce((sum, row) => sum + row.rawSimilarity, 0) / Math.max(1, selectedRows.length),
  nearestRows: selectedRows
};
const reportDir = dataPath("reports/hard_negatives");
await mkdir(reportDir, { recursive: true });
await writeFile(join(reportDir, "hard_negative_selection.json"), JSON.stringify(report, null, 2), "utf8");
await writeFile(join(reportDir, "hard_negative_selection.md"), markdown(report), "utf8");

console.log(`Selected ${selectedBackgrounds.length} hard-negative background works for ${targets.length} targets.`);

function atomWorkId(atomId: string, allAtoms: Atom[]): string | undefined {
  return allAtoms.find((atom) => atom.id === atomId)?.workId;
}

function markdown(report: HardNegativeReport): string {
  return `# Hard Negative Selection

- Targets: ${report.targetCount}
- Original background works: ${report.originalBackgroundCount}
- Selected background works: ${report.selectedBackgroundCount}
- Hard negatives per target: ${report.perTarget}
- Split-aware selection: ${report.splitAware ? "yes" : "no"}
- Strategy: ${report.strategy}
- Mean selected raw similarity: ${report.meanSelectedRawSimilarity.toFixed(3)}

## Top Matches

| Target | Background | Raw Similarity |
|---|---|---:|
${report.nearestRows.slice(0, 50).map((row) => `| ${row.targetTitle} | ${row.backgroundTitle} | ${row.rawSimilarity.toFixed(3)} |`).join("\n")}
`;
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function selectPerTargetNearest(): void {
  for (const target of targets) {
    const targetVector = rawWorkVectors.get(target.id);
    if (!targetVector) continue;
    const targetSplit = splitByWorkId.get(target.id);
    const candidateBackgrounds = splitAware && targetSplit ? backgrounds.filter((background) => splitByWorkId.get(background.id) === targetSplit) : backgrounds;
    const nearest = candidateBackgrounds
      .map((background) => ({ background, similarity: cosine(targetVector, rawWorkVectors.get(background.id) ?? []) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, perTarget);
    for (const item of nearest) {
      selectedBackgroundIds.add(item.background.id);
      nearestRows.push({
        targetId: target.id,
        targetTitle: target.title,
        backgroundId: item.background.id,
        backgroundTitle: item.background.title,
        split: targetSplit ?? "unsplit",
        rawSimilarity: item.similarity
      });
    }
  }
}

function selectByTargetCentroid(): void {
  const splitNames = splitAware && splits.length ? [...new Set(splits.map((split) => split.split))] : ["unsplit"];
  for (const splitName of splitNames) {
    const splitTargets = splitName === "unsplit" ? targets : targets.filter((target) => splitByWorkId.get(target.id) === splitName);
    const splitBackgrounds = splitName === "unsplit" ? backgrounds : backgrounds.filter((background) => splitByWorkId.get(background.id) === splitName);
    const targetCentroid = normalize(meanVector(splitTargets.map((target) => rawWorkVectors.get(target.id)).filter((vector): vector is number[] => Boolean(vector))));
    const nearest = splitBackgrounds
      .map((background) => ({ background, similarity: cosine(targetCentroid, rawWorkVectors.get(background.id) ?? []) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, Math.max(perTarget, perTarget * splitTargets.length));
    for (const item of nearest) {
      selectedBackgroundIds.add(item.background.id);
      nearestRows.push({
        targetId: `target_centroid_${splitName}`,
        targetTitle: `Target centroid (${splitName})`,
        backgroundId: item.background.id,
        backgroundTitle: item.background.title,
        split: splitName,
        rawSimilarity: item.similarity
      });
    }
  }
}
