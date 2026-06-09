import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { countLyricFiles, manifestStatus, readinessReport } from "../src/cli/privateModernCorpus.js";

const tempRoots: string[] = [];

describe("private modern corpus readiness", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("counts nested lyric text files without requiring committed corpus data", async () => {
    const root = await mkdtemp(join(tmpdir(), "style-lab-corpus-"));
    tempRoots.push(root);
    await writeFile(join(root, "direct.txt"), "Title: Direct\n\nA line", "utf8");
    await mkdir(join(root, "Nested Song"));
    await writeFile(join(root, "Nested Song", "lyrics.txt"), "Title: Nested\n\nA line", "utf8");

    expect(await countLyricFiles(root)).toBe(2);
  });

  it("reports blockers when private target or background corpora are too small", async () => {
    const targetRoot = await mkdtemp(join(tmpdir(), "style-lab-target-"));
    const backgroundRoot = await mkdtemp(join(tmpdir(), "style-lab-background-"));
    tempRoots.push(targetRoot, backgroundRoot);
    await writeFile(join(targetRoot, "one.txt"), "Title: One\n\nA line", "utf8");

    const report = await readinessReport({
      experimentId: "test",
      targetName: "Test Target",
      targetRoot,
      backgroundRoot,
      minTargetWorks: 2,
      minBackgroundWorks: 1
    });

    expect(report.ready).toBe(false);
    expect(report.targetWorks).toBe(1);
    expect(report.backgroundWorks).toBe(0);
    expect(report.blockers).toEqual([
      "Target corpus has 1 lyric files; need at least 2.",
      "Modern background corpus has 0 lyric files; need at least 1.",
      "Target corpus manifest is missing or invalid: manifest.json is missing"
    ]);
  });

  it("validates permitted corpus source manifests", async () => {
    const root = await mkdtemp(join(tmpdir(), "style-lab-manifest-"));
    tempRoots.push(root);
    await writeFile(join(root, "manifest.json"), JSON.stringify({
      sourceType: "openly_licensed",
      songs: [{ title: "Example", localPath: "example/lyrics.txt" }]
    }), "utf8");

    const status = await manifestStatus(root);

    expect(status.valid).toBe(true);
    expect(status.sourceType).toBe("openly_licensed");
    expect(status.songCount).toBe(1);
  });
});
