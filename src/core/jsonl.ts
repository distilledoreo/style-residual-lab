import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function readJsonl<T>(path: string): Promise<T[]> {
  try {
    const raw = await readFile(path, "utf8");
    return raw
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as T);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function writeJsonl<T>(path: string, records: T[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const body = records.map((record) => JSON.stringify(record)).join("\n");
  await writeFile(path, body ? `${body}\n` : "", "utf8");
}

export async function appendJsonl<T>(path: string, record: T): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
}

export async function upsertJsonl<T>(
  path: string,
  records: T[],
  keyFn: (record: T) => string
): Promise<void> {
  const existing = await readJsonl<T>(path);
  const merged = new Map(existing.map((record) => [keyFn(record), record]));
  for (const record of records) merged.set(keyFn(record), record);
  await writeJsonl(path, [...merged.values()]);
}
