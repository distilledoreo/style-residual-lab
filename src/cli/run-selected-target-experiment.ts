import { spawnSync } from "node:child_process";
import { preparePrivateModernCorpus, selectedTargetConfigFromEnv } from "./privateModernCorpus.js";

process.env.MODERN_EXPERIMENT_ID = process.env.MODERN_EXPERIMENT_ID ?? "green-day-vs-modern";
process.env.STYLE_LAB_DATA_ROOT = process.env.STYLE_LAB_DATA_ROOT ?? `data/private/${process.env.MODERN_EXPERIMENT_ID}`;
process.env.STYLE_LAB_TARGET_CORPUS_ROOT = process.env.STYLE_LAB_TARGET_CORPUS_ROOT ?? "__private_modern_prepared_raw__";
process.env.EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER ?? "local";
process.env.STYLE_LAB_SKIP_BACKGROUND_GENERATION = process.env.STYLE_LAB_SKIP_BACKGROUND_GENERATION ?? "1";

const report = await preparePrivateModernCorpus(selectedTargetConfigFromEnv());
if (!report.ready) {
  console.log(`Not ready to run ${report.targetName} experiment.`);
  for (const blocker of report.blockers) console.log(`- ${blocker}`);
  process.exit(2);
}

await import("./run-pipeline.js");

const candidateArg = process.argv[2];
if (candidateArg) {
  const result = spawnSync(process.execPath, ["./node_modules/tsx/dist/cli.mjs", "src/cli/score-candidate.ts", candidateArg], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

export {};
