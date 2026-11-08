/**
 * Live R2 smoke test. Skipped unless explicitly enabled, so CI never depends on
 * a bucket or credentials:
 *
 *   set -a; source .env.local; set +a
 *   R2_INTEGRATION=1 pnpm vitest run tests/r2.integration.test.ts
 *
 * It exercises exactly the production path: presign a PUT with the signed
 * content type and cache policy, upload bytes, verify metadata and magic bytes,
 * read through the public host, then delete and confirm it is gone.
 */
import { afterAll, describe, expect, it } from "vitest";

import { hasImageSignature, IMAGE_CACHE_CONTROL } from "../convex/lib/mediaConstants";
import {
  buildPublicUrl,
  presignPutObject,
  r2DeleteObject,
  r2HeadObject,
  r2ReadPrefix,
  readPublicHost,
} from "../convex/lib/r2";

const enabled = process.env.R2_INTEGRATION === "1";
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

const key = `_integration/${Date.now()}-${crypto.randomUUID()}.png`;

describe.skipIf(!enabled)("R2 presign integration", () => {
  afterAll(async () => {
    await r2DeleteObject(key).catch(() => undefined);
  });

  it("uploads, verifies, serves publicly and deletes", async () => {
    const presigned = await presignPutObject({
      key,
      contentType: "image/png",
      cacheControl: IMAGE_CACHE_CONTROL,
    });

    const put = await fetch(presigned.url, {
      method: "PUT",
      headers: presigned.headers,
      body: PNG,
    });
    expect(put.status).toBe(200);

    const stored = await r2HeadObject(key);
    expect(stored).toEqual({ contentType: "image/png", byteSize: PNG.byteLength });

    const prefix = await r2ReadPrefix(key, 32);
    expect(hasImageSignature("image/png", prefix)).toBe(true);

    const host = readPublicHost();
    expect(host).not.toBeNull();
    const publicUrl = buildPublicUrl(host ?? "", key);

    const publicGet = await fetch(publicUrl);
    expect(publicGet.status).toBe(200);
    expect(publicGet.headers.get("content-type")).toContain("image/png");
    expect(publicGet.headers.get("cache-control")).toContain("max-age=86400");
    expect(new Uint8Array(await publicGet.arrayBuffer())).toEqual(PNG);

    await r2DeleteObject(key);

    // The origin is authoritative. The public custom domain may still serve a
    // cached copy until IMAGE_CACHE_CONTROL's TTL expires, so do not assert 404
    // on the CDN URL here.
    expect(await r2HeadObject(key)).toBeNull();
  });
});
