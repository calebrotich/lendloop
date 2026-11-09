import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { DAY_MS } from "./lib/dates";
import { enqueueObjectDelete } from "./lib/media";
import { SEED_LISTINGS } from "./seedData";

/**
 * Production seed: real-looking listings owned by the deployment's real users.
 *
 * Operator action, never client-callable:
 *   pnpm exec convex run seedProd:seedProduction \
 *     '{"ownerEmails":["a@example.com","b@example.com","c@example.com","d@example.com"]}'
 *
 * Idempotent by (owner, exact name): a second run inserts nothing new, and
 * repairs a listing that somehow lost its photo rows. The whole batch is one
 * transaction, so a failure leaves the database untouched.
 *
 * Photos are uploaded to R2 by scripts/seed/upload-r2.mjs beforehand; this
 * mutation only writes the metadata rows that point at them.
 */
export const seedProduction = internalMutation({
  args: {
    ownerEmails: v.array(v.string()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    owners: v.array(v.object({ email: v.string(), name: v.string(), listings: v.number() })),
    insertedTools: v.number(),
    skippedTools: v.number(),
    insertedImages: v.number(),
    dryRun: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (args.ownerEmails.length === 0) {
      throw new Error("Pass at least one owner email.");
    }

    const owners: Array<Doc<"users">> = [];
    for (const rawEmail of args.ownerEmails) {
      const email = rawEmail.trim().toLowerCase();
      const user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();
      if (user === null) {
        throw new Error(
          `No user with email ${email}. That account must sign in once, or be created before seeding.`,
        );
      }
      owners.push(user);
    }

    // One read per owner instead of one per listing: the whole name set is
    // checked in memory, which keeps the transaction well inside its limits.
    const existingByOwner = new Map<Id<"users">, Map<string, Doc<"tools">>>();
    for (const owner of owners) {
      const rows = await ctx.db
        .query("tools")
        .withIndex("by_owner", (q) => q.eq("ownerId", owner._id))
        .take(200);
      existingByOwner.set(owner._id, new Map(rows.map((row) => [row.name, row])));
    }

    const now = Date.now();
    let insertedTools = 0;
    let skippedTools = 0;
    let insertedImages = 0;
    const perOwner = owners.map((owner) => ({
      email: owner.email,
      name: owner.name,
      listings: 0,
    }));

    for (const [index, listing] of SEED_LISTINGS.entries()) {
      const ownerIndex = (listing.ownerSlot + 0) % owners.length;
      const owner = owners[ownerIndex];
      if (owner === undefined) continue;

      const existing = existingByOwner.get(owner._id)?.get(listing.name);
      let toolId: Id<"tools">;

      if (existing !== undefined) {
        skippedTools += 1;
        perOwner[ownerIndex]!.listings += 1;
        toolId = existing._id;

        // Repair path: an existing listing with no photos gets its photos back.
        const current = await ctx.db
          .query("toolImages")
          .withIndex("by_toolId_and_sortOrder", (q) => q.eq("toolId", existing._id))
          .take(1);
        if (current.length > 0) continue;
      } else {
        // Spread the "listed N days ago" line over the last five months while
        // keeping every timestamp distinct.
        const createdAt =
          now -
          listing.listedDaysAgo * DAY_MS +
          (index % 24) * 60 * 60 * 1000 +
          (index % 59) * 60 * 1000;

        if (args.dryRun === true) {
          insertedTools += 1;
          insertedImages += listing.images.length;
          perOwner[ownerIndex]!.listings += 1;
          continue;
        }

        toolId = await ctx.db.insert("tools", {
          ownerId: owner._id,
          name: listing.name,
          category: listing.category,
          condition: listing.condition,
          description: listing.description,
          status: listing.status,
          valueCents: listing.valueCents,
          dailyRateCents: listing.dailyRateCents,
          createdAt,
          updatedAt: createdAt,
        });
        insertedTools += 1;
        perOwner[ownerIndex]!.listings += 1;
      }

      if (args.dryRun === true) {
        insertedImages += listing.images.length;
        continue;
      }

      for (const [sortOrder, image] of listing.images.entries()) {
        await ctx.db.insert("toolImages", {
          toolId,
          ownerId: owner._id,
          objectKey: image.objectKey,
          contentType: image.contentType,
          byteSize: image.byteSize,
          width: image.width,
          height: image.height,
          sortOrder,
          createdAt: now,
        });
        insertedImages += 1;
      }
    }

    return {
      owners: perOwner,
      insertedTools,
      skippedTools,
      insertedImages,
      dryRun: args.dryRun === true,
    };
  },
});

/**
 * Remove the seeded listings again. Rows are always deleted; the R2 objects are
 * only queued when `deleteObjects` is true, because the bucket is shared with
 * the dev deployment and an object may be in use there.
 */
export const removeProductionSeed = internalMutation({
  args: {
    ownerEmails: v.array(v.string()),
    deleteObjects: v.optional(v.boolean()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({ tools: v.number(), images: v.number(), objectsQueued: v.number() }),
  handler: async (ctx, args) => {
    const names = new Set(SEED_LISTINGS.map((listing) => listing.name));
    let tools = 0;
    let images = 0;
    let objectsQueued = 0;

    for (const rawEmail of args.ownerEmails) {
      const email = rawEmail.trim().toLowerCase();
      const owner = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();
      if (owner === null) continue;

      const rows = await ctx.db
        .query("tools")
        .withIndex("by_owner", (q) => q.eq("ownerId", owner._id))
        .take(200);

      for (const tool of rows) {
        if (!names.has(tool.name)) continue;
        tools += 1;

        const photos = await ctx.db
          .query("toolImages")
          .withIndex("by_toolId_and_sortOrder", (q) => q.eq("toolId", tool._id))
          .take(10);
        for (const photo of photos) {
          images += 1;
          if (args.dryRun !== true) {
            await ctx.db.delete(photo._id);
            if (args.deleteObjects === true) {
              await enqueueObjectDelete(ctx, photo.objectKey, "seed_removed");
              objectsQueued += 1;
            }
          }
        }

        if (args.dryRun !== true) await ctx.db.delete(tool._id);
      }
    }

    return { tools, images, objectsQueued };
  },
});
