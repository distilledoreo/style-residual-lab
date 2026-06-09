import { describe, expect, it } from "vitest";
import type { Work } from "../src/core/schema.js";
import type { StyleScore } from "../src/scoring/styleScoring.js";
import { evaluateNearMissGate, SAME_TOPIC_GENERIC_NEAR_MISS_TYPE } from "../src/validation/nearMissGate.js";

function work(id: string, syntheticControlType?: string): Work {
  return {
    id,
    domain: "lyrics",
    set: "background",
    title: id,
    sourcePath: `${id}.txt`,
    text: "test",
    metadata: { syntheticControlType }
  };
}

function score(workId: string, styleMargin: number): StyleScore {
  return {
    workId,
    title: workId,
    set: "background",
    targetSimilarity: 0,
    backgroundSimilarity: 0,
    styleMargin,
    overfitRisk: "low",
    sectionScores: {}
  };
}

describe("evaluateNearMissGate", () => {
  it("fails when same-topic generic near misses pass the selected threshold", () => {
    const result = evaluateNearMissGate(
      [score("near-1", 0.7), score("near-2", 0.2), score("other", 0.9)],
      [work("near-1", SAME_TOPIC_GENERIC_NEAR_MISS_TYPE), work("near-2", SAME_TOPIC_GENERIC_NEAR_MISS_TYPE), work("other", "generic_pop")],
      { threshold: 0.5, maxFalsePositiveRate: 0 }
    );

    expect(result.count).toBe(2);
    expect(result.falsePositiveCount).toBe(1);
    expect(result.falsePositiveRate).toBe(0.5);
    expect(result.passed).toBe(false);
    expect(result.falsePositives.map((item) => item.workId)).toEqual(["near-1"]);
  });

  it("marks the gate unavailable when the split has no near misses", () => {
    const result = evaluateNearMissGate([score("other", 0.9)], [work("other", "generic_pop")], { threshold: 0.5 });

    expect(result.count).toBe(0);
    expect(result.falsePositiveRate).toBeNull();
    expect(result.passed).toBe("not_available");
  });
});
