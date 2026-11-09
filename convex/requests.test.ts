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
const ISSUER = "https://clerk.example.test";
const DAY = 86_400_000;

type Tester = TestConvex<typeof schema>;

function identity(token: string, email: string): Partial<UserIdentity> {
  return {
    tokenIdentifier: `${ISSUER}|${token}`,
    subject: token,
    issuer: ISSUER,
    name: token,
    email,
  };
}

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
    category: "power_tools" | "garden";
    valueCents: number;
    dailyRateCents: number;
  }> = {},
) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("tools", {
        ownerId,
        name: overrides.name ?? "Cordless drill",
        category: overrides.category ?? "power_tools",
        condition: "good",
        description: "18V with two batteries.",
        status: overrides.status ?? "available",
        ...(overrides.valueCents === undefined ? {} : { valueCents: overrides.valueCents }),
        ...(overrides.dailyRateCents === undefined
          ? {}
          : { dailyRateCents: overrides.dailyRateCents }),
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      }),
  );
}

async function insertRequest(
  t: Tester,
  args: {
    toolId: Id<"tools">;
    ownerId: Id<"users">;
    borrowerId: Id<"users">;
    status?: "pending" | "approved" | "declined" | "returned";
    startDate?: number;
    endDate?: number;
    createdAt?: number;
    updatedAt?: number;
  },
) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("loanRequests", {
        toolId: args.toolId,
        ownerId: args.ownerId,
        borrowerId: args.borrowerId,
        startDate: args.startDate ?? Date.now() + DAY,
        endDate: args.endDate ?? Date.now() + 2 * DAY,
        status: args.status ?? "approved",
        createdAt: args.createdAt ?? 1_700_000_000_000,
        ...(args.updatedAt === undefined ? {} : { updatedAt: args.updatedAt }),
      }),
  );
}

const date = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

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

async function shelf(t: Tester) {
  const owner = await provision(t, "user_owner", "owner@example.test");
  const borrower = await provision(t, "user_borrower", "borrower@example.test");
  const toolId = await insertTool(t, owner.id);
  return { owner, borrower, toolId };
}

describe("requests.create", () => {
  it("creates a pending request owned by the tool owner", async () => {
    const t = convexTest(schema, modules);
    const { owner, borrower, toolId } = await shelf(t);

    const requestId = await borrower.as.mutation(api.requests.create, {
      toolId,
      startDate: date(1),
      endDate: date(3),
      note: "  Weekend project.  ",
    });

    const row = await t.run(async (ctx) => await ctx.db.get(requestId));
    expect(row).toMatchObject({
      toolId,
      ownerId: owner.id,
      borrowerId: borrower.id,
      status: "pending",
      note: "Weekend project.",
    });
  });

  it("refuses anonymous callers", async () => {
    const t = convexTest(schema, modules);
    const { toolId } = await shelf(t);

    const error = await capturedError(
      t.mutation(api.requests.create, { toolId, startDate: date(1), endDate: date(2) }),
    );

    expect(codeOf(error)).toBe("UNAUTHORIZED");
  });

  it("refuses a request for your own tool", async () => {
    const t = convexTest(schema, modules);
    const { owner, toolId } = await shelf(t);

    const error = await capturedError(
      owner.as.mutation(api.requests.create, { toolId, startDate: date(1), endDate: date(2) }),
    );

    expect(codeOf(error)).toBe("FORBIDDEN");
  });

  it("rejects a past start, a reversed window and an over-long window", async () => {
    const t = convexTest(schema, modules);
    const { borrower, toolId } = await shelf(t);

    for (const window of [
      { startDate: date(-1), endDate: date(1) },
      { startDate: date(3), endDate: date(2) },
      { startDate: date(1), endDate: date(31) },
    ]) {
      const error = await capturedError(
        borrower.as.mutation(api.requests.create, { toolId, ...window }),
      );
      expect(codeOf(error)).toBe("VALIDATION");
    }
  });

  it("refuses a paused listing", async () => {
    const t = convexTest(schema, modules);
    const owner = await provision(t, "user_owner", "owner@example.test");
    const borrower = await provision(t, "user_borrower", "borrower@example.test");
    const toolId = await insertTool(t, owner.id, { status: "unavailable" });

    const error = await capturedError(
      borrower.as.mutation(api.requests.create, { toolId, startDate: date(1), endDate: date(2) }),
    );

    expect(codeOf(error)).toBe("CONFLICT");
  });

  it("refuses dates that overlap an approved loan", async () => {
    const t = convexTest(schema, modules);
    const { owner, borrower, toolId } = await shelf(t);
    await insertRequest(t, {
      toolId,
      ownerId: owner.id,
      borrowerId: borrower.id,
      status: "approved",
      startDate: Date.now() + DAY,
      endDate: Date.now() + 3 * DAY,
    });

    const other = await provision(t, "user_other", "other@example.test");
    const error = await capturedError(
      other.as.mutation(api.requests.create, { toolId, startDate: date(2), endDate: date(4) }),
    );

    expect(codeOf(error)).toBe("CONFLICT");
  });

  it("refuses a second overlapping pending request from the same borrower", async () => {
    const t = convexTest(schema, modules);
    const { borrower, toolId } = await shelf(t);

    await borrower.as.mutation(api.requests.create, {
      toolId,
      startDate: date(1),
      endDate: date(3),
    });

    const error = await capturedError(
      borrower.as.mutation(api.requests.create, {
        toolId,
        startDate: date(2),
        endDate: date(4),
      }),
    );

    expect(codeOf(error)).toBe("CONFLICT");
  });
});

describe("requests.approve / decline", () => {
  it("lets the owner approve, and records when", async () => {
    const t = convexTest(schema, modules);
    const { owner, borrower, toolId } = await shelf(t);
    const requestId = await borrower.as.mutation(api.requests.create, {
      toolId,
      startDate: date(1),
      endDate: date(2),
    });

    await owner.as.mutation(api.requests.approve, { requestId });

    const row = await t.run(async (ctx) => await ctx.db.get(requestId));
    expect(row?.status).toBe("approved");
    expect(row?.decidedAt).toBeTypeOf("number");
  });

  it("refuses approval by anyone but the owner", async () => {
    const t = convexTest(schema, modules);
    const { borrower, toolId } = await shelf(t);
    const requestId = await borrower.as.mutation(api.requests.create, {
      toolId,
      startDate: date(1),
      endDate: date(2),
    });

    const error = await capturedError(borrower.as.mutation(api.requests.approve, { requestId }));

    expect(codeOf(error)).toBe("FORBIDDEN");
  });

  it("refuses a second approval of the same request", async () => {
    const t = convexTest(schema, modules);
    const { owner, borrower, toolId } = await shelf(t);
    const requestId = await borrower.as.mutation(api.requests.create, {
      toolId,
      startDate: date(1),
      endDate: date(2),
    });
    await owner.as.mutation(api.requests.approve, { requestId });

    const error = await capturedError(owner.as.mutation(api.requests.approve, { requestId }));

    expect(codeOf(error)).toBe("CONFLICT");
  });

  it("refuses to approve dates that clash with an existing approval", async () => {
    const t = convexTest(schema, modules);
    const { owner, borrower, toolId } = await shelf(t);
    const first = await borrower.as.mutation(api.requests.create, {
      toolId,
      startDate: date(1),
      endDate: date(5),
    });
    const other = await provision(t, "user_other", "other@example.test");
    const second = await other.as.mutation(api.requests.create, {
      toolId,
      startDate: date(3),
      endDate: date(4),
    });

    await owner.as.mutation(api.requests.approve, { requestId: first });
    const error = await capturedError(
      owner.as.mutation(api.requests.approve, { requestId: second }),
    );

    expect(codeOf(error)).toBe("CONFLICT");
  });

  it("lets the owner decline, and nobody else", async () => {
    const t = convexTest(schema, modules);
    const { owner, borrower, toolId } = await shelf(t);
    const requestId = await borrower.as.mutation(api.requests.create, {
      toolId,
      startDate: date(1),
      endDate: date(2),
    });

    const error = await capturedError(borrower.as.mutation(api.requests.decline, { requestId }));
    expect(codeOf(error)).toBe("FORBIDDEN");

    await owner.as.mutation(api.requests.decline, { requestId });
    const row = await t.run(async (ctx) => await ctx.db.get(requestId));
    expect(row?.status).toBe("declined");
  });
});

describe("requests.cancel / markReturned", () => {
  it("lets the borrower cancel a pending request, but not the owner", async () => {
    const t = convexTest(schema, modules);
    const { owner, borrower, toolId } = await shelf(t);
    const requestId = await borrower.as.mutation(api.requests.create, {
      toolId,
      startDate: date(1),
      endDate: date(2),
    });

    const ownerError = await capturedError(owner.as.mutation(api.requests.cancel, { requestId }));
    expect(codeOf(ownerError)).toBe("FORBIDDEN");

    await borrower.as.mutation(api.requests.cancel, { requestId });
    const row = await t.run(async (ctx) => await ctx.db.get(requestId));
    expect(row?.status).toBe("cancelled");
  });

  it("lets either party mark an approved loan returned", async () => {
    const t = convexTest(schema, modules);
    const { owner, borrower, toolId } = await shelf(t);
    const first = await borrower.as.mutation(api.requests.create, {
      toolId,
      startDate: date(1),
      endDate: date(2),
    });
    await owner.as.mutation(api.requests.approve, { requestId: first });

    await borrower.as.mutation(api.requests.markReturned, { requestId: first });

    const row = await t.run(async (ctx) => await ctx.db.get(first));
    expect(row?.status).toBe("returned");
    expect(row?.returnedAt).toBeTypeOf("number");
  });

  it("refuses to return something that was never approved", async () => {
    const t = convexTest(schema, modules);
    const { borrower, toolId } = await shelf(t);
    const requestId = await borrower.as.mutation(api.requests.create, {
      toolId,
      startDate: date(1),
      endDate: date(2),
    });

    const error = await capturedError(
      borrower.as.mutation(api.requests.markReturned, { requestId }),
    );

    expect(codeOf(error)).toBe("CONFLICT");
  });
});

describe("requests.listMine / listIncoming", () => {
  it("scopes the borrower view and derives the phase", async () => {
    const t = convexTest(schema, modules);
    const { owner, borrower, toolId } = await shelf(t);
    await insertRequest(t, {
      toolId,
      ownerId: owner.id,
      borrowerId: borrower.id,
      status: "approved",
      startDate: Date.now() - 5 * DAY,
      endDate: Date.now() - 2 * DAY,
    });
    const other = await provision(t, "user_other", "other@example.test");

    const mine = await borrower.as.query(api.requests.listMine, {});
    expect(mine).toHaveLength(1);
    expect(mine[0]?.phase).toBe("overdue");
    expect(mine[0]?.toolName).toBe("Cordless drill");

    expect(await other.as.query(api.requests.listMine, {})).toEqual([]);
  });

  it("scopes the owner inbox to their own tools", async () => {
    const t = convexTest(schema, modules);
    const { owner, borrower, toolId } = await shelf(t);
    await borrower.as.mutation(api.requests.create, {
      toolId,
      startDate: date(1),
      endDate: date(2),
    });
    const other = await provision(t, "user_other", "other@example.test");

    const incoming = await owner.as.query(api.requests.listIncoming, {});
    expect(incoming).toHaveLength(1);
    expect(incoming[0]?.borrowerName).toBe("user_borrower");

    expect(await other.as.query(api.requests.listIncoming, {})).toEqual([]);
  });

  it("puts the most recently updated request first in both inboxes", async () => {
    const t = convexTest(schema, modules);
    const { owner, borrower, toolId } = await shelf(t);

    const untouched = await insertRequest(t, {
      toolId,
      ownerId: owner.id,
      borrowerId: borrower.id,
      status: "approved",
      startDate: Date.now() + 5 * DAY,
      endDate: Date.now() + 6 * DAY,
      createdAt: 1_700_000_300_000,
      updatedAt: 1_700_000_300_000,
    });
    // Newer activity, older request: this is the one that belongs on top.
    const justDeclined = await insertRequest(t, {
      toolId,
      ownerId: owner.id,
      borrowerId: borrower.id,
      status: "declined",
      startDate: Date.now() + 7 * DAY,
      endDate: Date.now() + 8 * DAY,
      createdAt: 1_700_000_100_000,
      updatedAt: 1_700_000_900_000,
    });

    const mine = await borrower.as.query(api.requests.listMine, {});
    expect(mine.map((row) => row._id)).toEqual([justDeclined, untouched]);
    expect(mine[0]?.updatedAt).toBe(1_700_000_900_000);

    const incoming = await owner.as.query(api.requests.listIncoming, {});
    expect(incoming.map((row) => row._id)).toEqual([justDeclined, untouched]);
  });

  it("stamps updatedAt on create and every decision", async () => {
    const t = convexTest(schema, modules);
    const { owner, borrower, toolId } = await shelf(t);

    const requestId = await borrower.as.mutation(api.requests.create, {
      toolId,
      startDate: date(1),
      endDate: date(2),
    });
    const created = await t.run(async (ctx) => await ctx.db.get(requestId));
    expect(created?.updatedAt).toBeTypeOf("number");

    await owner.as.mutation(api.requests.approve, { requestId });
    const approved = await t.run(async (ctx) => await ctx.db.get(requestId));
    expect(approved?.updatedAt).toBeTypeOf("number");
    expect(approved?.updatedAt ?? 0).toBeGreaterThanOrEqual(created?.updatedAt ?? 0);
  });

  it("refuses anonymous callers", async () => {
    const t = convexTest(schema, modules);

    expect(codeOf(await capturedError(t.query(api.requests.listMine, {})))).toBe("UNAUTHORIZED");
    expect(codeOf(await capturedError(t.query(api.requests.listIncoming, {})))).toBe(
      "UNAUTHORIZED",
    );
  });

  it("snapshots the rate and returns the booking total with a cover summary", async () => {
    const t = convexTest(schema, modules);
    const owner = await provision(t, "user_owner", "owner@example.test");
    const borrower = await provision(t, "user_borrower", "borrower@example.test");
    const toolId = await insertTool(t, owner.id, {
      valueCents: 12_000,
      dailyRateCents: 480,
    });

    const requestId = await borrower.as.mutation(api.requests.create, {
      toolId,
      startDate: date(1),
      endDate: date(3),
    });

    const row = await t.run(async (ctx) => await ctx.db.get(requestId));
    expect(row?.dailyRateCents).toBe(480);
    expect(row?.valueCents).toBe(12_000);

    const mine = await borrower.as.query(api.requests.listMine, {});
    expect(mine[0]).toMatchObject({
      dayCount: 3,
      dailyRateCents: 480,
      valueCents: 12_000,
      totalCents: 1_440,
      images: { imageCount: 0, cover: null },
      ownerTrusted: false,
    });

    const incoming = await owner.as.query(api.requests.listIncoming, {});
    expect(incoming[0]).toMatchObject({
      dayCount: 3,
      dailyRateCents: 480,
      valueCents: 12_000,
      totalCents: 1_440,
      borrowerName: "user_borrower",
    });
  });

  it("renders the agreed total into the request notification email", async () => {
    const t = convexTest(schema, modules);
    const owner = await provision(t, "user_owner", "owner@example.test");
    const borrower = await provision(t, "user_borrower", "borrower@example.test");
    const toolId = await insertTool(t, owner.id, {
      valueCents: 12_000,
      dailyRateCents: 480,
    });

    const requestId = await borrower.as.mutation(api.requests.create, {
      toolId,
      startDate: date(1),
      endDate: date(3),
    });
    await owner.as.mutation(api.requests.approve, { requestId });

    const queued = await t.run(async (ctx) => await ctx.db.query("automationOutbox").take(10));
    const approved = queued.find((row) => row.kind === "request.approved");
    expect(approved).toBeDefined();
    const payload = JSON.parse(approved?.payload ?? "{}") as {
      email?: { html?: string };
    };
    expect(payload.email?.html).toContain("Booking total");
    expect(payload.email?.html).toContain("$14.40");
    expect(payload.email?.html).toContain("Replacement value");
    expect(payload.email?.html).toContain("reimburse");
    expect(payload.email?.html).toContain("$120");
  });

  it("counts pending and overdue work for the owner only", async () => {
    const t = convexTest(schema, modules);
    const { owner, borrower, toolId } = await shelf(t);
    await insertRequest(t, {
      toolId,
      ownerId: owner.id,
      borrowerId: borrower.id,
      status: "approved",
      startDate: Date.now() - 5 * DAY,
      endDate: Date.now() - 2 * DAY,
    });
    await borrower.as.mutation(api.requests.create, {
      toolId,
      startDate: date(1),
      endDate: date(2),
    });

    const summary = await owner.as.query(api.requests.incomingSummary, {});
    expect(summary).toMatchObject({ pending: 1, upcoming: 0, active: 0, overdue: 1 });
    expect(summary.latestPendingAt).toBeTypeOf("number");

    const other = await provision(t, "user_other", "other@example.test");
    expect(await other.as.query(api.requests.incomingSummary, {})).toEqual({
      pending: 0,
      latestPendingAt: null,
      upcoming: 0,
      active: 0,
      overdue: 0,
    });
    expect(await t.query(api.requests.incomingSummary, {})).toEqual({
      pending: 0,
      latestPendingAt: null,
      upcoming: 0,
      active: 0,
      overdue: 0,
    });
  });
});

describe("tools.listAvailable", () => {
  it("derives availability from approved loans and the owner's intent", async () => {
    const t = convexTest(schema, modules);
    const owner = await provision(t, "user_owner", "owner@example.test");
    const borrower = await provision(t, "user_borrower", "borrower@example.test");
    const onLoan = await insertTool(t, owner.id, { name: "On loan" });
    await insertTool(t, owner.id, { name: "Paused", status: "unavailable" });
    await insertTool(t, owner.id, { name: "Free", category: "garden" });
    await insertRequest(t, {
      toolId: onLoan,
      ownerId: owner.id,
      borrowerId: borrower.id,
      startDate: Date.now() - DAY,
      endDate: Date.now() + DAY,
    });

    const all = await borrower.as.query(api.tools.listAvailable, {});
    expect(all.map((tool) => [tool.name, tool.availability])).toEqual(
      expect.arrayContaining([
        ["On loan", "on_loan"],
        ["Paused", "paused"],
        ["Free", "available"],
      ]),
    );

    const garden = await borrower.as.query(api.tools.listAvailable, { category: "garden" });
    expect(garden.map((tool) => tool.name)).toEqual(["Free"]);

    expect(await capturedError(t.query(api.tools.listAvailable, {}))).not.toBeNull();
  });
});
