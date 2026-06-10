import { describe, expect, it } from "vitest";
import { buildIterationGuidance } from "../src/scoring/revisionGuidance.js";

const baseInput = {
  targetSimilarity: 0.4,
  backgroundSimilarity: 0.2,
  sectionScores: {},
  referenceTargetWorks: [{ title: "Reference Work", similarity: 0.6 }],
  overfitRisk: "low"
};

describe("iteration guidance", () => {
  it("computes headroom from the decision score and threshold", () => {
    const guidance = buildIterationGuidance({ ...baseInput, decision: true, decisionScore: 0.12, threshold: 0.05 });
    expect(guidance.headroom).toBeCloseTo(0.07, 12);
    expect(guidance.actions.some((action) => action.includes("passes the style gate"))).toBe(true);
  });

  it("prioritizes removing copied wording when lexical leakage fails", () => {
    const guidance = buildIterationGuidance({
      ...baseInput,
      decision: false,
      decisionScore: 0.2,
      threshold: 0.05,
      lexicalLeakage: { passed: false, exactLineMatches: [{ text: "a stolen line" }], rarePhraseMatches: [] }
    });
    expect(guidance.actions[0]).toContain("Remove copied source wording");
    expect(guidance.actions[0]).toContain("a stolen line");
  });

  it("flags drafts that sit closer to the near-miss cluster than the target", () => {
    const guidance = buildIterationGuidance({
      ...baseInput,
      decision: false,
      decisionScore: -0.2,
      threshold: 0.05,
      targetSimilarity: 0.3,
      nearMissSimilarity: 0.5
    });
    expect(guidance.actions.some((action) => action.includes("imitation/near-miss cluster"))).toBe(true);
  });

  it("points at the weakest section first when sections score below zero", () => {
    const guidance = buildIterationGuidance({
      ...baseInput,
      decision: false,
      decisionScore: -0.3,
      threshold: 0.05,
      sectionScores: {
        chorus: { targetSimilarity: 0.5, backgroundSimilarity: 0.3, styleMargin: 0.2 },
        bridge: { targetSimilarity: 0.2, backgroundSimilarity: 0.4, styleMargin: -0.2 }
      }
    });
    expect(guidance.weakestSections[0].section).toBe("bridge");
    expect(guidance.actions.some((action) => action.includes("'bridge'"))).toBe(true);
  });

  it("suggests targeted revision when the draft is just short of the threshold", () => {
    const guidance = buildIterationGuidance({ ...baseInput, decision: false, decisionScore: 0.03, threshold: 0.05 });
    expect(guidance.actions.some((action) => action.includes("close to passing"))).toBe(true);
  });

  it("warns about memorization-level similarity", () => {
    const guidance = buildIterationGuidance({
      ...baseInput,
      decision: true,
      decisionScore: 0.4,
      threshold: 0.05,
      overfitRisk: "high",
      referenceTargetWorks: [{ title: "Too Close", similarity: 0.95 }]
    });
    expect(guidance.actions.some((action) => action.includes("nearly a duplicate"))).toBe(true);
  });
});
