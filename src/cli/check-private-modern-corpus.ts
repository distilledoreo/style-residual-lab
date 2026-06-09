import { privateModernConfigFromEnv, readinessReport, writeReadinessReport } from "./privateModernCorpus.js";

process.env.STYLE_LAB_DATA_ROOT = process.env.STYLE_LAB_DATA_ROOT ?? `data/private/${process.env.MODERN_EXPERIMENT_ID ?? "modern-private"}`;

const report = await readinessReport(privateModernConfigFromEnv());
await writeReadinessReport(report);
console.log(`${report.ready ? "Ready" : "Not ready"}: ${report.targetWorks} target files, ${report.backgroundWorks} modern background files.`);
for (const blocker of report.blockers) console.log(`- ${blocker}`);
