import { describe, expect, it } from "vitest";
import {
  buildTasks,
  centroidMarginStyleScores,
  groupByAuthor,
  runCosineDeltaTask,
  splitTask,
  summarizeTaskMetrics,
  type BenchmarkWork
} from "../src/benchmark/authorBenchmark.js";

const TOPICS = ["river", "city", "winter", "garden", "engine", "harbor", "mountain", "letter", "window", "orchard", "lantern", "railway", "meadow", "bridge"];

function topicWord(index: number, offset: number): string {
  return TOPICS[(index + offset) % TOPICS.length];
}

function ardenWork(index: number): BenchmarkWork {
  const a = topicWord(index, 0);
  const b = topicWord(index, 1);
  const c = topicWord(index, 2);
  const text = `The ${a} of the ${b} stands at the edge of the ${c} and the light of the morning falls across the ${a}. The sound of the ${b} moves through the stillness of the ${c} and the shape of the ${a} remains in the distance. The weight of the day settles over the ${b} and the colour of the ${c} deepens with the turn of the hour.`;
  return { id: `arden-${index}`, title: `Arden ${index}`, author: "arden", text };
}

function beaWork(index: number): BenchmarkWork {
  const a = topicWord(index, 0);
  const b = topicWord(index, 3);
  const text = `I saw you near the ${a} and I asked you why you keep my ${b}. Do you remember when I told you what I wanted? You said you knew me better than I knew myself. I think you did and I think you still do. Why do you look at me like the ${a} is mine to carry? I gave you my ${b} and you never gave it back.`;
  return { id: `bea-${index}`, title: `Bea ${index}`, author: "bea", text };
}

function coleWork(index: number): BenchmarkWork {
  const a = topicWord(index, 0);
  const b = topicWord(index, 5);
  const text = `We carry our ${a} together and we hold our ${b} close when we walk. Our hands stay open and our doors stay wide because we were taught to share what we are given. When we reach the ${a} we will rest and when we pass the ${b} we will sing. We are not alone and we never were.`;
  return { id: `cole-${index}`, title: `Cole ${index}`, author: "cole", text };
}

function syntheticWorks(perAuthor = 14): BenchmarkWork[] {
  const works: BenchmarkWork[] = [];
  for (let index = 0; index < perAuthor; index++) {
    works.push(ardenWork(index), beaWork(index), coleWork(index));
  }
  return works;
}

const OPTIONS = { seed: 137, minWorksPerAuthor: 12, maxAuthors: 3, maxWorksPerAuthor: 14, maxBackgroundPerTask: 28 };

describe("author benchmark", () => {
  it("builds one task per eligible author with disjoint target and background sets", () => {
    const tasks = buildTasks(syntheticWorks(), OPTIONS);
    expect(tasks.map((task) => task.author).sort()).toEqual(["arden", "bea", "cole"]);
    for (const task of tasks) {
      expect(task.targetWorks.every((work) => work.author === task.author)).toBe(true);
      expect(task.backgroundWorks.every((work) => work.author !== task.author)).toBe(true);
      expect(task.targetWorks.length).toBeLessThanOrEqual(OPTIONS.maxWorksPerAuthor);
      expect(task.backgroundWorks.length).toBeLessThanOrEqual(OPTIONS.maxBackgroundPerTask);
    }
  });

  it("is deterministic for a fixed seed", () => {
    const first = buildTasks(syntheticWorks(), OPTIONS);
    const second = buildTasks(syntheticWorks(), OPTIONS);
    expect(second).toEqual(first);
    const firstSplits = [...splitTask(first[0], OPTIONS.seed).entries()].sort();
    const secondSplits = [...splitTask(second[0], OPTIONS.seed).entries()].sort();
    expect(secondSplits).toEqual(firstSplits);
  });

  it("rejects datasets with fewer than two eligible authors", () => {
    expect(() => buildTasks(syntheticWorks().filter((work) => work.author === "arden"), OPTIONS)).toThrow();
  });

  it("assigns every task work to a split and stratifies background by author", () => {
    const tasks = buildTasks(syntheticWorks(), OPTIONS);
    for (const task of tasks) {
      const assignments = splitTask(task, OPTIONS.seed);
      const all = [...task.targetWorks, ...task.backgroundWorks];
      expect(all.every((work) => assignments.has(work.id))).toBe(true);
      for (const [, group] of groupByAuthor(task.backgroundWorks)) {
        const splits = new Set(group.map((work) => assignments.get(work.id)));
        expect(splits.has("train")).toBe(true);
        expect(splits.has("test")).toBe(true);
      }
    }
  });

  it("separates clearly distinct function-word styles on held-out works", () => {
    const tasks = buildTasks(syntheticWorks(), OPTIONS);
    const results = tasks.map((task) => runCosineDeltaTask(task, splitTask(task, OPTIONS.seed)));
    for (const result of results) {
      expect(Number(result.testMetrics.count)).toBeGreaterThan(0);
      expect(Number(result.testMetrics.rocAuc)).toBeGreaterThanOrEqual(0.9);
    }
    const summary = summarizeTaskMetrics(results);
    expect(summary.rocAuc.mean).toBeGreaterThanOrEqual(0.9);
    expect(summary.rocAuc.ci95Low).toBeLessThanOrEqual(summary.rocAuc.mean);
    expect(summary.rocAuc.ci95High).toBeGreaterThanOrEqual(summary.rocAuc.mean);
  });

  it("scores embedding margins from supplied vectors", () => {
    const trainTarget = [
      { id: "t1", title: "T1", author: "a", text: "", set: "target" as const },
      { id: "t2", title: "T2", author: "a", text: "", set: "target" as const }
    ];
    const trainBackground = [
      { id: "b1", title: "B1", author: "b", text: "", set: "background" as const },
      { id: "b2", title: "B2", author: "b", text: "", set: "background" as const }
    ];
    const scored = [
      { id: "s1", title: "S1", author: "a", text: "", set: "target" as const },
      { id: "s2", title: "S2", author: "b", text: "", set: "background" as const }
    ];
    const vectors = new Map<string, number[]>([
      ["t1", [1, 0]],
      ["t2", [0.9, 0.1]],
      ["b1", [0, 1]],
      ["b2", [0.1, 0.9]],
      ["s1", [1, 0.05]],
      ["s2", [0.05, 1]]
    ]);
    const scores = centroidMarginStyleScores(trainTarget, trainBackground, scored, vectors);
    expect(scores.find((score) => score.workId === "s1")?.styleMargin).toBeGreaterThan(0);
    expect(scores.find((score) => score.workId === "s2")?.styleMargin).toBeLessThan(0);
  });
});
