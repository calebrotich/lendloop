# Listing media

Listings carry up to six photos. Bytes live in Cloudflare R2; Convex owns metadata, authorization
and lifecycle. Design and operations record below.

## Why this shape

- **R2** is S3-compatible, has no egress fee, serves through a public custom domain
  (`R2_PUBLIC_HOST`), and the API key needs object read/write only.
- **Presigned PUT + same-origin proxy:** the bucket has no CORS rule and the key cannot manage
  bucket config. `/api/media/upload` avoids CORS, keeps R2 credentials on the Convex deployment and
  enforces the 4 MB cap before bytes reach storage.
- **Ticket → verify → publish:** a successful PUT is not proof of a valid image. Size, content type
  and magic bytes are checked before a `toolImages` row is created.
- **Browser re-encode:** images are resized to a 2048 px longest edge and re-encoded, stripping
  EXIF/GPS before upload. These images are public by design.

## Data model

| Table              | Purpose                                                                                   | Key fields                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `toolImages`       | A published photo. Ordered by `sortOrder`; the lowest is the cover.                       | `toolId`, `ownerId`, `objectKey`, `contentType`, `byteSize`, `width`, `height`, `sortOrder`           |
| `toolImageUploads` | A short-lived authorization for exactly one object. Pending tickets reserve a photo slot. | `toolId`, `ownerId`, `objectKey`, `contentType`, `byteSize`, `width`, `height`, `status`, `expiresAt` |
| `storageDeletes`   | Outbox for R2 deletes. Removing an image only touches rows; the cron deletes the object.  | `objectKey`, `reason`, `status`, `attempts`, `nextAttemptAt`, `lastError`                             |

Object keys are `listing-images/<128-bit random>.<ext>`. They deliberately do not contain the tool
id: the key appears in a public URL, and the public projection withholds `_id`. Keys are generated
server-side and never accepted from a caller for a write.

## Upload flow

```text
Browser                    Next.js route                 Convex                        R2
  │ select file                 │                          │                            │
  │ resize + re-encode          │                          │                            │
  │── POST /api/media/upload ──▶│── prepareUpload ────────▶│ authz + presign (10 min)   │
  │                             │◀── presigned PUT ────────│                            │
  │                             │── PUT bytes ──────────────────────────────────────────▶│
  │◀── 200 {ok} ────────────────│                          │                            │
  │── completeUpload ─────────────────────────────────────▶│ HEAD + ranged GET + magic  │
  │                             │                          │ insert toolImages row      │
  │◀── image id ───────────────────────────────────────────│ delete upload ticket       │
```

1. `createUploadTicket` checks ownership, the six-photo cap (published + live pending tickets) and
   records the expected content type, size and dimensions.
2. The upload route authenticates Clerk, asks Convex for a presigned PUT scoped to that ticket,
   checks the declared size/type, forwards the bytes and returns success only if R2 accepted them.
3. `completeUpload` re-reads the object (`HEAD` for size/type, ranged `GET` for magic bytes), then
   re-checks ownership, expiry and the cap inside the transaction before inserting `toolImages` and
   deleting the ticket.
4. Any failure marks the ticket `failed` and queues the object for deletion.

The editor shows a local object URL as soon as a file is picked, before decoding or network work.
HEIC/HEIF is decoded where the browser supports it; unsupported HEIC shows an export-to-JPEG
instruction instead of failing silently.

## Limits

- **6 photos per listing**; pending tickets count toward the cap, so parallel uploads cannot race.
- **4 MB per object** after re-encode. Source files may be up to 25 MB; they are never uploaded raw.
- **JPEG, PNG, WebP or AVIF.** SVG is rejected (executable document); GIF is rejected.
- **Magic-byte check** for PNG, JPEG, WebP and AVIF. A caller cannot bypass the allowlist by lying
  about `Content-Type`.
- Upload tickets expire after **10 minutes**; `maxActiveUploads` (10) bounds live tickets per user.

## Delivery and caching

- URLs are `https://<R2_PUBLIC_HOST>/listing-images/<random>.<ext>`.
- `Cache-Control: public, max-age=86400` is signed into the PUT. Keys are never reused.
- `next/image` optimizes R2-hosted photos per viewport (AVIF/WebP) through `/_next/image` when
  `R2_PUBLIC_HOST` is set; without it the app falls back to unoptimized URLs. R2 remains the origin.
- A deleted object leaves Cloudflare edge caches within the one-day TTL. Immediate revocation would
  need a cache-purge step or private objects with signed GETs.

## Deletion and housekeeping

`convex/media.ts` runs every **15 minutes**:

1. Expire pending tickets whose `expiresAt` has passed and enqueue their objects.
2. Prune failed/expired tickets older than seven days.
3. Drain up to 25 due `storageDeletes` rows with exponential backoff (capped at six hours, eight
   attempts). Exhausted rows become `failed` and stay visible.

Removing a photo or listing never makes a network call inside the mutation. The row disappears
immediately; the object follows shortly after.

## Configuration

Set all five values on the **Convex deployment** (functions cannot read `.env.local`):

```bash
pnpm exec convex env set R2_BUCKET_NAME '<bucket>'
pnpm exec convex env set R2_ACCOUNT_ID '<cloudflare account id>'
pnpm exec convex env set R2_ACCESS_KEY_ID '<object read/write key>'
pnpm exec convex env set R2_SECRET_ACCESS_KEY '<secret>'
pnpm exec convex env set R2_PUBLIC_HOST 'cdn.example.com'
```

The API token needs object read/write only; this app never calls bucket-configuration APIs. The
public custom domain must be enabled in Cloudflare. The Next.js runtime reads `R2_PUBLIC_HOST` only
to allow-list `next/image`; never copy R2 secrets into it.

Verify the deployment:

```bash
pnpm exec convex run media:verifyStorage
# { "putStatus": 200, "contentType": "image/png", "byteSize": 12, "magic": true }
```

This writes a tiny `_healthchecks/` object, exercises presign → PUT → HEAD → ranged GET → DELETE,
and always deletes it.

## Failure modes

| Symptom                           | Likely cause                                         | Action                                                            |
| --------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- |
| "Photo storage is not configured" | one of `R2_*` missing on the deployment              | set the five variables; run `media:verifyStorage`                 |
| Upload route 401                  | Clerk session missing/expired                        | refresh and sign in again                                         |
| Upload route 409/404              | ticket expired, used, or owned by someone else       | start the upload again from My listings                           |
| Upload route 413                  | over 4 MB after re-encode                            | choose a smaller photo                                            |
| "doesn't look like an image"      | content/magic mismatch or corrupted re-encode        | try another file; the object is queued for delete                 |
| Object still exists after removal | cron has not run, or the delete failed               | inspect `storageDeletes`; failed rows carry `lastError` and retry |
| Photo missing but row exists      | public host/bucket misconfigured, or external delete | run `media:verifyStorage`; check the public host                  |

Tests: `convex/toolImages.test.ts`, `convex/media.test.ts`, `tests/r2.test.ts`,
`tests/media-upload-route.test.ts`, `tests/image-upload.test.ts`, `tests/file-selection.test.ts`.
The live R2 test is opt-in: `R2_INTEGRATION=1 pnpm vitest run tests/r2.integration.test.ts`.
