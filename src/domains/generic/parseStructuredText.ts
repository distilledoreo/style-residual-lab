import { readFile } from "node:fs/promises";
import { basename, dirname, relative } from "node:path";
import { createId } from "../../core/ids.js";
import type { Atom, Block, DatasetSet, DomainName, Work } from "../../core/schema.js";

export interface ParsedTextCorpus {
  works: Work[];
  blocks: Block[];
  atoms: Atom[];
}

const HEADER_RE = /^\s*\[([^\]]+)\]\s*$/;

export async function parseStructuredTextFile(sourcePath: string, set: DatasetSet, domain: DomainName, root = process.cwd()): Promise<ParsedTextCorpus> {
  const raw = await readFile(sourcePath, "utf8");
  const chunks = raw.split(/\n\s*----\s*\n/g).map((chunk) => chunk.trim()).filter(Boolean);
  const works: Work[] = [];
  const blocks: Block[] = [];
  const atoms: Atom[] = [];
  chunks.forEach((chunk, index) => {
    const titled = titleFromChunk(chunk, sourcePath, index);
    const sourceKey = `${relative(root, sourcePath)}#${index}:${titled.title}`;
    const work: Work = {
      id: createId("work", sourceKey),
      domain,
      set,
      title: titled.title,
      sourcePath: relative(root, sourcePath),
      text: titled.text,
      metadata: {
        chunkIndex: index,
        syntheticControlType: chunk.match(/^synthetic-control-type\s*:\s*(.+)$/im)?.[1]?.trim()
      }
    };
    const parsed = parseBlocks(work);
    works.push(work);
    blocks.push(...parsed.blocks);
    atoms.push(...parsed.atoms);
  });
  return { works, blocks, atoms };
}

function titleFromChunk(chunk: string, sourcePath: string, index: number): { title: string; text: string } {
  const lines = chunk.split(/\r?\n/);
  const metadataLineIndexes = new Set<number>();
  const titleLineIndex = lines.findIndex((line) => /^title\s*:/i.test(line.trim()));
  const syntheticTypeIndex = lines.findIndex((line) => /^synthetic-control-type\s*:/i.test(line.trim()));
  if (syntheticTypeIndex >= 0) metadataLineIndexes.add(syntheticTypeIndex);
  if (titleLineIndex >= 0) {
    metadataLineIndexes.add(titleLineIndex);
    const title = lines[titleLineIndex].replace(/^title\s*:/i, "").trim();
    return {
      title: title || `${basename(dirname(sourcePath))} ${index + 1}`,
      text: lines.filter((_, lineIndex) => !metadataLineIndexes.has(lineIndex)).join("\n").trim()
    };
  }
  const parent = basename(dirname(sourcePath));
  const file = basename(sourcePath, ".txt");
  return { title: parent === "." ? file : parent, text: chunk.trim() };
}

function parseBlocks(work: Work): { blocks: Block[]; atoms: Atom[] } {
  const lines = work.text.split(/\r?\n/);
  const hasHeaders = lines.some((line) => HEADER_RE.test(line));
  const blockDrafts: Array<{ type: string; lines: string[] }> = [];

  if (hasHeaders) {
    let current: { type: string; lines: string[] } | undefined;
    for (const line of lines) {
      const header = line.match(HEADER_RE);
      if (header) {
        if (current && current.lines.some((value) => value.trim())) blockDrafts.push(current);
        current = { type: normalizeBlockType(header[1]), lines: [] };
      } else if (current) {
        current.lines.push(line);
      } else if (line.trim()) {
        current = { type: "section", lines: [line] };
      }
    }
    if (current && current.lines.some((value) => value.trim())) blockDrafts.push(current);
  } else {
    for (const paragraph of work.text.split(/\n\s*\n/g)) {
      const blockLines = paragraph.split(/\r?\n/).filter((line) => line.trim());
      if (blockLines.length > 0) blockDrafts.push({ type: "section", lines: blockLines });
    }
  }

  const blocks: Block[] = [];
  const atoms: Atom[] = [];
  let indexInWork = 0;
  blockDrafts.forEach((draft, blockIndex) => {
    const units = draft.lines.map((line) => line.trim()).filter(Boolean);
    const blockId = createId("block", work.id, blockIndex, draft.type, units.join("\n"));
    const blockAtoms = units.map((text, indexInBlock) => ({
      id: createId("atom", blockId, indexInBlock, text),
      workId: work.id,
      blockId,
      domain: work.domain,
      indexInWork: indexInWork++,
      indexInBlock,
      text
    }));
    atoms.push(...blockAtoms);
    blocks.push({
      id: blockId,
      workId: work.id,
      domain: work.domain,
      type: draft.type,
      index: blockIndex,
      text: units.join("\n"),
      atomIds: blockAtoms.map((atom) => atom.id)
    });
  });
  return { blocks, atoms };
}

function normalizeBlockType(label: string): string {
  return label.toLowerCase().replace(/\d+/g, "").trim().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "section";
}
