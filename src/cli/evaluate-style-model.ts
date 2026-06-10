import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataPath, paths } from "../core/config.js";
import { readJsonl } from "../core/jsonl.js";
import type { ResidualRecord, TopicProfile, Work } from "../core/schema.js";
import { cosine, meanVector, normalize } from "../core/vector.js";
import { evaluateScores } from "../validation/metrics.js";
import { ATTEMPTED_LOOKALIKE_TYPE, evaluateNearMissGate } from "../validation/nearMissGate.js";
import { loadModelVectors, loadTrainedStyleModel, scoreSplit, scoreSplitWithModel } from "../model/modelComparison.js";
import type { StyleScore } from "../scoring/styleScoring.js";

const model = await loadTrainedStyleModel();
const scores = await scoreSplitWithModel("test", model);
const works = await readJsonl<Work>(paths.works);
const metrics = evaluateScores(scores, model.threshold, { usePredictions: true });
const antiOverfit = await antiOverfittingDiagnostics();
const testModelComparison = await testSplitModelComparison();
const residualAssessment = residualVsRawAssessment(testModelComparison);
const nearMissGate = evaluateNearMissGate(scores, works, { threshold: model.threshold });
const lookalikeGate = evaluateNearMissGate(scores, works, { controlType: ATTEMPTED_LOOKALIKE_TYPE, threshold: model.threshold });
const acceptance = {
  rocAuc: Number(metrics.rocAuc) >= 0.9,
  balancedAccuracy: Number(metrics.balancedAccuracy) >= 0.85,
  recall: Number(metrics.recall) >= 0.85,
  falsePositiveRate: Number(metrics.falsePositiveRate) <= 0.15,
  sameTopicGenericNearMissRejection: nearMissGate.passed,
  attemptedLookalikeRejection: lookalikeGate.passed,
  calibrationError: metrics.calibrationError === null ? "not_reported" : Number(metrics.calibrationError) <= 0.1,
  residualModelSelected: model.selectedModelId.startsWith("residual"),
  residualBeatsRawBaseline: residualAssessment.residualBeatsRawBaseline
};
const meetsAcceptanceCriteria = Object.values(acceptance).every((value) => value === true || value === "not_reported");
const report = {
  selectedModel: {
    id: model.selectedModelId,
    threshold: model.threshold,
    targetSimilarityThreshold: model.targetSimilarityThreshold,
    calibrated: model.calibrated,
    modelsCompared: model.modelsCompared
  },
  testModelComparison,
  metrics,
  residualAssessment,
  nearMissGate,
  lookalikeGate,
  acceptance,
  meetsAcceptanceCriteria,
  antiOverfit,
  scores,
  highestConfidenceCorrectTargets: scores.filter((score) => score.set === "target" && score.predictedTarget).sort((a, b) => b.styleMargin - a.styleMargin).slice(0, 5),
  highestConfidenceCorrectBackground: scores.filter((score) => score.set === "background" && !score.predictedTarget).sort((a, b) => a.styleMargin - b.styleMargin).slice(0, 5),
  falsePositives: scores.filter((score) => score.set === "background" && score.predictedTarget),
  falseNegatives: scores.filter((score) => score.set === "target" && !score.predictedTarget),
  uncertainCases: scores.filter((score) => Math.abs(score.styleMargin - model.threshold) < 0.05),
  limitations: [
    scores.length < 20 ? "Held-out set is small; metrics are directional and high-confidence claims are not supported." : undefined,
    scores.filter((score) => score.set === "background").length < 10 ? "Held-out background count is small; false-positive estimates are unstable." : undefined,
    "Calibration is not enabled, so scores are margins rather than probabilities."
  ].filter(Boolean)
};
const reportDir = dataPath("reports/model_training");
await mkdir(reportDir, { recursive: true });
await writeFile(join(reportDir, "heldout_evaluation.json"), JSON.stringify(report, null, 2), "utf8");
await writeFile(
  join(reportDir, "heldout_evaluation.md"),
  `# Held-Out Evaluation\n\n- Selected model: ${model.selectedModelId}\n- Validation-selected margin threshold: ${model.threshold.toFixed(6)}\n- Validation-selected target similarity floor: ${model.targetSimilarityThreshold === undefined ? "not used" : model.targetSimilarityThreshold.toFixed(6)}\n- Meets residual experiment acceptance criteria: ${meetsAcceptanceCriteria ? "yes" : "no"}\n\n## Metrics\n\n${Object.entries(metrics).map(([key, value]) => `- ${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`).join("\n")}\n\n## Acceptance Criteria\n\n${Object.entries(acceptance).map(([key, value]) => `- ${key}: ${value}`).join("\n")}\n\n## Raw vs Residual Assessment\n\n- Best residual validation model: ${residualAssessment.bestResidualValidationModel?.id ?? "none"} (${residualAssessment.bestResidualValidationModel ? Number(residualAssessment.bestResidualValidationModel.validationMetrics.rocAuc).toFixed(3) : "n/a"} validation ROC-AUC)\n- Best raw validation model: ${residualAssessment.bestRawValidationModel?.id ?? "none"} (${residualAssessment.bestRawValidationModel ? Number(residualAssessment.bestRawValidationModel.validationMetrics.rocAuc).toFixed(3) : "n/a"} validation ROC-AUC)\n- Selected residual test ROC-AUC: ${Number(metrics.rocAuc).toFixed(3)}\n- Best raw test ROC-AUC: ${Number(residualAssessment.bestRawTestModel?.testMetrics.rocAuc ?? 0).toFixed(3)}\n- Stylometric cosine-delta baseline test ROC-AUC: ${residualAssessment.bestStylometricTestModel ? Number(residualAssessment.bestStylometricTestModel.testMetrics.rocAuc).toFixed(3) : "not available"}\n- Residual beats raw baseline on test: ${residualAssessment.residualBeatsRawBaseline}\n\n${gateMarkdown("Same-Topic Generic Near-Miss Gate", nearMissGate)}\n\n${gateMarkdown("Attempted Lookalike Gate", lookalikeGate)}\n\n## Validation Model Comparison\n\n| Model | Margin Threshold | Target Similarity Floor | Validation Balanced Accuracy | Validation ROC-AUC | Validation FPR |\n|---|---:|---:|---:|---:|---:|\n${model.modelsCompared.map((item) => `| ${item.label} | ${item.threshold.toFixed(3)} | ${item.targetSimilarityThreshold === undefined ? "n/a" : item.targetSimilarityThreshold.toFixed(3)} | ${Number(item.validationMetrics.balancedAccuracy).toFixed(3)} | ${Number(item.validationMetrics.rocAuc).toFixed(3)} | ${Number(item.validationMetrics.falsePositiveRate).toFixed(3)} |`).join("\n")}\n\n## Test Model Comparison\n\n| Model | Test Balanced Accuracy | Test ROC-AUC | Test Recall | Test FPR |\n|---|---:|---:|---:|---:|\n${testModelComparison.map((item) => `| ${item.id} | ${Number(item.testMetrics.balancedAccuracy).toFixed(3)} | ${Number(item.testMetrics.rocAuc).toFixed(3)} | ${Number(item.testMetrics.recall).toFixed(3)} | ${Number(item.testMetrics.falsePositiveRate).toFixed(3)} |`).join("\n")}\n\n## Failure Cases\n\n- False positives: ${report.falsePositives.map((score) => score.title).join(", ") || "none"}\n- False negatives: ${report.falseNegatives.map((score) => score.title).join(", ") || "none"}\n- Uncertain cases: ${report.uncertainCases.map((score) => score.title).join(", ") || "none"}\n\n## Anti-Overfitting Diagnostics\n\n- Leave-one-work-out mean similarity: ${antiOverfit.leaveOneWorkOut.meanSimilarity.toFixed(3)}\n- Leave-one-topic-out mean similarity: ${antiOverfit.leaveOneTopicOut.meanSimilarity.toFixed(3)}\n- Raw vs residual: ${antiOverfit.rawVsResidual}\n\n## ${meetsAcceptanceCriteria ? "Conclusion" : "Failure Report"}\n\n${meetsAcceptanceCriteria ? "The residual embedding model meets the configured held-out acceptance criteria, rejects same-topic generic near misses and attempted lookalikes, and beats raw embedding baselines. Continue to treat this as provisional until the corpus is larger and calibration is enabled." : failureReport(report)}\n\n## Limitations\n\n${report.limitations.map((item) => `- ${item}`).join("\n")}\n`,
  "utf8"
);
console.log(`Evaluated ${scores.length} held-out works.`);

async function antiOverfittingDiagnostics() {
  const works = await readJsonl<Work>(paths.works);
  const topics = await readJsonl<TopicProfile>(paths.topics);
  const residuals = await readJsonl<ResidualRecord>(paths.residualEmbeddings);
  const targetWorks = works.filter((work) => work.set === "target");
  const workResiduals = residuals.filter((record) => record.ownerType === "work" && record.scope === "work");
  const residualByWork = new Map(workResiduals.map((record) => [record.workId, record]));
  const leaveOneWorkOut = targetWorks.flatMap((work) => {
    const held = residualByWork.get(work.id);
    const train = targetWorks.filter((candidate) => candidate.id !== work.id).map((candidate) => residualByWork.get(candidate.id)?.vector).filter((vector): vector is number[] => Boolean(vector));
    if (!held || train.length === 0) return [];
    return [{ workId: work.id, title: work.title, similarity: cosine(held.vector, normalize(meanVector(train))) }];
  });
  const topicByWork = new Map(topics.map((topic) => [topic.workId, topic.mainTheme || "unknown"]));
  const themeGroups = new Map<string, Work[]>();
  for (const work of targetWorks) themeGroups.set(topicByWork.get(work.id) ?? "unknown", [...(themeGroups.get(topicByWork.get(work.id) ?? "unknown") ?? []), work]);
  const leaveOneTopicOut = [...themeGroups.entries()].flatMap(([theme, group]) => {
    const groupIds = new Set(group.map((work) => work.id));
    const train = targetWorks.filter((work) => !groupIds.has(work.id)).map((work) => residualByWork.get(work.id)?.vector).filter((vector): vector is number[] => Boolean(vector));
    if (train.length === 0) return [];
    const centroid = normalize(meanVector(train));
    return group.map((work) => ({ theme, workId: work.id, title: work.title, similarity: cosine(residualByWork.get(work.id)?.vector ?? [], centroid) }));
  });
  return {
    leaveOneWorkOut: summarize(leaveOneWorkOut),
    leaveOneTopicOut: summarize(leaveOneTopicOut),
    rawVsResidual: model.modelsCompared
      .map((item) => `${item.id}: validation ROC-AUC ${Number(item.validationMetrics.rocAuc).toFixed(3)}, balanced accuracy ${Number(item.validationMetrics.balancedAccuracy).toFixed(3)}`)
      .join("; ")
  };
}

function summarize(records: Array<{ similarity: number; title: string }>) {
  const sorted = [...records].sort((a, b) => a.similarity - b.similarity);
  const values = sorted.map((record) => record.similarity);
  return {
    count: records.length,
    meanSimilarity: values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length),
    medianSimilarity: values[Math.floor(values.length / 2)] ?? 0,
    lowestScoring: sorted.slice(0, 5)
  };
}

async function testSplitModelComparison() {
  const vectors = await loadModelVectors();
  return Promise.all(model.modelsCompared.map(async (item) => {
    const modelScores = await scoreSplit(vectors, item.id, "test", item.threshold, item.targetSimilarityThreshold);
    return {
      id: item.id,
      threshold: item.threshold,
      testMetrics: evaluateScores(modelScores, item.threshold, { usePredictions: true })
    };
  }));
}

function residualVsRawAssessment(testComparison: Awaited<ReturnType<typeof testSplitModelComparison>>) {
  const residualModels = model.modelsCompared.filter((item) => item.id.startsWith("residual"));
  const rawModels = model.modelsCompared.filter((item) => item.id.startsWith("raw"));
  const bestByAuc = (items: typeof model.modelsCompared) => [...items].sort((a, b) => {
    const auc = Number(b.validationMetrics.rocAuc) - Number(a.validationMetrics.rocAuc);
    if (auc !== 0) return auc;
    return Number(b.validationMetrics.balancedAccuracy) - Number(a.validationMetrics.balancedAccuracy);
  })[0];
  const bestResidualValidationModel = bestByAuc(residualModels);
  const bestRawValidationModel = bestByAuc(rawModels);
  const byTestAuc = (a: (typeof testComparison)[number], b: (typeof testComparison)[number]) => {
    const auc = Number(b.testMetrics.rocAuc) - Number(a.testMetrics.rocAuc);
    if (auc !== 0) return auc;
    return Number(b.testMetrics.balancedAccuracy) - Number(a.testMetrics.balancedAccuracy);
  };
  const bestRawTestModel = [...testComparison.filter((item) => item.id.startsWith("raw"))].sort(byTestAuc)[0];
  const bestStylometricTestModel = [...testComparison.filter((item) => item.id.startsWith("stylometric"))].sort(byTestAuc)[0];
  return {
    bestResidualValidationModel,
    bestRawValidationModel,
    bestRawTestModel,
    bestStylometricTestModel,
    residualBeatsRawBaseline: Boolean(
      model.selectedModelId.startsWith("residual") &&
      bestRawTestModel &&
      Number(metrics.rocAuc) >= Number(bestRawTestModel.testMetrics.rocAuc) &&
      Number(metrics.balancedAccuracy) >= Number(bestRawTestModel.testMetrics.balancedAccuracy) &&
      Number(metrics.falsePositiveRate) <= Number(bestRawTestModel.testMetrics.falsePositiveRate)
    )
  };
}

function failureReport(report: {
  acceptance: Record<string, boolean | string>;
  falsePositives: StyleScore[];
  falseNegatives: StyleScore[];
  metrics: Record<string, unknown>;
  residualAssessment: ReturnType<typeof residualVsRawAssessment>;
  antiOverfit: Awaited<ReturnType<typeof antiOverfittingDiagnostics>>;
  nearMissGate: typeof nearMissGate;
  lookalikeGate: typeof lookalikeGate;
}): string {
  const failed = Object.entries(report.acceptance).filter(([, value]) => value === false).map(([key]) => key);
  const residualModel = model.modelsCompared.find((item) => item.id === "residual_margin");
  const rawModel = model.modelsCompared.find((item) => item.id === "raw_margin");
  const residualHelped = Number(residualModel?.validationMetrics.rocAuc ?? 0) > Number(rawModel?.validationMetrics.rocAuc ?? 0);
  const count = Number(report.metrics.count ?? 0);
  const syntheticBackgroundCount = Number(model.dataset.syntheticBackgroundCount ?? 0);
  const backgroundCount = Number(model.dataset.backgroundCount ?? 0);
  const backgroundAssessment = syntheticBackgroundCount > 0
    ? `Background-control assessment: ${syntheticBackgroundCount} of ${backgroundCount} background works are synthetic; useful diagnostics, but not enough alone to prove real-world rejection.`
    : `Background-control assessment: ${backgroundCount} background works are non-synthetic imported corpus items; this is stronger than synthetic controls, but still depends on contrast-set genre, era, language, and topic coverage.`;
  const metricFailures = failed.filter((key) => ["rocAuc", "balancedAccuracy", "recall", "falsePositiveRate", "calibrationError"].includes(key));
  const metricStatus = metricFailures.length
    ? `Metric thresholds failed: ${metricFailures.join(", ")}. ROC-AUC ${Number(report.metrics.rocAuc).toFixed(3)} vs 0.900 target; recall ${Number(report.metrics.recall).toFixed(3)} vs 0.850 target.`
    : `Metric thresholds passed, but residual-specific acceptance did not. ROC-AUC ${Number(report.metrics.rocAuc).toFixed(3)}; recall ${Number(report.metrics.recall).toFixed(3)}.`;
  const nearMissStatus = report.nearMissGate.passed === "not_available"
    ? "Same-topic generic near-miss assessment: not available in the held-out split, so this run cannot prove topic-adjacent generic rejection."
    : `Same-topic generic near-miss assessment: ${report.nearMissGate.falsePositiveCount} of ${report.nearMissGate.count} near misses were accepted as target-style (FPR ${Number(report.nearMissGate.falsePositiveRate ?? 0).toFixed(3)} vs ${report.nearMissGate.maxFalsePositiveRate.toFixed(3)} limit).`;
  const lookalikeStatus = report.lookalikeGate.passed === "not_available"
    ? "Attempted-lookalike assessment: not available in the held-out split, so this run cannot prove lookalike rejection."
    : `Attempted-lookalike assessment: ${report.lookalikeGate.falsePositiveCount} of ${report.lookalikeGate.count} lookalikes were accepted as target-style (FPR ${Number(report.lookalikeGate.falsePositiveRate ?? 0).toFixed(3)} vs ${report.lookalikeGate.maxFalsePositiveRate.toFixed(3)} limit).`;
  return [
    `The current corpus/model does not satisfy the target metrics. Failed criteria: ${failed.join(", ") || "none"}.`,
    metricStatus,
    `Residual experiment result: selected model is ${model.selectedModelId}; selected test ROC-AUC is ${Number(report.metrics.rocAuc).toFixed(3)} and best raw test ROC-AUC is ${Number(report.residualAssessment.bestRawTestModel?.testMetrics.rocAuc ?? 0).toFixed(3)}.`,
    `Dataset size assessment: held-out evaluation has ${count} works, so conclusions are still unstable and should not be treated as high-confidence.`,
    backgroundAssessment,
    nearMissStatus,
    lookalikeStatus,
    "Topic-leakage assessment: leave-one-topic-out uses local keyword topics and has the same mean as leave-one-work-out, so it is not strong evidence that topic signal has been removed.",
    `Residualization assessment: residual margin validation ROC-AUC ${Number(residualModel?.validationMetrics.rocAuc ?? 0).toFixed(3)} vs raw margin ${Number(rawModel?.validationMetrics.rocAuc ?? 0).toFixed(3)}; residualization ${residualHelped ? "helped margin ranking on validation but did not become the selected model" : "did not improve the selected held-out model"}.`,
    `False positives: ${report.falsePositives.map((score) => score.title).join(", ") || "none"}.`,
    `False negatives: ${report.falseNegatives.map((score) => score.title).join(", ") || "none"}.`,
    "Confused examples to inspect first: false negatives plus the uncertain case list in this report.",
    "Recommended data improvements: add more human-curated same-topic wrong-style controls, add manually mutated target-style controls per target theme, increase held-out background size, improve topic extraction with production LLM output, and rerun with production embeddings before treating confidence as meaningful."
  ].map((line) => `- ${line}`).join("\n");
}

function gateMarkdown(title: string, gate: typeof nearMissGate): string {
  return `## ${title}\n\n- Control type: ${gate.controlType}\n- Test examples: ${gate.count}\n- False positives: ${gate.falsePositiveCount}\n- False-positive rate: ${gate.falsePositiveRate === null ? "not available" : gate.falsePositiveRate.toFixed(3)}\n- Maximum allowed false-positive rate: ${gate.maxFalsePositiveRate.toFixed(3)}\n- Gate passed: ${gate.passed}\n- False positives: ${gate.falsePositives.map((score) => score.title).join(", ") || "none"}`;
}
