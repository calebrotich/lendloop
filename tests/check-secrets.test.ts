// secrets:allow-file — this file builds fake credentials to prove the scanner works.
import { describe, expect, it } from "vitest";

import { isEnvFile, scanRepository, scanText } from "../scripts/check-secrets.mjs";

/** Built at runtime so this fixture never looks like a real key to the scanner. */
const fakeStripeKey = ["sk", "live", "51HxQ9deadbeefdeadbeef"].join("_");
const fakeSvixSecret = ["whsec", "ZGVhZGJlZWZkZWFkYmVlZg=="].join("_");
const fakeAwsKey = ["AKIA", "Q9DEADBEEFDEADBE"].join("");

type Finding = ReturnType<typeof scanText>[number];

const rules = (findings: Finding[]) => findings.map((finding) => finding.rule);

describe("scanText", () => {
  it("flags high-confidence credential prefixes", () => {
    const text = [
      `STRIPE=${fakeStripeKey}`,
      `SVIX=${fakeSvixSecret}`,
      `AWS_KEY_ID=${fakeAwsKey}`,
    ].join("\n");

    expect(rules(scanText(text, "config.ts"))).toEqual([
      "secret-key",
      "svix-signing-secret",
      "aws-access-key-id",
    ]);
  });

  it("reports the line number of the leak", () => {
    const findings = scanText(`line one\nline two\nSTRIPE=${fakeStripeKey}\n`, "config.ts");

    expect(findings).toHaveLength(1);
    expect(findings[0]?.line).toBe(3);
  });

  it("masks the value in the report", () => {
    const findings = scanText(`STRIPE=${fakeStripeKey}`, "config.ts");
    const preview = findings[0]?.preview ?? "";

    expect(preview).not.toContain("deadbeef");
    expect(preview.startsWith("sk_l")).toBe(true);
  });

  it("ignores bare prefixes mentioned in prose", () => {
    // AGENTS.md documents the prefixes it scans for; that is not a leak.
    expect(scanText("we scan for `sk_`, `whsec_` and `n8n_api_` prefixes", "AGENTS.md")).toEqual(
      [],
    );
  });

  it("ignores placeholder assignments", () => {
    const text = [
      'password: "change-me-locally"',
      'apiKey: "your-key-here"',
      'secret: "${SOME_SECRET}"',
    ].join("\n");

    expect(scanText(text, "docs/n8n.md")).toEqual([]);
  });

  it("flags a real-looking hardcoded assignment", () => {
    const text = 'const config = { password: "hunter2hunter2" };';

    expect(rules(scanText(text, "convex/lib/db.ts"))).toEqual(["hardcoded-secret-assignment"]);
  });

  it("skips files that opt out with the marker", () => {
    const text = `// secrets:allow-file\nconst key = "${fakeStripeKey}";`;

    expect(scanText(text, "test/fixtures.ts")).toEqual([]);
  });

  it("skips binary assets", () => {
    expect(scanText(`sk_live_${"x".repeat(40)}`, "public/logo.png")).toEqual([]);
  });

  it("returns nothing for a clean file", () => {
    const text = 'export const TAGLINE = "Borrow what you need. Lend what you don\u2019t.";';

    expect(scanText(text, "app/constants.ts")).toEqual([]);
  });
});

describe("isEnvFile", () => {
  it("treats local env files as never-commit but keeps the template", () => {
    expect(isEnvFile(".env")).toBe(true);
    expect(isEnvFile(".env.local")).toBe(true);
    expect(isEnvFile("config/.env.production")).toBe(true);
    expect(isEnvFile(".env.example")).toBe(false);
    expect(isEnvFile("docs/env.md")).toBe(false);
  });
});

describe("scanRepository", () => {
  it("scans this repository and finds no leaked credentials", () => {
    const { findings, scanned } = scanRepository(process.cwd());

    expect(scanned).toBeGreaterThan(10);
    expect(findings).toEqual([]);
  });
});
