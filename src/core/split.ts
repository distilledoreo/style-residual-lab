import type { SplitName } from "./schema.js";

export function splitForIndex(index: number, count: number): SplitName {
  if (count >= 3) {
    const testCount = Math.max(1, Math.floor(count * 0.2));
    const validationCount = Math.max(1, Math.floor(count * 0.2));
    const trainCount = count - validationCount - testCount;
    if (index < trainCount) return "train";
    if (index < trainCount + validationCount) return "validation";
    return "test";
  }
  if (count === 2) return index === 0 ? "train" : "test";
  return "train";
}
