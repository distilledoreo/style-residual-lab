import { cosine } from "../core/vector.js";

export function nearestNeighbor<T extends { vector: number[] }>(vector: number[], records: T[], limit = 1): Array<T & { similarity: number }> {
  return records
    .map((record) => ({ ...record, similarity: cosine(vector, record.vector) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
