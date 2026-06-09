import type { Atom, Block, Work } from "../../core/schema.js";

const firstPerson = /\b(i|i'm|i've|i'll|me|my|mine|myself)\b/gi;
const secondPerson = /\b(you|you're|you've|you'll|your|yours|yourself)\b/gi;

export function atomFeatures(atom: Atom) {
  const words = atom.text.match(/\b[\w']+\b/g) ?? [];
  return {
    atomId: atom.id,
    workId: atom.workId,
    wordCount: words.length,
    characterCount: atom.text.length,
    questionMarkPresent: atom.text.includes("?"),
    exclamationMarkPresent: atom.text.includes("!"),
    firstPersonPronounCount: (atom.text.match(firstPerson) ?? []).length,
    secondPersonPronounCount: (atom.text.match(secondPerson) ?? []).length,
    punctuationCount: (atom.text.match(/[.,!?;:'"-]/g) ?? []).length
  };
}

export function blockFeatures(block: Block, atoms: Atom[]) {
  const blockAtoms = atoms.filter((atom) => atom.blockId === block.id);
  const lineTexts = blockAtoms.map((atom) => atom.text.toLowerCase());
  const repeatedLineCount = lineTexts.length - new Set(lineTexts).size;
  const wordCounts = blockAtoms.map((atom) => atomFeatures(atom).wordCount);
  return {
    blockId: block.id,
    workId: block.workId,
    sectionType: block.type,
    lineCount: blockAtoms.length,
    averageWordsPerLine: average(wordCounts),
    repeatedLineCount
  };
}

export function workFeatures(work: Work, blocks: Block[], atoms: Atom[]) {
  const workBlocks = blocks.filter((block) => block.workId === work.id);
  const workAtoms = atoms.filter((atom) => atom.workId === work.id);
  const wordCounts = workAtoms.map((atom) => atomFeatures(atom).wordCount);
  return {
    workId: work.id,
    lineCount: workAtoms.length,
    blockCount: workBlocks.length,
    chorusCount: workBlocks.filter((block) => block.type === "chorus").length,
    verseCount: workBlocks.filter((block) => block.type === "verse").length,
    bridgeCount: workBlocks.filter((block) => block.type === "bridge").length,
    averageWordsPerLine: average(wordCounts),
    questionMarkDensity: workAtoms.filter((atom) => atom.text.includes("?")).length / Math.max(1, workAtoms.length),
    firstPersonDensity: workAtoms.reduce((sum, atom) => sum + atomFeatures(atom).firstPersonPronounCount, 0) / Math.max(1, workAtoms.length),
    secondPersonDensity: workAtoms.reduce((sum, atom) => sum + atomFeatures(atom).secondPersonPronounCount, 0) / Math.max(1, workAtoms.length)
  };
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
