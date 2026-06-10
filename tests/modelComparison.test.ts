import { describe, expect, it } from "vitest";
import { MODEL_DEFINITIONS, isSelectableModelId } from "../src/model/modelComparison.js";

describe("model comparison definitions", () => {
  it("keeps the embedding models and adds the stylometric baseline last", () => {
    expect(MODEL_DEFINITIONS.map((model) => model.id)).toEqual([
      "residual_margin",
      "residual_margin_dual_gate",
      "residual_margin_strict_dual_gate",
      "residual_near_miss_contrast",
      "residual_near_miss_contrast_strict",
      "raw_margin",
      "residual_target_similarity",
      "raw_target_similarity",
      "stylometric_cosine_delta"
    ]);
  });

  it("keeps classification model selection embedding-only", () => {
    expect(isSelectableModelId("stylometric_cosine_delta")).toBe(false);
    for (const model of MODEL_DEFINITIONS) {
      if (model.id === "stylometric_cosine_delta") continue;
      expect(isSelectableModelId(model.id)).toBe(true);
    }
  });
});
