import { describe, expect, it } from "vitest";
import { cosine, dot, meanVector, normalize, orthonormalize, projectOntoBasis, residualize } from "../src/core/vector.js";

describe("vector math", () => {
  it("computes dot product and cosine", () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
    expect(cosine([1, 0], [0, 1])).toBe(0);
  });

  it("normalizes vectors and handles zero vectors", () => {
    expect(normalize([3, 4])).toEqual([0.6, 0.8]);
    expect(normalize([0, 0])).toEqual([0, 0]);
  });

  it("averages vectors", () => {
    expect(meanVector([[1, 2], [3, 4]])).toEqual([2, 3]);
  });

  it("orthonormalizes and projects onto a basis", () => {
    const basis = orthonormalize([[1, 0], [1, 1]]);
    expect(basis).toHaveLength(2);
    expect(projectOntoBasis([2, 3], [[1, 0]])).toEqual([2, 0]);
  });

  it("residualizes by removing content directions", () => {
    const residual = residualize([1, 1], [[1, 0]]);
    expect(residual[0]).toBeCloseTo(0);
    expect(residual[1]).toBeCloseTo(1);
  });
});
