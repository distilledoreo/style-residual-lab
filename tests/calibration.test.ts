import { describe, expect, it } from "vitest";
import { applyCalibration, fitPlattCalibration, percentileOfScore } from "../src/model/calibration.js";

describe("platt calibration", () => {
  it("fits a monotonic probability map on separable scores", () => {
    const calibration = fitPlattCalibration(
      [
        { score: 0.4, label: true },
        { score: 0.3, label: true },
        { score: 0.35, label: true },
        { score: -0.2, label: false },
        { score: -0.3, label: false },
        { score: -0.25, label: false }
      ],
      "test"
    );
    expect(calibration).toBeDefined();
    if (!calibration) return;
    const low = applyCalibration(calibration, -0.3);
    const mid = applyCalibration(calibration, 0.05);
    const high = applyCalibration(calibration, 0.4);
    expect(low).toBeGreaterThan(0);
    expect(high).toBeLessThan(1);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
    expect(high).toBeGreaterThan(0.5);
    expect(low).toBeLessThan(0.5);
  });

  it("handles noisy overlapping scores without diverging", () => {
    const calibration = fitPlattCalibration(
      [
        { score: 0.1, label: true },
        { score: -0.05, label: true },
        { score: 0.2, label: true },
        { score: 0.05, label: false },
        { score: -0.1, label: false },
        { score: 0.0, label: false }
      ],
      "test"
    );
    expect(calibration).toBeDefined();
    if (!calibration) return;
    expect(Number.isFinite(calibration.slope)).toBe(true);
    expect(Number.isFinite(calibration.intercept)).toBe(true);
    const probability = applyCalibration(calibration, 0.1);
    expect(probability).toBeGreaterThan(0);
    expect(probability).toBeLessThan(1);
  });

  it("refuses to fit with too few examples per class", () => {
    expect(fitPlattCalibration([{ score: 1, label: true }, { score: -1, label: false }], "test")).toBeUndefined();
    expect(fitPlattCalibration([], "test")).toBeUndefined();
  });
});

describe("percentile of score", () => {
  it("ranks scores against a reference distribution", () => {
    const distribution = [0.1, 0.2, 0.3, 0.4];
    expect(percentileOfScore(distribution, 0.05)).toBe(0);
    expect(percentileOfScore(distribution, 0.5)).toBe(1);
    expect(percentileOfScore(distribution, 0.25)).toBe(0.5);
    expect(percentileOfScore(distribution, 0.2)).toBeCloseTo(0.375, 12);
  });

  it("returns undefined for an empty distribution", () => {
    expect(percentileOfScore([], 0.5)).toBeUndefined();
  });
});
