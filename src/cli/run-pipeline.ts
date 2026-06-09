import { spawnSync } from "node:child_process";

const steps = [
  ["generate-background-corpus", "src/cli/generate-background-corpus.ts"],
  ["import", "src/cli/import-corpus.ts"],
  ["split-dataset", "src/cli/split-dataset.ts"],
  ["topics", "src/cli/extract-topics.ts"],
  ["embed", "src/cli/embed-text.ts"],
  ["residuals", "src/cli/build-residuals.ts"],
  ["centroids", "src/cli/build-centroids.ts"],
  ["train-style-model", "src/cli/train-style-model.ts"],
  ["evaluate-style-model", "src/cli/evaluate-style-model.ts"]
];

for (const [script, file] of steps) {
  if (script === "generate-background-corpus" && process.env.STYLE_LAB_SKIP_BACKGROUND_GENERATION === "1") {
    console.log(`\n> skipping ${script} because STYLE_LAB_SKIP_BACKGROUND_GENERATION=1`);
    continue;
  }
  console.log(`\n> npm run ${script}`);
  const result = spawnSync(process.execPath, ["./node_modules/tsx/dist/cli.mjs", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
