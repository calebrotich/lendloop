import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type DbCtx = QueryCtx | MutationCtx;

/** Bookings are bounded: one tool cannot realistically have 50 live approvals. */
const BOOKING_SCAN = 50;

async function approvedForTool(ctx: DbCtx, toolId: Id<"tools">) {
  return await ctx.db
    .query("loanRequests")
    .withIndex("by_tool_and_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .take(BOOKING_SCAN);
}

/**
 * Does an approved loan for this tool overlap the requested days?
 *
 * Checked inside `create` for fast feedback and again inside `approve`, in the
 * same transaction that flips the status, so two owners approving at once can
 * never double-book: the second write sees the first and fails CONFLICT.
 */
export async function findBookingOverlap(
  ctx: DbCtx,
  toolId: Id<"tools">,
  startDate: number,
  endDate: number,
) {
  const approved = await approvedForTool(ctx, toolId);
  return approved.find((loan) => startDate <= loan.endDate && loan.startDate <= endDate) ?? null;
}
