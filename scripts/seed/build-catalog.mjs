#!/usr/bin/env node
/**
 * Merge the hand-written catalogue parts into one validated manifest.
 *
 * The catalogue is authored by hand in `scripts/seed/catalog/*.json`; this
 * script only checks it against the same limits the Convex mutations enforce
 * (see convex/lib/limits.ts) and fails loudly so a typo never reaches a deploy.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG_DIR = join(HERE, "catalog");
const OUT = join(HERE, "catalog.json");

const CATEGORIES = new Set([
  "power_tools",
  "hand_tools",
  "garden",
  "kitchen",
  "camping",
  "cleaning",
  "automotive",
  "electronics",
  "sports_fitness",
  "bikes",
  "music",
  "photography",
  "party_events",
  "other",
]);
const CONDITIONS = new Set(["new", "like_new", "good", "fair", "worn"]);
const STATUSES = new Set(["available", "unavailable"]);

const LIMITS = {
  nameMin: 2,
  nameMax: 60,
  descriptionMin: 10,
  descriptionMax: 400,
  minValueCents: 100,
  maxValueCents: 100_000_000,
  maxDailyRateCents: 10_000_000,
};

const files = readdirSync(CATALOG_DIR)
  .filter((file) => file.endsWith(".json"))
  .sort();

const listings = [];
const problems = [];

for (const file of files) {
  const rows = JSON.parse(readFileSync(join(CATALOG_DIR, file), "utf8"));
  if (!Array.isArray(rows)) problems.push(`${file}: not an array`);
  for (const [index, row] of rows.entries()) {
    const where = `${file}[${index}] "{{name}}"`;
    const label = where.replace("{{name}}", row.name ?? "?");
    for (const key of [
      "name",
      "category",
      "condition",
      "description",
      "valueCents",
      "dailyRateCents",
      "status",
      "imageQueries",
    ]) {
      if (row[key] === undefined) problems.push(`${label}: missing ${key}`);
    }
    if (!CATEGORIES.has(row.category)) problems.push(`${label}: bad category ${row.category}`);
    if (!CONDITIONS.has(row.condition)) problems.push(`${label}: bad condition ${row.condition}`);
    if (!STATUSES.has(row.status)) problems.push(`${label}: bad status ${row.status}`);
    if (typeof row.name !== "string" || row.name.length > LIMITS.nameMax) {
      problems.push(`${label}: name too long (${row.name?.length})`);
    }
    if (typeof row.description !== "string" || row.description.length > LIMITS.descriptionMax) {
      problems.push(`${label}: description ${row.description?.length} chars > ${LIMITS.descriptionMax}`);
    }
    if (row.description?.trim().length < LIMITS.descriptionMin) {
      problems.push(`${label}: description too short`);
    }
    if (!Number.isInteger(row.valueCents) || row.valueCents < LIMITS.minValueCents) {
      problems.push(`${label}: bad valueCents`);
    }
    if (!Number.isInteger(row.dailyRateCents) || row.dailyRateCents > row.valueCents) {
      problems.push(`${label}: bad dailyRateCents`);
    }
    if (!Array.isArray(row.imageQueries) || row.imageQueries.length === 0) {
      problems.push(`${label}: needs imageQueries`);
    }
    listings.push({ ...row });
  }
}

const seen = new Map();
for (const listing of listings) {
  const key = listing.name.trim().toLowerCase();
  if (seen.has(key)) problems.push(`duplicate name "${listing.name}"`);
  seen.set(key, true);
}

const byCategory = {};
for (const listing of listings) {
  byCategory[listing.category] = (byCategory[listing.category] ?? 0) + 1;
}

if (listings.length % 4 !== 0) {
  problems.push(`total ${listings.length} is not divisible by 4 owners`);
}

if (problems.length > 0) {
  console.error(`catalogue invalid (${problems.length} problems):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const payload = {
  generatedBy: "scripts/seed/build-catalog.mjs",
  total: listings.length,
  byCategory,
  listings,
};
writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);

console.log(`catalogue OK: ${listings.length} listings across ${Object.keys(byCategory).length} categories`);
console.log(JSON.stringify(byCategory, null, 2));
