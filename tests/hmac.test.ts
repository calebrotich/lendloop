// secrets:allow-file — fixture secret for the HMAC known-answer vectors.
import { describe, expect, it } from "vitest";

import {
  DEFAULT_TOLERANCE_SECONDS,
  hmacSha256Hex,
  signRequest,
  signedHeaders,
  signingPayload,
  timingSafeEqual,
  verifySignature,
} from "../convex/lib/hmac";

const SECRET = "0123456789abcdef0123456789abcdef";
const NOW = 1_700_000_000;

/** Known answer for the 32-char SECRET, computed with `openssl dgst -sha256 -hmac`. */
const KNOWN_DIGEST = "f05f2539e3ae1c49aec5f8cfdad75ef6b06480b133973ffbb7ec9e18827af177";

async function verify(overrides: {
  secret?: string | undefined;
  timestamp?: string | null;
  signature?: string | null;
  rawBody?: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}) {
  return await verifySignature({
    secret: "secret" in overrides ? overrides.secret : SECRET,
    timestamp: "timestamp" in overrides ? (overrides.timestamp ?? null) : String(NOW),
    signature: "signature" in overrides ? (overrides.signature ?? null) : null,
    rawBody: overrides.rawBody ?? '{"a":1}',
    nowSeconds: overrides.nowSeconds ?? NOW,
    toleranceSeconds: overrides.toleranceSeconds,
  });
}

describe("hmac.sha256", () => {
  it("matches a known-answer vector", async () => {
    expect(await hmacSha256Hex(SECRET, '1700000000.{"a":1}')).toBe(KNOWN_DIGEST);
  });

  it("signs the timestamp and the body, not just the body", () => {
    expect(signingPayload("1700000000", '{"a":1}')).toBe('1700000000.{"a":1}');
  });

  it("emits a versioned header value", async () => {
    expect(await signRequest(SECRET, String(NOW), '{"a":1}')).toBe(`v1=${KNOWN_DIGEST}`);
  });

  it("builds headers that verify against their own payload", async () => {
    const payload = '{"event":"request.created"}';
    const headers = await signedHeaders({
      secret: SECRET,
      payload,
      idempotencyKey: "request:abc:created",
      nowMs: NOW * 1000,
    });

    const verdict = await verifySignature({
      secret: SECRET,
      timestamp: headers["X-LendLoop-Timestamp"] ?? null,
      signature: headers["X-LendLoop-Signature"] ?? null,
      rawBody: payload,
      nowSeconds: NOW,
    });

    expect(verdict).toEqual({ ok: true });
    expect(headers["X-LendLoop-Idempotency-Key"]).toBe("request:abc:created");
  });
});

describe("verifySignature", () => {
  it("accepts a valid signature inside the window", async () => {
    const signature = await signRequest(SECRET, String(NOW), '{"a":1}');
    expect(await verify({ signature })).toEqual({ ok: true });
  });

  it("rejects a body that changed after signing", async () => {
    const signature = await signRequest(SECRET, String(NOW), '{"a":1}');
    expect(await verify({ signature, rawBody: '{"a":2}' })).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });

  it("rejects a timestamp outside the tolerance in either direction", async () => {
    const signature = await signRequest(SECRET, String(NOW), '{"a":1}');
    const tolerance = DEFAULT_TOLERANCE_SECONDS;

    expect(await verify({ signature, nowSeconds: NOW + tolerance })).toEqual({ ok: true });
    expect(await verify({ signature, nowSeconds: NOW + tolerance + 1 })).toEqual({
      ok: false,
      reason: "stale",
    });
    expect(await verify({ signature, nowSeconds: NOW - tolerance - 1 })).toEqual({
      ok: false,
      reason: "stale",
    });
  });

  it("honours a tighter configured tolerance", async () => {
    const signature = await signRequest(SECRET, String(NOW), '{"a":1}');
    expect(await verify({ signature, nowSeconds: NOW + 30, toleranceSeconds: 10 })).toEqual({
      ok: false,
      reason: "stale",
    });
  });

  it("rejects missing, malformed and unversioned headers", async () => {
    expect(await verify({ signature: null })).toEqual({ ok: false, reason: "missing" });
    expect(await verify({ timestamp: null, signature: "v1=abc" })).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(await verify({ signature: "abc123" })).toEqual({ ok: false, reason: "malformed" });
    expect(await verify({ signature: "v1=not-hex" })).toEqual({ ok: false, reason: "malformed" });
    expect(await verify({ signature: `v2=${KNOWN_DIGEST}` })).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(await verify({ timestamp: "yesterday", signature: `v1=${"a".repeat(64)}` })).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("fails closed when the secret is missing or too short", async () => {
    const signature = await signRequest(SECRET, String(NOW), '{"a":1}');
    expect(await verify({ secret: undefined, signature })).toEqual({
      ok: false,
      reason: "not_configured",
    });
    expect(await verify({ secret: "short", signature })).toEqual({
      ok: false,
      reason: "not_configured",
    });
  });

  it("rejects a signature made with a different secret", async () => {
    const signature = await signRequest("fedcba9876543210fedcba9876543210", String(NOW), '{"a":1}');
    expect(await verify({ signature })).toEqual({ ok: false, reason: "mismatch" });
  });
});

describe("timingSafeEqual", () => {
  it("compares equal and unequal strings without throwing", () => {
    expect(timingSafeEqual("v1=abcd", "v1=abcd")).toBe(true);
    expect(timingSafeEqual("v1=abcd", "v1=abce")).toBe(false);
    expect(timingSafeEqual("v1=abcd", "v1=abc")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});
