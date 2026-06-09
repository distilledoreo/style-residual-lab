import { describe, expect, it } from "vitest";
import { buildContentBasisVectors } from "../src/residuals/contentBasis.js";
import type { EmbeddingRecord } from "../src/core/schema.js";

describe("content basis construction", () => {
  it("uses topic field vectors, a topic centroid, and the combined profile vector", () => {
    const records: EmbeddingRecord[] = [
      topic("mainTheme", [1, 0]),
      topic("emotionalSubject", [0, 1]),
      topic("combined_topic_profile", [1, 1])
    ];
    const basis = buildContentBasisVectors(records);
    expect(basis).toHaveLength(4);
    expect(basis[2][0]).toBeCloseTo(Math.SQRT1_2);
    expect(basis[2][1]).toBeCloseTo(Math.SQRT1_2);
  });
});

function topic(scope: string, vector: number[]): EmbeddingRecord {
  return {
    id: `topic_${scope}`,
    ownerType: "topic",
    ownerId: "work_1",
    scope,
    model: "test",
    textHash: scope,
    vector
  };
}
