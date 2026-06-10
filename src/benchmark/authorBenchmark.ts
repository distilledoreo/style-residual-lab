import { hashText } from "../core/ids.js";
import type { SplitName } from "../core/schema.js";
import { splitForIndex } from "../core/split.js";
import { cosine, meanVector, normalize } from "../core/vector.js";
import { evaluateScores } from "../validation/metrics.js";
import { chooseThreshold } from "../model/modelComparison.js";
import { cosineDeltaStyleScores } from "../stylometry/burrowsDelta.js";
import type { StyleScore } from "../scoring/styleScoring.js";

export interface BenchmarkWork {
  id: string;
  title: string;
  author: string;
  text: string;
}

export interface AuthorTask {
  author: string;
  targetWorks: BenchmarkWork[];
  backgroundWorks: BenchmarkWork[];
}

export interface AuthorBenchmarkOptions {
  seed: number;
  minWorksPerAuthor: number;
  maxAuthors: number;
  maxWorksPerAuthor: number;
  maxBackgroundPerTask: number;
}

export interface TaskModelResult {
  author: string;
  threshold: number;
  counts: { trainTarget: number; trainBackground: number; validation: number; test: number };
  validationMetrics: Record<string, unknown>;
  testMetrics: Record<string, unknown>;
}

export interface MetricSummary {
  mean: number;
  stdev: number;
  ci95Low: number;
  ci95High: number;
}

type LabelledWork = BenchmarkWork & { set: "target" | "background" };
type TaskScorer = (trainTarget: LabelledWork[], trainBackground: LabelledWork[], scored: LabelledWork[]) => StyleScore[];

export function groupByAuthor(works: BenchmarkWork[]): Map<string, BenchmarkWork[]> {
  const groups = new Map<string, BenchmarkWork[]>();
  for (const work of works) groups.set(work.author, [...(groups.get(work.author) ?? []), work]);
  return groups;
}

export function buildTasks(works: BenchmarkWork[], options: AuthorBenchmarkOptions): AuthorTask[] {
  const byAuthor = groupByAuthor(works);
  const eligible = [...byAuthor.entries()]
    .filter(([, authorWorks]) => authorWorks.length >= options.minWorksPerAuthor)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, options.maxAuthors);
  if (eligible.length < 2) {
    throw new Error(`Need at least 2 authors with ${options.minWorksPerAuthor}+ works; found ${eligible.length}.`);
  }
  return eligible.map(([author, authorWorks]) => {
    const targetWorks = deterministicSample(authorWorks, options.maxWorksPerAuthor, options.seed);
    const others = eligible.filter(([otherAuthor]) => otherAuthor !== author);
    const perAuthorCap = Math.max(1, Math.ceil(options.maxBackgroundPerTask / others.length));
    const backgroundWorks = deterministicSample(
      others.flatMap(([, otherWorks]) => deterministicSample(otherWorks, perAuthorCap, options.seed)),
      options.maxBackgroundPerTask,
      options.seed
    );
    return { author, targetWorks, backgroundWorks };
  });
}

export function splitTask(task: AuthorTask, seed: number): Map<string, SplitName> {
  const groups = [task.targetWorks, ...groupByAuthor(task.backgroundWorks).values()];
  const assignments = new Map<string, SplitName>();
  for (const group of groups) {
    deterministicSample(group, group.length, seed).forEach((work, index) => {
      assignments.set(work.id, splitForIndex(index, group.length));
    });
  }
  return assignments;
}

export function runCosineDeltaTask(task: AuthorTask, assignments: Map<string, SplitName>): TaskModelResult {
  return runTask(task, assignments, (trainTarget, trainBackground, scored) => cosineDeltaStyleScores(trainTarget, trainBackground, scored));
}

export function runEmbeddingMarginTask(task: AuthorTask, assignments: Map<string, SplitName>, vectorByWorkId: Map<string, number[]>): TaskModelResult {
  return runTask(task, assignments, (trainTarget, trainBackground, scored) => centroidMarginStyleScores(trainTarget, trainBackground, scored, vectorByWorkId));
}

export function centroidMarginStyleScores(
  trainTarget: LabelledWork[],
  trainBackground: LabelledWork[],
  scored: LabelledWork[],
  vectorByWorkId: Map<string, number[]>
): StyleScore[] {
  const targetCentroid = centroid(trainTarget.map((work) => vectorByWorkId.get(work.id)));
  const backgroundCentroid = centroid(trainBackground.map((work) => vectorByWorkId.get(work.id)));
  if (!targetCentroid.length || !backgroundCentroid.length) return [];
  return scored.flatMap((work) => {
    const vector = vectorByWorkId.get(work.id);
    if (!vector) return [];
    const targetSimilarity = cosine(vector, targetCentroid);
    const backgroundSimilarity = cosine(vector, backgroundCentroid);
    const nearest = trainTarget
      .filter((target) => target.id !== work.id)
      .map((target) => ({ id: target.id, title: target.title, similarity: cosine(vector, vectorByWorkId.get(target.id) ?? []) }))
      .sort((a, b) => b.similarity - a.similarity)[0];
    return [{
      workId: work.id,
      title: work.title,
      set: work.set,
      targetSimilarity,
      backgroundSimilarity,
      styleMargin: targetSimilarity - backgroundSimilarity,
      nearestTargetNeighbor: nearest,
      overfitRisk: nearest && nearest.similarity >= 0.92 ? "high" : nearest && nearest.similarity >= 0.84 ? "moderate" : "low",
      sectionScores: {}
    }];
  });
}

export function summarizeTaskMetrics(results: TaskModelResult[], keys = ["rocAuc", "balancedAccuracy", "recall", "falsePositiveRate"]): Record<string, MetricSummary> {
  const summary: Record<string, MetricSummary> = {};
  for (const key of keys) {
    const values = results.map((result) => Number(result.testMetrics[key])).filter((value) => Number.isFinite(value));
    const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);
    const stdev = Math.sqrt(variance);
    const halfWidth = values.length > 1 ? (1.96 * stdev) / Math.sqrt(values.length) : 0;
    summary[key] = { mean, stdev, ci95Low: mean - halfWidth, ci95High: mean + halfWidth };
  }
  return summary;
}

function runTask(task: AuthorTask, assignments: Map<string, SplitName>, scorer: TaskScorer): TaskModelResult {
  const labelled: LabelledWork[] = [
    ...task.targetWorks.map((work) => ({ ...work, set: "target" as const })),
    ...task.backgroundWorks.map((work) => ({ ...work, set: "background" as const }))
  ];
  const bySplit = (split: SplitName) => labelled.filter((work) => assignments.get(work.id) === split);
  const train = bySplit("train");
  const trainTarget = train.filter((work) => work.set === "target");
  const trainBackground = train.filter((work) => work.set === "background");
  const validation = bySplit("validation");
  const test = bySplit("test");
  const validationScores = scorer(trainTarget, trainBackground, validation);
  const threshold = validationScores.length ? chooseThreshold(validationScores) : 0;
  const testScores = scorer(trainTarget, trainBackground, test);
  return {
    author: task.author,
    threshold,
    counts: { trainTarget: trainTarget.length, trainBackground: trainBackground.length, validation: validation.length, test: test.length },
    validationMetrics: evaluateScores(validationScores, threshold),
    testMetrics: evaluateScores(testScores, threshold)
  };
}

function deterministicSample(works: BenchmarkWork[], cap: number, seed: number): BenchmarkWork[] {
  return [...works]
    .sort((a, b) => hashText(seed, a.id).localeCompare(hashText(seed, b.id)))
    .slice(0, cap);
}

function centroid(vectors: Array<number[] | undefined>): number[] {
  const present = vectors.filter((vector): vector is number[] => Boolean(vector));
  return present.length ? normalize(meanVector(present)) : [];
}
