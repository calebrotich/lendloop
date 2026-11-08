/**
 * Cloudflare R2 (S3-compatible) media client.
 *
 * Why hand-rolled SigV4 instead of the AWS SDK: Convex functions run in a V8
 * isolate where Web Crypto and `fetch` are available, but the default runtime
 * cannot bundle Node packages. The signing surface we need is small and fully
 * testable, so this keeps the whole media backend dependency-free and in one
 * runtime — mutations and actions share it.
 *
 * The browser never sees these credentials. Uploads are proxied through
 * `/api/media/upload`: Convex mints the presigned PUT, the Next.js route streams
 * the file to R2, and Convex verifies the stored object before accepting it.
 * Requiring CORS on the bucket would be the alternative; this app deliberately
 * does not need it, so the bucket can stay locked down.
 *
 * Everything here is server-side only. `readR2Credentials` reads deployment
 * env; object keys are generated server-side and are never accepted from a
 * caller for a write.
 */

import { readEnv } from "./env";
import { IMAGE_CACHE_CONTROL } from "./mediaConstants";

const ALGORITHM = "AWS4-HMAC-SHA256";
const SERVICE = "s3";
const REGION = "auto";
const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";
const encoder = new TextEncoder();

/** Presigned URLs are short-lived; the proxy uses one immediately. */
export const PRESIGN_TTL_SECONDS = 600;

export class R2NotConfiguredError extends Error {
  constructor() {
    super("R2 is not configured.");
    this.name = "R2NotConfiguredError";
  }
}

export class R2RequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "R2RequestError";
    this.status = status;
  }
}

export interface R2Credentials {
  bucket: string;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface PresignedPut {
  url: string;
  /**
   * The headers that were signed. The uploader must send every one of them
   * unchanged or R2 rejects the signature.
   */
  headers: Record<string, string>;
}

export interface StoredObject {
  contentType: string;
  byteSize: number;
}

function requireEnv(name: string): string | null {
  const value = readEnv(name)?.trim();
  return value !== undefined && value.length > 0 ? value : null;
}

export function readR2Credentials(): R2Credentials | null {
  const bucket = requireEnv("R2_BUCKET_NAME");
  const accountId = requireEnv("R2_ACCOUNT_ID");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");

  if (bucket === null || accountId === null || accessKeyId === null || secretAccessKey === null) {
    return null;
  }

  return { bucket, accountId, accessKeyId, secretAccessKey };
}

export function requireR2Credentials(): R2Credentials {
  const credentials = readR2Credentials();
  if (credentials === null) throw new R2NotConfiguredError();
  return credentials;
}

/** Public custom-domain host, with or without a protocol. */
export function readPublicHost(): string | null {
  return requireEnv("R2_PUBLIC_HOST");
}

function endpointHost(accountId: string): string {
  return `${accountId}.r2.cloudflarestorage.com`;
}

/** RFC 3986: encode everything except the unreserved set. */
function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Preserve `/` separators while encoding each path segment. */
function encodeKeyPath(key: string): string {
  return key.split("/").map(encodeRfc3986).join("/");
}

/** `https://cdn.example.com/tools/<id>/<random>.webp` */
export function buildPublicUrl(publicHost: string, objectKey: string): string {
  const trimmed = publicHost.trim().replace(/\/+$/, "");
  const base = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return `${base}/${encodeKeyPath(objectKey)}`;
}

function amzDate(nowMs: number): { date: string; dateStamp: string } {
  const iso = new Date(nowMs).toISOString();
  const date = iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return { date, dateStamp: date.slice(0, 8) };
}

function toHex(buffer: ArrayBuffer): string {
  let hex = "";
  for (const byte of new Uint8Array(buffer)) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(input)));
}

async function hmac(key: BufferSource, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

function canonicalHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function canonicalQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeRfc3986(key)}=${encodeRfc3986(params[key] ?? "")}`)
    .join("&");
}

async function signingKey(secretAccessKey: string, dateStamp: string): Promise<ArrayBuffer> {
  const dateKey = await hmac(encoder.encode(`AWS4${secretAccessKey}`), dateStamp);
  const regionKey = await hmac(dateKey, REGION);
  const serviceKey = await hmac(regionKey, SERVICE);
  return await hmac(serviceKey, "aws4_request");
}

async function signatureFor(
  credentials: R2Credentials,
  amz: { date: string; dateStamp: string },
  stringToSign: string,
): Promise<string> {
  const key = await signingKey(credentials.secretAccessKey, amz.dateStamp);
  return toHex(await hmac(key, stringToSign));
}

interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

/**
 * Sign a request with the Authorization header (used for HEAD/GET/DELETE from
 * Convex actions). The body is always empty for these calls.
 */
async function signObjectRequest(args: {
  method: "GET" | "HEAD" | "DELETE";
  key: string;
  credentials?: R2Credentials;
  now?: number;
}): Promise<SignedRequest> {
  const credentials = args.credentials ?? requireR2Credentials();
  const now = args.now ?? Date.now();
  const amz = amzDate(now);
  const host = endpointHost(credentials.accountId);
  const path = `/${encodeRfc3986(credentials.bucket)}/${encodeKeyPath(args.key)}`;
  const payloadHash = await sha256Hex("");
  const canonicalHeaders =
    `host:${host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amz.date}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const scope = `${amz.dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const canonicalRequest = [
    args.method,
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const stringToSign = [ALGORITHM, amz.date, scope, await sha256Hex(canonicalRequest)].join("\n");
  const signature = await signatureFor(credentials, amz, stringToSign);

  return {
    url: `https://${host}${path}`,
    headers: {
      Authorization:
        `${ALGORITHM} Credential=${credentials.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amz.date,
    },
  };
}

/**
 * Presign a PUT with a fixed content type and cache policy.
 *
 * Signing `content-type` means the uploader cannot swap the media type after
 * the URL is minted; signing `cache-control` gives the CDN a bounded cache
 * lifetime that also lets deleted media age out. R2 stores both headers.
 */
export async function presignPutObject(args: {
  key: string;
  contentType: string;
  cacheControl?: string;
  expiresInSeconds?: number;
  now?: number;
  credentials?: R2Credentials;
}): Promise<PresignedPut> {
  const credentials = args.credentials ?? requireR2Credentials();
  const now = args.now ?? Date.now();
  const expiresInSeconds = args.expiresInSeconds ?? PRESIGN_TTL_SECONDS;
  const cacheControl = args.cacheControl ?? IMAGE_CACHE_CONTROL;
  const amz = amzDate(now);
  const host = endpointHost(credentials.accountId);
  const path = `/${encodeRfc3986(credentials.bucket)}/${encodeKeyPath(args.key)}`;
  const scope = `${amz.dateStamp}/${REGION}/${SERVICE}/aws4_request`;

  const headers: Record<string, string> = {
    "cache-control": cacheControl,
    "content-type": args.contentType,
  };
  const signedHeaderNames = [...Object.keys(headers), "host"].sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => {
      const value = name === "host" ? host : (headers[name] ?? "");
      return `${name}:${canonicalHeaderValue(value)}\n`;
    })
    .join("");
  const signedHeaders = signedHeaderNames.join(";");

  const query: Record<string, string> = {
    "X-Amz-Algorithm": ALGORITHM,
    "X-Amz-Credential": `${credentials.accessKeyId}/${scope}`,
    "X-Amz-Date": amz.date,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  };

  const canonicalRequest = [
    "PUT",
    path,
    canonicalQuery(query),
    canonicalHeaders,
    signedHeaders,
    UNSIGNED_PAYLOAD,
  ].join("\n");
  const stringToSign = [ALGORITHM, amz.date, scope, await sha256Hex(canonicalRequest)].join("\n");
  const signature = await signatureFor(credentials, amz, stringToSign);

  return {
    url: `https://${host}${path}?${canonicalQuery(query)}&X-Amz-Signature=${signature}`,
    headers,
  };
}

async function errorFromResponse(response: Response): Promise<R2RequestError> {
  const body = await response.text().catch(() => "");
  const detail = body.trim().slice(0, 200);
  return new R2RequestError(
    response.status,
    detail.length > 0
      ? `R2 returned ${response.status}: ${detail}`
      : `R2 returned ${response.status}.`,
  );
}

/** Metadata for a stored object, or `null` when it does not exist. */
export async function r2HeadObject(
  objectKey: string,
  options: { credentials?: R2Credentials } = {},
): Promise<StoredObject | null> {
  const request = await signObjectRequest({
    method: "HEAD",
    key: objectKey,
    credentials: options.credentials,
  });
  const response = await fetch(request.url, { method: "HEAD", headers: request.headers });

  if (response.status === 404) return null;
  if (!response.ok) throw await errorFromResponse(response);

  const contentType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
  const byteSize = Number(response.headers.get("content-length") ?? "0");
  return { contentType, byteSize: Number.isFinite(byteSize) ? byteSize : 0 };
}

/**
 * Read the first bytes of an object. Range is not part of the signature, so it
 * is added after signing; R2 honours it. The stream is cancelled after the
 * first chunk so a large (or hostile) object is never buffered whole.
 */
export async function r2ReadPrefix(
  objectKey: string,
  length = 32,
  options: { credentials?: R2Credentials } = {},
): Promise<Uint8Array> {
  const request = await signObjectRequest({
    method: "GET",
    key: objectKey,
    credentials: options.credentials,
  });
  const response = await fetch(request.url, {
    method: "GET",
    headers: { ...request.headers, Range: `bytes=0-${Math.max(0, length - 1)}` },
  });

  if (!response.ok) throw await errorFromResponse(response);
  if (response.body === null) return new Uint8Array();

  const reader = response.body.getReader();
  try {
    const { value } = await reader.read();
    return value === undefined ? new Uint8Array() : value.slice(0, length);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/**
 * Idempotent delete: a missing object is already the desired state. Used by the
 * cleanup cron, so retries after a half-failed run are safe.
 */
export async function r2DeleteObject(
  objectKey: string,
  options: { credentials?: R2Credentials } = {},
): Promise<void> {
  const request = await signObjectRequest({
    method: "DELETE",
    key: objectKey,
    credentials: options.credentials,
  });
  const response = await fetch(request.url, { method: "DELETE", headers: request.headers });

  if (response.ok || response.status === 404) return;
  throw await errorFromResponse(response);
}
