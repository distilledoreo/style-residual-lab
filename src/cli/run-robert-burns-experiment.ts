process.env.STYLE_LAB_DATA_ROOT = process.env.STYLE_LAB_DATA_ROOT ?? "data/experiments/robert-burns";
process.env.STYLE_LAB_TARGET_CORPUS_ROOT = process.env.STYLE_LAB_TARGET_CORPUS_ROOT ?? "__no_seed_target_corpus__";
process.env.EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER ?? "local";

await import("./prepare-robert-burns-corpus.js");
await import("./run-pipeline.js");

export {};
