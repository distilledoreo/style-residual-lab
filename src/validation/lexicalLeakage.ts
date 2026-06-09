import type { Work } from "../core/schema.js";

export interface LexicalLeakageMatch {
  kind: "line" | "phrase";
  text: string;
  targetTitle: string;
  targetLine?: string;
}

export interface LexicalLeakageReport {
  passed: boolean;
  exactLineMatches: LexicalLeakageMatch[];
  rarePhraseMatches: LexicalLeakageMatch[];
  longestSharedPhraseTokens: number;
  maxAllowedExactLineMatches: number;
  maxAllowedRarePhraseMatches: number;
  maxAllowedSharedPhraseTokens: number;
}

export interface LexicalLeakageOptions {
  minPhraseTokens?: number;
  maxAllowedExactLineMatches?: number;
  maxAllowedRarePhraseMatches?: number;
  maxAllowedSharedPhraseTokens?: number;
}

const DEFAULT_MIN_PHRASE_TOKENS = 2;
const DEFAULT_MAX_EXACT_LINE_MATCHES = 0;
const DEFAULT_MAX_RARE_PHRASE_MATCHES = 0;
const DEFAULT_MAX_SHARED_PHRASE_TOKENS = 5;
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "i",
  "if",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "so",
  "the",
  "that",
  "this",
  "to",
  "was",
  "were",
  "have",
  "has",
  "had",
  "did",
  "does",
  "do",
  "you",
  "your"
]);

export function evaluateLexicalLeakage(candidate: Work, targetWorks: Work[], options: LexicalLeakageOptions = {}): LexicalLeakageReport {
  const minPhraseTokens = options.minPhraseTokens ?? DEFAULT_MIN_PHRASE_TOKENS;
  const maxAllowedExactLineMatches = options.maxAllowedExactLineMatches ?? DEFAULT_MAX_EXACT_LINE_MATCHES;
  const maxAllowedRarePhraseMatches = options.maxAllowedRarePhraseMatches ?? DEFAULT_MAX_RARE_PHRASE_MATCHES;
  const maxAllowedSharedPhraseTokens = options.maxAllowedSharedPhraseTokens ?? DEFAULT_MAX_SHARED_PHRASE_TOKENS;
  const targetLineIndex = buildTargetLineIndex(targetWorks);
  const candidateLines = textLines(candidate.text);
  const exactLineMatches = uniqueMatches(
    candidateLines.flatMap((line) => {
      const normalized = normalizeText(line);
      if (!normalized) return [];
      return (targetLineIndex.get(normalized) ?? []).map((target) => ({ kind: "line" as const, text: line, targetTitle: target.title, targetLine: target.line }));
    })
  );
  const phraseMatches = uniqueMatches(findRarePhraseMatches(candidate.text, targetWorks, minPhraseTokens));
  const longestSharedPhraseTokens = longestSharedContiguousTokenRun(candidate.text, targetWorks.map((work) => work.text));
  const passed =
    exactLineMatches.length <= maxAllowedExactLineMatches &&
    phraseMatches.length <= maxAllowedRarePhraseMatches &&
    longestSharedPhraseTokens <= maxAllowedSharedPhraseTokens;

  return {
    passed,
    exactLineMatches,
    rarePhraseMatches: phraseMatches,
    longestSharedPhraseTokens,
    maxAllowedExactLineMatches,
    maxAllowedRarePhraseMatches,
    maxAllowedSharedPhraseTokens
  };
}

function buildTargetLineIndex(targetWorks: Work[]): Map<string, Array<{ title: string; line: string }>> {
  const index = new Map<string, Array<{ title: string; line: string }>>();
  for (const work of targetWorks) {
    for (const line of textLines(work.text)) {
      const normalized = normalizeText(line);
      if (!normalized) continue;
      const entries = index.get(normalized) ?? [];
      entries.push({ title: work.title, line });
      index.set(normalized, entries);
    }
  }
  return index;
}

function findRarePhraseMatches(candidateText: string, targetWorks: Work[], minPhraseTokens: number): LexicalLeakageMatch[] {
  const targetPhraseIndex = new Map<string, Array<{ title: string; line: string }>>();
  for (const work of targetWorks) {
    for (const line of textLines(work.text)) {
      const tokens = tokenize(line);
      for (let size = minPhraseTokens; size <= Math.min(6, tokens.length); size++) {
        for (let index = 0; index <= tokens.length - size; index++) {
          const phraseTokens = tokens.slice(index, index + size);
          if (!isDistinctivePhrase(phraseTokens)) continue;
          const phrase = phraseTokens.join(" ");
          const entries = targetPhraseIndex.get(phrase) ?? [];
          entries.push({ title: work.title, line });
          targetPhraseIndex.set(phrase, entries);
        }
      }
    }
  }

  const matches: LexicalLeakageMatch[] = [];
  for (const line of textLines(candidateText)) {
    const tokens = tokenize(line);
    for (let size = Math.min(6, tokens.length); size >= minPhraseTokens; size--) {
      for (let index = 0; index <= tokens.length - size; index++) {
        const phraseTokens = tokens.slice(index, index + size);
        if (!isDistinctivePhrase(phraseTokens)) continue;
        const phrase = phraseTokens.join(" ");
        for (const target of targetPhraseIndex.get(phrase) ?? []) {
          matches.push({ kind: "phrase", text: phrase, targetTitle: target.title, targetLine: target.line });
        }
      }
    }
  }
  return matches;
}

function longestSharedContiguousTokenRun(candidateText: string, targetTexts: string[]): number {
  const candidateTokens = tokenize(candidateText);
  if (candidateTokens.length === 0) return 0;
  let longest = 0;
  for (const targetText of targetTexts) {
    const targetTokens = tokenize(targetText);
    const previous = new Array(targetTokens.length + 1).fill(0);
    for (let candidateIndex = 1; candidateIndex <= candidateTokens.length; candidateIndex++) {
      let diagonal = 0;
      for (let targetIndex = 1; targetIndex <= targetTokens.length; targetIndex++) {
        const saved = previous[targetIndex];
        previous[targetIndex] = candidateTokens[candidateIndex - 1] === targetTokens[targetIndex - 1] ? diagonal + 1 : 0;
        longest = Math.max(longest, previous[targetIndex]);
        diagonal = saved;
      }
    }
  }
  return longest;
}

function uniqueMatches(matches: LexicalLeakageMatch[]): LexicalLeakageMatch[] {
  const seen = new Set<string>();
  return matches.filter((match) => {
    const key = `${match.kind}\0${normalizeText(match.text)}\0${match.targetTitle}\0${normalizeText(match.targetLine ?? "")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isDistinctivePhrase(tokens: string[]): boolean {
  return tokens.filter((token) => !STOPWORDS.has(token) && token.length >= 4).length >= 2;
}

function textLines(text: string): string[] {
  return text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line && !/^\[[^\]]+\]$/.test(line));
}

function normalizeText(text: string): string {
  return tokenize(text).join(" ");
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}
