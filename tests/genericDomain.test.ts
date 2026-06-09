import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { getDomainAdapter } from "../src/domains/domainAdapter.js";
import { parseStructuredTextFile } from "../src/domains/generic/parseStructuredText.js";

describe("generic domain adapter", () => {
  it("parses structured text into work, block, and atom records for arbitrary domains", async () => {
    const dir = await mkdtemp(join(tmpdir(), "generic-domain-"));
    const file = join(dir, "essay.txt");
    await writeFile(file, "Title: Test Essay\n\n[Introduction]\nOpening claim.\n\n[Body]\nSupporting point.\n", "utf8");

    const parsed = await parseStructuredTextFile(file, "target", "essay", dir);

    expect(parsed.works[0]).toMatchObject({ title: "Test Essay", domain: "essay", set: "target" });
    expect(parsed.blocks.map((block) => block.type)).toEqual(["introduction", "body"]);
    expect(parsed.atoms.map((atom) => atom.text)).toEqual(["Opening claim.", "Supporting point."]);
  });

  it("uses configurable generic section types", () => {
    const previous = process.env.STYLE_LAB_SECTION_TYPES;
    process.env.STYLE_LAB_SECTION_TYPES = "claim,evidence,turn";
    try {
      expect(getDomainAdapter("memo").sectionTypes).toEqual(["claim", "evidence", "turn"]);
    } finally {
      if (previous === undefined) delete process.env.STYLE_LAB_SECTION_TYPES;
      else process.env.STYLE_LAB_SECTION_TYPES = previous;
    }
  });
});
