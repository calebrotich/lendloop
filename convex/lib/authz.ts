import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "./errors";

type AuthCtx = QueryCtx | MutationCtx;

/**
 * Clerk proves *who* is calling; this is the only place identity enters a
 * function. No function may accept a user id or role as an argument.
 */
export async function requireIdentity(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    appError("UNAUTHORIZED", "Sign in to continue.");
  }
  return identity;
}

/**
 * Identity → the local `users` row that carries `role` and `isTrustedLender`.
 * Every authorisation decision reads the row from the database, never the token.
 */
export async function requireUser(ctx: AuthCtx) {
  const identity = await requireIdentity(ctx);
  const user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();

  if (user === null) {
    appError("UNAUTHORIZED", "No profile for this session. Sign in again.");
  }
  return user;
}

/**
 * Load a tool and prove the caller owns it.
 *
 * The ownership check reads `tool.ownerId` from the database — never a value
 * from the request — so a forged `ownerId` argument is impossible: no function
 * takes one.
 */
export async function requireOwnedTool(ctx: AuthCtx, toolId: Id<"tools">) {
  const user = await requireUser(ctx);
  const tool = await ctx.db.get(toolId);

  if (tool === null || tool.removedAt !== undefined) {
    appError("NOT_FOUND", "That listing no longer exists.");
  }
  if (tool.ownerId !== user._id) {
    appError("FORBIDDEN", "You can only change your own listings.");
  }

  return { user, tool };
}

/**
 * Load a loan request and prove the caller is one of its two parties. Which
 * party is allowed to do what is decided by each mutation, not here.
 */
export async function requireRequestParty(ctx: AuthCtx, requestId: Id<"loanRequests">) {
  const user = await requireUser(ctx);
  const request = await ctx.db.get(requestId);

  if (request === null) {
    appError("NOT_FOUND", "That request no longer exists.");
  }

  if (request.ownerId !== user._id && request.borrowerId !== user._id) {
    appError("FORBIDDEN", "That request isn't yours.");
  }

  return { user, request };
}

/**
 * T12/T18 — administration. The role is read from the `users` row, never from
 * the token or the request, so a client cannot claim it.
 */
export async function requireAdmin(ctx: AuthCtx) {
  const user = await requireUser(ctx);
  if (user.role !== "admin") {
    appError("FORBIDDEN", "That action is for admins.");
  }
  return user;
}
