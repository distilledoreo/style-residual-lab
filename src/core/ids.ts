import { createHash } from "node:crypto";

export function hashText(...parts: unknown[]): string {
  const input = parts.map((part) => String(part)).join("\u001f");
  return createHash("sha256").update(input).digest("hex");
}

export function createId(prefix: string, ...parts: unknown[]): string {
  return `${prefix}_${hashText(...parts).slice(0, 16)}`;
}
