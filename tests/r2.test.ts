import { describe, expect, it } from "vitest";

import {
  hasImageSignature,
  IMAGE_CACHE_CONTROL,
  isImageContentType,
} from "../convex/lib/mediaConstants";
import { buildPublicUrl, presignPutObject } from "../convex/lib/r2";

const CREDENTIALS = {
  bucket: "test-bucket",
  accountId: "abc123",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
};

const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);

describe("buildPublicUrl", () => {
  it("normalises the host and preserves key separators", () => {
    expect(buildPublicUrl("cdn.example.test", "tools/t1/a.webp")).toBe(
      "https://cdn.example.test/tools/t1/a.webp",
    );
    expect(buildPublicUrl("https://cdn.example.test/", "tools/t1/a b.webp")).toBe(
      "https://cdn.example.test/tools/t1/a%20b.webp",
    );
  });

  it("encodes path segments but not the slashes between them", () => {
    expect(buildPublicUrl("cdn.example.test", "tools/t1/a+b.webp")).toBe(
      "https://cdn.example.test/tools/t1/a%2Bb.webp",
    );
  });
});

describe("presignPutObject", () => {
  it("signs the content type and cache policy into an S3-compatible URL", async () => {
    const presigned = await presignPutObject({
      key: "tools/t1/photo.webp",
      contentType: "image/webp",
      cacheControl: IMAGE_CACHE_CONTROL,
      now: NOW,
      credentials: CREDENTIALS,
    });

    expect(presigned.url).toMatch(
      /^https:\/\/abc123\.r2\.cloudflarestorage\.com\/test-bucket\/tools\/t1\/photo\.webp\?/,
    );
    expect(presigned.url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(presigned.url).toContain("X-Amz-Date=20261107T120000Z");
    expect(presigned.url).toContain("X-Amz-Expires=600");
    expect(presigned.url).toContain("X-Amz-SignedHeaders=cache-control%3Bcontent-type%3Bhost");
    expect(presigned.url).toContain("X-Amz-Signature=");
    expect(presigned.url.split("X-Amz-Signature=")[1]).toMatch(/^[0-9a-f]{64}$/);
    expect(presigned.headers).toEqual({
      "cache-control": IMAGE_CACHE_CONTROL,
      "content-type": "image/webp",
    });
  });

  it("changes the signature with the timestamp", async () => {
    const first = await presignPutObject({
      key: "tools/t1/photo.webp",
      contentType: "image/webp",
      now: NOW,
      credentials: CREDENTIALS,
    });
    const second = await presignPutObject({
      key: "tools/t1/photo.webp",
      contentType: "image/webp",
      now: NOW + 1_000,
      credentials: CREDENTIALS,
    });

    expect(first.url).not.toBe(second.url);
  });
});

describe("image signatures", () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  const avif = Uint8Array.from([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]);
  const html = new TextEncoder().encode("<html><script>alert(1)</script>");

  it("accepts the allow-listed formats and rejects everything else", () => {
    expect(hasImageSignature("image/jpeg", jpeg)).toBe(true);
    expect(hasImageSignature("image/png", png)).toBe(true);
    expect(hasImageSignature("image/webp", webp)).toBe(true);
    expect(hasImageSignature("image/avif", avif)).toBe(true);
    expect(hasImageSignature("image/png", html)).toBe(false);
    expect(hasImageSignature("image/webp", png)).toBe(false);
    expect(hasImageSignature("image/svg+xml", png)).toBe(false);
  });

  it("allows only the documented content types", () => {
    expect(isImageContentType("image/webp")).toBe(true);
    expect(isImageContentType("image/svg+xml")).toBe(false);
    expect(isImageContentType("text/html")).toBe(false);
  });
});
