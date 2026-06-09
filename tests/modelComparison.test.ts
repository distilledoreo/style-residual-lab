import { describe, expect, it } from "vitest";
import { EMBEDDING_MODEL_DEFINITIONS } from "../src/model/modelComparison.js";

describe("embedding model comparison", () => {
  it("keeps classification model selection embedding-only", () => {
    expect(EMBEDDING_MODEL_DEFINITIONS.map((model) => model.id)).toEqual([
      "residual_margin",
      "residual_margin_dual_gate",
      "residual_margin_strict_dual_gate",
      "residual_near_miss_contrast",
      "residual_near_miss_contrast_strict",
      "raw_margin",
      "residual_target_similarity",
      "raw_target_similarity"
    ]);
  });
});
