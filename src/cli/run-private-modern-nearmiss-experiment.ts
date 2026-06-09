process.env.STYLE_LAB_INCLUDE_NEAR_MISSES = "1";
process.env.MODERN_EXPERIMENT_ID = process.env.MODERN_EXPERIMENT_ID ?? "modern-private-nearmiss";

await import("./run-private-modern-experiment.js");

export {};
