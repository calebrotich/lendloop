import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { requireOwnedTool, requireUser } from "./lib/authz";
import { imageUploadStatusValidator, type ImageUploadStatus } from "./lib/constants";
import { appError } from "./lib/errors";
import { LIMITS } from "./lib/limits";
import {
  hasImageSignature,
  IMAGE_CACHE_CONTROL,
  isImageContentType,
  type ImageContentType,
} from "./lib/mediaConstants";
import { enqueueObjectDelete, imageValidator, listImagesForTool, newObjectKey } from "./lib/media";
import {
  PRESIGN_TTL_SECONDS,
  presignPutObject,
  R2NotConfiguredError,
  readR2Credentials,
  r2HeadObject,
  r2ReadPrefix,
} from "./lib/r2";

/** Dimensions are metadata for layout; still bounded so a bad client cannot store nonsense. */
const MAX_DIMENSION = 20_000;

const uploadTargetValidator = v.object({
  url: v.string(),
  // Header names contain hyphens, which are not valid Convex object keys.
  headers: v.array(v.object({ name: v.string(), value: v.string() })),
  contentType: v.string(),
  byteSize: v.number(),
  expiresAt: v.number(),
});

const uploadForOwnerValidator = v.object({
  _id: v.id("toolImageUploads"),
  toolId: v.id("tools"),
  objectKey: v.string(),
  contentType: v.string(),
  byteSize: v.number(),
  width: v.number(),
  height: v.number(),
  status: imageUploadStatusValidator,
  expiresAt: v.number(),
});

type UploadForOwner = {
  _id: Id<"toolImageUploads">;
  toolId: Id<"tools">;
  objectKey: string;
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
  status: ImageUploadStatus;
  expiresAt: number;
};

function assertImageDetails(args: {
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
}): asserts args is {
  contentType: ImageContentType;
  byteSize: number;
  width: number;
  height: number;
} {
  if (!isImageContentType(args.contentType)) {
    appError("VALIDATION", "Use a JPEG, PNG, WebP or AVIF image.");
  }
  if (
    !Number.isInteger(args.byteSize) ||
    args.byteSize < 1 ||
    args.byteSize > LIMITS.maxImageBytes
  ) {
    appError(
      "VALIDATION",
      `Each photo must be between 1 byte and ${Math.floor(LIMITS.maxImageBytes / 1024 / 1024)} MB.`,
    );
  }
  if (
    !Number.isInteger(args.width) ||
    !Number.isInteger(args.height) ||
    args.width < 1 ||
    args.height < 1 ||
    args.width > MAX_DIMENSION ||
    args.height > MAX_DIMENSION
  ) {
    appError("VALIDATION", "That image has invalid dimensions.");
  }
}

function storageUnavailable(): never {
  appError(
    "UNAVAILABLE",
    "Photo storage is not configured on this deployment. Ask an operator to set the R2_* variables.",
  );
}

/** Every image on a live listing, ordered cover-first. Any signed-in neighbour may view. */
export const listForTool = query({
  args: { toolId: v.id("tools") },
  returns: v.array(imageValidator),
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (tool === null || tool.removedAt !== undefined) {
      appError("NOT_FOUND", "That listing no longer exists.");
    }
    return await listImagesForTool(ctx, args.toolId);
  },
});

/**
 * Reserve one image slot and return the ticket id.
 *
 * No bytes move yet. The proxy asks for a presigned PUT with `prepareUpload`,
 * and only `completeUpload` (after a server-side check of the stored object)
 * turns the ticket into a visible image. Counting live pending tickets here is
 * what stops a burst of parallel uploads from racing past the per-listing cap.
 */
export const createUploadTicket = mutation({
  args: {
    toolId: v.id("tools"),
    contentType: v.string(),
    byteSize: v.number(),
    width: v.number(),
    height: v.number(),
  },
  returns: v.object({
    uploadId: v.id("toolImageUploads"),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const { user, tool } = await requireOwnedTool(ctx, args.toolId);
    assertImageDetails(args);

    if (readR2Credentials() === null) storageUnavailable();

    const now = Date.now();
    const images = await ctx.db
      .query("toolImages")
      .withIndex("by_toolId_and_sortOrder", (q) => q.eq("toolId", tool._id))
      .take(LIMITS.maxImagesPerTool + 1);

    const pending = await ctx.db
      .query("toolImageUploads")
      .withIndex("by_toolId_and_status", (q) => q.eq("toolId", tool._id).eq("status", "pending"))
      .take(LIMITS.maxImagesPerTool + 2);
    const livePending = pending.filter((upload) => upload.expiresAt > now).length;

    if (images.length + livePending >= LIMITS.maxImagesPerTool) {
      appError("VALIDATION", `You can add up to ${LIMITS.maxImagesPerTool} photos per listing.`);
    }

    const active = await ctx.db
      .query("toolImageUploads")
      .withIndex("by_ownerId_and_status", (q) => q.eq("ownerId", user._id).eq("status", "pending"))
      .take(LIMITS.maxActiveUploads + 2);
    const liveActive = active.filter((upload) => upload.expiresAt > now).length;
    if (liveActive >= LIMITS.maxActiveUploads) {
      appError("VALIDATION", "Too many uploads are in progress. Wait a moment and try again.");
    }

    const expiresAt = now + LIMITS.uploadTicketSeconds * 1000;
    const uploadId = await ctx.db.insert("toolImageUploads", {
      toolId: tool._id,
      ownerId: user._id,
      objectKey: newObjectKey(args.contentType),
      contentType: args.contentType,
      byteSize: args.byteSize,
      width: args.width,
      height: args.height,
      status: "pending",
      createdAt: now,
      expiresAt,
    });

    return { uploadId, expiresAt };
  },
});

/**
 * Load an upload ticket for the caller. Internal because it returns the object
 * key and is only ever reached from an action that already proved identity.
 */
export const getUploadForOwner = internalQuery({
  args: { uploadId: v.id("toolImageUploads") },
  returns: uploadForOwnerValidator,
  handler: async (ctx, args): Promise<UploadForOwner> => {
    const user = await requireUser(ctx);
    const upload = await ctx.db.get(args.uploadId);

    if (upload === null) {
      appError("NOT_FOUND", "That upload link no longer exists.");
    }
    if (upload.ownerId !== user._id) {
      appError("FORBIDDEN", "That upload isn't yours.");
    }

    const tool = await ctx.db.get(upload.toolId);
    if (tool === null || tool.removedAt !== undefined) {
      appError("NOT_FOUND", "That listing no longer exists.");
    }

    return {
      _id: upload._id,
      toolId: upload.toolId,
      objectKey: upload.objectKey,
      contentType: upload.contentType,
      byteSize: upload.byteSize,
      width: upload.width,
      height: upload.height,
      status: upload.status,
      expiresAt: upload.expiresAt,
    };
  },
});

/**
 * Mint the short-lived presigned PUT for the authenticated owner.
 *
 * This is an action rather than a query because it reads the clock and returns
 * a time-bounded signature. The Next.js upload route calls it with the caller's
 * Clerk token; the browser never receives R2 credentials.
 */
export const prepareUpload = action({
  args: { uploadId: v.id("toolImageUploads") },
  returns: uploadTargetValidator,
  handler: async (
    ctx,
    args,
  ): Promise<{
    url: string;
    headers: Array<{ name: string; value: string }>;
    contentType: string;
    byteSize: number;
    expiresAt: number;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) appError("UNAUTHORIZED", "Sign in to continue.");

    const upload: UploadForOwner = await ctx.runQuery(internal.toolImages.getUploadForOwner, {
      uploadId: args.uploadId,
    });

    if (upload.status !== "pending") {
      appError("CONFLICT", "That upload link has already been used.");
    }
    if (upload.expiresAt <= Date.now()) {
      appError("CONFLICT", "That upload link expired. Try again.");
    }

    try {
      const presigned = await presignPutObject({
        key: upload.objectKey,
        contentType: upload.contentType,
        cacheControl: IMAGE_CACHE_CONTROL,
        expiresInSeconds: PRESIGN_TTL_SECONDS,
      });

      return {
        url: presigned.url,
        headers: Object.entries(presigned.headers).map(([name, value]) => ({ name, value })),
        contentType: upload.contentType,
        byteSize: upload.byteSize,
        expiresAt: upload.expiresAt,
      };
    } catch (error) {
      if (error instanceof R2NotConfiguredError) storageUnavailable();
      throw error;
    }
  },
});

class UploadRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadRejected";
  }
}

/**
 * Verify the object R2 actually stored, then publish it.
 *
 * The proxy can only say "the PUT returned 200". This action checks the truth:
 * the object exists, its size and content type match the ticket, and its first
 * bytes match the declared image format. Only then does a `toolImages` row
 * appear. Any failure marks the ticket failed and queues the object for delete.
 */
export const completeUpload = action({
  args: { uploadId: v.id("toolImageUploads") },
  returns: v.id("toolImages"),
  handler: async (ctx, args): Promise<Id<"toolImages">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) appError("UNAUTHORIZED", "Sign in to continue.");

    const upload: UploadForOwner = await ctx.runQuery(internal.toolImages.getUploadForOwner, {
      uploadId: args.uploadId,
    });

    if (upload.status !== "pending") {
      appError("CONFLICT", "That upload has already been completed.");
    }
    if (upload.expiresAt <= Date.now()) {
      appError("CONFLICT", "That upload expired before it was confirmed. Try again.");
    }

    const credentials = readR2Credentials();
    if (credentials === null) storageUnavailable();

    try {
      const stored = await r2HeadObject(upload.objectKey, { credentials });
      if (stored === null) {
        throw new UploadRejected("The upload didn't reach storage. Try again.");
      }
      if (stored.contentType !== upload.contentType) {
        throw new UploadRejected("The file type changed during upload. Try again.");
      }
      if (stored.byteSize !== upload.byteSize) {
        throw new UploadRejected("The file size changed during upload. Try again.");
      }
      if (stored.byteSize < 1 || stored.byteSize > LIMITS.maxImageBytes) {
        throw new UploadRejected("That photo is too large.");
      }

      const prefix = await r2ReadPrefix(upload.objectKey, 32, { credentials });
      if (!hasImageSignature(upload.contentType, prefix)) {
        throw new UploadRejected("That file doesn't look like an image. Try another photo.");
      }

      return await ctx.runMutation(internal.toolImages.confirmUpload, {
        uploadId: args.uploadId,
        contentType: upload.contentType,
        byteSize: stored.byteSize,
      });
    } catch (error) {
      await ctx
        .runMutation(internal.toolImages.failUpload, {
          uploadId: args.uploadId,
          reason: error instanceof UploadRejected ? error.message : "Verification failed.",
        })
        .catch((cleanupError: unknown) => {
          console.error("Could not mark a failed image upload", cleanupError);
        });

      if (error instanceof ConvexError) throw error;
      console.error("Image upload verification failed", error);
      appError(
        "VALIDATION",
        error instanceof UploadRejected
          ? error.message
          : "We couldn't verify that photo. Try again.",
      );
    }
  },
});

/**
 * Turn a verified ticket into a visible image.
 *
 * Re-checks ownership, ticket state and the per-listing cap inside the
 * transaction; the action's external checks can be stale by the time this runs.
 */
export const confirmUpload = internalMutation({
  args: {
    uploadId: v.id("toolImageUploads"),
    contentType: v.string(),
    byteSize: v.number(),
  },
  returns: v.id("toolImages"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const upload = await ctx.db.get(args.uploadId);

    if (upload === null || upload.ownerId !== user._id) {
      appError("NOT_FOUND", "That upload no longer exists.");
    }
    if (upload.status !== "pending") {
      appError("CONFLICT", "That upload has already been completed.");
    }

    const now = Date.now();
    if (upload.expiresAt <= now) {
      appError("CONFLICT", "That upload expired before it was confirmed. Try again.");
    }

    const tool = await ctx.db.get(upload.toolId);
    if (tool === null || tool.removedAt !== undefined) {
      appError("NOT_FOUND", "That listing no longer exists.");
    }
    if (tool.ownerId !== user._id) {
      appError("FORBIDDEN", "You can only add photos to your own listings.");
    }

    assertImageDetails({
      contentType: args.contentType,
      byteSize: args.byteSize,
      width: upload.width,
      height: upload.height,
    });

    const images = await ctx.db
      .query("toolImages")
      .withIndex("by_toolId_and_sortOrder", (q) => q.eq("toolId", tool._id))
      .take(LIMITS.maxImagesPerTool + 1);
    if (images.length >= LIMITS.maxImagesPerTool) {
      appError("VALIDATION", `You can add up to ${LIMITS.maxImagesPerTool} photos per listing.`);
    }

    const last = images.at(-1);
    const imageId = await ctx.db.insert("toolImages", {
      toolId: tool._id,
      ownerId: user._id,
      objectKey: upload.objectKey,
      contentType: args.contentType,
      byteSize: args.byteSize,
      width: upload.width,
      height: upload.height,
      sortOrder: last === undefined ? 0 : last.sortOrder + 1,
      createdAt: now,
    });

    // The ticket has served its purpose; pruning it keeps the table small.
    await ctx.db.delete(upload._id);
    return imageId;
  },
});

/** Mark a ticket failed and queue its object for deletion. Internal-only. */
export const failUpload = internalMutation({
  args: { uploadId: v.id("toolImageUploads"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (upload === null || upload.status !== "pending") return null;

    await ctx.db.patch(upload._id, {
      status: "failed",
      failureReason: args.reason.slice(0, 200),
    });
    await enqueueObjectDelete(ctx, upload.objectKey, "upload_failed");
    return null;
  },
});

/** Owner-initiated cancel, used by the browser when the upload proxy fails. */
export const abandonUpload = mutation({
  args: { uploadId: v.id("toolImageUploads") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const upload = await ctx.db.get(args.uploadId);

    if (upload === null || upload.ownerId !== user._id) {
      appError("NOT_FOUND", "That upload no longer exists.");
    }
    if (upload.status !== "pending") return null;

    await ctx.db.patch(upload._id, {
      status: "failed",
      failureReason: "Cancelled by the owner.",
    });
    await enqueueObjectDelete(ctx, upload.objectKey, "upload_cancelled");
    return null;
  },
});

async function requireOwnedImage(ctx: MutationCtx, imageId: Id<"toolImages">) {
  const user = await requireUser(ctx);
  const image = await ctx.db.get(imageId);

  if (image === null) appError("NOT_FOUND", "That photo no longer exists.");
  if (image.ownerId !== user._id) {
    appError("FORBIDDEN", "You can only change photos on your own listings.");
  }

  const tool = await ctx.db.get(image.toolId);
  if (tool === null || tool.removedAt !== undefined) {
    appError("NOT_FOUND", "That listing no longer exists.");
  }
  if (tool.ownerId !== user._id) {
    appError("FORBIDDEN", "You can only change photos on your own listings.");
  }

  return { image, tool };
}

/** Remove one photo. The row disappears now; the object is deleted by cron. */
export const removeImage = mutation({
  args: { imageId: v.id("toolImages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { image } = await requireOwnedImage(ctx, args.imageId);
    await ctx.db.delete(image._id);
    await enqueueObjectDelete(ctx, image.objectKey, "image_removed");
    return null;
  },
});

/** Promote one photo to the cover by making it first in the sort order. */
export const setCover = mutation({
  args: { imageId: v.id("toolImages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { image, tool } = await requireOwnedImage(ctx, args.imageId);

    const images = await ctx.db
      .query("toolImages")
      .withIndex("by_toolId_and_sortOrder", (q) => q.eq("toolId", tool._id))
      .take(LIMITS.maxImagesPerTool + 1);

    const ordered = [image, ...images.filter((row) => row._id !== image._id)];
    for (const [index, row] of ordered.entries()) {
      if (row.sortOrder !== index) {
        await ctx.db.patch(row._id, { sortOrder: index });
      }
    }
    return null;
  },
});
