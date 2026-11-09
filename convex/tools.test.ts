/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import type { UserIdentity } from "convex/server";
import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// Image summaries derive their URL from R2_PUBLIC_HOST. The test VM has no
// process env, so stub the one variable the read path needs.
const runtime = globalThis as { process?: { env?: Record<string, string | undefined> } };
runtime.process ??= { env: {} };
runtime.process.env ??= {};
runtime.process.env.R2_PUBLIC_HOST = "https://cdn.example.test";

const ISSUER = "https://clerk.example.test";

function identity(token: string, email: string): Partial<UserIdentity> {
  return {
    tokenIdentifier: `${ISSUER}|${token}`,
    subject: token,
    issuer: ISSUER,
    name: token,
    email,
  };
}

type Tester = TestConvex<typeof schema>;

/** Insert the `users` row that sign-in would have provisioned. */
async function provision(t: Tester, token: string, email: string) {
  const id = await t.run(
    async (ctx) =>
      await ctx.db.insert("users", {
        tokenIdentifier: `${ISSUER}|${token}`,
        clerkId: token,
        name: token,
        email,
        role: "user",
        isTrustedLender: false,
        createdAt: 1_700_000_000_000,
      }),
  );
  return { id, as: t.withIdentity(identity(token, email)) };
}

async function insertTool(
  t: Tester,
  ownerId: Id<"users">,
  overrides: Partial<{
    name: string;
    status: "available" | "unavailable";
    removedAt: number;
    createdAt: number;
    valueCents: number;
    dailyRateCents: number;
  }> = {},
) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("tools", {
        ownerId,
        name: overrides.name ?? "Cordless drill",
        category: "power_tools",
        condition: "good",
        description: "18V with two batteries.",
        status: overrides.status ?? "available",
        valueCents: overrides.valueCents,
        dailyRateCents: overrides.dailyRateCents,
        removedAt: overrides.removedAt,
        createdAt: overrides.createdAt ?? 1_700_000_000_000,
        updatedAt: overrides.createdAt ?? 1_700_000_000_000,
      }),
  );
}

async function insertLoan(
  t: Tester,
  toolId: Id<"tools">,
  ownerId: Id<"users">,
  overrides: Partial<{ status: "pending" | "approved"; startDate: number; endDate: number }> = {},
) {
  const borrower = await provision(t, "user_borrower", "borrower@example.test");
  const now = Date.now();
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("loanRequests", {
        toolId,
        ownerId,
        borrowerId: borrower.id,
        startDate: overrides.startDate ?? now - 86_400_000,
        endDate: overrides.endDate ?? now + 86_400_000,
        status: overrides.status ?? "approved",
        createdAt: now,
      }),
  );
}

async function capturedError(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

function codeOf(error: unknown): string | undefined {
  if (error instanceof ConvexError) {
    return (error.data as { code?: string } | undefined)?.code;
  }
  return undefined;
}

describe("tools.listPublic", () => {
  it("returns only name, category and a photo summary", async () => {
    const t = convexTest(schema, modules);
    const { id } = await provision(t, "owner_1", "owner@example.test");
    await insertTool(t, id);

    const shelf = await t.query(api.tools.listPublic, {});

    expect(shelf).toHaveLength(1);
    expect(Object.keys(shelf[0] ?? {}).sort()).toEqual(["category", "images", "name"]);
    expect(shelf[0]).toEqual({
      name: "Cordless drill",
      category: "power_tools",
      images: { imageCount: 0, cover: null },
    });
  });

  it("exposes a cover URL but never an owner, description or condition", async () => {
    const t = convexTest(schema, modules);
    const { id } = await provision(t, "owner_1", "owner@example.test");
    const toolId = await insertTool(t, id);
    await t.run(
      async (ctx) =>
        await ctx.db.insert("toolImages", {
          toolId,
          ownerId: id,
          objectKey: "tools/cover.webp",
          contentType: "image/webp",
          byteSize: 1_024,
          width: 800,
          height: 600,
          sortOrder: 0,
          createdAt: 1_700_000_000_000,
        }),
    );

    const shelf = await t.query(api.tools.listPublic, {});

    expect(Object.keys(shelf[0] ?? {}).sort()).toEqual(["category", "images", "name"]);
    expect(shelf[0]?.images.imageCount).toBe(1);
    expect(shelf[0]?.images.cover).toEqual({
      url: "https://cdn.example.test/tools/cover.webp",
      width: 800,
      height: 600,
    });
  });

  it("is readable by anonymous callers", async () => {
    const t = convexTest(schema, modules);
    const { id } = await provision(t, "owner_1", "owner@example.test");
    await insertTool(t, id);

    await expect(t.query(api.tools.listPublic, {})).resolves.toHaveLength(1);
  });

  it("hides removed, paused and currently-on-loan listings", async () => {
    const t = convexTest(schema, modules);
    const { id } = await provision(t, "owner_1", "owner@example.test");
    await insertTool(t, id, { name: "Still here" });
    await insertTool(t, id, { name: "Gone", removedAt: 1_700_000_000_100 });
    await insertTool(t, id, { name: "Packed away", status: "unavailable" });
    const onLoan = await insertTool(t, id, { name: "On loan" });
    await insertLoan(t, onLoan, id);

    const shelf = await t.query(api.tools.listPublic, {});

    expect(shelf.map((tool) => tool.name)).toEqual(["Still here"]);
  });
});

describe("tools.listShowcase", () => {
  it("is anonymous, bounded to the public fields and never leaks identity", async () => {
    const t = convexTest(schema, modules);
    const { id } = await provision(t, "owner_1", "owner@example.test");
    await t.run(
      async (ctx) => await ctx.db.patch(id, { name: "Caleb Rotich", isTrustedLender: true }),
    );
    await insertTool(t, id);

    const shelf = await t.query(api.tools.listShowcase, {});

    expect(shelf).toHaveLength(1);
    expect(Object.keys(shelf[0] ?? {}).sort()).toEqual([
      "_id",
      "availability",
      "busyUntil",
      "category",
      "condition",
      "createdAt",
      "dailyRateCents",
      "description",
      "images",
      "name",
      "ownerTrusted",
    ]);
    expect(shelf[0]).toMatchObject({
      name: "Cordless drill",
      condition: "good",
      description: "18V with two batteries.",
      ownerTrusted: true,
      availability: "available",
      busyUntil: null,
    });
    // The shelf advertises trust, never the person behind the listing.
    expect(JSON.stringify(shelf)).not.toContain("owner@example.test");
    expect(JSON.stringify(shelf)).not.toContain("Caleb");
  });

  it("keeps paused and on-loan listings, with derived availability", async () => {
    const t = convexTest(schema, modules);
    const { id } = await provision(t, "owner_1", "owner@example.test");
    await insertTool(t, id, { name: "Available" });
    await insertTool(t, id, { name: "Paused", status: "unavailable" });
    const onLoan = await insertTool(t, id, { name: "On loan" });
    await insertLoan(t, onLoan, id);

    const shelf = await t.query(api.tools.listShowcase, {});
    const byName = new Map(shelf.map((tool) => [tool.name, tool]));

    expect(byName.get("Available")?.availability).toBe("available");
    expect(byName.get("Paused")?.availability).toBe("paused");
    expect(byName.get("On loan")?.availability).toBe("on_loan");
    expect(byName.get("On loan")?.busyUntil).toBeTypeOf("number");
  });

  it("hides removed listings and sorts newest first", async () => {
    const t = convexTest(schema, modules);
    const { id } = await provision(t, "owner_1", "owner@example.test");
    await insertTool(t, id, { name: "Older", createdAt: 1_700_000_000_000 });
    await insertTool(t, id, { name: "Newer", createdAt: 1_700_000_100_000 });
    await insertTool(t, id, { name: "Removed", removedAt: 1_700_000_200_000 });

    const shelf = await t.query(api.tools.listShowcase, {});

    expect(shelf.map((tool) => tool.name)).toEqual(["Newer", "Older"]);
  });
});

describe("tools.getPublicListing", () => {
  it("returns a public detail with the full gallery, ordered", async () => {
    const t = convexTest(schema, modules);
    const { id } = await provision(t, "owner_1", "owner@example.test");
    const toolId = await insertTool(t, id);
    await t.run(async (ctx) => {
      for (const [sortOrder, objectKey] of [
        [1, "tools/second.webp"],
        [0, "tools/first.webp"],
      ] as const) {
        await ctx.db.insert("toolImages", {
          toolId,
          ownerId: id,
          objectKey,
          contentType: "image/webp",
          byteSize: 1_024,
          width: 800,
          height: 600,
          sortOrder,
          createdAt: 1_700_000_000_000,
        });
      }
    });

    const listing = await t.query(api.tools.getPublicListing, { toolId });

    expect(listing?.name).toBe("Cordless drill");
    expect(listing === null || "ownerName" in listing).toBe(false);
    expect(listing?.images.map((image) => image.url)).toEqual([
      "https://cdn.example.test/tools/first.webp",
      "https://cdn.example.test/tools/second.webp",
    ]);
    expect(JSON.stringify(listing)).not.toContain("owner@example.test");
  });

  it("exposes future pending and approved ranges, merged, but no other statuses", async () => {
    const t = convexTest(schema, modules);
    const { id } = await provision(t, "owner_1", "owner@example.test");
    const borrower = await provision(t, "borrower_1", "borrower@example.test");
    const toolId = await insertTool(t, id);
    const today = Math.floor(Date.now() / 86_400_000) * 86_400_000;
    const day = 86_400_000;

    const loans = [
      { status: "pending" as const, start: today + 2 * day, end: today + 4 * day },
      { status: "approved" as const, start: today + 4 * day, end: today + 6 * day },
      { status: "declined" as const, start: today + 8 * day, end: today + 10 * day },
      { status: "returned" as const, start: today - 6 * day, end: today - 4 * day },
      { status: "pending" as const, start: today - 3 * day, end: today - 1 * day },
    ];

    await t.run(async (ctx) => {
      for (const loan of loans) {
        await ctx.db.insert("loanRequests", {
          toolId,
          ownerId: id,
          borrowerId: borrower.id,
          startDate: loan.start,
          endDate: loan.end,
          status: loan.status,
          createdAt: Date.now(),
        });
      }
    });

    const listing = await t.query(api.tools.getPublicListing, { toolId });

    expect(listing?.busyRanges).toEqual([{ startDate: today + 2 * day, endDate: today + 6 * day }]);
  });

  it("tells the owner it is theirs, without exposing owner identity", async () => {
    const t = convexTest(schema, modules);
    const owner = await provision(t, "owner_1", "owner@example.test");
    const other = await provision(t, "borrower_1", "borrower@example.test");
    const toolId = await insertTool(t, owner.id);

    expect((await t.query(api.tools.getPublicListing, { toolId }))?.isOwner).toBe(false);
    expect((await other.as.query(api.tools.getPublicListing, { toolId }))?.isOwner).toBe(false);

    const mine = await owner.as.query(api.tools.getPublicListing, { toolId });
    expect(mine?.isOwner).toBe(true);
    // Ownership is a boolean for the viewer; the id never leaves the database.
    expect(mine === null || "ownerId" in mine).toBe(false);
    expect(JSON.stringify(mine)).not.toContain(owner.id);
  });

  it("returns null for a removed listing so the route can 404", async () => {
    const t = convexTest(schema, modules);
    const { id } = await provision(t, "owner_1", "owner@example.test");
    const toolId = await insertTool(t, id, { removedAt: 1_700_000_100_000 });

    await expect(t.query(api.tools.getPublicListing, { toolId })).resolves.toBeNull();
  });
});

describe("tools.create", () => {
  it("creates a listing owned by the caller, with trimmed text", async () => {
    const t = convexTest(schema, modules);
    const { as, id: userId } = await provision(t, "user_sam", "sam@example.test");

    const toolId = await as.mutation(api.tools.create, {
      name: "  Cordless drill  ",
      category: "power_tools",
      condition: "good",
      description: "  18V with two batteries.  ",
    });

    const [mine] = await as.query(api.tools.listMine, {});
    expect(mine).toMatchObject({
      _id: toolId,
      name: "Cordless drill",
      description: "18V with two batteries.",
      status: "available",
    });

    const row = await t.run(async (ctx) => await ctx.db.get(toolId));
    expect(row?.ownerId).toBe(userId);
  });

  it("rejects a name outside the shared limits", async () => {
    const t = convexTest(schema, modules);
    const { as } = await provision(t, "user_sam", "sam@example.test");

    const error = await capturedError(
      as.mutation(api.tools.create, {
        name: "x",
        category: "power_tools",
        condition: "good",
        description: "Long enough description.",
      }),
    );

    expect(codeOf(error)).toBe("VALIDATION");
  });

  it("rejects a description outside the shared limits", async () => {
    const t = convexTest(schema, modules);
    const { as } = await provision(t, "user_sam", "sam@example.test");

    const error = await capturedError(
      as.mutation(api.tools.create, {
        name: "Cordless drill",
        category: "power_tools",
        condition: "good",
        description: "short",
      }),
    );

    expect(codeOf(error)).toBe("VALIDATION");
  });

  it("refuses anonymous callers", async () => {
    const t = convexTest(schema, modules);

    const error = await capturedError(
      t.mutation(api.tools.create, {
        name: "Cordless drill",
        category: "power_tools",
        condition: "good",
        description: "18V with two batteries.",
      }),
    );

    expect(codeOf(error)).toBe("UNAUTHORIZED");
  });
});

describe("tools pricing", () => {
  it("stores the value and daily rate, and exposes the value only on the detail", async () => {
    const t = convexTest(schema, modules);
    const { as, id: userId } = await provision(t, "user_sam", "sam@example.test");

    const toolId = await as.mutation(api.tools.create, {
      name: "Cordless drill",
      category: "power_tools",
      condition: "good",
      description: "18V with two batteries.",
      valueCents: 12_000,
      dailyRateCents: 480,
    });

    const row = await t.run(async (ctx) => await ctx.db.get(toolId));
    expect(row).toMatchObject({ valueCents: 12_000, dailyRateCents: 480 });

    const shelf = await t.query(api.tools.listShowcase, {});
    expect(shelf[0]?.dailyRateCents).toBe(480);
    expect(JSON.stringify(shelf)).not.toContain("valueCents");

    const mine = await as.query(api.tools.listMine, {});
    expect(mine[0]).toMatchObject({ valueCents: 12_000, dailyRateCents: 480 });

    const listing = await t.query(api.tools.getPublicListing, { toolId });
    expect(listing?.valueCents).toBe(12_000);
    expect(row?.ownerId).toBe(userId);
  });

  it("rejects a daily rate above the replacement value and non-integer cents", async () => {
    const t = convexTest(schema, modules);
    const { as } = await provision(t, "user_sam", "sam@example.test");

    const aboveValue = await capturedError(
      as.mutation(api.tools.create, {
        name: "Cordless drill",
        category: "power_tools",
        condition: "good",
        description: "18V with two batteries.",
        valueCents: 1_000,
        dailyRateCents: 2_000,
      }),
    );
    expect(codeOf(aboveValue)).toBe("VALIDATION");

    const fractional = await capturedError(
      as.mutation(api.tools.create, {
        name: "Cordless drill",
        category: "power_tools",
        condition: "good",
        description: "18V with two batteries.",
        valueCents: 1_000,
        dailyRateCents: 4.5,
      }),
    );
    expect(codeOf(fractional)).toBe("VALIDATION");
  });

  it("keeps an existing price when an edit omits pricing", async () => {
    const t = convexTest(schema, modules);
    const { as } = await provision(t, "user_sam", "sam@example.test");
    const toolId = await as.mutation(api.tools.create, {
      name: "Cordless drill",
      category: "power_tools",
      condition: "good",
      description: "18V with two batteries.",
      valueCents: 12_000,
      dailyRateCents: 480,
    });

    await as.mutation(api.tools.update, {
      toolId,
      name: "Impact driver",
      category: "power_tools",
      condition: "like_new",
      description: "Replaced the drill; this one has more torque.",
      status: "available",
    });

    const row = await t.run(async (ctx) => await ctx.db.get(toolId));
    expect(row).toMatchObject({ valueCents: 12_000, dailyRateCents: 480 });
  });
});

describe("migrations.backfillPricing", () => {
  it("fills missing prices, leaves an explicit free rate alone and skips priced listings", async () => {
    const t = convexTest(schema, modules);
    const { id } = await provision(t, "owner_1", "owner@example.test");
    const missing = await insertTool(t, id, { name: "No price" });
    const free = await insertTool(t, id, {
      name: "Lent free",
      valueCents: 10_000,
      dailyRateCents: 0,
    });
    const priced = await insertTool(t, id, {
      name: "Already priced",
      valueCents: 20_000,
      dailyRateCents: 800,
    });

    const result = await t.mutation(internal.migrations.backfillPricing, {});
    expect(result).toEqual({ scanned: 3, updated: 1 });

    const rows = await t.run(async (ctx) => ({
      missing: await ctx.db.get(missing),
      free: await ctx.db.get(free),
      priced: await ctx.db.get(priced),
    }));
    expect(rows.missing).toMatchObject({ valueCents: 12_000, dailyRateCents: 480 });
    expect(rows.free).toMatchObject({ valueCents: 10_000, dailyRateCents: 0 });
    expect(rows.priced).toMatchObject({ valueCents: 20_000, dailyRateCents: 800 });
  });
});

describe("tools.listMine", () => {
  it("returns only the caller's listings", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const alex = await provision(t, "user_alex", "alex@example.test");
    await insertTool(t, sam.id, { name: "Sam's drill" });
    await insertTool(t, alex.id, { name: "Alex's ladder" });

    const mine = await sam.as.query(api.tools.listMine, {});

    expect(mine.map((tool) => tool.name)).toEqual(["Sam's drill"]);
  });

  it("hides removed listings and orders newest first", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    await insertTool(t, sam.id, { name: "Older", createdAt: 1_700_000_000_000 });
    await insertTool(t, sam.id, { name: "Newer", createdAt: 1_700_000_000_500 });
    await insertTool(t, sam.id, { name: "Removed", removedAt: 1_700_000_000_900 });

    const mine = await sam.as.query(api.tools.listMine, {});

    expect(mine.map((tool) => tool.name)).toEqual(["Newer", "Older"]);
  });

  it("refuses anonymous callers", async () => {
    const t = convexTest(schema, modules);

    const error = await capturedError(t.query(api.tools.listMine, {}));

    expect(codeOf(error)).toBe("UNAUTHORIZED");
  });
});

describe("tools.update", () => {
  it("lets the owner edit their own listing", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const toolId = await insertTool(t, sam.id);

    await sam.as.mutation(api.tools.update, {
      toolId,
      name: "Impact driver",
      category: "power_tools",
      condition: "like_new",
      description: "Replaced the drill; this one has more torque.",
      status: "unavailable",
    });

    const [mine] = await sam.as.query(api.tools.listMine, {});
    expect(mine).toMatchObject({
      name: "Impact driver",
      condition: "like_new",
      status: "unavailable",
    });
  });

  it("refuses someone else's listing and leaves it untouched", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const alex = await provision(t, "user_alex", "alex@example.test");
    const toolId = await insertTool(t, sam.id);

    const error = await capturedError(
      alex.as.mutation(api.tools.update, {
        toolId,
        name: "Stolen listing",
        category: "power_tools",
        condition: "good",
        description: "This should never be written.",
        status: "available",
      }),
    );

    expect(codeOf(error)).toBe("FORBIDDEN");
    const row = await t.run(async (ctx) => await ctx.db.get(toolId));
    expect(row?.name).toBe("Cordless drill");
  });

  it("reports a removed listing as missing", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const toolId = await insertTool(t, sam.id, { removedAt: 1_700_000_000_900 });

    const error = await capturedError(
      sam.as.mutation(api.tools.update, {
        toolId,
        name: "Ghost tool",
        category: "power_tools",
        condition: "good",
        description: "Should not be editable.",
        status: "available",
      }),
    );

    expect(codeOf(error)).toBe("NOT_FOUND");
  });

  it("lets the owner edit a tool while it is out on loan", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const toolId = await insertTool(t, sam.id);
    await insertLoan(t, toolId, sam.id);

    await sam.as.mutation(api.tools.update, {
      toolId,
      name: "Impact driver",
      category: "power_tools",
      condition: "like_new",
      description: "Owner updated the description while the tool is out.",
      status: "available",
    });

    const row = await t.run(async (ctx) => await ctx.db.get(toolId));
    expect(row?.name).toBe("Impact driver");
    expect(row?.condition).toBe("like_new");
  });
});

describe("tools.remove", () => {
  it("soft-removes the owner's listing from every read", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const toolId = await insertTool(t, sam.id);

    await sam.as.mutation(api.tools.remove, { toolId });

    expect(await sam.as.query(api.tools.listMine, {})).toEqual([]);
    expect(await t.query(api.tools.listPublic, {})).toEqual([]);

    const row = await t.run(async (ctx) => await ctx.db.get(toolId));
    expect(row?.removedAt).toBeTypeOf("number");
    expect(row?.status).toBe("unavailable");
  });

  it("refuses someone else's listing", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const alex = await provision(t, "user_alex", "alex@example.test");
    const toolId = await insertTool(t, sam.id);

    const error = await capturedError(alex.as.mutation(api.tools.remove, { toolId }));

    expect(codeOf(error)).toBe("FORBIDDEN");
    const row = await t.run(async (ctx) => await ctx.db.get(toolId));
    expect(row?.removedAt).toBeUndefined();
  });

  it("lets the owner remove a tool while it is out on loan without losing the loan", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const toolId = await insertTool(t, sam.id);
    const loanId = await insertLoan(t, toolId, sam.id);

    await sam.as.mutation(api.tools.remove, { toolId });

    const row = await t.run(async (ctx) => await ctx.db.get(toolId));
    expect(row?.removedAt).toBeTypeOf("number");
    expect(await t.run(async (ctx) => await ctx.db.get(loanId))).not.toBeNull();
  });
});
