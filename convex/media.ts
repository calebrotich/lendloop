/**
 * Storage housekeeping.
 *
 * Deleting an image, or a whole listing, only removes rows in the transaction.
 * The object itself is removed by this cron, which keeps the failure visible in
 * `storageDeletes` and retries with backoff — the same outbox pattern the n8n
 * integration uses. It also expires abandoned upload tickets, so a browser that
 * disappears mid-upload cannot leave a permanent object behind.
 */

import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { enqueueObjectDelete } from "./lib/media";
import { hasImageSignature, IMAGE_CACHE_CONTROL } from "./lib/mediaConstants";
import {
  presignPutObject,
  readR2Credentials,
  r2DeleteObject,
  r2HeadObject,
  r2ReadPrefix,
} from "./lib/r2";

const DELETE_BATCH = 25;
const MAX_DELETE_ATTEMPTS = 8;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;
const TICKET_RETENTION_MS = 7 * 24 * 60 * 60_000;

/** Rows whose retry time has arrived. The caller supplies the clock. */
export const dueDeletes = internalQuery({
  args: { now: v.number(), limit: v.number() },
  returns: v.array(
    v.object({
      _id: v.id("storageDeletes"),
      objectKey: v.string(),
      attempts: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit, DELETE_BATCH));
    const rows = await ctx.db
      .query("storageDeletes")
      .withIndex("by_status_and_nextAttemptAt", (q) =>
        q.eq("status", "pending").lte("nextAttemptAt", args.now),
      )
      .take(limit);

    return rows.map((row) => ({
      _id: row._id,
      objectKey: row.objectKey,
      attempts: row.attempts,
    }));
  },
});

/** Record the outcome of one delete: done, retry later, or give up visibly. */
export const finishDelete = internalMutation({
  args: {
    id: v.id("storageDeletes"),
    ok: v.boolean(),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (row === null) return null;

    const now = Date.now();
    if (args.ok) {
      await ctx.db.delete(row._id);
      return null;
    }

    const attempts = row.attempts + 1;
    if (attempts >= MAX_DELETE_ATTEMPTS) {
      await ctx.db.patch(row._id, {
        status: "failed",
        attempts,
        lastError: args.error?.slice(0, 200),
        updatedAt: now,
      });
      return null;
    }

    const backoff = Math.min(60_000 * 2 ** (attempts - 1), MAX_BACKOFF_MS);
    await ctx.db.patch(row._id, {
      attempts,
      nextAttemptAt: now + backoff,
      lastError: args.error?.slice(0, 200),
      updatedAt: now,
    });
    return null;
  },
});

/**
 * Expire pending tickets and queue their objects for deletion. The object may
 * not exist (the browser never started) — the delete is idempotent, so queue it
 * anyway rather than trying to distinguish the two cases.
 */
export const expireUploads = internalMutation({
  args: { now: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const stale = await ctx.db
      .query("toolImageUploads")
      .withIndex("by_status_and_expiresAt", (q) =>
        q.eq("status", "pending").lte("expiresAt", args.now),
      )
      .take(DELETE_BATCH);

    for (const upload of stale) {
      await ctx.db.patch(upload._id, {
        status: "expired",
        failureReason: "The upload expired before it was confirmed.",
      });
      await enqueueObjectDelete(ctx, upload.objectKey, "upload_expired");
    }

    return stale.length;
  },
});

/** Drop old failed/expired tickets; a confirmed ticket is deleted in its transaction. */
export const pruneTickets = internalMutation({
  args: { now: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const cutoff = args.now - TICKET_RETENTION_MS;
    const old = await ctx.db
      .query("toolImageUploads")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
      .take(100);

    let removed = 0;
    for (const upload of old) {
      if (upload.status === "pending") continue;
      await ctx.db.delete(upload._id);
      removed += 1;
    }
    return removed;
  },
});

/**
 * Cron entry point. Expiration first, then the delete queue, so an object
 * orphaned by an abandoned upload is picked up in the same pass.
 */
export const cleanup = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();

    await ctx.runMutation(internal.media.expireUploads, { now });
    await ctx.runMutation(internal.media.pruneTickets, { now });

    const credentials = readR2Credentials();
    if (credentials === null) {
      // Visible in Convex logs and Sentry; not fatal for the app itself.
      console.error("Media cleanup skipped: R2 credentials are not configured.");
      return null;
    }

    const due = await ctx.runQuery(internal.media.dueDeletes, {
      now,
      limit: DELETE_BATCH,
    });

    for (const row of due) {
      try {
        await r2DeleteObject(row.objectKey, { credentials });
        await ctx.runMutation(internal.media.finishDelete, { id: row._id, ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown storage error";
        console.error(`Could not delete R2 object ${row.objectKey}`, error);
        await ctx.runMutation(internal.media.finishDelete, {
          id: row._id,
          ok: false,
          error: message,
        });
      }
    }

    return null;
  },
});

/** A PNG signature is all the smoke test needs; this object is never displayed. */
const SMOKE_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

function randomSuffix(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Operator smoke test for the storage configuration:
 *
 *   pnpm exec convex run media:verifyStorage
 *
 * It writes a tiny object under `_healthchecks/`, verifies the stored metadata
 * and magic bytes through the same code path as `completeUpload`, then deletes
 * it. Internal-only; never callable from a client.
 */
export const verifyStorage = internalAction({
  args: {},
  returns: v.object({
    putStatus: v.number(),
    contentType: v.string(),
    byteSize: v.number(),
    magic: v.boolean(),
  }),
  handler: async () => {
    const key = `_healthchecks/convex-${Date.now()}-${randomSuffix()}.png`;
    const presigned = await presignPutObject({
      key,
      contentType: "image/png",
      cacheControl: IMAGE_CACHE_CONTROL,
    });

    try {
      const put = await fetch(presigned.url, {
        method: "PUT",
        headers: presigned.headers,
        body: SMOKE_PNG,
      });
      if (!put.ok) throw new Error(`Signed PUT failed with status ${put.status}.`);

      const stored = await r2HeadObject(key);
      if (stored === null) throw new Error("The uploaded object was not found by HEAD.");

      const prefix = await r2ReadPrefix(key, 32);
      const magic = hasImageSignature("image/png", prefix);
      if (!magic) throw new Error("The ranged GET did not return the expected image bytes.");

      return {
        putStatus: put.status,
        contentType: stored.contentType,
        byteSize: stored.byteSize,
        magic,
      };
    } finally {
      await r2DeleteObject(key).catch((error: unknown) => {
        console.error("Storage smoke test could not delete its object", error);
      });
    }
  },
});
