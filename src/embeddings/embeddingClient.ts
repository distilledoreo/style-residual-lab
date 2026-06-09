import OpenAI from "openai";
import { createHash } from "node:crypto";
import { getEmbeddingModel, getEmbeddingProvider, hasOpenAiKey } from "../core/config.js";
import { normalize } from "../core/vector.js";

const DIMENSIONS = 96;
let localExtractorPromise: Promise<unknown> | undefined;

export async function embedText(text: string, model = getEmbeddingModel()): Promise<{ vector: number[]; model: string }> {
  const provider = getEmbeddingProvider();
  if (provider === "openai") {
    if (!hasOpenAiKey()) throw new Error("EMBEDDING_PROVIDER=openai requires OPENAI_API_KEY.");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.embeddings.create({ model, input: text });
    return { vector: normalize(response.data[0].embedding), model: `openai:${model}` };
  }
  if (provider === "local") return { vector: await localTransformerEmbedding(text, model), model: `local-transformers:${model}` };
  if (provider === "hash") return { vector: localHashEmbedding(text), model: "local-hash-embedding-v1" };
  throw new Error(`Unsupported embedding provider: ${provider satisfies never}`);
}

export async function localTransformerEmbedding(text: string, model = getEmbeddingModel()): Promise<number[]> {
  const extractor = await getLocalExtractor(model);
  const output = await (extractor as (input: string, options: Record<string, unknown>) => Promise<{ data: Float32Array | number[] }>)(text, {
    pooling: "mean",
    normalize: true
  });
  return Array.from(output.data);
}

async function getLocalExtractor(model: string): Promise<unknown> {
  localExtractorPromise ??= import("@xenova/transformers").then(async ({ pipeline, env }) => {
    env.allowLocalModels = true;
    env.allowRemoteModels = true;
    return pipeline("feature-extraction", model);
  });
  return localExtractorPromise;
}

export function embedTextWithHashFallbackForTests(text: string): { vector: number[]; model: string } {
  return { vector: localHashEmbedding(text), model: "local-hash-embedding-v1" };
}

export function localHashEmbedding(text: string): number[] {
  const vector = new Array(DIMENSIONS).fill(0);
  const tokens = text.toLowerCase().match(/\b[\w']+\b/g) ?? [];
  for (const token of tokens) {
    const hash = createHash("sha256").update(token).digest();
    const index = hash[0] % DIMENSIONS;
    const sign = hash[1] % 2 === 0 ? 1 : -1;
    vector[index] += sign * (1 + Math.min(token.length, 12) / 12);
  }
  for (let i = 0; i < text.length - 2; i += 1) {
    const gram = text.slice(i, i + 3).toLowerCase();
    const hash = createHash("sha1").update(gram).digest();
    vector[hash[0] % DIMENSIONS] += hash[1] % 2 === 0 ? 0.15 : -0.15;
  }
  return normalize(vector);
}
