/**
 * Helpers shared by the listing and image functions.
 *
 * Image rows are only ever read through these helpers, so the public URL is
 * derived in one place and the read is always bounded by `maxImagesPerTool`.
 */

import { v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { LIMITS } from "./limits";
import { IMAGE_EXTENSIONS, type ImageContentType } from "./mediaConstants";
import { buildPublicUrl, readPublicHost } from "./r2";

type ReadCtx = QueryCtx | MutationCtx;

const coverValidator = v.union(
  v.null(),
  v.object({
    url: v.string(),
    width: v.number(),
    height: v.number(),
  }),
);

/** What a list view needs: a cover image and a count, not every row. */
export const imageSummaryValidator = v.object({
  imageCount: v.number(),
  cover: coverValidator,
});

/** What the gallery and the owner's editor need: every image, ordered. */
export const imageValidator = v.object({
  _id: v.id("toolImages"),
  url: v.union(v.string(), v.null()),
  width: v.number(),
  height: v.number(),
  contentType: v.string(),
  sortOrder: v.number(),
});

interface ImageSummary {
  imageCount: number;
  cover: { url: string; width: number; height: number } | null;
}

function imageRows(ctx: ReadCtx, toolId: Id<"tools">) {
  return ctx.db
    .query("toolImages")
    .withIndex("by_toolId_and_sortOrder", (q) => q.eq("toolId", toolId))
    .take(LIMITS.maxImagesPerTool + 1);
}

function publicUrl(objectKey: string, publicHost: string | null): string | null {
  return publicHost === null ? null : buildPublicUrl(publicHost, objectKey);
}

function summariseImages(
  rows: Array<Pick<Doc<"toolImages">, "objectKey" | "width" | "height">>,
  publicHost: string | null,
): ImageSummary {
  const first = rows[0];
  const url = first === undefined ? null : publicUrl(first.objectKey, publicHost);

  return {
    imageCount: rows.length,
    cover:
      first === undefined || url === null
        ? null
        : { url, width: first.width, height: first.height },
  };
}

export async function imageSummaryForTool(
  ctx: ReadCtx,
  toolId: Id<"tools">,
): Promise<ImageSummary> {
  return summariseImages(await imageRows(ctx, toolId), readPublicHost());
}

export async function listImagesForTool(ctx: ReadCtx, toolId: Id<"tools">) {
  const host = readPublicHost();
  const rows = await imageRows(ctx, toolId);
  return rows.map((row) => ({
    _id: row._id,
    url: publicUrl(row.objectKey, host),
    width: row.width,
    height: row.height,
    contentType: row.contentType,
    sortOrder: row.sortOrder,
  }));
}

function randomHex(bytes: number): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
}

/**
 * `listing-images/<128-bit random>.<ext>`.
 *
 * Deliberately does not include the tool id: the key is embedded in the public
 * image URL, and the public projection deliberately withholds `_id`. The random
 * part makes the object unguessable even though the bucket is publicly readable.
 * The extension is cosmetic — R2 serves the stored Content-Type — but keeps
 * URLs legible. The `toolImages` row is the authoritative listing association.
 */
export function newObjectKey(contentType: ImageContentType): string {
  return `listing-images/${randomHex(16)}.${IMAGE_EXTENSIONS[contentType]}`;
}

/**
 * Enqueue an R2 delete for the cron. Deduplicated by key so removing an image
 * and then its listing does not queue the same object twice. A previously
 * failed delete is retried from scratch when the key is enqueued again.
 */
export async function enqueueObjectDelete(
  ctx: MutationCtx,
  objectKey: string,
  reason: string,
): Promise<void> {
  const now = Date.now();
  const existing = await ctx.db
    .query("storageDeletes")
    .withIndex("by_objectKey", (q) => q.eq("objectKey", objectKey))
    .first();

  if (existing !== null) {
    if (existing.status === "pending") return;
    await ctx.db.patch(existing._id, {
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("storageDeletes", {
    objectKey,
    reason,
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Remove every trace of a listing's media: ready images lose their rows and
 * are queued for deletion; in-flight uploads are failed so a late completion
 * cannot attach a photo to a removed listing.
 */
export async function discardToolImages(ctx: MutationCtx, toolId: Id<"tools">): Promise<void> {
  const images = await ctx.db
    .query("toolImages")
    .withIndex("by_toolId_and_sortOrder", (q) => q.eq("toolId", toolId))
    .take(LIMITS.maxImagesPerTool + 1);

  for (const image of images) {
    await enqueueObjectDelete(ctx, image.objectKey, "listing_removed");
    await ctx.db.delete(image._id);
  }

  const uploads = await ctx.db
    .query("toolImageUploads")
    .withIndex("by_toolId_and_status", (q) => q.eq("toolId", toolId).eq("status", "pending"))
    .take(LIMITS.maxActiveUploads + 1);

  for (const upload of uploads) {
    await ctx.db.patch(upload._id, {
      status: "failed",
      failureReason: "The listing was removed.",
    });
    await enqueueObjectDelete(ctx, upload.objectKey, "listing_removed");
  }
}
