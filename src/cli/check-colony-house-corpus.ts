import { colonyHouseConfigFromEnv, readinessReport, writeReadinessReport } from "./privateModernCorpus.js";

process.env.MODERN_EXPERIMENT_ID = process.env.MODERN_EXPERIMENT_ID ?? "colony-house-vs-modern";
process.env.STYLE_LAB_DATA_ROOT = process.env.STYLE_LAB_DATA_ROOT ?? `data/private/${process.env.MODERN_EXPERIMENT_ID}`;

const report = await readinessReport(colonyHouseConfigFromEnv());
await writeReadinessReport(report);
console.log(`${report.ready ? "Ready" : "Not ready"}: ${report.targetWorks} Colony House files, ${report.backgroundWorks} modern background files.`);
for (const blocker of report.blockers) console.log(`- ${blocker}`);
