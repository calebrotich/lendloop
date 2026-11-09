#!/usr/bin/env node
/**
 * Upload the re-encoded seed photos to the media bucket.
 *
 * The bytes go to the same R2 bucket the app already serves from, under the
 * same `listing-images/<random>.webp` key shape the upload flow produces, so
 * `convex/lib/media.ts` derives the public URL with no special case. Dev and
 * prod share this bucket; uploading twice is a no-op because the object key is
 * checked first.
 *
 * Uses curl's SigV4 implementation rather than the AWS SDK: the repo deliberately
 * keeps its R2 client dependency-free, and this is a one-off operator script.
 *
 *   node scripts/seed/upload-r2.mjs           # upload what is missing
 *   node scripts/seed/upload-r2.mjs --dry-run # print what would be uploaded
 */
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const MANIFEST = join(ROOT, ".seed-cache", "manifest.json");
const DRY_RUN = process.argv.includes("--dry-run");

function readEnvFile(name) {
  try {
    return Object.fromEntries(
      readFileSync(join(ROOT, name), "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, "")];
        }),
    );
  } catch {
    return {};
  }
}

const env = { ...readEnvFile(".env"), ...readEnvFile(".env.local"), ...process.env };
const bucket = env.R2_BUCKET_NAME;
const accountId = env.R2_ACCOUNT_ID;
const accessKeyId = env.R2_ACCESS_KEY_ID;
const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
const publicHost = (env.R2_PUBLIC_HOST ?? "").trim().replace(/\/+$/, "").replace(/^https?:\/\//, "");

if (!bucket || !accountId || !accessKeyId || !secretAccessKey || !publicHost) {
  console.error("R2_* is not fully configured in .env.local");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const images = new Map();
for (const listing of manifest.listings) {
  for (const image of listing.images) images.set(image.objectKey, image);
}

async function exists(objectKey) {
  const { stdout } = await run("curl", [
    "-s",
    "-o",
    "/dev/null",
    "-w",
    "%{http_code}",
    "-I",
    `https://${publicHost}/${objectKey}`,
  ]);
  return stdout.trim() === "200";
}

async function upload(objectKey, file) {
  const target = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${objectKey}`;
  const args = [
    "-s",
    "-o",
    "/dev/null",
    "-w",
    "%{http_code}",
    "-X",
    "PUT",
    "--aws-sigv4",
    "aws:amz:auto:s3",
    "--user",
    `${accessKeyId}:${secretAccessKey}`,
    "-H",
    "content-type: image/webp",
    "-H",
    "cache-control: public, max-age=86400",
    "--data-binary",
    `@${join(ROOT, file)}`,
    target,
  ];
  const { stdout } = await run("curl", args, { maxBuffer: 1024 * 1024 });
  const status = stdout.trim();
  if (status !== "200") throw new Error(`${objectKey}: HTTP ${status}`);
}

const entries = [...images.values()];
let uploaded = 0;
let skipped = 0;
let failed = 0;
const queue = [...entries];

async function worker() {
  for (;;) {
    const image = queue.shift();
    if (image === undefined) return;
    try {
      if (await exists(image.objectKey)) {
        skipped += 1;
        continue;
      }
      if (DRY_RUN) {
        console.log(`would upload ${image.objectKey} (${image.byteSize} bytes)`);
        continue;
      }
      await upload(image.objectKey, image.file);
      uploaded += 1;
      if (uploaded % 20 === 0) console.log(`uploaded ${uploaded}/${entries.length}`);
    } catch (error) {
      failed += 1;
      console.error(String(error.message ?? error));
    }
  }
}

await Promise.all(Array.from({ length: 6 }, worker));
console.log(
  `${DRY_RUN ? "dry run: " : ""}${uploaded} uploaded, ${skipped} already present, ${failed} failed (${entries.length} total)`,
);
if (failed > 0) process.exit(1);
