/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import type { UserIdentity } from "convex/server";
import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
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
  it("returns only name, category and a photo summary — nothing else", async () => {
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

  it("refuses to edit a tool that is out on loan", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const toolId = await insertTool(t, sam.id);
    await insertLoan(t, toolId, sam.id);

    const error = await capturedError(
      sam.as.mutation(api.tools.update, {
        toolId,
        name: "Impact driver",
        category: "power_tools",
        condition: "good",
        description: "Still out on loan to a neighbour.",
        status: "available",
      }),
    );

    expect(codeOf(error)).toBe("CONFLICT");
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

  it("refuses to remove a tool that is out on loan", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const toolId = await insertTool(t, sam.id);
    await insertLoan(t, toolId, sam.id);

    const error = await capturedError(sam.as.mutation(api.tools.remove, { toolId }));

    expect(codeOf(error)).toBe("CONFLICT");
  });
});
