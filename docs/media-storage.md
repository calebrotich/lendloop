# Listing media (Cloudflare R2)

Listings carry up to **six photos**. The bytes live in Cloudflare R2; Convex owns the metadata,
authorisation and lifecycle. This document is the decision record and the operations runbook.

## Why this shape

| Decision                            | Reason                                                                                                                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R2 for object storage               | S3-compatible, no egress fees, a public custom domain (`R2_PUBLIC_HOST`) for delivery, and credentials that can be scoped to object read/write only.                                                                                                               |
| Presigned PUT + same-origin proxy   | The bucket has **no CORS rule** and the S3 key cannot manage bucket configuration. Proxying through `/api/media/upload` avoids CORS entirely, keeps R2 credentials on the Convex deployment, and lets the app enforce the 4 MB cap before the bytes reach storage. |
| Two-phase ticket → verify → publish | A successful `PUT` is not proof of a valid image. The object is checked (size, content type, magic bytes) by a Convex action before a `toolImages` row is inserted. A failed ticket cannot leak into a listing.                                                    |
| Browser re-encode                   | Resizes to a 2048 px longest edge and strips EXIF/GPS metadata before upload. These images are public, so metadata minimisation matters. R2 stores the re-encoded bytes, not the camera original.                                                                  |
| No Next image optimiser             | R2 already sits behind a CDN; stored width/height prevent layout shift. A second optimiser would add cost and cache layers without improving delivery.                                                                                                             |

## Data model

| Table              | Purpose                                                                                                                 | Key fields                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `toolImages`       | A published photo. Rows are ordered by `sortOrder`; the lowest is the cover.                                            | `toolId`, `ownerId`, `objectKey`, `contentType`, `byteSize`, `width`, `height`, `sortOrder`                                          |
| `toolImageUploads` | A short-lived authorisation to upload exactly one object. Pending tickets reserve a photo slot.                         | `toolId`, `ownerId`, `objectKey`, `contentType`, `byteSize`, `width`, `height`, `status` (`pending`/`failed`/`expired`), `expiresAt` |
| `storageDeletes`   | Outbox for R2 deletes. Removing an image only touches rows in the transaction; the cron deletes the object and retries. | `objectKey`, `reason`, `status` (`pending`/`failed`), `attempts`, `nextAttemptAt`, `lastError`                                       |

Object keys are `listing-images/<128-bit random>.<ext>`. They deliberately do **not** contain the
tool id: the key appears in the public image URL, and the public projection withholds `_id`. The
random suffix makes a URL unguessable even though the bucket is public; the `toolImages` row is the
authoritative listing association. Keys are generated server-side and are never accepted from a
caller for a write.

R2 credentials are only ever read inside `convex/` (`convex/lib/r2.ts`). The browser receives a
presigned URL only through the authenticated proxy; no credential or bucket mutation permission is
exposed to the client.

## Upload flow

```
Browser                     Next.js route                  Convex                          R2
  │                              │                            │                              │
  │ 1. select file               │                            │                              │
  │ 2. resize + re-encode        │                            │                              │
  │    (EXIF stripped)           │                            │                              │
  │── POST /api/media/upload ───▶│                            │                              │
  │    x-lendloop-upload-id      │── prepareUpload (token) ──▶│ authz + presign (10 min)     │
  │                              │◀── presigned PUT ──────────│                              │
  │                              │── PUT bytes ──────────────────────────────────────────────▶│
  │                              │◀────────────────────────────────────────── 200 ────────────│
  │◀── 200 {ok} ─────────────────│                            │                              │
  │── completeUpload (action) ──────────────────────────────▶│ HEAD + ranged GET + magic    │
  │                              │                            │── verify size/type/bytes ───▶│
  │                              │                            │ insert toolImages row        │
  │◀── image id ─────────────────────────────────────────────│ delete upload ticket         │
```

1. `createUploadTicket` verifies the caller owns the listing, checks the per-listing cap (published
   photos + live pending tickets), and writes a ticket. The ticket already knows the expected
   content type, size and dimensions.
2. The upload route authenticates the Clerk session, asks Convex for a presigned PUT for that
   ticket, checks the declared size and content type, forwards the bytes, and returns success only
   if R2 accepted the object.
3. `completeUpload` re-reads the object: `HEAD` for size/type, a ranged `GET` for magic bytes, then
   `confirmUpload` re-checks ownership, ticket state, expiry and the cap inside the transaction
   before inserting `toolImages` and deleting the ticket.
4. Any verification failure marks the ticket `failed` and enqueues the object for deletion.

The owner's editor renders a local object URL as soon as a file is picked, before decoding or
network work, so an upload never looks like a no-op. HEIC/HEIF sources are decoded where the
browser supports them (Safari via `<img>`, others via `createImageBitmap`); unsupported HEIC shows
an export-to-JPEG instruction instead of a silent failure.

The browser never talks to R2 for upload. It does fetch the public object URL for display through a
plain `<img>`, which requires no CORS.

## Limits and validation

- **6 photos per listing.** Live pending tickets count toward the cap, so parallel uploads cannot
  race past it.
- **4 MB per object**, measured after the browser re-encode. Source files may be up to 25 MB; they
  are never uploaded raw.
- **JPEG, PNG, WebP or AVIF.** SVG is rejected because it is an executable document; the public host
  would otherwise serve it as a first-class resource. GIF is not accepted (animation + metadata).
- **Magic-byte check:** PNG, JPEG, WebP and AVIF signatures are checked server-side. A client cannot
  bypass the allowlist by lying about `Content-Type`.
- **Dimensions:** integers between 1 and 20,000; used for layout, not security.
- Upload tickets expire after **10 minutes**. `maxActiveUploads` (10) bounds one person's live
  tickets.

## Delivery and caching

- URLs are `https://<R2_PUBLIC_HOST>/listing-images/<random>.<ext>`.
- `Cache-Control: public, max-age=86400` is signed into the PUT. Keys are never reused, so cached
  bytes are always the same bytes.
- A deleted object is removed from R2 by the media cron; Cloudflare edge caches may serve the old
  URL for up to the one-day TTL. `immutable` is deliberately not used because there is no cache
  purge hook in this app. If you need immediate revocation, add a Cloudflare cache-purge step to
  the delete action or move to private objects with signed GETs.

## Deletion and housekeeping

`convex/media.ts` runs every **15 minutes**:

1. Expire pending tickets whose `expiresAt` has passed and enqueue their objects.
2. Prune failed/expired tickets older than seven days.
3. Drain up to 25 due `storageDeletes` rows, with `60s × 2^(attempts−1)` backoff capped at six
   hours and eight attempts. Exhausted rows become `failed` and stay visible; successes are removed.

Removing a photo or a listing never makes a network call inside the mutation. The price is that the
object disappears shortly after the row; the UI already stops showing it immediately.

## Configuration

Set all five values on the **Convex deployment** (not only in `.env.local`, which functions cannot
read):

```bash
pnpm exec convex env set R2_BUCKET_NAME '<bucket>'
pnpm exec convex env set R2_ACCOUNT_ID '<cloudflare account id>'
pnpm exec convex env set R2_ACCESS_KEY_ID '<object read/write key>'
pnpm exec convex env set R2_SECRET_ACCESS_KEY '<secret>'
pnpm exec convex env set R2_PUBLIC_HOST 'cdn.example.com'
```

The R2 API token needs object read/write on the bucket. It does **not** need bucket-configuration
permissions: this app never calls `GetBucketCors`, `PutBucketCors`, or any bucket-level API. The
public custom domain must be enabled in the Cloudflare dashboard; that is delivered by
`R2_PUBLIC_HOST`.

To rotate, create a new R2 API token, set `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` on the
deployment, and run `media:verifyStorage` before revoking the old token. Presigned URLs minted with
the old key stop working within ten minutes; outstanding upload tickets fail verification and are
cleaned up by the cron.

The Next.js route only needs the existing Clerk and Convex variables. Do not copy R2 secrets into
the Next runtime.

### Verify the deployment

```bash
pnpm exec convex run media:verifyStorage
# { "putStatus": 200, "contentType": "image/png", "byteSize": 12, "magic": true }
```

This internal action writes a tiny object under `_healthchecks/`, exercises the exact presign →
PUT → HEAD → ranged GET → DELETE path, and always deletes the object. It is safe to run against a
dev deployment and is the first check when a photo upload fails with "storage is not configured".

### Optional: direct browser uploads

If you later configure bucket CORS (`PUT` from the app origin, allowed headers `content-type` and
`cache-control`), the presigned URL from `prepareUpload` can be used directly by the browser. That
removes the Next.js hop but changes the security posture: the bucket then trusts a presigned URL
from any origin. The current proxy is the default because it works with a locked-down bucket.

## Failure modes

| Symptom                                            | Likely cause                                                            | Action                                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| "Photo storage is not configured"                  | One of `R2_*` missing on the deployment                                 | Set the five variables; run `media:verifyStorage`.                                                |
| Upload route returns 401                           | Clerk session missing/expired                                           | Refresh and sign in again.                                                                        |
| Upload route returns 409/404                       | Ticket expired, already used, or belongs to someone else                | Start the upload again from My listings.                                                          |
| Upload route returns 413                           | File over 4 MB after re-encode                                          | Choose a smaller photo; the browser already resizes, so this usually means a very dense image.    |
| `completeUpload` says "doesn't look like an image" | Content/magic mismatch or a corrupted re-encode                         | Try another file; the object is queued for delete.                                                |
| R2 object still exists after removal               | Cron has not run yet, or the delete failed                              | Inspect `storageDeletes`; rows with `status: "failed"` have `lastError` and up to eight attempts. |
| Photo missing but row exists                       | Public host or bucket not configured, or object deleted outside the app | Run `media:verifyStorage`; check the public host in a browser.                                    |

## Testing

- `convex/toolImages.test.ts` — ownership, ticket lifecycle, cap enforcement, ordering/cover,
  removal + outbox, listing-removal cleanup, public URL projection.
- `convex/media.test.ts` — ticket expiry, pruning, due-delete selection, retry backoff and the
  visible failed state.
- `tests/r2.test.ts` — SigV4 URL shape, header signing, public URL encoding, magic-byte matching.
- `tests/media-upload-route.test.ts`, `tests/read-bounded-body.test.ts` — proxy forwarding, auth
  rejection, size mismatch/cap, Convex error mapping, and the bounded request reader.
- `tests/image-upload.test.ts` — the source-format gate, including HEIC/HEIF and SVG rejection.
- `tests/file-selection.test.ts` — the Chromium/Safari live-`FileList` regression.
- `tests/r2.integration.test.ts` — **skipped by default**; run against a real bucket with:

  ```bash
  set -a; source .env.local; set +a
  R2_INTEGRATION=1 pnpm vitest run tests/r2.integration.test.ts
  ```

The integration test asserts presign → PUT → HEAD → range → public GET → delete. It leaves no
object behind; a cached public copy may persist for the cache TTL.
