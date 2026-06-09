import type { EmbeddingRecord } from "../core/schema.js";
import { meanVector, norm, normalize } from "../core/vector.js";

export function buildContentBasisVectors(topicEmbeddings: EmbeddingRecord[]): number[][] {
  const fieldVectors = topicEmbeddings
    .filter((embedding) => embedding.scope !== "combined_topic_profile")
    .map((embedding) => embedding.vector)
    .filter((vector) => norm(vector) > 0);
  const combined = topicEmbeddings.find((embedding) => embedding.scope === "combined_topic_profile")?.vector;
  const vectors = [...fieldVectors];
  if (fieldVectors.length > 1) vectors.push(normalize(meanVector(fieldVectors)));
  if (combined && norm(combined) > 0) vectors.push(combined);
  return vectors;
}
