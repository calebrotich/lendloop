import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/authz";
import { loanPhaseValidator, loanStatusValidator, roleValidator } from "./lib/constants";
import { loanPhase } from "./lib/dates";
import { readCsvEnv } from "./lib/env";
import { appError } from "./lib/errors";
import { discardToolImages } from "./lib/media";

const ADMIN_LIST_LIMIT = 100;

type DbCtx = QueryCtx | MutationCtx;

async function nameOf(ctx: DbCtx, id: Id<"users">) {
  const user = await ctx.db.get(id);
  return user?.name ?? "Unknown neighbour";
}

/** Every admin action writes an audit row in the same transaction as the change. */
async function record(
  ctx: MutationCtx,
  actorId: Id<"users">,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, string | number | boolean | null>,
) {
  await ctx.db.insert("auditLog", {
    actorId,
    action,
    targetType,
    targetId,
    metadata,
    createdAt: Date.now(),
  });
}

/** T13 — an admin can take any listing down, including someone else's. */
export const removeListing = mutation({
  args: { toolId: v.id("tools") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const tool = await ctx.db.get(args.toolId);

    if (tool === null || tool.removedAt !== undefined) {
      appError("NOT_FOUND", "That listing no longer exists.");
    }
    const now = Date.now();
    await ctx.db.patch(tool._id, {
      removedAt: now,
      status: "unavailable",
      updatedAt: now,
    });
    await record(ctx, admin._id, "tool.admin_removed", "tool", tool._id, {
      toolName: tool.name,
      ownerId: tool.ownerId,
    });
    await discardToolImages(ctx, tool._id);
    return null;
  },
});

/** T14 — every loan in the app, with the parties named for the admin view. */
export const listAllLoans = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("loanRequests"),
      toolName: v.string(),
      ownerName: v.string(),
      borrowerName: v.string(),
      startDate: v.number(),
      endDate: v.number(),
      status: loanStatusValidator,
      phase: loanPhaseValidator,
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = Date.now();

    const requests = await ctx.db.query("loanRequests").order("desc").take(ADMIN_LIST_LIMIT);

    const rows = [];
    for (const request of requests) {
      const tool = await ctx.db.get(request.toolId);
      rows.push({
        _id: request._id,
        toolName: tool?.name ?? "Removed listing",
        ownerName: await nameOf(ctx, request.ownerId),
        borrowerName: await nameOf(ctx, request.borrowerId),
        startDate: request.startDate,
        endDate: request.endDate,
        status: request.status,
        phase: loanPhase(request, now),
        createdAt: request.createdAt,
      });
    }
    return rows;
  },
});

/** T15 — the list an admin picks a lender from. Admin-only PII, no tokens. */
export const listUsers = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("users"),
      name: v.string(),
      email: v.string(),
      role: roleValidator,
      isTrustedLender: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").order("desc").take(ADMIN_LIST_LIMIT);
    return users.map((user) => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isTrustedLender: user.isTrustedLender,
    }));
  },
});

/** T15 — mark, or unmark, a lender as trusted. */
export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const user = await ctx.db.get(args.userId);

    if (user === null) {
      appError("NOT_FOUND", "That neighbour no longer exists.");
    }

    await ctx.db.patch(user._id, { isTrustedLender: args.trusted });
    await record(ctx, admin._id, "user.trusted_lender", "user", user._id, {
      trusted: args.trusted,
      name: user.name,
    });
    return null;
  },
});

/** The audit trail, newest first. Read-only, admin-only. */
export const listAudit = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("auditLog"),
      action: v.string(),
      targetType: v.string(),
      targetId: v.string(),
      actorName: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const entries = await ctx.db.query("auditLog").order("desc").take(ADMIN_LIST_LIMIT);

    const rows = [];
    for (const entry of entries) {
      rows.push({
        _id: entry._id,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        actorName: await nameOf(ctx, entry.actorId),
        createdAt: entry.createdAt,
      });
    }
    return rows;
  },
});

/**
 * Operator bootstrap for T12: promote existing accounts whose verified email is
 * on `ADMIN_EMAIL_ALLOWLIST`. Internal-only — no client can call it, and it can
 * only grant a role to an address an operator already configured.
 */
export const promoteFromAllowlist = internalMutation({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const allowlist = readCsvEnv("ADMIN_EMAIL_ALLOWLIST");
    const promoted: string[] = [];

    for (const email of allowlist) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();
      if (user === null || user.role === "admin") continue;
      await ctx.db.patch(user._id, { role: "admin" });
      promoted.push(email);
    }

    return promoted;
  },
});
