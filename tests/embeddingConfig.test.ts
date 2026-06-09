import { afterEach, describe, expect, it } from "vitest";
import { dataPath, getEmbeddingModel, getEmbeddingProvider, getTargetCorpusRoot } from "../src/core/config.js";

const originalEnv = { ...process.env };

describe("embedding provider configuration", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults to local Transformers embeddings when no OpenAI key is present", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.EMBEDDING_PROVIDER;
    delete process.env.LOCAL_EMBEDDING_MODEL;
    expect(getEmbeddingProvider()).toBe("local");
    expect(getEmbeddingModel()).toBe("Xenova/all-MiniLM-L6-v2");
  });

  it("uses hash embeddings only when explicitly requested", async () => {
    process.env.EMBEDDING_PROVIDER = "hash";
    expect(getEmbeddingProvider()).toBe("hash");
    expect(getEmbeddingModel()).toBe("local-hash-embedding-v1");
  });

  it("supports isolated experiment data and target corpus roots", async () => {
    process.env.STYLE_LAB_DATA_ROOT = "data/experiments/example";
    process.env.STYLE_LAB_TARGET_CORPUS_ROOT = "fixtures/example-corpus";
    expect(dataPath("processed/works.jsonl")).toBe("data/experiments/example/processed/works.jsonl");
    expect(getTargetCorpusRoot()).toBe("fixtures/example-corpus");
  });
});
