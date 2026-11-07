#!/usr/bin/env node
/**
 * Secret hygiene gate (T22).
 *
 * Scans files tracked by git for credential-shaped strings, and refuses to let
 * a populated `.env` reach the repository at all. Runs in CI and via
 * `pnpm secrets:check`; every finding prints a masked preview so the log itself
 * never becomes the leak.
 *
 * The rules are intentionally high-confidence: a noisy scanner gets muted, and a
 * muted scanner is the same as no scanner.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

/** Files carrying this marker are pattern definitions or fixtures, not leaks. */
const ALLOW_FILE_MARKER = "secrets:allow-file";

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".woff",
  ".woff2",
]);

/** Values a developer is *supposed* to replace before running anything. */
const PLACEHOLDER_PATTERN =
  /^(?:|change[-_ ]?me.*|example.*|placeholder.*|your[-_ ].*|xxx+|\*+|<.*>|\$\{.*\}|\.\.\.)$/i;

const RULES = [
  {
    id: "secret-key",
    // Stripe and Clerk both mint sk_(live|test)_ keys.
    pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  },
  { id: "svix-signing-secret", pattern: /\bwhsec_[A-Za-z0-9+/=]{16,}/g },
  { id: "n8n-api-key", pattern: /\bn8n_api_[A-Za-z0-9]{16,}/g },
  // Sentry org/user auth tokens, used only for source-map upload.
  { id: "sentry-auth-token", pattern: /\bsntry[s|u]_[A-Za-z0-9+/=_-]{20,}/g },
  { id: "aws-access-key-id", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}/g },
  { id: "slack-token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { id: "private-key-block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g },
  {
    id: "hardcoded-secret-assignment",
    // The captured group holds the value; the key name is context only.
    pattern:
      /(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)["']?\s*[:=]\s*["']([^"'\n]{8,})["']/gi,
    captureGroup: 1,
  },
];

/** `.env` files may exist locally, but only the template may be committed. */
const ENV_FILE = /(^|\/)\.env(?:\.(?!example$)[^/]+)?$/;

/** @param {string} file */
export function isEnvFile(file) {
  return ENV_FILE.test(file);
}

/** Never worth scanning: generated output and package stores. */
const SKIP_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".pnpm-store",
  "node_modules",
  "coverage",
  "dist",
  "build",
  "out",
  "playwright-report",
  "test-results",
]);

function isBinary(file) {
  const dot = file.lastIndexOf(".");
  return dot !== -1 && BINARY_EXTENSIONS.has(file.slice(dot).toLowerCase());
}

function redact(value) {
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}${"*".repeat(Math.min(value.length - 6, 12))}${value.slice(-2)}`;
}

function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return (index) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (starts[mid] <= index) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
}

/**
 * @typedef {{ file: string; line: number; rule: string; preview: string }} Finding
 */

/**
 * @param {string} text
 * @param {string} file repository-relative path
 * @returns {Finding[]}
 */
export function scanText(text, file) {
  if (isBinary(file) || text.includes(ALLOW_FILE_MARKER)) return [];

  const lineOf = lineIndex(text);
  const findings = [];

  for (const rule of RULES) {
    for (const match of text.matchAll(rule.pattern)) {
      const value = rule.captureGroup ? (match[rule.captureGroup] ?? "") : match[0];
      if (value === "") continue;
      if (rule.id === "hardcoded-secret-assignment" && PLACEHOLDER_PATTERN.test(value)) continue;
      findings.push({
        file,
        line: lineOf(match.index ?? 0),
        rule: rule.id,
        preview: redact(value),
      });
    }
  }

  return findings;
}

function trackedFiles(cwd) {
  try {
    const output = execFileSync("git", ["-C", cwd, "ls-files", "-z"], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    return output.split("\0").filter((file) => file.length > 0);
  } catch {
    return null;
  }
}

function walk(dir, root, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRECTORIES.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, root, out);
    else if (entry.isFile()) out.push(relative(root, full));
  }
  return out;
}

/**
 * @param {string} cwd
 * @returns {{ findings: Finding[]; scanned: number }}
 */
export function scanRepository(cwd = process.cwd()) {
  const tracked = trackedFiles(cwd);
  // Before the first commit `git ls-files` is empty, so fall back to the working
  // tree — otherwise the pre-commit run would scan nothing and always pass.
  const staged = Array.isArray(tracked) && tracked.length > 0;
  const files = staged ? tracked : walk(cwd, cwd, []);

  const findings = [];
  let scanned = 0;

  for (const file of files) {
    if (staged && isEnvFile(file)) {
      findings.push({
        file,
        line: 1,
        rule: "committed-env-file",
        preview: "(file must stay local)",
      });
      continue;
    }
    // A working-tree scan legitimately sees local .env files; they are not leaks.
    if (!staged && isEnvFile(file)) continue;

    const full = join(cwd, file);
    if (!existsSync(full)) continue;
    if (statSync(full).size > 2 * 1024 * 1024) continue;

    scanned += 1;
    findings.push(...scanText(readFileSync(full, "utf8"), file));
  }

  return { findings, scanned };
}

function main() {
  const { findings, scanned } = scanRepository(process.cwd());

  if (findings.length === 0) {
    console.log(`secrets:check — clean (${scanned} files)`);
    return 0;
  }

  console.error(`secrets:check — ${findings.length} finding(s):\n`);
  for (const finding of findings) {
    console.error(`  ${finding.file}:${finding.line}  ${finding.rule}  ${finding.preview}`);
  }
  console.error(
    "\nRemove the value, rotate it if it was ever real, and use .env / Convex env vars instead.",
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
