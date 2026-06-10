import { describe, expect, it } from "vitest";
import {
  buildCenteringTransform,
  createModelScorer,
  leaveOneOutCentroidStats,
  meanTopK,
  type ScorerTrainingPools
} from "../src/model/scoringEngine.js";
import { cosine, normalize } from "../src/core/vector.js";

function pools(partial: Partial<ScorerTrainingPools>): ScorerTrainingPools {
  return { target: [], background: [], nearMiss: [], ...partial };
}

describe("scoring engine", () => {
  it("computes the centroid margin like the legacy scorer", () => {
    const target = [normalize([1, 0.1, 0]), normalize([1, -0.1, 0])];
    const background = [normalize([0, 1, 0.1]), normalize([0, 1, -0.1])];
    const scorer = createModelScorer("residual_margin", pools({ target, background }));
    const parts = scorer.score(normalize([1, 0, 0]));
    expect(parts.targetSimilarity).toBeGreaterThan(0.9);
    expect(parts.backgroundSimilarity).toBeLessThan(0.2);
    expect(parts.score).toBeCloseTo(parts.targetSimilarity - parts.backgroundSimilarity, 12);
  });

  it("scores near-miss contrast against the strongest negative centroid", () => {
    const target = [normalize([1, 0, 0])];
    const background = [normalize([0, 1, 0])];
    const nearMiss = [normalize([0.8, 0.6, 0])];
    const scorer = createModelScorer("residual_near_miss_contrast", pools({ target, background, nearMiss }));
    const parts = scorer.score(normalize([0.9, 0.45, 0]));
    expect(parts.nearMissSimilarity).toBeDefined();
    expect(parts.score).toBeCloseTo(parts.targetSimilarity - Math.max(parts.backgroundSimilarity, parts.nearMissSimilarity ?? -1), 12);
  });

  it("captures multimodal target structure with k-NN that a single centroid misses", () => {
    // Two tight target clusters on opposite axes; their centroid points between them.
    const clusterA = [normalize([1, 0, 0.05]), normalize([1, 0, -0.05]), normalize([1, 0.05, 0])];
    const clusterB = [normalize([0, 1, 0.05]), normalize([0, 1, -0.05]), normalize([0, 1.05, 0])];
    const background = [normalize([0.7, 0.7, 0.1]), normalize([0.7, 0.7, -0.1])];
    const candidate = normalize([1, 0.02, 0]); // clearly inside cluster A
    const centroidScorer = createModelScorer("residual_margin", pools({ target: [...clusterA, ...clusterB], background }));
    const knnScorer = createModelScorer("residual_knn_contrast", pools({ target: [...clusterA, ...clusterB], background }));
    // The pooled centroid sits near the background direction, so the margin collapses.
    expect(centroidScorer.score(candidate).score).toBeLessThan(knnScorer.score(candidate).score);
    expect(knnScorer.score(candidate).score).toBeGreaterThan(0);
  });

  it("recovers contrast hidden by a shared anisotropic component after centering", () => {
    // Every vector shares a dominant common direction; raw cosines are all ~1.
    const common = [10, 10, 0, 0];
    const target = [normalize([common[0] + 1, common[1], 0.2, 0]), normalize([common[0] + 1, common[1], -0.2, 0])];
    const background = [normalize([common[0] - 1, common[1], 0, 0.2]), normalize([common[0] - 1, common[1], 0, -0.2])];
    const candidate = normalize([common[0] + 1, common[1], 0, 0]);
    const rawScorer = createModelScorer("raw_margin", pools({ target, background }));
    const centeredScorer = createModelScorer("raw_centered_margin", pools({ target, background }));
    expect(centeredScorer.score(candidate).score).toBeGreaterThan(rawScorer.score(candidate).score);
    expect(centeredScorer.score(candidate).score).toBeGreaterThan(0.5);
  });

  it("normalizes typicality by cluster tightness in the z-norm margin", () => {
    const tightTarget = [normalize([1, 0.01, 0]), normalize([1, -0.01, 0]), normalize([1, 0, 0.01])];
    const background = [normalize([0, 1, 0.3]), normalize([0.3, 1, -0.3]), normalize([-0.3, 1, 0])];
    const scorer = createModelScorer("residual_znorm_margin", pools({ target: tightTarget, background }));
    const inCluster = scorer.score(normalize([1, 0, 0]));
    const offCluster = scorer.score(normalize([0.7, 0.7, 0]));
    expect(inCluster.score).toBeGreaterThan(offCluster.score);
  });

  it("computes meanTopK over the k nearest pool members only", () => {
    const pool = [normalize([1, 0]), normalize([0, 1]), normalize([1, 0.1])];
    const value = meanTopK(normalize([1, 0]), pool, 2);
    const sims = pool.map((vector) => cosine(normalize([1, 0]), vector)).sort((a, b) => b - a);
    expect(value).toBeCloseTo((sims[0] + sims[1]) / 2, 12);
  });

  it("returns leave-one-out stats with a floored standard deviation", () => {
    const stats = leaveOneOutCentroidStats([normalize([1, 0]), normalize([1, 0]), normalize([1, 0])]);
    expect(stats.mean).toBeCloseTo(1, 6);
    expect(stats.std).toBeGreaterThanOrEqual(0.02);
  });

  it("keeps centering transform a no-op for empty training data", () => {
    const transform = buildCenteringTransform([]);
    expect(transform([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("handles empty pools without throwing", () => {
    const scorer = createModelScorer("residual_margin", pools({}));
    const parts = scorer.score(normalize([1, 0, 0]));
    expect(parts.targetSimilarity).toBe(0);
    expect(parts.backgroundSimilarity).toBe(0);
    expect(parts.score).toBe(0);
  });
});
