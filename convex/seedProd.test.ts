/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "./_generated/api";
import { SEED_LISTINGS } from "./seedData";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const OWNERS = [
  "owner-a@lendloop.test",
  "owner-b@lendloop.test",
  "owner-c@lendloop.test",
  "owner-d@lendloop.test",
];

async function withOwners(t: ReturnType<typeof convexTest>) {
  for (const [index, email] of OWNERS.entries()) {
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        tokenIdentifier: `test|owner-${index}`,
        clerkId: `seed_owner_${index}`,
        name: `Owner ${index + 1}`,
        email,
        role: "user",
        isTrustedLender: false,
        createdAt: Date.now(),
      });
    });
  }
}

describe("seedProduction", () => {
  test("dry run reports the work without writing anything", async () => {
    const t = convexTest(schema, modules);
    await withOwners(t);

    const result = await t.mutation(internal.seedProd.seedProduction, {
      ownerEmails: OWNERS,
      dryRun: true,
    });

    expect(result.insertedTools).toBe(SEED_LISTINGS.length);
    expect(result.insertedImages).toBe(
      SEED_LISTINGS.reduce((sum, listing) => sum + listing.images.length, 0),
    );

    const tools = await t.run(async (ctx) => ctx.db.query("tools").take(10));
    expect(tools).toHaveLength(0);
  });

  test("inserts every listing once and distributes them across the owners", async () => {
    const t = convexTest(schema, modules);
    await withOwners(t);

    const first = await t.mutation(internal.seedProd.seedProduction, { ownerEmails: OWNERS });
    expect(first.insertedTools).toBe(SEED_LISTINGS.length);
    expect(first.insertedImages).toBe(
      SEED_LISTINGS.reduce((sum, listing) => sum + listing.images.length, 0),
    );
    expect(first.owners.map((owner) => owner.listings)).toEqual([34, 34, 34, 34]);

    const second = await t.mutation(internal.seedProd.seedProduction, { ownerEmails: OWNERS });
    expect(second.insertedTools).toBe(0);
    expect(second.skippedTools).toBe(SEED_LISTINGS.length);

    const tools = await t.run(async (ctx) => ctx.db.query("tools").take(200));
    expect(tools).toHaveLength(SEED_LISTINGS.length);

    // Every listing has at least one photo and the cover is sortOrder 0.
    const sample = SEED_LISTINGS.find((listing) => listing.images.length > 1);
    expect(sample).toBeDefined();
    const stored = await t.run(async (ctx) => {
      const tool = await ctx.db
        .query("tools")
        .withIndex("by_owner")
        .filter((q) => q.eq(q.field("name"), sample!.name))
        .first();
      if (tool === null) return null;
      return await ctx.db
        .query("toolImages")
        .withIndex("by_toolId_and_sortOrder", (q) => q.eq("toolId", tool._id))
        .take(10);
    });
    expect(stored).not.toBeNull();
    expect(stored!.map((image) => image.sortOrder)).toEqual(
      sample!.images.map((_, index) => index),
    );
    expect(stored!.map((image) => image.objectKey)).toEqual(
      sample!.images.map((image) => image.objectKey),
    );
  });

  test("refuses an owner email that does not exist yet", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.seedProd.seedProduction, { ownerEmails: ["missing@lendloop.test"] }),
    ).rejects.toThrow(/No user with email/);
  });

  test("removeProductionSeed deletes the seeded rows", async () => {
    const t = convexTest(schema, modules);
    await withOwners(t);
    await t.mutation(internal.seedProd.seedProduction, { ownerEmails: OWNERS });

    const removed = await t.mutation(internal.seedProd.removeProductionSeed, {
      ownerEmails: OWNERS,
    });
    expect(removed.tools).toBe(SEED_LISTINGS.length);
    expect(removed.objectsQueued).toBe(0);

    const tools = await t.run(async (ctx) => ctx.db.query("tools").take(10));
    expect(tools).toHaveLength(0);
    const images = await t.run(async (ctx) => ctx.db.query("toolImages").take(10));
    expect(images).toHaveLength(0);
  });
});
