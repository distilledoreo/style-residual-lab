import { describe, expect, it } from "vitest";
import type { Work } from "../src/core/schema.js";
import { evaluateLexicalLeakage } from "../src/validation/lexicalLeakage.js";

function work(id: string, text: string, set: Work["set"] = "target"): Work {
  return {
    id,
    domain: "lyrics",
    set,
    title: id,
    sourcePath: `${id}.txt`,
    text
  };
}

describe("evaluateLexicalLeakage", () => {
  it("fails exact source-line reuse", () => {
    const result = evaluateLexicalLeakage(
      work("candidate", "Title: Candidate\n\n[Verse]\nI kept the blue receipt\nA new unrelated line", "candidate"),
      [work("target", "[Verse]\nI kept the blue receipt\nAnother target line")]
    );

    expect(result.passed).toBe(false);
    expect(result.exactLineMatches).toEqual([
      {
        kind: "line",
        text: "I kept the blue receipt",
        targetTitle: "target",
        targetLine: "I kept the blue receipt"
      }
    ]);
  });

  it("fails distinctive short phrase reuse even when the full line changes", () => {
    const result = evaluateLexicalLeakage(
      work("candidate", "[Verse]\nI found a grayscale gallery under my bed", "candidate"),
      [work("target", "[Bridge]\nWe built a grayscale gallery for all the things we lost")]
    );

    expect(result.passed).toBe(false);
    expect(result.rarePhraseMatches.some((match) => match.text === "grayscale gallery")).toBe(true);
  });

  it("allows ordinary overlap that is too short or not distinctive", () => {
    const result = evaluateLexicalLeakage(
      work("candidate", "[Verse]\nI was alone in the room\nThen I took the long way home", "candidate"),
      [work("target", "[Verse]\nI was alone at the door\nThen you took another road")]
    );

    expect(result.passed).toBe(true);
    expect(result.exactLineMatches).toHaveLength(0);
    expect(result.rarePhraseMatches).toHaveLength(0);
  });
});
