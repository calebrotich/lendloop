/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type Tester = TestConvex<typeof schema>;

async function seedFixture(t: Tester) {
  const ownerId = await t.run(
    async (ctx) =>
      await ctx.db.insert("users", {
        tokenIdentifier: "test|owner",
        clerkId: "owner",
        name: "Owner",
        email: "owner@example.test",
        role: "user",
        isTrustedLender: false,
        createdAt: 1_700_000_000_000,
      }),
  );
  const toolId = await t.run(
    async (ctx) =>
      await ctx.db.insert("tools", {
        ownerId,
        name: "Cordless drill",
        category: "power_tools",
        condition: "good",
        description: "18V with two batteries.",
        status: "available",
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      }),
  );
  return { ownerId, toolId };
}

async function insertTicket(
  t: Tester,
  fixture: { ownerId: Id<"users">; toolId: Id<"tools"> },
  overrides: {
    status?: "pending" | "failed" | "expired";
    expiresAt?: number;
    createdAt?: number;
    objectKey?: string;
  } = {},
) {
  const now = Date.now();
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("toolImageUploads", {
        toolId: fixture.toolId,
        ownerId: fixture.ownerId,
        objectKey: overrides.objectKey ?? `tools/test/${crypto.randomUUID()}.webp`,
        contentType: "image/webp",
        byteSize: 1_024,
        width: 800,
        height: 600,
        status: overrides.status ?? "pending",
        createdAt: overrides.createdAt ?? now,
        expiresAt: overrides.expiresAt ?? now + 60_000,
      }),
  );
}

async function insertDelete(t: Tester, overrides: { attempts?: number } = {}) {
  const now = Date.now();
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("storageDeletes", {
        objectKey: `tools/test/${crypto.randomUUID()}.webp`,
        reason: "test",
        status: "pending",
        attempts: overrides.attempts ?? 0,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      }),
  );
}

describe("media.expireUploads", () => {
  it("expires only overdue tickets and queues their objects", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedFixture(t);
    const overdue = await insertTicket(t, fixture, {
      expiresAt: Date.now() - 1,
      objectKey: "tools/old.webp",
    });
    const live = await insertTicket(t, fixture, {
      expiresAt: Date.now() + 60_000,
      objectKey: "tools/live.webp",
    });

    const count = await t.mutation(internal.media.expireUploads, { now: Date.now() });

    expect(count).toBe(1);
    expect((await t.run(async (ctx) => await ctx.db.get(overdue)))?.status).toBe("expired");
    expect((await t.run(async (ctx) => await ctx.db.get(live)))?.status).toBe("pending");

    const queued = await t.run(
      async (ctx) =>
        await ctx.db
          .query("storageDeletes")
          .withIndex("by_objectKey", (q) => q.eq("objectKey", "tools/old.webp"))
          .unique(),
    );
    expect(queued?.reason).toBe("upload_expired");
  });
});

describe("media.pruneTickets", () => {
  it("drops old finished tickets but keeps a pending one", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedFixture(t);
    const old = Date.now() - 8 * 24 * 60 * 60_000;
    const failed = await insertTicket(t, fixture, { status: "failed", createdAt: old });
    const stalePending = await insertTicket(t, fixture, { status: "pending", createdAt: old });

    const removed = await t.mutation(internal.media.pruneTickets, { now: Date.now() });

    expect(removed).toBe(1);
    expect(await t.run(async (ctx) => await ctx.db.get(failed))).toBeNull();
    expect(await t.run(async (ctx) => await ctx.db.get(stalePending))).not.toBeNull();
  });
});

describe("media.dueDeletes", () => {
  it("returns only pending rows whose retry time has arrived", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const due = await t.run(
      async (ctx) =>
        await ctx.db.insert("storageDeletes", {
          objectKey: "tools/due.webp",
          reason: "test",
          status: "pending",
          attempts: 0,
          nextAttemptAt: now - 1_000,
          createdAt: now,
          updatedAt: now,
        }),
    );
    await t.run(
      async (ctx) =>
        await ctx.db.insert("storageDeletes", {
          objectKey: "tools/later.webp",
          reason: "test",
          status: "pending",
          attempts: 0,
          nextAttemptAt: now + 60_000,
          createdAt: now,
          updatedAt: now,
        }),
    );

    const rows = await t.query(internal.media.dueDeletes, { now, limit: 25 });

    expect(rows.map((row) => row._id)).toEqual([due]);
  });
});

describe("media.finishDelete", () => {
  it("removes a row when the delete succeeds", async () => {
    const t = convexTest(schema, modules);
    const id = await insertDelete(t);

    await t.mutation(internal.media.finishDelete, { id, ok: true });

    expect(await t.run(async (ctx) => await ctx.db.get(id))).toBeNull();
  });

  it("increments attempts and schedules a retry on failure", async () => {
    const t = convexTest(schema, modules);
    const id = await insertDelete(t);

    await t.mutation(internal.media.finishDelete, { id, ok: false, error: "R2 returned 500" });

    const row = await t.run(async (ctx) => await ctx.db.get(id));
    expect(row?.attempts).toBe(1);
    expect(row?.status).toBe("pending");
    expect(row?.lastError).toBe("R2 returned 500");
    expect(row?.nextAttemptAt).toBeGreaterThan(Date.now() - 1_000);
  });

  it("gives up visibly after the last attempt", async () => {
    const t = convexTest(schema, modules);
    const id = await insertDelete(t, { attempts: 7 });

    await t.mutation(internal.media.finishDelete, { id, ok: false, error: "still failing" });

    const row = await t.run(async (ctx) => await ctx.db.get(id));
    expect(row?.status).toBe("failed");
    expect(row?.attempts).toBe(8);
  });
});
