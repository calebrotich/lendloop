/**
 * Deployment environment variables.
 *
 * Convex functions read configuration from `process.env`, which exists in the
 * Convex runtime. Unit tests run the same functions in an edge-runtime VM where
 * `process` may be absent, so every read goes through this guard and returns
 * `undefined` rather than throwing.
 */
interface ProcessLike {
  env?: Record<string, string | undefined>;
}

export function readEnv(name: string): string | undefined {
  const runtime = globalThis as { process?: ProcessLike };
  const value = runtime.process?.env?.[name];
  return typeof value === "string" ? value : undefined;
}

/** Comma-separated CSV → trimmed, lower-cased, non-empty entries. */
export function readCsvEnv(name: string): string[] {
  return (readEnv(name) ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}
