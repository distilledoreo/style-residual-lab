import type { StyleScore } from "../scoring/styleScoring.js";

export function evaluateScores(scores: StyleScore[], threshold = 0, options: { usePredictions?: boolean } = {}): Record<string, unknown> {
  const labelled = scores.map((score) => ({
    ...score,
    actual: score.set === "target",
    predicted: options.usePredictions && typeof score.predictedTarget === "boolean" ? score.predictedTarget : score.styleMargin >= threshold
  }));
  const tp = labelled.filter((item) => item.actual && item.predicted).length;
  const tn = labelled.filter((item) => !item.actual && !item.predicted).length;
  const fp = labelled.filter((item) => !item.actual && item.predicted).length;
  const fn = labelled.filter((item) => item.actual && !item.predicted).length;
  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);
  const specificity = tn / Math.max(1, tn + fp);
  const accuracy = (tp + tn) / Math.max(1, labelled.length);
  const f1 = (2 * precision * recall) / Math.max(1e-12, precision + recall);
  return {
    count: labelled.length,
    threshold,
    accuracy,
    balancedAccuracy: (recall + specificity) / 2,
    precision,
    recall,
    f1,
    falsePositiveRate: fp / Math.max(1, fp + tn),
    rocAuc: rocAuc(labelled.map((item) => ({ score: item.styleMargin, label: item.actual }))),
    calibrationError: null,
    confusionMatrix: { tp, tn, fp, fn }
  };
}

export function rocAuc(points: Array<{ score: number; label: boolean }>): number {
  const positives = points.filter((point) => point.label);
  const negatives = points.filter((point) => !point.label);
  if (!positives.length || !negatives.length) return 0.5;
  let wins = 0;
  for (const pos of positives) for (const neg of negatives) wins += pos.score > neg.score ? 1 : pos.score === neg.score ? 0.5 : 0;
  return wins / (positives.length * negatives.length);
}
