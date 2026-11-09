import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireRequestParty, requireUser } from "./lib/authz";
import { categoryValidator, loanPhaseValidator, loanStatusValidator } from "./lib/constants";
import { assertLoanWindow, loanDayCount, loanPhase, parseDateInput, startOfDay } from "./lib/dates";
import { appError } from "./lib/errors";
import { findBookingOverlap } from "./lib/loans";
import { imageSummaryForTool, imageSummaryValidator } from "./lib/media";
import { enqueueRequestNotification } from "./lib/outbox";
import { bookingTotalCents } from "./lib/pricing";

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
  ownerTrusted: v.boolean(),
  startDate: v.number(),
  endDate: v.number(),
  dayCount: v.number(),
  dailyRateCents: v.number(),
  valueCents: v.number(),
  totalCents: v.number(),
  status: loanStatusValidator,
  phase: loanPhaseValidator,
  note: v.union(v.null(), v.string()),
  decidedAt: v.union(v.null(), v.number()),
  returnedAt: v.union(v.null(), v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
  images: imageSummaryValidator,
});

const incomingValidator = v.object({
  _id: v.id("loanRequests"),
  toolId: v.id("tools"),
  toolName: v.string(),
  toolCategory: categoryValidator,
  borrowerName: v.string(),
  borrowerTrusted: v.boolean(),
  startDate: v.number(),
  endDate: v.number(),
  dayCount: v.number(),
  dailyRateCents: v.number(),
  valueCents: v.number(),
  totalCents: v.number(),
  status: loanStatusValidator,
  phase: loanPhaseValidator,
  note: v.union(v.null(), v.string()),
  decidedAt: v.union(v.null(), v.number()),
  returnedAt: v.union(v.null(), v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
  images: imageSummaryValidator,
});

/**
 * The last time this request changed. New writes set `updatedAt`; rows created
 * before that field existed fall back to the latest timestamp they carry, so
 * the inboxes can sort by real activity without hiding old loans.
 */
function lastActivityAt(request: Doc<"loanRequests">): number {
  return Math.max(
    request.createdAt,
    request.updatedAt ?? 0,
    request.decidedAt ?? 0,
    request.returnedAt ?? 0,
  );
}

/** The newest change first — deciding a request moves it to the top. */
function byLatestActivity(a: Doc<"loanRequests">, b: Doc<"loanRequests">): number {
  return lastActivityAt(b) - lastActivityAt(a);
}

/**
 * The agreed rate and replacement value live on the request. A loan created
 * before pricing existed falls back to the listing's current terms, and a
 * missing rate reads as free.
 */
function priceFor(request: Doc<"loanRequests">, tool: Doc<"tools"> | null) {
  const dayCount = loanDayCount(request.startDate, request.endDate);
  const dailyRateCents = request.dailyRateCents ?? tool?.dailyRateCents ?? 0;
  const valueCents = request.valueCents ?? tool?.valueCents ?? 0;
  return {
    dayCount,
    dailyRateCents,
    valueCents,
    totalCents: bookingTotalCents(dailyRateCents, dayCount),
  };
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
      // Snapshot the terms: a later edit should not rewrite a booked total or
      // the replacement-value commitment.
      dailyRateCents: tool.dailyRateCents ?? 0,
      valueCents: tool.valueCents ?? 0,
      status: "pending",
      note,
      createdAt: now,
      updatedAt: now,
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
        dailyRateCents: tool.dailyRateCents ?? 0,
        valueCents: tool.valueCents ?? 0,
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
      .take(MAX_BORROWER_REQUESTS);

    // The bounded read keeps this a single indexed pass; the sort makes the
    // list follow the latest decision rather than the status bucket order.
    requests.sort(byLatestActivity);

    const rows = [];
    for (const request of requests) {
      const tool = await ctx.db.get(request.toolId);
      const owner = await ctx.db.get(request.ownerId);
      rows.push({
        _id: request._id,
        toolId: request.toolId,
        toolName: tool?.name ?? "Removed listing",
        toolCategory: tool?.category ?? "other",
        ownerName: owner?.name ?? "A neighbour",
        ownerTrusted: owner?.isTrustedLender ?? false,
        startDate: request.startDate,
        endDate: request.endDate,
        ...priceFor(request, tool),
        status: request.status,
        phase: loanPhase(request, now),
        note: request.note ?? null,
        decidedAt: request.decidedAt ?? null,
        returnedAt: request.returnedAt ?? null,
        createdAt: request.createdAt,
        updatedAt: lastActivityAt(request),
        images: await imageSummaryForTool(ctx, request.toolId),
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
      .take(MAX_OWNER_REQUESTS);

    // Same rule as the borrower view: a request the owner just approved or
    // declined is the one they are most likely to look at next.
    requests.sort(byLatestActivity);

    const rows = [];
    for (const request of requests) {
      const tool = await ctx.db.get(request.toolId);
      const borrower = await ctx.db.get(request.borrowerId);
      rows.push({
        _id: request._id,
        toolId: request.toolId,
        toolName: tool?.name ?? "Removed listing",
        toolCategory: tool?.category ?? "other",
        borrowerName: borrower?.name ?? "A neighbour",
        borrowerTrusted: borrower?.isTrustedLender ?? false,
        startDate: request.startDate,
        endDate: request.endDate,
        ...priceFor(request, tool),
        status: request.status,
        phase: loanPhase(request, now),
        note: request.note ?? null,
        decidedAt: request.decidedAt ?? null,
        returnedAt: request.returnedAt ?? null,
        createdAt: request.createdAt,
        updatedAt: lastActivityAt(request),
        images: await imageSummaryForTool(ctx, request.toolId),
      });
    }
    return rows;
  },
});

/**
 * The header's incoming signal: a bounded count of requests that need an
 * answer, plus the loan states an owner can act on. It is deliberately cheap —
 * two indexed reads and no joins — because it is subscribed on every page.
 */
export const incomingSummary = query({
  args: {},
  returns: v.object({
    pending: v.number(),
    latestPendingAt: v.union(v.null(), v.number()),
    upcoming: v.number(),
    active: v.number(),
    overdue: v.number(),
  }),
  handler: async (ctx) => {
    // The header subscribes to this query on every page, including during the
    // brief window before SyncUser has created the profile. Returning zeroes
    // for an anonymous or not-yet-provisioned caller keeps the public header
    // from crashing; it exposes no data either way.
    const identity = await ctx.auth.getUserIdentity();
    const user =
      identity === null
        ? null
        : await ctx.db
            .query("users")
            .withIndex("by_tokenIdentifier", (q) =>
              q.eq("tokenIdentifier", identity.tokenIdentifier),
            )
            .unique();
    if (user === null) {
      return { pending: 0, latestPendingAt: null, upcoming: 0, active: 0, overdue: 0 };
    }

    const today = startOfDay(Date.now());

    const pending = await ctx.db
      .query("loanRequests")
      .withIndex("by_owner_and_status", (q) => q.eq("ownerId", user._id).eq("status", "pending"))
      .take(MAX_OWNER_REQUESTS);

    const approved = await ctx.db
      .query("loanRequests")
      .withIndex("by_owner_and_status", (q) => q.eq("ownerId", user._id).eq("status", "approved"))
      .take(MAX_OWNER_REQUESTS);

    let upcoming = 0;
    let active = 0;
    let overdue = 0;
    for (const loan of approved) {
      if (loan.endDate < today) overdue += 1;
      else if (loan.startDate > today) upcoming += 1;
      else active += 1;
    }

    const latestPendingAt =
      pending.length === 0 ? null : Math.max(...pending.map((request) => request.createdAt));

    return { pending: pending.length, latestPendingAt, upcoming, active, overdue };
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
    await ctx.db.patch(request._id, { status: "approved", decidedAt: now, updatedAt: now });
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
    await ctx.db.patch(request._id, { status: "declined", decidedAt: now, updatedAt: now });
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
    await ctx.db.patch(request._id, { status: "cancelled", updatedAt: now });
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
    await ctx.db.patch(request._id, { status: "returned", returnedAt: now, updatedAt: now });
    await enqueueRequestNotification(ctx, "request.returned", request, now);
    return null;
  },
});
