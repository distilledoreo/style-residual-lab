import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { privateModernConfigFromEnv, readinessReport, selectedSongwriterConfigFromEnv, type CorpusReadinessReport } from "./privateModernCorpus.js";

const auditRoot = process.env.MODERN_AUDIT_DATA_ROOT ?? "data/private/modern-experiments-audit";
process.env.STYLE_LAB_DATA_ROOT = auditRoot;

const reports = [
  await readinessReport(privateModernConfigFromEnv("modern-private")),
  await readinessReport(selectedSongwriterConfigFromEnv())
];
const allReady = reports.every((report) => report.ready);
const audit = {
  readyToRunBothExperiments: allReady,
  requiredExperiments: reports.map((report) => ({
    experimentId: report.experimentId,
    targetName: report.targetName,
    ready: report.ready,
    targetRoot: report.targetRoot,
    backgroundRoot: report.backgroundRoot,
    targetWorks: report.targetWorks,
    backgroundWorks: report.backgroundWorks,
    candidateWorks: report.candidateWorks,
    blockers: report.blockers
  })),
  nextCommands: allReady
    ? ["npm run experiment:modern-private", "npm run experiment:selected-songwriter"]
    : ["npm run check:modern-private", "npm run check:selected-songwriter"],
  notes: [
    "This audit does not print lyric text.",
    "The active goal remains incomplete until both experiments run through the full pipeline and produce held-out residual-vs-raw reports.",
    "The modern background corpus is shared by both experiments and should contain real modern songs from permitted local/licensed/API-authorized sources."
  ]
};

const reportDir = join(auditRoot, "reports", "modern_experiments");
await mkdir(reportDir, { recursive: true });
await writeFile(join(reportDir, "audit.json"), JSON.stringify(audit, null, 2), "utf8");
await writeFile(join(reportDir, "audit.md"), markdown(reports), "utf8");

console.log(allReady ? "Ready to run both modern experiments." : "Modern experiments are not ready.");
for (const report of reports) {
  console.log(`${report.experimentId}: ${report.targetWorks} target files, ${report.backgroundWorks} background files, ready=${report.ready}`);
  for (const blocker of report.blockers) console.log(`- ${blocker}`);
}

function markdown(reports: CorpusReadinessReport[]): string {
  const allReady = reports.every((report) => report.ready);
  return `# Modern Experiments Audit

- Ready to run both experiments: ${allReady ? "yes" : "no"}
- Audit root: ${auditRoot}

## Experiment Readiness

| Experiment | Target | Ready | Target Files | Background Files | Blockers |
|---|---|---:|---:|---:|---|
${reports.map((report) => `| ${report.experimentId} | ${report.targetName} | ${report.ready ? "yes" : "no"} | ${report.targetWorks}/${report.minTargetWorks} | ${report.backgroundWorks}/${report.minBackgroundWorks} | ${report.blockers.join("<br>") || "none"} |`).join("\n")}

## Next Step

${allReady ? "- Run `npm run experiment:modern-private` and `npm run experiment:selected-songwriter`." : "- Add the missing local-only lyric files, then rerun `npm run audit:modern-experiments`."}

## Notes

- This audit does not print lyric text.
- The active goal remains incomplete until both experiments run through the full pipeline and produce held-out residual-vs-raw reports.
- Use only user-supplied, licensed, public-domain, openly licensed, or API-authorized lyric files.
`;
}
