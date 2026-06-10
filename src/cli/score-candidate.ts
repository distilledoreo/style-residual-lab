import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { extractTopicProfile, topicText } from "../llm/topicExtractor.js";
import { embedText } from "../embeddings/embeddingClient.js";
import { createId, hashText } from "../core/ids.js";
import { dataPath, paths } from "../core/config.js";
import { readJsonl } from "../core/jsonl.js";
import type { Block, EmbeddingRecord, ResidualRecord, Work } from "../core/schema.js";
import { cosine, residualize } from "../core/vector.js";
import { loadCentroids, scoreResidual } from "../scoring/styleScoring.js";
import { buildIterationGuidance } from "../scoring/revisionGuidance.js";
import { buildTrainPools, loadModelVectors, loadTrainedStyleModel } from "../model/modelComparison.js";
import { createModelScorer, vectorSpaceForModel, type DecisionScoreParts } from "../model/scoringEngine.js";
import { applyCalibration, percentileOfScore } from "../model/calibration.js";
import { buildContentBasisVectors } from "../residuals/contentBasis.js";
import { evaluateLexicalLeakage } from "../validation/lexicalLeakage.js";
import { getDomainAdapter } from "../domains/domainAdapter.js";

const cliArguments = process.argv.slice(2);
const jsonOutput = cliArguments.includes("--json");
const candidatePath = cliArguments.find((argument) => !argument.startsWith("--"));
if (!candidatePath) throw new Error("Usage: npm run score -- <candidate-work.txt> [--json]");

const existingWorks = await readJsonl<Work>(paths.works);
const adapter = getDomainAdapter(existingWorks[0]?.domain);
const parsed = await adapter.parseFile(candidatePath, "candidate");
const candidate = parsed.works[0];
candidate.domain = adapter.name;
for (const block of parsed.blocks) block.domain = adapter.name;
for (const atom of parsed.atoms) atom.domain = adapter.name;
const topic = await extractTopicProfile(candidate);
const centroids = await loadCentroids();
const trainedModel = await loadTrainedStyleModel().catch(() => undefined);
const modelHealth = await loadModelHealth();
const targetWorks = existingWorks.filter((work) => work.set === "target" && work.domain === adapter.name);
const existingResiduals = await readJsonl<ResidualRecord>(paths.residualEmbeddings);
const targetPool = existingResiduals
  .filter((record) => existingWorks.find((work) => work.id === record.workId)?.set === "target")
  .map((record) => ({ ...record, title: existingWorks.find((work) => work.id === record.workId)?.title ?? record.workId }));
const lexicalLeakage = evaluateLexicalLeakage(candidate, targetWorks);

async function emb(ownerType: EmbeddingRecord["ownerType"], ownerId: string, scope: string, text: string): Promise<EmbeddingRecord> {
  const embedded = await embedText(text);
  return { id: createId("emb", ownerType, ownerId, scope, hashText(text)), ownerType, ownerId, scope, model: embedded.model, textHash: hashText(text), vector: embedded.vector };
}

const topicEmbeddings = await Promise.all([
  emb("topic", candidate.id, "mainTheme", topic.mainTheme),
  emb("topic", candidate.id, "emotionalSubject", topic.emotionalSubject),
  emb("topic", candidate.id, "centralSituation", topic.centralSituation),
  emb("topic", candidate.id, "centralImage", topic.centralImage),
  emb("topic", candidate.id, "contentOnlySummary", topic.contentOnlySummary),
  emb("topic", candidate.id, "combined_topic_profile", topicText(topic))
]);
const residuals: ResidualRecord[] = [];
const workEmbedding = await emb("work", candidate.id, "work", `${candidate.title}\n${candidate.text}`);
residuals.push(toResidual(workEmbedding, candidate.id));
for (const block of parsed.blocks) {
  const blockEmbedding = await emb("block", block.id, "block", block.text);
  residuals.push(toResidual(blockEmbedding, block.workId, block));
}

const score = scoreResidual(candidate, residuals, centroids, targetPool);
const decision = await decisionForSelectedModel();
const referenceTargetWorks = nearestTargetWorks(3);
const presentBlockTypes = new Set(parsed.blocks.map((block) => block.type));
const warnings = [
  centroids.background.length === 0 ? "No background corpus found. Score is less reliable because there is no contrast set." : undefined,
  modelHealth && modelHealth.meetsAcceptanceCriteria === false ? "The trained model failed held-out acceptance criteria; do not treat target-style decisions as reliable." : undefined,
  modelHealth?.acceptance?.sameTopicGenericNearMissRejection === false ? "The trained model accepted same-topic generic near-miss controls, so this score may be rewarding topic proximity instead of style." : undefined,
  residualBeatsRawBaseline(modelHealth) === false ? "Residual embeddings did not beat the raw embedding baseline in the last held-out evaluation." : undefined,
  ...adapter.sectionTypes.map((sectionType) => (!presentBlockTypes.has(sectionType) ? `No ${sectionType} section found.` : undefined)),
  score.overfitRisk === "high" ? "High nearest-neighbor similarity; inspect for memorization or close imitation." : undefined,
  lexicalLeakage.passed === false ? "Lexical leakage gate failed; candidate reuses exact or distinctive source-corpus wording." : undefined
].filter(Boolean);
const overallStyleScore = Math.round(((score.styleMargin + 1) / 2) * 100);
const targetStyleDecision = trainedModel && decision ? candidateDecision(decision.parts) : undefined;
const styleMembershipProbability = trainedModel?.calibrated && trainedModel.calibration && decision
  ? applyCalibration(trainedModel.calibration, decision.parts.score)
  : undefined;
const targetScorePercentile = decision && trainedModel?.scoreDistributions
  ? percentileOfScore(trainedModel.scoreDistributions.target, decision.parts.score)
  : undefined;
const backgroundScorePercentile = decision && trainedModel?.scoreDistributions
  ? percentileOfScore(trainedModel.scoreDistributions.background, decision.parts.score)
  : undefined;
const iteration = buildIterationGuidance({
  decision: targetStyleDecision,
  decisionScore: decision?.parts.score,
  threshold: trainedModel?.threshold,
  targetSimilarity: decision?.parts.targetSimilarity ?? score.targetSimilarity,
  backgroundSimilarity: decision?.parts.backgroundSimilarity ?? score.backgroundSimilarity,
  nearMissSimilarity: decision?.parts.nearMissSimilarity,
  sectionScores: score.sectionScores,
  referenceTargetWorks,
  overfitRisk: score.overfitRisk,
  lexicalLeakage,
  styleMembershipProbability,
  targetScorePercentile,
  backgroundScorePercentile
});
const reportJson = {
  ...score,
  overallStyleScore,
  selectedModelScore: decision?.parts.score,
  selectedModelTargetSimilarity: decision?.parts.targetSimilarity,
  selectedModelBackgroundSimilarity: decision?.parts.backgroundSimilarity,
  selectedModelNearMissSimilarity: decision?.parts.nearMissSimilarity,
  styleMembershipProbability,
  probabilityBasis: styleMembershipProbability !== undefined ? trainedModel?.calibration?.basis : undefined,
  targetScorePercentile,
  backgroundScorePercentile,
  lexicalLeakage,
  targetStyleDecision,
  decisionThreshold: trainedModel?.threshold,
  decisionHeadroom: iteration.headroom,
  targetSimilarityThreshold: trainedModel?.targetSimilarityThreshold,
  selectedModelId: trainedModel?.selectedModelId,
  confidenceLevel: styleMembershipProbability !== undefined ? "calibrated (small-sample Platt scaling; directional, not precise)" : "uncalibrated",
  referenceTargetWorks,
  iteration,
  warnings
};
const stem = basename(candidatePath, ".txt");
const reportDir = dataPath("reports/candidate_scores");
await mkdir(reportDir, { recursive: true });
await writeFile(join(reportDir, `${stem}.score.json`), JSON.stringify(reportJson, null, 2), "utf8");
await writeFile(join(reportDir, `${stem}.report.md`), markdown(reportJson), "utf8");
if (jsonOutput) {
  console.log(JSON.stringify(reportJson, null, 2));
} else {
  console.log(`Wrote candidate score reports for ${candidate.title}.`);
}

function toResidual(embedding: EmbeddingRecord, workId: string, block?: Block): ResidualRecord {
  return {
    id: createId("res", embedding.id),
    ownerType: embedding.ownerType as "work" | "block",
    ownerId: embedding.ownerId,
    workId,
    scope: embedding.scope,
    blockType: block?.type,
    sourceEmbeddingId: embedding.id,
    topicEmbeddingIds: topicEmbeddings.map((item) => item.id),
    vector: residualize(embedding.vector, buildContentBasisVectors(topicEmbeddings))
  };
}

function markdown(report: typeof reportJson): string {
  const rows = Object.entries(report.sectionScores).map(([section, values]) => `| ${section} | ${values.targetSimilarity.toFixed(3)} | ${values.backgroundSimilarity.toFixed(3)} | ${values.styleMargin.toFixed(3)} |`).join("\n");
  const threshold = report.decisionThreshold;
  const exactLineRows = report.lexicalLeakage.exactLineMatches.map((match) => `| ${escapeTable(match.text)} | ${escapeTable(match.targetTitle)} | ${escapeTable(match.targetLine ?? "")} |`).join("\n");
  const rarePhraseRows = report.lexicalLeakage.rarePhraseMatches.map((match) => `| ${escapeTable(match.text)} | ${escapeTable(match.targetTitle)} | ${escapeTable(match.targetLine ?? "")} |`).join("\n");
  const referenceRows = report.referenceTargetWorks.map((work) => `- ${work.title} (similarity ${work.similarity.toFixed(3)})`).join("\n");
  return `# Candidate Style Report: ${report.title}\n\n## Summary\n\n- Overall style score: ${report.overallStyleScore}\n- Target-style decision: ${report.targetStyleDecision === undefined ? "not available" : report.targetStyleDecision ? "target-style" : "not target-style"}\n- Style membership probability: ${report.styleMembershipProbability === undefined ? "not available (uncalibrated)" : report.styleMembershipProbability.toFixed(3)}\n- Percentile vs real target works: ${report.targetScorePercentile === undefined ? "not available" : `${(report.targetScorePercentile * 100).toFixed(0)}%`}\n- Percentile vs background works: ${report.backgroundScorePercentile === undefined ? "not available" : `${(report.backgroundScorePercentile * 100).toFixed(0)}%`}\n- Selected model score: ${report.selectedModelScore === undefined ? "not available" : report.selectedModelScore.toFixed(3)}\n- Decision margin threshold: ${threshold === undefined ? "not available" : threshold.toFixed(3)}\n- Decision headroom: ${report.decisionHeadroom === undefined ? "not available" : report.decisionHeadroom.toFixed(3)}\n- Decision target similarity floor: ${report.targetSimilarityThreshold === undefined ? "not used" : report.targetSimilarityThreshold.toFixed(3)}\n- Selected model: ${report.selectedModelId ?? "not available"}\n- Target similarity: ${report.targetSimilarity.toFixed(3)}\n- Background similarity: ${report.backgroundSimilarity.toFixed(3)}\n- Style margin: ${report.styleMargin.toFixed(3)}\n- Confidence level: ${report.confidenceLevel}\n- Overfit risk: ${report.overfitRisk}\n- Nearest target work: ${report.nearestTargetNeighbor?.title ?? "none"} (${(report.nearestTargetNeighbor?.similarity ?? 0).toFixed(3)})\n- Lexical leakage gate: ${report.lexicalLeakage.passed ? "pass" : "fail"}\n- Exact source-line matches: ${report.lexicalLeakage.exactLineMatches.length} / ${report.lexicalLeakage.maxAllowedExactLineMatches}\n- Distinctive source-phrase matches: ${report.lexicalLeakage.rarePhraseMatches.length} / ${report.lexicalLeakage.maxAllowedRarePhraseMatches}\n- Longest shared source phrase: ${report.lexicalLeakage.longestSharedPhraseTokens} / ${report.lexicalLeakage.maxAllowedSharedPhraseTokens} tokens\n\n## Iteration Guidance\n\n${report.iteration.actions.map((action) => `- ${action}`).join("\n") || "- None"}\n\n### Reference Target Works\n\n${referenceRows || "- None"}\n\n## Section Scores\n\n| Section | Target Similarity | Background Similarity | Style Margin |\n|---|---:|---:|---:|\n${rows || "| Whole Work | | | |"}\n\n## Lexical Leakage\n\n### Exact Line Matches\n\n| Candidate Line | Target Work | Target Line |\n|---|---|---|\n${exactLineRows || "| None | | |"}\n\n### Distinctive Phrase Matches\n\n| Candidate Phrase | Target Work | Target Line |\n|---|---|---|\n${rarePhraseRows || "| None | | |"}\n\n## Warnings and Limitations\n\n${report.warnings.map((warning) => `- ${warning}`).join("\n") || "- None"}\n- This score measures topic-normalized style similarity, not quality, preference, release readiness, or originality.\n`;
}

function candidateDecision(parts: DecisionScoreParts): boolean {
  if (!lexicalLeakage.passed) return false;
  if (!trainedModel) return false;
  if (parts.score < trainedModel.threshold) return false;
  if (trainedModel.selectedModelId === "residual_margin_dual_gate" || trainedModel.selectedModelId === "residual_margin_strict_dual_gate") {
    return parts.targetSimilarity >= (trainedModel.targetSimilarityThreshold ?? Number.POSITIVE_INFINITY);
  }
  return true;
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function nearestTargetWorks(count: number): Array<{ title: string; similarity: number }> {
  const candidateResidual = residuals.find((record) => record.ownerType === "work" && record.scope === "work");
  if (!candidateResidual) return [];
  return targetPool
    .filter((record) => record.workId !== candidate.id && record.ownerType === "work" && record.scope === "work")
    .map((record) => ({ title: record.title, similarity: cosine(candidateResidual.vector, record.vector) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, count);
}

/**
 * Scores the candidate with the exact scorer the selected model was trained
 * with (same train pools, same vector space), so the decision matches what
 * train/evaluate would produce for this work.
 */
async function decisionForSelectedModel(): Promise<{ parts: DecisionScoreParts } | undefined> {
  if (!trainedModel) return undefined;
  const vectors = await loadModelVectors().catch(() => undefined);
  if (!vectors) return undefined;
  const { pools } = buildTrainPools(vectors, trainedModel.selectedModelId);
  if (pools.target.length === 0) return undefined;
  const scorer = createModelScorer(trainedModel.selectedModelId, pools);
  const candidateVector = vectorSpaceForModel(trainedModel.selectedModelId) === "raw"
    ? workEmbedding.vector
    : residuals.find((record) => record.ownerType === "work" && record.scope === "work")?.vector;
  if (!candidateVector) return undefined;
  return { parts: scorer.score(candidateVector) };
}

function residualBeatsRawBaseline(health: Awaited<ReturnType<typeof loadModelHealth>>): boolean | undefined {
  const fromExperiment = health?.residualExperiment?.residualBeatsRawBaseline;
  if (typeof fromExperiment === "boolean") return fromExperiment;
  const fromAcceptance = health?.acceptance?.residualBeatsRawBaseline;
  return typeof fromAcceptance === "boolean" ? fromAcceptance : undefined;
}

async function loadModelHealth(): Promise<{
  meetsAcceptanceCriteria?: boolean;
  acceptance?: Record<string, boolean | string>;
  residualExperiment?: Record<string, boolean | string>;
} | undefined> {
  try {
    return JSON.parse(await readFile(dataPath("reports/model_training/heldout_evaluation.json"), "utf8")) as {
      meetsAcceptanceCriteria?: boolean;
      acceptance?: Record<string, boolean | string>;
      residualExperiment?: Record<string, boolean | string>;
    };
  } catch {
    return undefined;
  }
}
