import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { dataPath, paths } from "../core/config.js";
import { trainModelComparison } from "../model/modelComparison.js";

const summary = await trainModelComparison();
await mkdir(dirname(paths.trainedModel), { recursive: true });
await writeFile(paths.trainedModel, JSON.stringify(summary, null, 2), "utf8");
const reportDir = dataPath("reports/model_training");
await mkdir(reportDir, { recursive: true });
await writeFile(
  join(reportDir, "training_summary.md"),
  `# Training Summary\n\n- Model selected: ${summary.selectedModelId}\n- Model family: ${summary.modelType}\n- Validation-selected margin threshold: ${summary.threshold.toFixed(6)}\n- Validation-selected target similarity floor: ${summary.targetSimilarityThreshold === undefined ? "not used" : summary.targetSimilarityThreshold.toFixed(6)}\n- Calibration: ${summary.calibrated ? `enabled (Platt scaling; ${summary.calibration?.basis ?? "validation scores"})` : "not enabled; reports use style score/margin language, not probability."}\n- Reference score distributions: ${summary.scoreDistributions ? `${summary.scoreDistributions.target.length} target / ${summary.scoreDistributions.background.length} background scores (${summary.scoreDistributions.basis})` : "not available"}\n\n## Dataset\n\n\`\`\`json\n${JSON.stringify(summary.dataset, null, 2)}\n\`\`\`\n\n## Embedding Models Compared\n\n| Model | Margin Threshold | Target Similarity Floor | Balanced Accuracy | ROC-AUC | Recall | FPR |\n|---|---:|---:|---:|---:|---:|---:|\n${summary.modelsCompared.map((model) => `| ${model.label} | ${model.threshold.toFixed(3)} | ${model.targetSimilarityThreshold === undefined ? "n/a" : model.targetSimilarityThreshold.toFixed(3)} | ${Number(model.validationMetrics.balancedAccuracy).toFixed(3)} | ${Number(model.validationMetrics.rocAuc).toFixed(3)} | ${Number(model.validationMetrics.recall).toFixed(3)} | ${Number(model.validationMetrics.falsePositiveRate).toFixed(3)} |`).join("\n")}\n\n## Selection Notes\n\nOnly raw embedding and topic-normalized residual embedding models are eligible for classification; handcrafted domain traits are kept out of model selection. The best validation performer wins regardless of vector space; structural preference (contrast models over plain margins, residual over raw) only breaks exact metric ties. The dual-gate residual models additionally require a validation-selected minimum target-centroid similarity to reduce low-similarity margin false positives.\n\n## Limitations\n\n${summary.limitations.map((item) => `- ${item}`).join("\n")}\n`,
  "utf8"
);
console.log("Wrote style model summary.");
