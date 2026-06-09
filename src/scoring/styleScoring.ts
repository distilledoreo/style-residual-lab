import { readFile } from "node:fs/promises";
import { paths } from "../core/config.js";
import { readJsonl } from "../core/jsonl.js";
import type { CentroidRecord, ResidualRecord, SplitRecord, Work } from "../core/schema.js";
import { cosine } from "../core/vector.js";
import { overfitRisk } from "./overfitRisk.js";
import { getDomainAdapter } from "../domains/domainAdapter.js";

export interface StyleScore {
  workId: string;
  title: string;
  set?: string;
  targetSimilarity: number;
  backgroundSimilarity: number;
  nearMissSimilarity?: number;
  styleMargin: number;
  nearestTargetNeighbor?: { id: string; title: string; similarity: number };
  overfitRisk: string;
  sectionScores: Record<string, { targetSimilarity: number; backgroundSimilarity: number; styleMargin: number }>;
  predictedTarget?: boolean;
}

export async function loadCentroids(): Promise<{ target: CentroidRecord[]; background: CentroidRecord[] }> {
  return {
    target: JSON.parse(await readFile(paths.targetCentroids, "utf8")) as CentroidRecord[],
    background: JSON.parse(await readFile(paths.backgroundCentroids, "utf8")) as CentroidRecord[]
  };
}

export function scoreResidual(
  work: Work,
  residuals: ResidualRecord[],
  centroids: { target: CentroidRecord[]; background: CentroidRecord[] },
  targetPool: Array<ResidualRecord & { title: string }> = []
): StyleScore {
  const workResidual = residuals.find((record) => record.workId === work.id && record.ownerType === "work" && record.scope === "work");
  if (!workResidual) throw new Error(`No work residual for ${work.title}`);
  const targetWork = centroids.target.find((centroid) => centroid.ownerType === "work" && centroid.scope === "work");
  const backgroundWork = centroids.background.find((centroid) => centroid.ownerType === "work" && centroid.scope === "work");
  const targetSimilarity = targetWork ? cosine(workResidual.vector, targetWork.vector) : 0;
  const backgroundSimilarity = backgroundWork ? cosine(workResidual.vector, backgroundWork.vector) : 0;
  const nearest = targetPool
    .filter((record) => record.workId !== work.id && record.ownerType === "work" && record.scope === "work")
    .map((record) => ({ id: record.workId, title: record.title, similarity: cosine(workResidual.vector, record.vector) }))
    .sort((a, b) => b.similarity - a.similarity)[0];
  const sectionScores: StyleScore["sectionScores"] = {};
  const adapter = getDomainAdapter(work.domain);
  for (const type of adapter.sectionTypes) {
    const residual = residuals.find((record) => record.workId === work.id && record.blockType === type);
    const target = centroids.target.find((centroid) => centroid.blockType === type);
    const background = centroids.background.find((centroid) => centroid.blockType === type);
    if (residual && target) {
      const ts = cosine(residual.vector, target.vector);
      const bs = background ? cosine(residual.vector, background.vector) : 0;
      sectionScores[type] = { targetSimilarity: ts, backgroundSimilarity: bs, styleMargin: ts - bs };
    }
  }
  return {
    workId: work.id,
    title: work.title,
    set: work.set,
    targetSimilarity,
    backgroundSimilarity,
    styleMargin: targetSimilarity - backgroundSimilarity,
    nearestTargetNeighbor: nearest,
    overfitRisk: overfitRisk(nearest?.similarity ?? 0),
    sectionScores
  };
}

export async function scoreHeldout(splitName = "test"): Promise<StyleScore[]> {
  const works = await readJsonl<Work>(paths.works);
  const residuals = await readJsonl<ResidualRecord>(paths.residualEmbeddings);
  const splits = await readJsonl<SplitRecord>(paths.splits);
  const centroids = await loadCentroids();
  const heldout = new Set(splits.filter((split) => split.split === splitName).map((split) => split.workId));
  const targetPool = residuals
    .filter((record) => works.find((work) => work.id === record.workId)?.set === "target")
    .map((record) => ({ ...record, title: works.find((work) => work.id === record.workId)?.title ?? record.workId }));
  return works.filter((work) => heldout.has(work.id)).map((work) => scoreResidual(work, residuals, centroids, targetPool));
}
