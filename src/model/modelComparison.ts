import { readFile } from "node:fs/promises";
import { paths } from "../core/config.js";
import { readJsonl } from "../core/jsonl.js";
import type { EmbeddingRecord, ResidualRecord, SplitName, SplitRecord, Work } from "../core/schema.js";
import { cosine } from "../core/vector.js";
import { evaluateScores } from "../validation/metrics.js";
import { ATTEMPTED_LOOKALIKE_TYPE, SAME_TOPIC_GENERIC_NEAR_MISS_TYPE } from "../validation/nearMissGate.js";
import type { StyleScore } from "../scoring/styleScoring.js";
import { createModelScorer, vectorSpaceForModel, type ScorerTrainingPools } from "./scoringEngine.js";
import { fitPlattCalibration, type PlattCalibration } from "./calibration.js";

export const EMBEDDING_MODEL_DEFINITIONS = [
  { id: "residual_margin", label: "Residual target-minus-background centroid margin" },
  { id: "residual_margin_dual_gate", label: "Residual margin plus target-centroid similarity floor" },
  { id: "residual_margin_strict_dual_gate", label: "Residual margin plus recall-tolerant target-centroid similarity floor" },
  { id: "residual_near_miss_contrast", label: "Residual target-minus-near-miss contrast margin" },
  { id: "residual_near_miss_contrast_strict", label: "Residual target-minus-near-miss contrast margin with recall-tolerant threshold" },
  { id: "raw_margin", label: "Raw target-minus-background centroid margin" },
  { id: "residual_target_similarity", label: "Residual target centroid similarity" },
  { id: "raw_target_similarity", label: "Raw target centroid similarity" },
  { id: "residual_knn_contrast", label: "Residual k-nearest-target minus k-nearest-negative contrast" },
  { id: "raw_knn_contrast", label: "Raw k-nearest-target minus k-nearest-negative contrast" },
  { id: "residual_centered_margin", label: "Residual mean-centered centroid margin" },
  { id: "raw_centered_margin", label: "Raw mean-centered centroid margin" },
  { id: "residual_centered_knn_contrast", label: "Residual mean-centered k-nearest contrast" },
  { id: "raw_centered_knn_contrast", label: "Raw mean-centered k-nearest contrast" },
  { id: "residual_znorm_margin", label: "Residual typicality z-score margin" },
  { id: "raw_znorm_margin", label: "Raw typicality z-score margin" }
] as const;

export type ModelId = (typeof EMBEDDING_MODEL_DEFINITIONS)[number]["id"];

export interface ComparedModel {
  id: ModelId;
  label: string;
  threshold: number;
  targetSimilarityThreshold?: number;
  validationMetrics: Record<string, unknown>;
}

export interface TrainedStyleModel {
  modelType: string;
  selectedModelId: ModelId;
  selectedFeature: string;
  threshold: number;
  targetSimilarityThreshold?: number;
  calibrated: boolean;
  calibration?: PlattCalibration;
  scoreDistributions?: {
    basis: string;
    target: number[];
    background: number[];
  };
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

export interface TrainPoolData {
  pools: ScorerTrainingPools;
  trainTargetWorks: Array<{ id: string; title: string; vector: number[] }>;
}

const MIN_CALIBRATION_CLASS_COUNT = 3;

export async function trainModelComparison(): Promise<TrainedStyleModel> {
  const vectors = await loadModelVectors();
  const compared = await Promise.all(EMBEDDING_MODEL_DEFINITIONS.map((model) => compareModel(vectors, model, "validation")));
  const selected = selectModel(compared);
  const dataset = datasetSummary(vectors.works, vectors.splits);
  const scoreDistributions = buildScoreDistributions(vectors, selected.id);
  const calibration = fitPlattCalibration(
    [
      ...scoreDistributions.target.map((score) => ({ score, label: true })),
      ...scoreDistributions.background.map((score) => ({ score, label: false }))
    ],
    scoreDistributions.basis
  );
  const calibrated = Boolean(
    calibration &&
    calibration.positives >= MIN_CALIBRATION_CLASS_COUNT &&
    calibration.negatives >= MIN_CALIBRATION_CLASS_COUNT
  );
  return {
    modelType: "validation-selected centroid threshold model",
    selectedModelId: selected.id,
    selectedFeature: selected.id,
    threshold: selected.threshold,
    targetSimilarityThreshold: selected.targetSimilarityThreshold,
    calibrated,
    calibration: calibrated ? calibration : undefined,
    scoreDistributions,
    modelsCompared: compared,
    dataset,
    acceptanceCriteria: {
      rocAuc: 0.9,
      balancedAccuracy: 0.85,
      recall: 0.85,
      falsePositiveRate: 0.15
    },
    limitations: limitations(dataset, calibrated)
  };
}

function selectModel(compared: ComparedModel[]): ComparedModel {
  const passing = compared.filter((model) => meetsValidationAcceptance(model.validationMetrics));
  const pool = passing.length ? passing : compared;
  return [...pool].sort(compareValidationModels)[0];
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

export function buildTrainPools(vectors: ModelVectors, modelId: string, options: { excludeWorkId?: string } = {}): TrainPoolData {
  const trainIds = new Set(vectors.splits.filter((record) => record.split === "train").map((record) => record.workId));
  const vectorMap = vectorSpaceForModel(modelId) === "raw" ? vectors.rawVectors : vectors.residualVectors;
  const trainWorks = vectors.works.filter((work) => trainIds.has(work.id) && work.id !== options.excludeWorkId && vectorMap.has(work.id));
  const trainTarget = trainWorks.filter((work) => work.set === "target");
  const trainBackground = trainWorks.filter((work) => work.set === "background");
  const trainNearMiss = trainBackground.filter((work) =>
    [SAME_TOPIC_GENERIC_NEAR_MISS_TYPE, ATTEMPTED_LOOKALIKE_TYPE].includes(String(work.metadata?.syntheticControlType))
  );
  return {
    pools: {
      target: trainTarget.map((work) => vectorMap.get(work.id) as number[]),
      background: trainBackground.map((work) => vectorMap.get(work.id) as number[]),
      nearMiss: trainNearMiss.map((work) => vectorMap.get(work.id) as number[])
    },
    trainTargetWorks: trainTarget.map((work) => ({ id: work.id, title: work.title, vector: vectorMap.get(work.id) as number[] }))
  };
}

export async function scoreSplit(vectors: ModelVectors, modelId: ModelId, split: SplitName, threshold: number, targetSimilarityThreshold?: number): Promise<StyleScore[]> {
  const splitIds = new Set(vectors.splits.filter((record) => record.split === split).map((record) => record.workId));
  const { pools, trainTargetWorks } = buildTrainPools(vectors, modelId);
  const scorer = createModelScorer(modelId, pools);
  const vectorMap = vectorSpaceForModel(modelId) === "raw" ? vectors.rawVectors : vectors.residualVectors;
  return vectors.works
    .filter((work) => splitIds.has(work.id))
    .flatMap((work) => {
      const vector = vectorMap.get(work.id);
      if (!vector) return [];
      const parts = scorer.score(vector);
      const predictedTarget = isDualGateModel(modelId)
        ? parts.score >= threshold && parts.targetSimilarity >= (targetSimilarityThreshold ?? Number.NEGATIVE_INFINITY)
        : parts.score >= threshold;
      const nearest = trainTargetWorks
        .map((target) => ({ id: target.id, title: target.title, similarity: cosine(vector, target.vector) }))
        .sort((a, b) => b.similarity - a.similarity)[0];
      return [{
        workId: work.id,
        title: work.title,
        set: work.set,
        targetSimilarity: parts.targetSimilarity,
        backgroundSimilarity: parts.backgroundSimilarity,
        nearMissSimilarity: parts.nearMissSimilarity,
        styleMargin: parts.score,
        nearestTargetNeighbor: nearest,
        overfitRisk: nearest && nearest.similarity >= 0.92 ? "high" : nearest && nearest.similarity >= 0.84 ? "moderate" : "low",
        sectionScores: {},
        predictedTarget
      }];
    });
}

function isDualGateModel(modelId: ModelId): boolean {
  return modelId === "residual_margin_dual_gate" || modelId === "residual_margin_strict_dual_gate";
}

export async function compareModel(vectors: ModelVectors, model: (typeof EMBEDDING_MODEL_DEFINITIONS)[number], split: SplitName): Promise<ComparedModel> {
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

/**
 * Honest reference distributions for the selected model: each train work is
 * scored with itself removed from the training pools (leave-one-out), then
 * validation works are scored normally. Used for candidate percentile
 * feedback and Platt calibration; the test split is never touched.
 */
function buildScoreDistributions(vectors: ModelVectors, modelId: ModelId): { basis: string; target: number[]; background: number[] } {
  const trainIds = new Set(vectors.splits.filter((record) => record.split === "train").map((record) => record.workId));
  const validationIds = new Set(vectors.splits.filter((record) => record.split === "validation").map((record) => record.workId));
  const vectorMap = vectorSpaceForModel(modelId) === "raw" ? vectors.rawVectors : vectors.residualVectors;
  const fullScorer = createModelScorer(modelId, buildTrainPools(vectors, modelId).pools);
  const target: number[] = [];
  const background: number[] = [];
  for (const work of vectors.works) {
    if (work.set !== "target" && work.set !== "background") continue;
    const vector = vectorMap.get(work.id);
    if (!vector) continue;
    let score: number | undefined;
    if (trainIds.has(work.id)) {
      const { pools } = buildTrainPools(vectors, modelId, { excludeWorkId: work.id });
      score = createModelScorer(modelId, pools).score(vector).score;
    } else if (validationIds.has(work.id)) {
      score = fullScorer.score(vector).score;
    }
    if (score === undefined) continue;
    (work.set === "target" ? target : background).push(score);
  }
  return {
    basis: "leave-one-out train scores plus validation scores; test split untouched",
    target: target.sort((a, b) => a - b),
    background: background.sort((a, b) => a - b)
  };
}

function chooseThreshold(scores: StyleScore[]): number {
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

/**
 * Validation metrics decide first; structural preference only breaks exact
 * ties. Contrast models (which score against the hardest negative cluster)
 * are preferred over plain margins because the operational goal is rejecting
 * plausible imitations, not maximizing permissive recall.
 */
function compareValidationModels(a: ComparedModel, b: ComparedModel): number {
  const metricOrder = compareMetricObjects(a.validationMetrics, b.validationMetrics);
  if (metricOrder !== 0) return metricOrder;
  const rankOrder = modelPreferenceRank(a.id) - modelPreferenceRank(b.id);
  if (rankOrder !== 0) return rankOrder;
  const aResidual = a.id.startsWith("residual") ? 0 : 1;
  const bResidual = b.id.startsWith("residual") ? 0 : 1;
  return aResidual - bResidual;
}

function modelPreferenceRank(id: ModelId): number {
  if (id === "residual_near_miss_contrast_strict") return 0;
  if (id.endsWith("centered_knn_contrast")) return 1;
  if (id.endsWith("knn_contrast")) return 2;
  if (id.includes("near_miss_contrast")) return 3;
  if (id.endsWith("znorm_margin")) return 4;
  if (id.endsWith("centered_margin")) return 5;
  if (id.includes("strict_dual_gate")) return 6;
  if (id.includes("dual_gate")) return 7;
  if (id.endsWith("margin")) return 8;
  return 9;
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

function datasetSummary(works: Work[], splits: SplitRecord[]) {
  return {
    targetCount: works.filter((work) => work.set === "target").length,
    backgroundCount: works.filter((work) => work.set === "background").length,
    candidateCount: works.filter((work) => work.set === "candidate").length,
    syntheticBackgroundCount: works.filter((work) => work.set === "background" && work.metadata?.syntheticControlType).length,
    splits: Object.fromEntries(["train", "validation", "test"].map((split) => [split, splits.filter((record) => record.split === split).length]))
  };
}

function limitations(summary: ReturnType<typeof datasetSummary>, calibrated: boolean): string[] {
  const syntheticCount = Number(summary.syntheticBackgroundCount);
  const backgroundCount = Number(summary.backgroundCount);
  return [
    calibrated
      ? "Calibration uses leave-one-out train scores plus validation scores; with a small corpus the probabilities are directional, not precise."
      : "Calibration is disabled because there are too few labelled works; reports use score/margin language, not probability.",
    syntheticCount > 0
      ? "Synthetic background controls are useful diagnostics but are not a substitute for a large human-curated negative corpus."
      : `Background corpus contains ${backgroundCount} non-synthetic works; quality still depends on whether the contrast set is genre-, era-, and topic-appropriate.`,
    "Model selection is embedding-only. Handcrafted domain traits are not used for classification."
  ];
}
