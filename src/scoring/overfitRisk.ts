export type OverfitRisk = "low" | "moderate" | "high";

export function overfitRisk(nearestTargetSimilarity: number): OverfitRisk {
  if (nearestTargetSimilarity >= 0.92) return "high";
  if (nearestTargetSimilarity >= 0.84) return "moderate";
  return "low";
}
