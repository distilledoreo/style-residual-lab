import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { normalizeSectionLabel, parseLyricsFile } from "../src/domains/lyrics/parseLyrics.js";

describe("lyrics parser", () => {
  it("normalizes common section labels", () => {
    expect(normalizeSectionLabel("Verse 2")).toBe("verse");
    expect(normalizeSectionLabel("Final Chorus")).toBe("chorus");
    expect(normalizeSectionLabel("BRIDGE")).toBe("bridge");
  });

  it("parses labeled lyrics with repeated choruses", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lyrics-"));
    const file = join(dir, "song.txt");
    await writeFile(file, "Title: Test Song\n\n[Verse 1]\nA line\n\n[Chorus]\nHook\n\n[Final Chorus]\nHook changed\n", "utf8");
    const parsed = await parseLyricsFile(file, "target", dir);
    expect(parsed.works[0].title).toBe("Test Song");
    expect(parsed.blocks.map((block) => block.type)).toEqual(["verse", "chorus", "chorus"]);
    expect(parsed.atoms.map((atom) => atom.text)).toEqual(["A line", "Hook", "Hook changed"]);
  });

  it("parses unlabeled lyrics by blank lines", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lyrics-"));
    const file = join(dir, "song.txt");
    await writeFile(file, "One\nTwo\n\nThree\n\n", "utf8");
    const parsed = await parseLyricsFile(file, "background", dir);
    expect(parsed.blocks).toHaveLength(2);
    expect(parsed.atoms).toHaveLength(3);
  });

  it("splits multi-song files on separators", async () => {
    const dir = await mkdtemp(join(tmpdir(), "lyrics-"));
    const file = join(dir, "album.txt");
    await writeFile(file, "Title: One\n\nA\n\n----\n\nTitle: Two\n\nB\n", "utf8");
    const parsed = await parseLyricsFile(file, "target", dir);
    expect(parsed.works.map((work) => work.title)).toEqual(["One", "Two"]);
  });
});
