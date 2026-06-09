import { spawnSync } from "node:child_process";
import { privateModernConfigFromEnv, preparePrivateModernCorpus } from "./privateModernCorpus.js";

const experimentId = process.env.MODERN_EXPERIMENT_ID ?? "modern-private";
process.env.STYLE_LAB_DATA_ROOT = process.env.STYLE_LAB_DATA_ROOT ?? `data/private/${experimentId}`;
process.env.STYLE_LAB_TARGET_CORPUS_ROOT = process.env.STYLE_LAB_TARGET_CORPUS_ROOT ?? "__private_modern_prepared_raw__";
process.env.EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER ?? "local";
process.env.STYLE_LAB_SKIP_BACKGROUND_GENERATION = process.env.STYLE_LAB_SKIP_BACKGROUND_GENERATION ?? "1";

const report = await preparePrivateModernCorpus(privateModernConfigFromEnv(experimentId));
if (!report.ready) {
  console.log(`Not ready to run ${report.targetName} experiment.`);
  for (const blocker of report.blockers) console.log(`- ${blocker}`);
  process.exit(2);
}

if (process.env.STYLE_LAB_INCLUDE_NEAR_MISSES === "1") {
  await import("./generate-near-miss-corpus.js");
}

await import("./run-pipeline.js");

const candidateArg = process.argv[2];
if (candidateArg) {
  const result = spawnSync(process.execPath, ["./node_modules/tsx/dist/cli.mjs", "src/cli/score-candidate.ts", candidateArg], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

export {};
