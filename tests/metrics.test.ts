import { describe, expect, it } from "vitest";
import { evaluateScores } from "../src/validation/metrics.js";

describe("held-out metrics", () => {
  it("computes confusion metrics from style margins", () => {
    const metrics = evaluateScores([
      { workId: "a", title: "A", set: "target", targetSimilarity: 0.8, backgroundSimilarity: 0.2, styleMargin: 0.6, overfitRisk: "low", sectionScores: {} },
      { workId: "b", title: "B", set: "background", targetSimilarity: 0.2, backgroundSimilarity: 0.6, styleMargin: -0.4, overfitRisk: "low", sectionScores: {} }
    ]);
    expect(metrics.accuracy).toBe(1);
    expect(metrics.rocAuc).toBe(1);
  });

  it("uses explicit model predictions when a model has multiple gates", () => {
    const metrics = evaluateScores([
      { workId: "a", title: "A", set: "target", targetSimilarity: 0.8, backgroundSimilarity: 0.2, styleMargin: 0.6, predictedTarget: true, overfitRisk: "low", sectionScores: {} },
      { workId: "b", title: "B", set: "background", targetSimilarity: 0.2, backgroundSimilarity: 0.1, styleMargin: 0.4, predictedTarget: false, overfitRisk: "low", sectionScores: {} }
    ], 0, { usePredictions: true });

    expect(metrics.falsePositiveRate).toBe(0);
    expect(metrics.accuracy).toBe(1);
  });
});
