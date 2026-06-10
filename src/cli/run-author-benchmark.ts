import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataPath, getEmbeddingModel, getEmbeddingProvider, getSeed } from "../core/config.js";
import { createId, hashText } from "../core/ids.js";
import { inferFormat, loadRows } from "../core/tabular.js";
import { embedText } from "../embeddings/embeddingClient.js";
import {
  buildTasks,
  runCosineDeltaTask,
  runEmbeddingMarginTask,
  splitTask,
  summarizeTaskMetrics,
  type AuthorTask,
  type BenchmarkWork,
  type TaskModelResult
} from "../benchmark/authorBenchmark.js";

const source = valueAfter("--source");
if (!source) {
  throw new Error(
    "Usage: npm run benchmark:authors -- --source <file.csv|file.json|file.jsonl> [--text-column text] [--author-column author] [--title-column title] [--min-works 12] [--max-authors 10] [--max-works-per-author 24] [--max-background 120] [--min-chars 200] [--with-embeddings]"
  );
}
const format = valueAfter("--format") ?? inferFormat(source);
const textColumn = valueAfter("--text-column") ?? "text";
const titleColumn = valueAfter("--title-column") ?? "title";
const authorColumn = valueAfter("--author-column") ?? "author";
const minWorksPerAuthor = Number(valueAfter("--min-works") ?? 12);
const maxAuthors = Number(valueAfter("--max-authors") ?? 10);
const maxWorksPerAuthor = Number(valueAfter("--max-works-per-author") ?? 24);
const maxBackgroundPerTask = Number(valueAfter("--max-background") ?? 120);
const minChars = Number(valueAfter("--min-chars") ?? 200);
const seed = Number(valueAfter("--seed") ?? getSeed());
const withEmbeddings = process.argv.includes("--with-embeddings");

const rows = await loadRows(source, format);
const seen = new Set<string>();
const works: BenchmarkWork[] = [];
for (const row of rows) {
  const author = String(row[authorColumn] ?? "").trim();
  const text = String(row[textColumn] ?? "").trim();
  if (!author || text.length < minChars) continue;
  const key = hashText(author.toLowerCase(), text);
  if (seen.has(key)) continue;
  seen.add(key);
  const title = String(row[titleColumn] ?? `Untitled ${works.length + 1}`).trim();
  works.push({ id: createId("bwork", key), title, author, text });
}

const tasks = buildTasks(works, { seed, minWorksPerAuthor, maxAuthors, maxWorksPerAuthor, maxBackgroundPerTask });
const assignmentsByAuthor = new Map(tasks.map((task) => [task.author, splitTask(task, seed)]));
const deltaResults = tasks.map((task) => runCosineDeltaTask(task, assignmentsByAuthor.get(task.author) ?? new Map()));
const deltaSummary = summarizeTaskMetrics(deltaResults);

let embeddingResults: TaskModelResult[] | undefined;
let embeddingSummary: ReturnType<typeof summarizeTaskMetrics> | undefined;
let embeddingModelLabel: string | undefined;
if (withEmbeddings) {
  const vectorByWorkId = await embedTaskWorks(tasks);
  embeddingResults = tasks.map((task) => runEmbeddingMarginTask(task, assignmentsByAuthor.get(task.author) ?? new Map(), vectorByWorkId));
  embeddingSummary = summarizeTaskMetrics(embeddingResults);
  embeddingModelLabel = `${getEmbeddingProvider()}:${getEmbeddingModel()}`;
}

const report = {
  source,
  seed,
  options: { minWorksPerAuthor, maxAuthors, maxWorksPerAuthor, maxBackgroundPerTask, minChars },
  datasetWorkCount: works.length,
  authors: tasks.map((task) => task.author),
  deltaResults,
  deltaSummary,
  embeddingModel: embeddingModelLabel,
  embeddingResults,
  embeddingSummary,
  headToHead: embeddingResults ? headToHead(deltaResults, embeddingResults) : undefined,
  notes: [
    "Each task treats one author as target and the remaining benchmark authors as background; thresholds are chosen per task on the validation split only and applied unchanged to the test split.",
    "Author identity correlates with topic, so this benchmark alone cannot prove topic-invariance; keep the same-topic near-miss and lookalike gates as a complementary check.",
    "All works are human-written dataset rows; no synthetic controls are involved.",
    `Confidence intervals are normal-approximation 95% intervals across ${tasks.length} author tasks, not within-task uncertainty.`
  ]
};

const reportDir = dataPath("reports/author_benchmark");
await mkdir(reportDir, { recursive: true });
await writeFile(join(reportDir, "author_benchmark.json"), JSON.stringify(report, null, 2), "utf8");
await writeFile(join(reportDir, "author_benchmark.md"), markdown(), "utf8");
console.log(`Benchmarked ${tasks.length} author tasks over ${works.length} works. Reports in ${reportDir}.`);

function markdown(): string {
  const summaryRow = (label: string, summary: ReturnType<typeof summarizeTaskMetrics>) =>
    `| ${label} | ${ci(summary.rocAuc)} | ${ci(summary.balancedAccuracy)} | ${ci(summary.recall)} | ${ci(summary.falsePositiveRate)} |`;
  const sections = [
    `# Multi-Author Style Benchmark`,
    ``,
    `- Source: ${source}`,
    `- Seed: ${seed}`,
    `- Works after filtering/dedupe: ${works.length}`,
    `- Author tasks: ${tasks.length} (${tasks.map((task) => task.author).join(", ")})`,
    `- Options: min ${minWorksPerAuthor} works/author, max ${maxAuthors} authors, max ${maxWorksPerAuthor} target works, max ${maxBackgroundPerTask} background works, min ${minChars} chars`,
    `- Embedding model: ${embeddingModelLabel ?? "not run (pass --with-embeddings)"}`,
    ``,
    `## Summary (mean [95% CI] across tasks)`,
    ``,
    `| Model | Test ROC-AUC | Test Balanced Accuracy | Test Recall | Test FPR |`,
    `|---|---:|---:|---:|---:|`,
    summaryRow("Cosine delta (function words)", deltaSummary),
    ...(embeddingSummary ? [summaryRow("Raw embedding centroid margin", embeddingSummary)] : []),
    ``,
    `## Cosine Delta Per Task`,
    ``,
    taskTable(deltaResults),
    ...(embeddingResults
      ? [``, `## Raw Embedding Centroid Margin Per Task`, ``, taskTable(embeddingResults), ``, `## Head To Head (test ROC-AUC)`, ``, headToHeadMarkdown(headToHead(deltaResults, embeddingResults))]
      : []),
    ``,
    `## Notes`,
    ``,
    ...report.notes.map((note) => `- ${note}`),
    ``
  ];
  return sections.join("\n");
}

function taskTable(results: TaskModelResult[]): string {
  const header = `| Author | Train Target | Train Background | Validation | Test | Threshold | Test ROC-AUC | Test Balanced Accuracy | Test Recall | Test FPR |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|`;
  const rows = results.map((result) =>
    `| ${result.author} | ${result.counts.trainTarget} | ${result.counts.trainBackground} | ${result.counts.validation} | ${result.counts.test} | ${result.threshold.toFixed(3)} | ${metric(result, "rocAuc")} | ${metric(result, "balancedAccuracy")} | ${metric(result, "recall")} | ${metric(result, "falsePositiveRate")} |`
  );
  return [header, ...rows].join("\n");
}

function metric(result: TaskModelResult, key: string): string {
  return Number(result.testMetrics[key]).toFixed(3);
}

function ci(summary: { mean: number; ci95Low: number; ci95High: number }): string {
  return `${summary.mean.toFixed(3)} [${summary.ci95Low.toFixed(3)}, ${summary.ci95High.toFixed(3)}]`;
}

function headToHead(delta: TaskModelResult[], embedding: TaskModelResult[]) {
  const byAuthor = new Map(embedding.map((result) => [result.author, result]));
  let deltaWins = 0;
  let embeddingWins = 0;
  let ties = 0;
  for (const result of delta) {
    const other = byAuthor.get(result.author);
    if (!other) continue;
    const deltaAuc = Number(result.testMetrics.rocAuc);
    const embeddingAuc = Number(other.testMetrics.rocAuc);
    if (deltaAuc > embeddingAuc) deltaWins++;
    else if (embeddingAuc > deltaAuc) embeddingWins++;
    else ties++;
  }
  return { deltaWins, embeddingWins, ties };
}

function headToHeadMarkdown(result: { deltaWins: number; embeddingWins: number; ties: number }): string {
  return `- Cosine delta wins: ${result.deltaWins}\n- Embedding wins: ${result.embeddingWins}\n- Ties: ${result.ties}`;
}

async function embedTaskWorks(allTasks: AuthorTask[]): Promise<Map<string, number[]>> {
  const unique = new Map<string, BenchmarkWork>();
  for (const task of allTasks) {
    for (const work of [...task.targetWorks, ...task.backgroundWorks]) unique.set(work.id, work);
  }
  const vectors = new Map<string, number[]>();
  let done = 0;
  for (const work of unique.values()) {
    const embedded = await embedText(`${work.title}\n${work.text}`);
    vectors.set(work.id, embedded.vector);
    done++;
    if (done % 25 === 0) console.log(`Embedded ${done}/${unique.size} works...`);
  }
  return vectors;
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
