import type { StyleScore } from "../scoring/styleScoring.js";
import { cosine, meanVector } from "../core/vector.js";

export const DEFAULT_DELTA_VOCABULARY_SIZE = 150;
const EPSILON = 1e-12;

export interface DeltaModel {
  vocabulary: string[];
  means: number[];
  stds: number[];
}

export interface DeltaWork {
  id: string;
  title: string;
  text: string;
}

export interface DeltaScoredWork extends DeltaWork {
  set?: string;
}

export function tokenizeForDelta(text: string): string[] {
  return text.toLowerCase().match(/[a-z']+/g) ?? [];
}

export function relativeFrequencies(tokens: string[], vocabulary: string[]): number[] {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  const total = Math.max(1, tokens.length);
  return vocabulary.map((word) => (counts.get(word) ?? 0) / total);
}

export function buildDeltaModel(texts: string[], vocabularySize = DEFAULT_DELTA_VOCABULARY_SIZE): DeltaModel {
  const counts = new Map<string, number>();
  for (const text of texts) for (const token of tokenizeForDelta(text)) counts.set(token, (counts.get(token) ?? 0) + 1);
  const vocabulary = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, vocabularySize)
    .map(([word]) => word);
  const rows = texts.map((text) => relativeFrequencies(tokenizeForDelta(text), vocabulary));
  const means = vocabulary.map((_, index) => rows.reduce((sum, row) => sum + row[index], 0) / Math.max(1, rows.length));
  const stds = vocabulary.map((_, index) => {
    const variance = rows.reduce((sum, row) => sum + (row[index] - means[index]) ** 2, 0) / Math.max(1, rows.length);
    return Math.sqrt(variance);
  });
  return { vocabulary, means, stds };
}

export function deltaZScores(text: string, model: DeltaModel): number[] {
  const frequencies = relativeFrequencies(tokenizeForDelta(text), model.vocabulary);
  return frequencies.map((value, index) => (model.stds[index] > EPSILON ? (value - model.means[index]) / model.stds[index] : 0));
}

export function burrowsDelta(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`Delta z-vector length mismatch: ${a.length} !== ${b.length}`);
  if (a.length === 0) return 0;
  return a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0) / a.length;
}

export function cosineDeltaStyleScores(
  trainTarget: DeltaWork[],
  trainBackground: DeltaWork[],
  scored: DeltaScoredWork[],
  options: { vocabularySize?: number } = {}
): StyleScore[] {
  if (!trainTarget.length || !trainBackground.length) return [];
  const model = buildDeltaModel([...trainTarget, ...trainBackground].map((work) => work.text), options.vocabularySize);
  const zByWork = new Map<string, number[]>();
  for (const work of [...trainTarget, ...trainBackground, ...scored]) {
    if (!zByWork.has(work.id)) zByWork.set(work.id, deltaZScores(work.text, model));
  }
  const targetProfile = meanVector(trainTarget.map((work) => zByWork.get(work.id) ?? []));
  const backgroundProfile = meanVector(trainBackground.map((work) => zByWork.get(work.id) ?? []));
  return scored.map((work) => {
    const z = zByWork.get(work.id) ?? [];
    const targetSimilarity = cosine(z, targetProfile);
    const backgroundSimilarity = cosine(z, backgroundProfile);
    const nearest = trainTarget
      .filter((target) => target.id !== work.id)
      .map((target) => ({ id: target.id, title: target.title, similarity: cosine(z, zByWork.get(target.id) ?? []) }))
      .sort((a, b) => b.similarity - a.similarity)[0];
    return {
      workId: work.id,
      title: work.title,
      set: work.set,
      targetSimilarity,
      backgroundSimilarity,
      styleMargin: targetSimilarity - backgroundSimilarity,
      nearestTargetNeighbor: nearest,
      overfitRisk: nearest && nearest.similarity >= 0.92 ? "high" : nearest && nearest.similarity >= 0.84 ? "moderate" : "low",
      sectionScores: {}
    };
  });
}
