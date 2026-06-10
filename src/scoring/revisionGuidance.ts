export interface SectionMargin {
  section: string;
  targetSimilarity: number;
  backgroundSimilarity: number;
  styleMargin: number;
}

export interface IterationGuidanceInput {
  decision?: boolean;
  decisionScore?: number;
  threshold?: number;
  targetSimilarity: number;
  backgroundSimilarity: number;
  nearMissSimilarity?: number;
  sectionScores: Record<string, { targetSimilarity: number; backgroundSimilarity: number; styleMargin: number }>;
  referenceTargetWorks: Array<{ title: string; similarity: number }>;
  overfitRisk: string;
  lexicalLeakage?: {
    passed: boolean;
    exactLineMatches: Array<{ text: string }>;
    rarePhraseMatches: Array<{ text: string }>;
  };
  styleMembershipProbability?: number;
  targetScorePercentile?: number;
  backgroundScorePercentile?: number;
}

export interface IterationGuidance {
  decision?: boolean;
  decisionScore?: number;
  threshold?: number;
  headroom?: number;
  styleMembershipProbability?: number;
  targetScorePercentile?: number;
  backgroundScorePercentile?: number;
  weakestSections: SectionMargin[];
  referenceTargetWorks: Array<{ title: string; similarity: number }>;
  actions: string[];
}

const NEAR_THRESHOLD_BAND = 0.05;

/**
 * Machine-actionable revision feedback for the generate -> score -> revise
 * loop. The actions are ordered: fix disqualifying problems (quotation,
 * memorization) first, then cluster-level drift, then the weakest sections.
 */
export function buildIterationGuidance(input: IterationGuidanceInput): IterationGuidance {
  const headroom = input.decisionScore !== undefined && input.threshold !== undefined ? input.decisionScore - input.threshold : undefined;
  const sections = Object.entries(input.sectionScores)
    .map(([section, values]) => ({ section, ...values }))
    .sort((a, b) => a.styleMargin - b.styleMargin);
  const actions: string[] = [];

  if (input.lexicalLeakage && !input.lexicalLeakage.passed) {
    const examples = [...input.lexicalLeakage.exactLineMatches, ...input.lexicalLeakage.rarePhraseMatches]
      .slice(0, 3)
      .map((match) => `"${match.text}"`)
      .join(", ");
    actions.push(
      `Remove copied source wording before any other revision: ${input.lexicalLeakage.exactLineMatches.length} exact line match(es) and ${input.lexicalLeakage.rarePhraseMatches.length} distinctive phrase match(es)${examples ? ` (${examples})` : ""}. Quotation is rejected regardless of embedding score.`
    );
  }

  if (input.overfitRisk === "high") {
    const nearest = input.referenceTargetWorks[0];
    actions.push(
      `The draft is nearly a duplicate of ${nearest ? `"${nearest.title}" (similarity ${nearest.similarity.toFixed(3)})` : "a target work"}. Vary the imagery, structure, and line shapes while keeping the voice; memorization-level similarity is not a pass.`
    );
  }

  // A decision can fail on the quotation gate alone; cluster and section
  // advice only applies when the embedding score itself is short.
  const belowThreshold = headroom !== undefined ? headroom < 0 : input.decision === false;
  if (input.decision === false && headroom !== undefined && headroom >= 0) {
    actions.push("The embedding style score already clears the threshold; the failure is the quotation/memorization gating, not the style signal.");
  }

  const failing = belowThreshold;
  if (failing && input.nearMissSimilarity !== undefined && input.nearMissSimilarity >= input.targetSimilarity) {
    actions.push(
      `The draft sits closer to the known imitation/near-miss cluster (similarity ${input.nearMissSimilarity.toFixed(3)}) than to the target corpus (${input.targetSimilarity.toFixed(3)}). Generic-AI phrasing patterns dominate; rebuild lines from the reference target works instead of polishing the current draft.`
    );
  } else if (failing && input.backgroundSimilarity >= input.targetSimilarity) {
    actions.push(
      `The draft is more similar to the background corpus (${input.backgroundSimilarity.toFixed(3)}) than to the target corpus (${input.targetSimilarity.toFixed(3)}). Study the reference target works and rewrite toward their diction, line lengths, and structural habits.`
    );
  }

  const weakSections = sections.filter((section) => section.styleMargin < 0);
  if (failing && weakSections.length > 0) {
    actions.push(
      `Revise the weakest section(s) first: ${weakSections
        .slice(0, 3)
        .map((section) => `'${section.section}' (margin ${section.styleMargin.toFixed(3)})`)
        .join(", ")}. These score closer to the negative corpora than to the target corpus.`
    );
  } else if (failing && sections.length > 1) {
    const weakest = sections[0];
    actions.push(`Section '${weakest.section}' has the lowest style margin (${weakest.styleMargin.toFixed(3)}); start revision there.`);
  }

  if (failing && headroom !== undefined && headroom > -NEAR_THRESHOLD_BAND) {
    actions.push(
      `The draft is close to passing (short of the threshold by ${Math.abs(headroom).toFixed(3)}). Targeted revision of the weakest section(s) may be enough; avoid a full rewrite.`
    );
  }

  if (input.decision === true) {
    actions.push(
      `The draft passes the style gate${headroom !== undefined ? ` with ${headroom.toFixed(3)} margin headroom` : ""}. If revising further, keep nearest-target similarity below the memorization band (0.92) and re-score after edits.`
    );
  }

  if (failing && actions.length === 0) {
    actions.push(
      "The draft fails the style gate without a single dominant cause. Compare it line-by-line against the reference target works and rebuild its diction, imagery density, and structure toward theirs."
    );
  }

  return {
    decision: input.decision,
    decisionScore: input.decisionScore,
    threshold: input.threshold,
    headroom,
    styleMembershipProbability: input.styleMembershipProbability,
    targetScorePercentile: input.targetScorePercentile,
    backgroundScorePercentile: input.backgroundScorePercentile,
    weakestSections: sections.slice(0, 3),
    referenceTargetWorks: input.referenceTargetWorks.slice(0, 3),
    actions
  };
}
