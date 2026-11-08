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

async function provision(t: Tester, token: string, role: "user" | "admin" = "user") {
  const id = await t.run(
    async (ctx) =>
      await ctx.db.insert("users", {
        tokenIdentifier: `${ISSUER}|${token}`,
        clerkId: token,
        name: token,
        email: `${token}@example.test`,
        role,
        isTrustedLender: false,
        createdAt: 1_700_000_000_000,
      }),
  );
  return { id, as: t.withIdentity(identity(token, `${token}@example.test`)) };
}

async function insertTool(t: Tester, ownerId: Id<"users">) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("tools", {
        ownerId,
        name: "Cordless drill",
        category: "power_tools",
        condition: "good",
        description: "18V with two batteries.",
        status: "available",
        createdAt: 1,
        updatedAt: 1,
      }),
  );
}

async function insertLoan(
  t: Tester,
  toolId: Id<"tools">,
  ownerId: Id<"users">,
  borrowerId: Id<"users">,
) {
  const now = Date.now();
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("loanRequests", {
        toolId,
        ownerId,
        borrowerId,
        startDate: now - DAY,
        endDate: now + DAY,
        status: "approved",
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

describe("admin.removeListing", () => {
  it("lets an admin remove someone else's listing and audits it", async () => {
    const t = convexTest(schema, modules);
    const owner = await provision(t, "owner");
    const admin = await provision(t, "admin", "admin");
    const toolId = await insertTool(t, owner.id);

    await admin.as.mutation(api.admin.removeListing, { toolId });

    const row = await t.run(async (ctx) => await ctx.db.get(toolId));
    expect(row?.removedAt).toBeTypeOf("number");

    const audit = await t.run(async (ctx) => await ctx.db.query("auditLog").collect());
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "tool.admin_removed", targetId: toolId });
  });

  it("refuses a non-admin and an anonymous caller", async () => {
    const t = convexTest(schema, modules);
    const owner = await provision(t, "owner");
    const toolId = await insertTool(t, owner.id);

    expect(
      codeOf(await capturedError(owner.as.mutation(api.admin.removeListing, { toolId }))),
    ).toBe("FORBIDDEN");
    expect(codeOf(await capturedError(t.mutation(api.admin.removeListing, { toolId })))).toBe(
      "UNAUTHORIZED",
    );
  });

  it("removes a tool that is out on loan without losing the loan", async () => {
    const t = convexTest(schema, modules);
    const owner = await provision(t, "owner");
    const borrower = await provision(t, "borrower");
    const admin = await provision(t, "admin", "admin");
    const toolId = await insertTool(t, owner.id);
    const loanId = await insertLoan(t, toolId, owner.id, borrower.id);

    await admin.as.mutation(api.admin.removeListing, { toolId });

    const row = await t.run(async (ctx) => await ctx.db.get(toolId));
    expect(row?.removedAt).toBeTypeOf("number");
    expect(await t.run(async (ctx) => await ctx.db.get(loanId))).not.toBeNull();
  });
});

describe("admin.listAllLoans", () => {
  it("shows every loan to an admin, with both parties named", async () => {
    const t = convexTest(schema, modules);
    const owner = await provision(t, "owner");
    const borrower = await provision(t, "borrower");
    const admin = await provision(t, "admin", "admin");
    const toolId = await insertTool(t, owner.id);
    await insertLoan(t, toolId, owner.id, borrower.id);

    const loans = await admin.as.query(api.admin.listAllLoans, {});

    expect(loans).toHaveLength(1);
    expect(loans[0]).toMatchObject({ ownerName: "owner", borrowerName: "borrower" });
  });

  it("refuses non-admins", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "sam");

    expect(codeOf(await capturedError(sam.as.query(api.admin.listAllLoans, {})))).toBe("FORBIDDEN");
  });
});

describe("admin users and trusted lenders", () => {
  it("lists users for an admin only", async () => {
    const t = convexTest(schema, modules);
    const admin = await provision(t, "admin", "admin");
    const sam = await provision(t, "sam");

    const users = await admin.as.query(api.admin.listUsers, {});
    expect(users.map((user) => user.name).sort()).toEqual(["admin", "sam"]);
    expect(codeOf(await capturedError(sam.as.query(api.admin.listUsers, {})))).toBe("FORBIDDEN");
  });

  it("marks a lender trusted and audits the change", async () => {
    const t = convexTest(schema, modules);
    const admin = await provision(t, "admin", "admin");
    const sam = await provision(t, "sam");

    await admin.as.mutation(api.admin.setTrustedLender, { userId: sam.id, trusted: true });

    const row = await t.run(async (ctx) => await ctx.db.get(sam.id));
    expect(row?.isTrustedLender).toBe(true);

    const audit = await t.run(async (ctx) => await ctx.db.query("auditLog").collect());
    expect(audit[0]).toMatchObject({ action: "user.trusted_lender", targetId: sam.id });
  });

  it("refuses a non-admin toggling trust", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "sam");
    const alex = await provision(t, "alex");

    const error = await capturedError(
      sam.as.mutation(api.admin.setTrustedLender, { userId: alex.id, trusted: true }),
    );

    expect(codeOf(error)).toBe("FORBIDDEN");
  });
});

describe("admin.listAudit", () => {
  it("is admin-only and returns newest first", async () => {
    const t = convexTest(schema, modules);
    const admin = await provision(t, "admin", "admin");
    const sam = await provision(t, "sam");
    await admin.as.mutation(api.admin.setTrustedLender, { userId: sam.id, trusted: true });

    const entries = await admin.as.query(api.admin.listAudit, {});
    expect(entries).toHaveLength(1);
    expect(entries[0]?.actorName).toBe("admin");

    expect(codeOf(await capturedError(sam.as.query(api.admin.listAudit, {})))).toBe("FORBIDDEN");
  });
});
