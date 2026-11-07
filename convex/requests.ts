import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireRequestParty, requireUser } from "./lib/authz";
import { categoryValidator, loanPhaseValidator, loanStatusValidator } from "./lib/constants";
import { assertLoanWindow, loanPhase, parseDateInput } from "./lib/dates";
import { appError } from "./lib/errors";
import { findBookingOverlap } from "./lib/loans";
import { enqueueRequestNotification } from "./lib/outbox";

const MAX_BORROWER_REQUESTS = 100;
const MAX_OWNER_REQUESTS = 100;
const MAX_NOTE_LENGTH = 300;

function parseWindow(startDate: string, endDate: string) {
  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate);
  if (start === null || end === null) {
    appError("VALIDATION", "Pick both dates as YYYY-MM-DD.");
  }
  assertLoanWindow(start, end, Date.now());
  return { start, end };
}

function cleanNote(note: string | null | undefined): string | undefined {
  if (note === null || note === undefined) return undefined;
  const trimmed = note.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > MAX_NOTE_LENGTH) {
    appError("VALIDATION", `Notes are capped at ${MAX_NOTE_LENGTH} characters.`);
  }
  return trimmed;
}

const mineValidator = v.object({
  _id: v.id("loanRequests"),
  toolId: v.id("tools"),
  toolName: v.string(),
  toolCategory: categoryValidator,
  ownerName: v.string(),
  startDate: v.number(),
  endDate: v.number(),
  status: loanStatusValidator,
  phase: loanPhaseValidator,
  note: v.union(v.null(), v.string()),
  createdAt: v.number(),
});

const incomingValidator = v.object({
  _id: v.id("loanRequests"),
  toolId: v.id("tools"),
  toolName: v.string(),
  borrowerName: v.string(),
  startDate: v.number(),
  endDate: v.number(),
  status: loanStatusValidator,
  phase: loanPhaseValidator,
  note: v.union(v.null(), v.string()),
  createdAt: v.number(),
});

async function nameOf(ctx: QueryCtx | MutationCtx, id: Id<"users">) {
  const user = await ctx.db.get(id);
  return user?.name ?? "A neighbour";
}

/** T6 — ask to borrow a listing for a date range. */
export const create = mutation({
  args: {
    toolId: v.id("tools"),
    startDate: v.string(),
    endDate: v.string(),
    note: v.optional(v.string()),
  },
  returns: v.id("loanRequests"),
  handler: async (ctx, args) => {
    const borrower = await requireUser(ctx);
    const tool = await ctx.db.get(args.toolId);

    if (tool === null || tool.removedAt !== undefined) {
      appError("NOT_FOUND", "That listing no longer exists.");
    }
    if (tool.ownerId === borrower._id) {
      appError("FORBIDDEN", "That’s your own tool — no need to request it.");
    }
    if (tool.status === "unavailable") {
      appError("CONFLICT", "The owner has paused this listing.");
    }

    const { start, end } = parseWindow(args.startDate, args.endDate);
    const note = cleanNote(args.note);

    if (await findBookingOverlap(ctx, tool._id, start, end)) {
      appError("CONFLICT", "Those dates are already booked for this tool.");
    }

    // One open request per tool per borrower: stops a double-submit from
    // becoming two pendings the owner has to decline twice.
    const myPending = await ctx.db
      .query("loanRequests")
      .withIndex("by_borrower_and_status", (q) =>
        q.eq("borrowerId", borrower._id).eq("status", "pending"),
      )
      .take(MAX_BORROWER_REQUESTS);
    const duplicate = myPending.find(
      (request) =>
        request.toolId === tool._id && start <= request.endDate && request.startDate <= end,
    );
    if (duplicate !== undefined) {
      appError("CONFLICT", "You already have a pending request for those dates.");
    }

    const now = Date.now();
    const requestId = await ctx.db.insert("loanRequests", {
      toolId: tool._id,
      ownerId: tool.ownerId,
      borrowerId: borrower._id,
      startDate: start,
      endDate: end,
      status: "pending",
      note,
      createdAt: now,
    });

    // Same transaction as the insert: the owner hears about a request that
    // committed, and a failed enqueue rolls the request back rather than
    // leaving an invisible pending row.
    await enqueueRequestNotification(
      ctx,
      "request.created",
      {
        _id: requestId,
        toolId: tool._id,
        ownerId: tool.ownerId,
        borrowerId: borrower._id,
        startDate: start,
        endDate: end,
      },
      now,
    );

    return requestId;
  },
});

/** T10 — the borrower's view. Scoped by `borrowerId`, never by an argument. */
export const listMine = query({
  args: {},
  returns: v.array(mineValidator),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const now = Date.now();

    const requests = await ctx.db
      .query("loanRequests")
      .withIndex("by_borrower_and_status", (q) => q.eq("borrowerId", user._id))
      .order("desc")
      .take(MAX_BORROWER_REQUESTS);

    const rows = [];
    for (const request of requests) {
      const tool = await ctx.db.get(request.toolId);
      rows.push({
        _id: request._id,
        toolId: request.toolId,
        toolName: tool?.name ?? "Removed listing",
        toolCategory: tool?.category ?? "other",
        ownerName: await nameOf(ctx, request.ownerId),
        startDate: request.startDate,
        endDate: request.endDate,
        status: request.status,
        phase: loanPhase(request, now),
        note: request.note ?? null,
        createdAt: request.createdAt,
      });
    }
    return rows;
  },
});

/** T10 — the owner's inbox for their own tools. */
export const listIncoming = query({
  args: {},
  returns: v.array(incomingValidator),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const now = Date.now();

    const requests = await ctx.db
      .query("loanRequests")
      .withIndex("by_owner_and_status", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .take(MAX_OWNER_REQUESTS);

    const rows = [];
    for (const request of requests) {
      const tool = await ctx.db.get(request.toolId);
      rows.push({
        _id: request._id,
        toolId: request.toolId,
        toolName: tool?.name ?? "Removed listing",
        borrowerName: await nameOf(ctx, request.borrowerId),
        startDate: request.startDate,
        endDate: request.endDate,
        status: request.status,
        phase: loanPhase(request, now),
        note: request.note ?? null,
        createdAt: request.createdAt,
      });
    }
    return rows;
  },
});

/**
 * T7 — approve a pending request on one of your own tools.
 *
 * The overlap check runs again here, in the same transaction as the status
 * change, so two approvals for the same days cannot both land.
 */
export const approve = mutation({
  args: { requestId: v.id("loanRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, request } = await requireRequestParty(ctx, args.requestId);

    if (request.ownerId !== user._id) {
      appError("FORBIDDEN", "Only the owner can decide on this request.");
    }
    if (request.status !== "pending") {
      appError("CONFLICT", "That request has already been decided.");
    }

    const tool = await ctx.db.get(request.toolId);
    if (tool === null || tool.removedAt !== undefined) {
      appError("CONFLICT", "The listing was removed. Decline instead.");
    }

    const clash = await findBookingOverlap(ctx, request.toolId, request.startDate, request.endDate);
    if (clash !== null) {
      appError("CONFLICT", "Those dates overlap a loan you already approved.");
    }

    const now = Date.now();
    await ctx.db.patch(request._id, { status: "approved", decidedAt: now });
    await enqueueRequestNotification(ctx, "request.approved", request, now);
    return null;
  },
});

/** T7 — decline a pending request on one of your own tools. */
export const decline = mutation({
  args: { requestId: v.id("loanRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, request } = await requireRequestParty(ctx, args.requestId);

    if (request.ownerId !== user._id) {
      appError("FORBIDDEN", "Only the owner can decide on this request.");
    }
    if (request.status !== "pending") {
      appError("CONFLICT", "That request has already been decided.");
    }

    const now = Date.now();
    await ctx.db.patch(request._id, { status: "declined", decidedAt: now });
    await enqueueRequestNotification(ctx, "request.declined", request, now);
    return null;
  },
});

/** The borrower withdraws a request that has not been decided. */
export const cancel = mutation({
  args: { requestId: v.id("loanRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, request } = await requireRequestParty(ctx, args.requestId);

    if (request.borrowerId !== user._id) {
      appError("FORBIDDEN", "Only the borrower can cancel this request.");
    }
    if (request.status !== "pending") {
      appError("CONFLICT", "Only a pending request can be cancelled.");
    }

    const now = Date.now();
    await ctx.db.patch(request._id, { status: "cancelled" });
    await enqueueRequestNotification(ctx, "request.cancelled", request, now);
    return null;
  },
});

/**
 * T8 — mark a loan returned. Either party can do it: the owner often gets the
 * tool back in hand, the borrower knows when they dropped it off. Documented in
 * the README.
 */
export const markReturned = mutation({
  args: { requestId: v.id("loanRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { request } = await requireRequestParty(ctx, args.requestId);

    if (request.status !== "approved") {
      appError("CONFLICT", "Only an approved loan can be marked returned.");
    }

    const now = Date.now();
    await ctx.db.patch(request._id, { status: "returned", returnedAt: now });
    await enqueueRequestNotification(ctx, "request.returned", request, now);
    return null;
  },
});
