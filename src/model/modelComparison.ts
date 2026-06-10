import { readFile } from "node:fs/promises";
import { paths } from "../core/config.js";
import { readJsonl } from "../core/jsonl.js";
import type { EmbeddingRecord, ResidualRecord, SplitName, SplitRecord, Work } from "../core/schema.js";
import { cosine, meanVector, normalize } from "../core/vector.js";
import { evaluateScores } from "../validation/metrics.js";
import { ATTEMPTED_LOOKALIKE_TYPE, SAME_TOPIC_GENERIC_NEAR_MISS_TYPE } from "../validation/nearMissGate.js";
import { cosineDeltaStyleScores } from "../stylometry/burrowsDelta.js";
import type { StyleScore } from "../scoring/styleScoring.js";

export interface ComparedModel {
  id: "residual_margin" | "residual_margin_dual_gate" | "residual_margin_strict_dual_gate" | "residual_near_miss_contrast" | "residual_near_miss_contrast_strict" | "raw_margin" | "residual_target_similarity" | "raw_target_similarity" | "stylometric_cosine_delta";
  label: string;
  threshold: number;
  targetSimilarityThreshold?: number;
  validationMetrics: Record<string, unknown>;
}

export interface TrainedStyleModel {
  modelType: string;
  selectedModelId: ComparedModel["id"];
  selectedFeature: string;
  threshold: number;
  targetSimilarityThreshold?: number;
  calibrated: false;
  modelsCompared: ComparedModel[];
  dataset: Record<string, unknown>;
  acceptanceCriteria: Record<string, number>;
  limitations: string[];
}

interface ModelVectors {
  works: Work[];
  splits: SplitRecord[];
  residualVectors: Map<string, number[]>;
  rawVectors: Map<string, number[]>;
}

export async function trainModelComparison(): Promise<TrainedStyleModel> {
  const vectors = await loadModelVectors();
  const compared = await Promise.all(MODEL_DEFINITIONS.map((model) => compareModel(vectors, model, "validation")));
  const selected = selectModel(compared);
  const dataset = datasetSummary(vectors.works, vectors.splits);
  return {
    modelType: "validation-selected centroid threshold model",
    selectedModelId: selected.id,
    selectedFeature: selected.id,
    threshold: selected.threshold,
    targetSimilarityThreshold: selected.targetSimilarityThreshold,
    calibrated: false,
    modelsCompared: compared,
    dataset,
    acceptanceCriteria: {
      rocAuc: 0.9,
      balancedAccuracy: 0.85,
      recall: 0.85,
      falsePositiveRate: 0.15
    },
    limitations: limitations(dataset)
  };
}

export function isSelectableModelId(id: ComparedModel["id"]): boolean {
  return !id.startsWith("stylometric");
}

function selectModel(compared: ComparedModel[]): ComparedModel {
  const selectable = compared.filter((model) => isSelectableModelId(model.id));
  const passingResiduals = selectable
    .filter((model) => model.id.startsWith("residual") && meetsValidationAcceptance(model.validationMetrics))
    .sort(compareValidationModels);
  return passingResiduals[0] ?? [...selectable].sort(compareValidationModels)[0];
}

function meetsValidationAcceptance(metrics: Record<string, unknown>): boolean {
  return (
    Number(metrics.rocAuc) >= 0.9 &&
    Number(metrics.balancedAccuracy) >= 0.85 &&
    Number(metrics.recall) >= 0.85 &&
    Number(metrics.falsePositiveRate) <= 0.15
  );
}

export async function loadTrainedStyleModel(): Promise<TrainedStyleModel> {
  return JSON.parse(await readFile(paths.trainedModel, "utf8")) as TrainedStyleModel;
}

export async function scoreSplitWithModel(split: SplitName, model: TrainedStyleModel): Promise<StyleScore[]> {
  const vectors = await loadModelVectors();
  return scoreSplit(vectors, model.selectedModelId, split, model.threshold, model.targetSimilarityThreshold);
}

export async function scoreSplit(vectors: ModelVectors, modelId: ComparedModel["id"], split: SplitName, threshold: number, targetSimilarityThreshold?: number): Promise<StyleScore[]> {
  const splitIds = new Set(vectors.splits.filter((record) => record.split === split).map((record) => record.workId));
  const trainIds = new Set(vectors.splits.filter((record) => record.split === "train").map((record) => record.workId));
  const trainTarget = vectors.works.filter((work) => work.set === "target" && trainIds.has(work.id));
  const trainBackground = vectors.works.filter((work) => work.set === "background" && trainIds.has(work.id));
  if (modelId === "stylometric_cosine_delta") {
    const scored = vectors.works.filter((work) => splitIds.has(work.id));
    return cosineDeltaStyleScores(trainTarget, trainBackground, scored).map((score) => ({ ...score, predictedTarget: score.styleMargin >= threshold }));
  }
  const trainNearMiss = trainBackground.filter((work) => [SAME_TOPIC_GENERIC_NEAR_MISS_TYPE, ATTEMPTED_LOOKALIKE_TYPE].includes(String(work.metadata?.syntheticControlType)));
  const vectorMap = modelId.startsWith("raw") ? vectors.rawVectors : vectors.residualVectors;
  const targetCentroid = centroid(trainTarget.map((work) => vectorMap.get(work.id)));
  const backgroundCentroid = centroid(trainBackground.map((work) => vectorMap.get(work.id)));
  const nearMissCentroid = centroid(trainNearMiss.map((work) => vectorMap.get(work.id)));
  return vectors.works
    .filter((work) => splitIds.has(work.id))
    .flatMap((work) => {
      const vector = vectorMap.get(work.id);
      if (!vector) return [];
      const targetSimilarity = vector && targetCentroid.length ? cosine(vector, targetCentroid) : 0;
      const backgroundSimilarity = vector && backgroundCentroid.length ? cosine(vector, backgroundCentroid) : 0;
      const nearMissSimilarity = vector && nearMissCentroid.length ? cosine(vector, nearMissCentroid) : undefined;
      const contrastSimilarity = Math.max(backgroundSimilarity, nearMissSimilarity ?? Number.NEGATIVE_INFINITY);
      const score = modelId.endsWith("target_similarity")
        ? targetSimilarity
        : modelId === "residual_near_miss_contrast" || modelId === "residual_near_miss_contrast_strict"
          ? targetSimilarity - contrastSimilarity
          : targetSimilarity - backgroundSimilarity;
      const predictedTarget = modelId === "residual_margin_dual_gate" || modelId === "residual_margin_strict_dual_gate"
        ? score >= threshold && targetSimilarity >= (targetSimilarityThreshold ?? Number.NEGATIVE_INFINITY)
        : score >= threshold;
      const nearest = trainTarget
        .map((target) => ({ id: target.id, title: target.title, similarity: vector ? cosine(vector, vectorMap.get(target.id) ?? []) : 0 }))
        .sort((a, b) => b.similarity - a.similarity)[0];
      return [{
        workId: work.id,
        title: work.title,
        set: work.set,
        targetSimilarity,
        backgroundSimilarity,
        nearMissSimilarity,
        styleMargin: score,
        nearestTargetNeighbor: nearest,
        overfitRisk: nearest && nearest.similarity >= 0.92 ? "high" : nearest && nearest.similarity >= 0.84 ? "moderate" : "low",
        sectionScores: {},
        predictedTarget
      }];
    });
}

export async function compareModel(vectors: ModelVectors, model: (typeof MODEL_DEFINITIONS)[number], split: SplitName): Promise<ComparedModel> {
  const unthresholded = await scoreSplit(vectors, model.id, split, Number.NEGATIVE_INFINITY);
  const chosen: { threshold: number; targetSimilarityThreshold?: number } = model.id === "residual_margin_dual_gate" || model.id === "residual_margin_strict_dual_gate"
    ? chooseDualGateThresholds(unthresholded, { preferStrictSimilarityFloor: model.id === "residual_margin_strict_dual_gate" })
    : model.id === "residual_near_miss_contrast_strict"
      ? { threshold: chooseStrictThreshold(unthresholded) }
    : { threshold: chooseThreshold(unthresholded) };
  const thresholded = await scoreSplit(vectors, model.id, split, chosen.threshold, chosen.targetSimilarityThreshold);
  return {
    id: model.id,
    label: model.label,
    threshold: chosen.threshold,
    targetSimilarityThreshold: chosen.targetSimilarityThreshold,
    validationMetrics: evaluateScores(thresholded, chosen.threshold, { usePredictions: true })
  };
}

export async function loadModelVectors(): Promise<ModelVectors> {
  const works = await readJsonl<Work>(paths.works);
  const splits = await readJsonl<SplitRecord>(paths.splits);
  const residuals = await readJsonl<ResidualRecord>(paths.residualEmbeddings);
  const rawEmbeddings = await readJsonl<EmbeddingRecord>(paths.workEmbeddings);
  return {
    works,
    splits,
    residualVectors: new Map(residuals.filter((record) => record.ownerType === "work" && record.scope === "work").map((record) => [record.workId, record.vector])),
    rawVectors: new Map(rawEmbeddings.filter((record) => record.ownerType === "work" && record.scope === "work").map((record) => [record.ownerId, record.vector]))
  };
}

export function chooseThreshold(scores: StyleScore[]): number {
  const values = [...new Set(scores.map((score) => score.styleMargin))].sort((a, b) => a - b);
  const candidates = [values[0] - 1e-6, ...values.slice(0, -1).map((value, index) => (value + values[index + 1]) / 2), values[values.length - 1] + 1e-6];
  return candidates
    .map((threshold) => ({ threshold, metrics: evaluateScores(scores, threshold) }))
    .sort((a, b) => compareMetricObjects(a.metrics, b.metrics))[0]?.threshold ?? 0;
}

function chooseStrictThreshold(scores: StyleScore[]): number {
  const operationalFloor = Number(process.env.STYLE_LAB_MIN_CONTRAST_MARGIN ?? 0.05);
  const floorMetrics = evaluateScores(scores, operationalFloor);
  if (meetsValidationAcceptance(floorMetrics)) return operationalFloor;
  const values = [...new Set(scores.map((score) => score.styleMargin))].sort((a, b) => a - b);
  const candidates = thresholdCandidates(values);
  const eligible = candidates
    .map((threshold) => ({ threshold, metrics: evaluateScores(scores, threshold) }))
    .filter((item) => meetsValidationAcceptance(item.metrics));
  return eligible.sort((a, b) => b.threshold - a.threshold)[0]?.threshold ?? chooseThreshold(scores);
}

function chooseDualGateThresholds(scores: StyleScore[], options: { preferStrictSimilarityFloor?: boolean } = {}): { threshold: number; targetSimilarityThreshold: number } {
  const marginValues = [...new Set(scores.map((score) => score.styleMargin))].sort((a, b) => a - b);
  const similarityValues = [...new Set(scores.map((score) => score.targetSimilarity))].sort((a, b) => a - b);
  const marginCandidates = thresholdCandidates(marginValues);
  const similarityCandidates = thresholdCandidates(similarityValues);
  const candidates = marginCandidates
    .flatMap((threshold) => similarityCandidates.map((targetSimilarityThreshold) => {
      const predicted = scores.map((score) => ({
        ...score,
        predictedTarget: score.styleMargin >= threshold && score.targetSimilarity >= targetSimilarityThreshold
      }));
      return {
        threshold,
        targetSimilarityThreshold,
        metrics: evaluateScores(predicted, threshold, { usePredictions: true })
      };
    }));
  const eligible = options.preferStrictSimilarityFloor ? candidates.filter((item) => meetsValidationAcceptance(item.metrics)) : candidates;
  return eligible.sort((a, b) => {
    if (options.preferStrictSimilarityFloor) {
      const stricterSimilarity = b.targetSimilarityThreshold - a.targetSimilarityThreshold;
      if (stricterSimilarity !== 0) return stricterSimilarity;
    }
    const metricOrder = compareMetricObjects(a.metrics, b.metrics);
    if (metricOrder !== 0) return metricOrder;
    const stricterSimilarity = b.targetSimilarityThreshold - a.targetSimilarityThreshold;
    if (stricterSimilarity !== 0) return stricterSimilarity;
    return b.threshold - a.threshold;
  })[0] ?? { threshold: 0, targetSimilarityThreshold: 0 };
}

function thresholdCandidates(values: number[]): number[] {
  return [values[0] - 1e-6, ...values.slice(0, -1).map((value, index) => (value + values[index + 1]) / 2), values[values.length - 1] + 1e-6];
}

function compareValidationModels(a: ComparedModel, b: ComparedModel): number {
  const aStrictContrast = a.id === "residual_near_miss_contrast_strict" && meetsValidationAcceptance(a.validationMetrics);
  const bStrictContrast = b.id === "residual_near_miss_contrast_strict" && meetsValidationAcceptance(b.validationMetrics);
  if (aStrictContrast && !bStrictContrast) return -1;
  if (bStrictContrast && !aStrictContrast) return 1;
  const metricOrder = compareMetricObjects(a.validationMetrics, b.validationMetrics);
  if (metricOrder !== 0) return metricOrder;
  if (a.id === "residual_near_miss_contrast_strict" && b.id !== "residual_near_miss_contrast_strict") return -1;
  if (b.id === "residual_near_miss_contrast_strict" && a.id !== "residual_near_miss_contrast_strict") return 1;
  if (a.id === "residual_near_miss_contrast" && b.id !== "residual_near_miss_contrast") return -1;
  if (b.id === "residual_near_miss_contrast" && a.id !== "residual_near_miss_contrast") return 1;
  if (a.id === "residual_margin_strict_dual_gate" && b.id !== "residual_margin_strict_dual_gate") return -1;
  if (b.id === "residual_margin_strict_dual_gate" && a.id !== "residual_margin_strict_dual_gate") return 1;
  if (a.id === "residual_margin_dual_gate" && b.id !== "residual_margin_dual_gate") return -1;
  if (b.id === "residual_margin_dual_gate" && a.id !== "residual_margin_dual_gate") return 1;
  return 0;
}

function compareMetricObjects(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const ba = Number(b.balancedAccuracy) - Number(a.balancedAccuracy);
  if (ba !== 0) return ba;
  const auc = Number(b.rocAuc) - Number(a.rocAuc);
  if (auc !== 0) return auc;
  const fpr = Number(a.falsePositiveRate) - Number(b.falsePositiveRate);
  if (fpr !== 0) return fpr;
  return Number(b.recall) - Number(a.recall);
}

function centroid(vectors: Array<number[] | undefined>): number[] {
  const present = vectors.filter((vector): vector is number[] => Boolean(vector));
  return present.length ? normalize(meanVector(present)) : [];
}

function datasetSummary(works: Work[], splits: SplitRecord[]) {
  return {
    targetCount: works.filter((work) => work.set === "target").length,
    backgroundCount: works.filter((work) => work.set === "background").length,
    candidateCount: works.filter((work) => work.set === "candidate").length,
    syntheticBackgroundCount: works.filter((work) => work.set === "background" && work.metadata?.syntheticControlType).length,
    splits: Object.fromEntries(["train", "validation", "test"].map((split) => [split, splits.filter((record) => record.split === split).length]))
  };
}

function limitations(summary: ReturnType<typeof datasetSummary>): string[] {
  const syntheticCount = Number(summary.syntheticBackgroundCount);
  const backgroundCount = Number(summary.backgroundCount);
  return [
    "Calibration is disabled because the validation set is still small; reports use score/margin language, not probability.",
    syntheticCount > 0
      ? "Synthetic background controls are useful diagnostics but are not a substitute for a large human-curated negative corpus."
      : `Background corpus contains ${backgroundCount} non-synthetic works; quality still depends on whether the contrast set is genre-, era-, and topic-appropriate.`,
    "Model selection is embedding-only. Handcrafted domain traits are not used for classification."
  ];
}

export const MODEL_DEFINITIONS = [
  { id: "residual_margin", label: "Residual target-minus-background centroid margin" },
  { id: "residual_margin_dual_gate", label: "Residual margin plus target-centroid similarity floor" },
  { id: "residual_margin_strict_dual_gate", label: "Residual margin plus recall-tolerant target-centroid similarity floor" },
  { id: "residual_near_miss_contrast", label: "Residual target-minus-near-miss contrast margin" },
  { id: "residual_near_miss_contrast_strict", label: "Residual target-minus-near-miss contrast margin with recall-tolerant threshold" },
  { id: "raw_margin", label: "Raw target-minus-background centroid margin" },
  { id: "residual_target_similarity", label: "Residual target centroid similarity" },
  { id: "raw_target_similarity", label: "Raw target centroid similarity" },
  { id: "stylometric_cosine_delta", label: "Cosine-delta function-word stylometry baseline (reported only, never selected)" }
] as const;
