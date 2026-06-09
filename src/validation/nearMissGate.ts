import type { Work } from "../core/schema.js";
import type { StyleScore } from "../scoring/styleScoring.js";

export const SAME_TOPIC_GENERIC_NEAR_MISS_TYPE = "same_topic_generic_ai_near_miss";
export const ATTEMPTED_LOOKALIKE_TYPE = "attempted_lookalike";

export interface NearMissGateResult {
  controlType: string;
  maxFalsePositiveRate: number;
  threshold: number;
  count: number;
  falsePositiveCount: number;
  falsePositiveRate: number | null;
  passed: boolean | "not_available";
  falsePositives: StyleScore[];
}

export function evaluateNearMissGate(
  scores: StyleScore[],
  works: Work[],
  options: {
    controlType?: string;
    threshold: number;
    maxFalsePositiveRate?: number;
  }
): NearMissGateResult {
  const controlType = options.controlType ?? SAME_TOPIC_GENERIC_NEAR_MISS_TYPE;
  const maxFalsePositiveRate = options.maxFalsePositiveRate ?? 0.15;
  const workById = new Map(works.map((work) => [work.id, work]));
  const nearMissScores = scores.filter((score) => workById.get(score.workId)?.metadata?.syntheticControlType === controlType);
  const falsePositives = nearMissScores.filter((score) => typeof score.predictedTarget === "boolean" ? score.predictedTarget : score.styleMargin >= options.threshold);
  const falsePositiveRate = nearMissScores.length > 0 ? falsePositives.length / nearMissScores.length : null;
  return {
    controlType,
    maxFalsePositiveRate,
    threshold: options.threshold,
    count: nearMissScores.length,
    falsePositiveCount: falsePositives.length,
    falsePositiveRate,
    passed: falsePositiveRate === null ? "not_available" : falsePositiveRate <= maxFalsePositiveRate,
    falsePositives
  };
}
