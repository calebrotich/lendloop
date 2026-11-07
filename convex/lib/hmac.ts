/**
 * HMAC-SHA256 for both directions of the n8n integration (T21).
 *
 * Signed string format, shared by Convex and the n8n Code nodes:
 *
 *     v1 = hex( HMAC-SHA256( secret, `${timestamp}.${rawBody}` ) )
 *
 * The timestamp is UNIX **seconds**; the verifier rejects anything outside a
 * tolerance window, so a captured request stops being useful. The `v1=` prefix
 * versions the scheme: a future rotation can accept `v1` and `v2` side by side
 * without a flag day.
 *
 * Web Crypto only — this module runs unchanged in the Convex runtime, in the
 * browser bundle (unused there) and in the Vitest edge runtime. No `"use node"`.
 */

const encoder = new TextEncoder();

export const SIGNATURE_HEADER = "X-LendLoop-Signature";
export const TIMESTAMP_HEADER = "X-LendLoop-Timestamp";
export const IDEMPOTENCY_HEADER = "X-LendLoop-Idempotency-Key";
export const SIGNATURE_VERSION = "v1";
export const DEFAULT_TOLERANCE_SECONDS = 300;

const SIGNATURE_PATTERN = new RegExp(`^${SIGNATURE_VERSION}=([0-9a-f]{64})$`);
const TIMESTAMP_PATTERN = /^\d{1,12}$/;

export type SignatureFailure = "not_configured" | "missing" | "malformed" | "stale" | "mismatch";

export type SignatureResult = { ok: true } | { ok: false; reason: SignatureFailure };

/** The exact bytes both sides sign. Centralised so they cannot disagree. */
export function signingPayload(timestamp: string, rawBody: string): string {
  return `${timestamp}.${rawBody}`;
}

function toHex(buffer: ArrayBuffer): string {
  let hex = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** Lower-level helper, exported for tests and for rotation tooling. */
export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toHex(signature);
}

/** `v1=<hex>` for an outbound request. */
export async function signRequest(
  secret: string,
  timestamp: string,
  rawBody: string,
): Promise<string> {
  const hex = await hmacSha256Hex(secret, signingPayload(timestamp, rawBody));
  return `${SIGNATURE_VERSION}=${hex}`;
}

/**
 * Compare two strings without an early exit on the first differing byte.
 *
 * Length is compared first (that leak is unavoidable when the expected length is
 * public); the content loop always touches every byte of the shorter side.
 */
export function timingSafeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;

  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

/**
 * Verify an inbound signature. All failure modes return `{ ok: false }` with a
 * machine reason for logs; the HTTP layer maps every one of them to a 401/503
 * without echoing what was expected.
 */
export async function verifySignature(input: {
  secret: string | undefined;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  nowSeconds: number;
  toleranceSeconds?: number;
}): Promise<SignatureResult> {
  const { secret, timestamp, signature, rawBody, nowSeconds } = input;
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;

  if (!secret || secret.length < 16) return { ok: false, reason: "not_configured" };
  if (!timestamp || !signature) return { ok: false, reason: "missing" };

  if (!TIMESTAMP_PATTERN.test(timestamp)) return { ok: false, reason: "malformed" };
  const sentAt = Number(timestamp);
  if (Math.abs(nowSeconds - sentAt) > tolerance) return { ok: false, reason: "stale" };

  const match = SIGNATURE_PATTERN.exec(signature);
  if (match === null) return { ok: false, reason: "malformed" };

  const expected = await hmacSha256Hex(secret, signingPayload(timestamp, rawBody));
  return timingSafeEqual(expected, match[1] ?? "")
    ? { ok: true }
    : { ok: false, reason: "mismatch" };
}

/**
 * Header bundle for an outbound call. `payload` must be the exact string that is
 * sent as the body, or the receiver will (correctly) reject it.
 */
export async function signedHeaders(input: {
  secret: string;
  payload: string;
  idempotencyKey: string;
  nowMs?: number;
}): Promise<Record<string, string>> {
  const timestamp = String(Math.floor((input.nowMs ?? Date.now()) / 1000));
  return {
    "content-type": "application/json",
    [TIMESTAMP_HEADER]: timestamp,
    [SIGNATURE_HEADER]: await signRequest(input.secret, timestamp, input.payload),
    [IDEMPOTENCY_HEADER]: input.idempotencyKey,
  };
}
