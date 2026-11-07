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
