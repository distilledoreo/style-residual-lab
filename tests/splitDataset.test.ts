import { describe, expect, it } from "vitest";
import { splitForIndex } from "../src/core/split.js";

describe("dataset splitting", () => {
  it("keeps train, validation, and test examples for four-item control groups", () => {
    const splits = [0, 1, 2, 3].map((index) => splitForIndex(index, 4));
    expect(splits).toEqual(["train", "train", "validation", "test"]);
  });
});
