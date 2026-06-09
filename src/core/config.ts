import "dotenv/config";

export function dataPath(path: string): string {
  return `${getDataRoot()}/${path}`.replace(/\\/g, "/");
}

export function getDataRoot(): string {
  return process.env.STYLE_LAB_DATA_ROOT ?? "data";
}

export function getTargetCorpusRoot(): string {
  return process.env.STYLE_LAB_TARGET_CORPUS_ROOT ?? "lyric-corpus";
}

export function getDomainName(): string {
  return process.env.STYLE_LAB_DOMAIN ?? "lyrics";
}

export const paths = {
  works: dataPath("processed/works.jsonl"),
  blocks: dataPath("processed/blocks.jsonl"),
  atoms: dataPath("processed/atoms.jsonl"),
  topics: dataPath("processed/topics.jsonl"),
  splits: dataPath("processed/splits.jsonl"),
  workEmbeddings: dataPath("embeddings/work_embeddings.jsonl"),
  blockEmbeddings: dataPath("embeddings/block_embeddings.jsonl"),
  atomEmbeddings: dataPath("embeddings/atom_embeddings.jsonl"),
  topicEmbeddings: dataPath("embeddings/topic_embeddings.jsonl"),
  residualEmbeddings: dataPath("embeddings/residual_embeddings.jsonl"),
  targetCentroids: dataPath("models/target_centroids.json"),
  backgroundCentroids: dataPath("models/background_centroids.json"),
  trainedModel: dataPath("models/style_model.json")
};

export function getSeed(): number {
  return Number(process.env.STYLE_LAB_SEED ?? 137);
}

export function getEmbeddingModel(): string {
  if (getEmbeddingProvider() === "openai") return process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
  if (getEmbeddingProvider() === "hash") return "local-hash-embedding-v1";
  return process.env.LOCAL_EMBEDDING_MODEL ?? "Xenova/all-MiniLM-L6-v2";
}

export function getEmbeddingProvider(): "openai" | "local" | "hash" {
  const configured = process.env.EMBEDDING_PROVIDER;
  if (configured === "openai" || configured === "local" || configured === "hash") return configured;
  return hasOpenAiKey() ? "openai" : "local";
}

export function hasOpenAiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}
