import { cosine, meanVector, normalize, subtract } from "../core/vector.js";

export type VectorSpace = "raw" | "residual";

export type ScoringMethod =
  | "centroid_margin"
  | "centroid_target_similarity"
  | "near_miss_contrast"
  | "knn_contrast"
  | "centered_centroid_margin"
  | "centered_knn_contrast"
  | "znorm_margin";

export interface ScorerTrainingPools {
  target: number[][];
  background: number[][];
  nearMiss: number[][];
}

export interface DecisionScoreParts {
  targetSimilarity: number;
  backgroundSimilarity: number;
  nearMissSimilarity?: number;
  score: number;
}

export interface ModelScorer {
  method: ScoringMethod;
  score(vector: number[]): DecisionScoreParts;
}

const KNN_K = 3;
const MIN_Z_STD = 0.02;

export function vectorSpaceForModel(modelId: string): VectorSpace {
  return modelId.startsWith("raw") ? "raw" : "residual";
}

export function scoringMethodForModel(modelId: string): ScoringMethod {
  if (modelId.endsWith("target_similarity")) return "centroid_target_similarity";
  if (modelId.endsWith("centered_knn_contrast")) return "centered_knn_contrast";
  if (modelId.endsWith("centered_margin")) return "centered_centroid_margin";
  if (modelId.endsWith("knn_contrast")) return "knn_contrast";
  if (modelId.endsWith("znorm_margin")) return "znorm_margin";
  if (modelId.includes("near_miss_contrast")) return "near_miss_contrast";
  return "centroid_margin";
}

export function createModelScorer(modelId: string, pools: ScorerTrainingPools): ModelScorer {
  const method = scoringMethodForModel(modelId);
  if (method === "centered_centroid_margin" || method === "centered_knn_contrast") {
    const transform = buildCenteringTransform([...pools.target, ...pools.background]);
    const centered: ScorerTrainingPools = {
      target: pools.target.map(transform),
      background: pools.background.map(transform),
      nearMiss: pools.nearMiss.map(transform)
    };
    const inner = method === "centered_knn_contrast" ? knnContrastScorer(centered) : centroidMarginScorer(centered);
    return { method, score: (vector) => inner(transform(vector)) };
  }
  if (method === "knn_contrast") return { method, score: knnContrastScorer(pools) };
  if (method === "znorm_margin") return { method, score: znormMarginScorer(pools) };
  if (method === "near_miss_contrast") return { method, score: nearMissContrastScorer(pools) };
  if (method === "centroid_target_similarity") {
    const targetCentroid = centroidOf(pools.target);
    return {
      method,
      score: (vector) => {
        const targetSimilarity = safeCosine(vector, targetCentroid);
        return { targetSimilarity, backgroundSimilarity: safeCosine(vector, centroidOf(pools.background)), score: targetSimilarity };
      }
    };
  }
  return { method, score: centroidMarginScorer(pools) };
}

function centroidMarginScorer(pools: ScorerTrainingPools): (vector: number[]) => DecisionScoreParts {
  const targetCentroid = centroidOf(pools.target);
  const backgroundCentroid = centroidOf(pools.background);
  return (vector) => {
    const targetSimilarity = safeCosine(vector, targetCentroid);
    const backgroundSimilarity = safeCosine(vector, backgroundCentroid);
    return { targetSimilarity, backgroundSimilarity, score: targetSimilarity - backgroundSimilarity };
  };
}

function nearMissContrastScorer(pools: ScorerTrainingPools): (vector: number[]) => DecisionScoreParts {
  const targetCentroid = centroidOf(pools.target);
  const backgroundCentroid = centroidOf(pools.background);
  const nearMissCentroid = centroidOf(pools.nearMiss);
  return (vector) => {
    const targetSimilarity = safeCosine(vector, targetCentroid);
    const backgroundSimilarity = safeCosine(vector, backgroundCentroid);
    const nearMissSimilarity = nearMissCentroid.length ? cosine(vector, nearMissCentroid) : undefined;
    const contrast = Math.max(backgroundSimilarity, nearMissSimilarity ?? Number.NEGATIVE_INFINITY);
    return { targetSimilarity, backgroundSimilarity, nearMissSimilarity, score: targetSimilarity - contrast };
  };
}

function knnContrastScorer(pools: ScorerTrainingPools): (vector: number[]) => DecisionScoreParts {
  return (vector) => {
    const targetSimilarity = meanTopK(vector, pools.target);
    const backgroundSimilarity = meanTopK(vector, pools.background);
    const nearMissSimilarity = pools.nearMiss.length ? meanTopK(vector, pools.nearMiss) : undefined;
    const contrast = Math.max(backgroundSimilarity, nearMissSimilarity ?? Number.NEGATIVE_INFINITY);
    return { targetSimilarity, backgroundSimilarity, nearMissSimilarity, score: targetSimilarity - contrast };
  };
}

function znormMarginScorer(pools: ScorerTrainingPools): (vector: number[]) => DecisionScoreParts {
  const targetCentroid = centroidOf(pools.target);
  const backgroundCentroid = centroidOf(pools.background);
  const targetStats = leaveOneOutCentroidStats(pools.target);
  const backgroundStats = leaveOneOutCentroidStats(pools.background);
  return (vector) => {
    const targetSimilarity = safeCosine(vector, targetCentroid);
    const backgroundSimilarity = safeCosine(vector, backgroundCentroid);
    const zTarget = (targetSimilarity - targetStats.mean) / targetStats.std;
    const zBackground = backgroundCentroid.length ? (backgroundSimilarity - backgroundStats.mean) / backgroundStats.std : 0;
    return { targetSimilarity, backgroundSimilarity, score: zTarget - zBackground };
  };
}

/**
 * Removes the shared train-corpus mean direction before comparing vectors.
 * Sentence embeddings are anisotropic (all vectors share a large common
 * component), which compresses cosine similarities into a narrow band;
 * centering on the train mean restores contrast between the clusters.
 */
export function buildCenteringTransform(trainVectors: number[][]): (vector: number[]) => number[] {
  const present = trainVectors.filter((vector) => vector.length > 0);
  if (present.length === 0) return (vector) => vector;
  const mean = meanVector(present);
  return (vector) => (vector.length === mean.length ? normalize(subtract(vector, mean)) : vector);
}

export function meanTopK(vector: number[], pool: number[][], k = KNN_K): number {
  if (pool.length === 0) return 0;
  const sims = pool
    .filter((candidate) => candidate.length === vector.length)
    .map((candidate) => cosine(vector, candidate))
    .sort((a, b) => b - a)
    .slice(0, Math.max(1, Math.min(k, pool.length)));
  if (sims.length === 0) return 0;
  return sims.reduce((sum, value) => sum + value, 0) / sims.length;
}

/**
 * How similar is each pool member to the centroid of the *other* members?
 * These leave-one-out statistics describe how tight the cluster is, so a
 * candidate's centroid similarity can be read as a typicality z-score.
 */
export function leaveOneOutCentroidStats(pool: number[][]): { mean: number; std: number } {
  if (pool.length < 2) return { mean: 0, std: MIN_Z_STD };
  const sims = pool.map((vector, index) => {
    const others = pool.filter((_, otherIndex) => otherIndex !== index);
    return cosine(vector, meanVector(others));
  });
  const mean = sims.reduce((sum, value) => sum + value, 0) / sims.length;
  const variance = sims.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sims.length;
  return { mean, std: Math.max(Math.sqrt(variance), MIN_Z_STD) };
}

function centroidOf(vectors: number[][]): number[] {
  const present = vectors.filter((vector) => vector.length > 0);
  return present.length ? normalize(meanVector(present)) : [];
}

function safeCosine(vector: number[], centroid: number[]): number {
  return centroid.length === vector.length && centroid.length > 0 ? cosine(vector, centroid) : 0;
}
