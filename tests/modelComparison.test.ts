import { describe, expect, it } from "vitest";
import { EMBEDDING_MODEL_DEFINITIONS } from "../src/model/modelComparison.js";
import { scoringMethodForModel, vectorSpaceForModel } from "../src/model/scoringEngine.js";

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
      "raw_target_similarity",
      "residual_knn_contrast",
      "raw_knn_contrast",
      "residual_centered_margin",
      "raw_centered_margin",
      "residual_centered_knn_contrast",
      "raw_centered_knn_contrast",
      "residual_znorm_margin",
      "raw_znorm_margin"
    ]);
  });

  it("maps every model id to a vector space and scoring method", () => {
    for (const model of EMBEDDING_MODEL_DEFINITIONS) {
      expect(["raw", "residual"]).toContain(vectorSpaceForModel(model.id));
      expect(scoringMethodForModel(model.id)).toBeTruthy();
    }
  });

  it("routes model ids to the intended scoring methods", () => {
    expect(scoringMethodForModel("residual_margin")).toBe("centroid_margin");
    expect(scoringMethodForModel("residual_margin_dual_gate")).toBe("centroid_margin");
    expect(scoringMethodForModel("residual_near_miss_contrast")).toBe("near_miss_contrast");
    expect(scoringMethodForModel("residual_near_miss_contrast_strict")).toBe("near_miss_contrast");
    expect(scoringMethodForModel("raw_target_similarity")).toBe("centroid_target_similarity");
    expect(scoringMethodForModel("raw_knn_contrast")).toBe("knn_contrast");
    expect(scoringMethodForModel("residual_centered_margin")).toBe("centered_centroid_margin");
    expect(scoringMethodForModel("raw_centered_knn_contrast")).toBe("centered_knn_contrast");
    expect(scoringMethodForModel("residual_znorm_margin")).toBe("znorm_margin");
  });
});
