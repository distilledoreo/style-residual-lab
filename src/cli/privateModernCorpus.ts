import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { dataPath } from "../core/config.js";
import { parseLyricsFile } from "../domains/lyrics/parseLyrics.js";

export interface PrivateModernExperimentConfig {
  experimentId: string;
  targetName: string;
  targetRoot: string;
  backgroundRoot: string;
  candidateRoot?: string;
  minTargetWorks: number;
  minBackgroundWorks: number;
}

export interface CorpusReadinessReport {
  experimentId: string;
  targetName: string;
  dataRoot: string;
  targetRoot: string;
  backgroundRoot: string;
  candidateRoot?: string;
  targetWorks: number;
  backgroundWorks: number;
  candidateWorks: number;
  targetManifest: CorpusManifestStatus;
  backgroundManifest: CorpusManifestStatus;
  candidateManifest?: CorpusManifestStatus;
  minTargetWorks: number;
  minBackgroundWorks: number;
  ready: boolean;
  blockers: string[];
  notes: string[];
}

export interface CorpusManifestStatus {
  path: string;
  present: boolean;
  valid: boolean;
  sourceType?: string;
  songCount?: number;
  issues: string[];
}

const allowedSourceTypes = new Set(["user_supplied", "licensed", "public_domain", "openly_licensed", "api_authorized"]);

export function privateModernConfigFromEnv(defaultExperimentId = "modern-private"): PrivateModernExperimentConfig {
  return {
    experimentId: process.env.MODERN_EXPERIMENT_ID ?? defaultExperimentId,
    targetName: process.env.MODERN_TARGET_NAME ?? "private target corpus",
    targetRoot: process.env.MODERN_TARGET_CORPUS_ROOT ?? "lyric-corpus",
    backgroundRoot: process.env.MODERN_BACKGROUND_CORPUS_ROOT ?? "private-corpus/copyrighted-lyrics/modern-background",
    candidateRoot: process.env.MODERN_CANDIDATE_CORPUS_ROOT,
    minTargetWorks: Number(process.env.MODERN_MIN_TARGET_WORKS ?? 12),
    minBackgroundWorks: Number(process.env.MODERN_MIN_BACKGROUND_WORKS ?? 50)
  };
}

export function colonyHouseConfigFromEnv(): PrivateModernExperimentConfig {
  return {
    ...privateModernConfigFromEnv("colony-house-vs-modern"),
    targetName: process.env.MODERN_TARGET_NAME ?? "Colony House",
    targetRoot: process.env.MODERN_TARGET_CORPUS_ROOT ?? "private-corpus/copyrighted-lyrics/colony-house",
    backgroundRoot: process.env.MODERN_BACKGROUND_CORPUS_ROOT ?? "private-corpus/copyrighted-lyrics/modern-background",
    minTargetWorks: Number(process.env.MODERN_MIN_TARGET_WORKS ?? 12),
    minBackgroundWorks: Number(process.env.MODERN_MIN_BACKGROUND_WORKS ?? 50)
  };
}

export function selectedSongwriterConfigFromEnv(): PrivateModernExperimentConfig {
  return {
    ...privateModernConfigFromEnv("green-day-vs-modern"),
    targetName: process.env.MODERN_TARGET_NAME ?? "Green Day",
    targetRoot: process.env.MODERN_TARGET_CORPUS_ROOT ?? "private-corpus/copyrighted-lyrics/green-day",
    backgroundRoot: process.env.MODERN_BACKGROUND_CORPUS_ROOT ?? "private-corpus/copyrighted-lyrics/modern-background",
    minTargetWorks: Number(process.env.MODERN_MIN_TARGET_WORKS ?? 12),
    minBackgroundWorks: Number(process.env.MODERN_MIN_BACKGROUND_WORKS ?? 50)
  };
}

export async function readinessReport(config: PrivateModernExperimentConfig): Promise<CorpusReadinessReport> {
  const targetWorks = await countLyricWorks(config.targetRoot);
  const backgroundWorks = await countLyricWorks(config.backgroundRoot);
  const candidateWorks = config.candidateRoot ? await countLyricWorks(config.candidateRoot) : 0;
  const targetManifest = await manifestStatus(config.targetRoot);
  const backgroundManifest = await manifestStatus(config.backgroundRoot);
  const candidateManifest = config.candidateRoot ? await manifestStatus(config.candidateRoot) : undefined;
  const blockers = [
    targetWorks < config.minTargetWorks ? `Target corpus has ${targetWorks} lyric files; need at least ${config.minTargetWorks}.` : undefined,
    backgroundWorks < config.minBackgroundWorks ? `Modern background corpus has ${backgroundWorks} lyric files; need at least ${config.minBackgroundWorks}.` : undefined,
    targetWorks > 0 && !targetManifest.valid ? `Target corpus manifest is missing or invalid: ${targetManifest.issues.join("; ")}` : undefined,
    backgroundWorks > 0 && !backgroundManifest.valid ? `Modern background corpus manifest is missing or invalid: ${backgroundManifest.issues.join("; ")}` : undefined,
    candidateWorks > 0 && candidateManifest && !candidateManifest.valid ? `Candidate corpus manifest is missing or invalid: ${candidateManifest.issues.join("; ")}` : undefined
  ].filter((item): item is string => Boolean(item));
  return {
    experimentId: config.experimentId,
    targetName: config.targetName,
    dataRoot: dataPath(""),
    targetRoot: config.targetRoot,
    backgroundRoot: config.backgroundRoot,
    candidateRoot: config.candidateRoot,
    targetWorks,
    backgroundWorks,
    candidateWorks,
    targetManifest,
    backgroundManifest,
    candidateManifest,
    minTargetWorks: config.minTargetWorks,
    minBackgroundWorks: config.minBackgroundWorks,
    ready: blockers.length === 0,
    blockers,
    notes: [
      "Use only local user-supplied, licensed, public-domain, openly licensed, or API-authorized lyric files.",
      "This readiness report intentionally records counts and paths only, not lyric text.",
      "Private data roots should stay under data/private/ or data/experiments/private-* so copied raw lyrics remain ignored by Git."
    ]
  };
}

export async function writeReadinessReport(report: CorpusReadinessReport): Promise<void> {
  const reportDir = dataPath("reports/corpus_readiness");
  await mkdir(reportDir, { recursive: true });
  await writeFile(join(reportDir, `${report.experimentId}.json`), JSON.stringify(report, null, 2), "utf8");
  await writeFile(join(reportDir, `${report.experimentId}.md`), markdown(report), "utf8");
}

export async function preparePrivateModernCorpus(config: PrivateModernExperimentConfig): Promise<CorpusReadinessReport> {
  const report = await readinessReport(config);
  await writeReadinessReport(report);
  if (!report.ready) return report;

  await rm(dataPath("raw"), { recursive: true, force: true });
  await copyCorpus(config.targetRoot, dataPath("raw/target/lyrics"));
  await copyCorpus(config.backgroundRoot, dataPath("raw/background/lyrics"));
  if (config.candidateRoot) await copyCorpus(config.candidateRoot, dataPath("raw/candidates/lyrics"));
  return report;
}

export async function countLyricFiles(root: string): Promise<number> {
  const files = await lyricFiles(root);
  return files.length;
}

export async function countLyricWorks(root: string): Promise<number> {
  const files = await lyricFiles(root);
  const counts = await Promise.all(files.map(async (file) => {
    try {
      return (await parseLyricsFile(file, "target")).works.length;
    } catch {
      return 1;
    }
  }));
  return counts.reduce((sum, count) => sum + count, 0);
}

export async function manifestStatus(root: string): Promise<CorpusManifestStatus> {
  const path = join(root, "manifest.json");
  const exists = await stat(path).then((info) => info.isFile()).catch(() => false);
  if (!exists && root.replace(/\\/g, "/") === "lyric-corpus") {
    return { path, present: false, valid: true, sourceType: "user_supplied", issues: ["implicit local user-supplied corpus"] };
  }
  if (!exists) return { path, present: false, valid: false, issues: ["manifest.json is missing"] };
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as { sourceType?: string; songs?: unknown[] };
    const issues = [
      !parsed.sourceType ? "sourceType is missing" : undefined,
      parsed.sourceType && !allowedSourceTypes.has(parsed.sourceType) ? `sourceType must be one of ${[...allowedSourceTypes].join(", ")}` : undefined,
      !Array.isArray(parsed.songs) ? "songs must be an array" : undefined
    ].filter((item): item is string => Boolean(item));
    return {
      path,
      present: true,
      valid: issues.length === 0,
      sourceType: parsed.sourceType,
      songCount: Array.isArray(parsed.songs) ? parsed.songs.length : undefined,
      issues
    };
  } catch (error) {
    return { path, present: true, valid: false, issues: [`manifest.json is not valid JSON: ${String(error)}`] };
  }
}

async function copyCorpus(sourceRoot: string, destRoot: string): Promise<void> {
  await mkdir(destRoot, { recursive: true });
  const files = await lyricFiles(sourceRoot);
  await Promise.all(files.map((file) => {
    const relativeName = relative(sourceRoot, file).replace(/\.txt$/i, "");
    return copyFile(file, join(destRoot, `${slug(relativeName)}.txt`));
  }));
}

async function lyricFiles(root: string): Promise<string[]> {
  const exists = await stat(root).then((info) => info.isDirectory()).catch(() => false);
  if (!exists) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) return lyricFiles(fullPath);
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".txt")) return [fullPath];
    return [];
  }));
  return nested.flat();
}

function markdown(report: CorpusReadinessReport): string {
  return `# Modern Corpus Readiness: ${report.targetName}

- Experiment ID: ${report.experimentId}
- Ready to run full pipeline: ${report.ready ? "yes" : "no"}
- Data root: ${report.dataRoot}
- Target root: ${report.targetRoot}
- Background root: ${report.backgroundRoot}
- Candidate root: ${report.candidateRoot ?? "not configured"}
- Target lyric files: ${report.targetWorks} / ${report.minTargetWorks} minimum
- Modern background lyric files: ${report.backgroundWorks} / ${report.minBackgroundWorks} minimum
- Candidate lyric files: ${report.candidateWorks}
- Target manifest: ${manifestLine(report.targetManifest)}
- Background manifest: ${manifestLine(report.backgroundManifest)}
- Candidate manifest: ${report.candidateManifest ? manifestLine(report.candidateManifest) : "not configured"}

## Blockers

${report.blockers.map((item) => `- ${item}`).join("\n") || "- None"}

## Notes

${report.notes.map((item) => `- ${item}`).join("\n")}
`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
}

function manifestLine(status: CorpusManifestStatus): string {
  if (!status.present) return `missing (${status.path})`;
  if (!status.valid) return `invalid (${status.issues.join("; ")})`;
  return `valid (${status.sourceType}, ${status.songCount ?? 0} songs)`;
}
