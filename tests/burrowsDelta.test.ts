import { describe, expect, it } from "vitest";
import {
  buildDeltaModel,
  burrowsDelta,
  cosineDeltaStyleScores,
  deltaZScores,
  tokenizeForDelta
} from "../src/stylometry/burrowsDelta.js";

const NOUNS = ["river", "city", "winter", "garden", "engine", "harbor", "mountain", "letter"];

function articleHeavy(index: number): string {
  const a = NOUNS[index % NOUNS.length];
  const b = NOUNS[(index + 1) % NOUNS.length];
  const c = NOUNS[(index + 2) % NOUNS.length];
  return `The ${a} of the ${b} stands in the ${c} and the light of the evening falls over the ${a}. The sound of the ${b} carries through the ${c} and the shape of the ${a} remains in the distance of the ${b}.`;
}

function pronounHeavy(index: number): string {
  const a = NOUNS[index % NOUNS.length];
  const b = NOUNS[(index + 3) % NOUNS.length];
  return `I told you I saw you near my ${a} and you asked me why I keep your ${b}. Do you know what I mean when I say you remind me of my ${a}? I think you do and I think you knew it before I did.`;
}

describe("burrows delta stylometry", () => {
  it("builds a frequency-ranked, capped vocabulary", () => {
    const model = buildDeltaModel(["the the the of of and", "the of and and"], 3);
    expect(model.vocabulary).toEqual(["the", "and", "of"]);
    expect(model.means).toHaveLength(3);
    expect(model.stds).toHaveLength(3);
  });

  it("produces z-scores that are mean-zero across the reference corpus", () => {
    const texts = [0, 1, 2, 3].map(articleHeavy).concat([0, 1, 2, 3].map(pronounHeavy));
    const model = buildDeltaModel(texts, 50);
    const rows = texts.map((text) => deltaZScores(text, model));
    for (let feature = 0; feature < model.vocabulary.length; feature++) {
      const mean = rows.reduce((sum, row) => sum + row[feature], 0) / rows.length;
      expect(Math.abs(mean)).toBeLessThan(1e-9);
    }
  });

  it("computes a symmetric delta distance that is zero for identical vectors", () => {
    const a = [1, -2, 0.5];
    const b = [0, 1, -1];
    expect(burrowsDelta(a, a)).toBe(0);
    expect(burrowsDelta(a, b)).toBeCloseTo(burrowsDelta(b, a));
    expect(() => burrowsDelta(a, [1, 2])).toThrow();
  });

  it("separates function-word styles with positive target margins and negative background margins", () => {
    const trainTarget = [0, 1, 2, 3, 4].map((index) => ({ id: `t${index}`, title: `Target ${index}`, text: articleHeavy(index) }));
    const trainBackground = [0, 1, 2, 3, 4].map((index) => ({ id: `b${index}`, title: `Background ${index}`, text: pronounHeavy(index) }));
    const scored = [
      { id: "heldout-target", title: "Held-out target", set: "target", text: articleHeavy(6) },
      { id: "heldout-background", title: "Held-out background", set: "background", text: pronounHeavy(6) }
    ];
    const results = cosineDeltaStyleScores(trainTarget, trainBackground, scored);
    expect(results).toHaveLength(2);
    const targetScore = results.find((score) => score.workId === "heldout-target");
    const backgroundScore = results.find((score) => score.workId === "heldout-background");
    expect(targetScore && targetScore.styleMargin).toBeGreaterThan(0);
    expect(backgroundScore && backgroundScore.styleMargin).toBeLessThan(0);
    expect(targetScore?.nearestTargetNeighbor?.id).toMatch(/^t/);
  });

  it("tokenizes with lowercase words and apostrophes only", () => {
    expect(tokenizeForDelta("Don't STOP me now, 123!")).toEqual(["don't", "stop", "me", "now"]);
  });
});
