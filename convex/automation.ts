import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { requireAdmin, requireUser } from "./lib/authz";
import {
  automationChannelValidator,
  automationEventKindValidator,
  automationEventStatusValidator,
  outboxTargetValidator,
} from "./lib/constants";
import { DAY_MS, formatDateInput, startOfDay } from "./lib/dates";
import { readEnv } from "./lib/env";
import { appError } from "./lib/errors";
import { signedHeaders } from "./lib/hmac";
import { renderReminderEmail } from "./lib/emailTemplates";
import { imageSummaryForTool } from "./lib/media";
import type { AutomationAlertPayload, OverdueLoan } from "./lib/n8n";
import { deepLinkFor, truncateDetail } from "./lib/n8n";
import type { ClaimedOutboxRow } from "./lib/outbox";
import {
  backoffMs,
  enqueueOutbox,
  MAX_ATTEMPTS,
  OUTBOX_BATCH,
  OUTBOX_LEASE_MS,
  recordAutomationEvent,
} from "./lib/outbox";

const FEED_LIMIT = 20;
const OPS_LIMIT = 100;
const OVERDUE_LIMIT = 50;

const eventViewValidator = v.object({
  _id: v.id("automationEvents"),
  kind: automationEventKindValidator,
  channel: automationChannelValidator,
  status: automationEventStatusValidator,
  detail: v.union(v.null(), v.string()),
  createdAt: v.number(),
});

/**
 * T25 — the automation trail for one loan. Participants only (admins may audit
 * any loan); the check reads the request row, never a caller-supplied role.
 */
export const listForLoan = query({
  args: { loanRequestId: v.id("loanRequests") },
  returns: v.array(eventViewValidator),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.loanRequestId);

    if (request === null) {
      appError("NOT_FOUND", "That request no longer exists.");
    }
    const isParticipant = request.ownerId === user._id || request.borrowerId === user._id;
    if (!isParticipant && user.role !== "admin") {
      appError("FORBIDDEN", "That request isn’t yours.");
    }

    const events = await ctx.db
      .query("automationEvents")
      .withIndex("by_loanRequestId", (q) => q.eq("loanRequestId", args.loanRequestId))
      .order("desc")
      .take(FEED_LIMIT);

    return events.map((event) => ({
      _id: event._id,
      kind: event.kind,
      channel: event.channel,
      status: event.status,
      detail: event.detail ?? null,
      createdAt: event.createdAt,
    }));
  },
});

/**
 * T24 — an admin's view of automation health: how much is queued, what has
 * permanently failed, and the most recent events. Counts are bounded reads
 * (`take`, not `collect().length`); the UI says "up to" where it matters.
 */
export const adminHealth = query({
  args: {},
  returns: v.object({
    pending: v.number(),
    failed: v.number(),
    recent: v.array(
      v.object({
        _id: v.id("automationEvents"),
        kind: automationEventKindValidator,
        channel: automationChannelValidator,
        status: automationEventStatusValidator,
        detail: v.union(v.null(), v.string()),
        loanRequestId: v.union(v.null(), v.id("loanRequests")),
        createdAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const pending = await ctx.db
      .query("automationOutbox")
      .withIndex("by_status_and_nextAttemptAt", (q) => q.eq("status", "pending"))
      .take(OPS_LIMIT);
    const failed = await ctx.db
      .query("automationOutbox")
      .withIndex("by_status_and_nextAttemptAt", (q) => q.eq("status", "failed"))
      .take(OPS_LIMIT);
    const recent = await ctx.db
      .query("automationEvents")
      .withIndex("by_createdAt")
      .order("desc")
      .take(FEED_LIMIT);

    return {
      pending: pending.length,
      failed: failed.length,
      recent: recent.map((event) => ({
        _id: event._id,
        kind: event.kind,
        channel: event.channel,
        status: event.status,
        detail: event.detail ?? null,
        loanRequestId: event.loanRequestId ?? null,
        createdAt: event.createdAt,
      })),
    };
  },
});

/**
 * T20 — the loans W2 should remind about. Approved, past their end date, and
 * only where there is an address to send to. `asOf` is passed in so the HTTP
 * caller and the tests see the same "today".
 */
export const listOverdue = internalQuery({
  args: { asOf: v.number(), limit: v.optional(v.number()) },
  returns: v.object({
    asOf: v.number(),
    loans: v.array(
      v.object({
        loanRequestId: v.id("loanRequests"),
        toolName: v.string(),
        borrowerName: v.string(),
        borrowerEmail: v.string(),
        startDate: v.number(),
        endDate: v.number(),
        daysOverdue: v.number(),
        dueDate: v.string(),
        deepLink: v.string(),
        email: v.object({
          subject: v.string(),
          html: v.string(),
          text: v.string(),
        }),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? OVERDUE_LIMIT, 1), 100);
    const today = startOfDay(args.asOf);

    const rows = await ctx.db
      .query("loanRequests")
      .withIndex("by_status_and_endDate", (q) => q.eq("status", "approved").lt("endDate", today))
      .take(limit);

    const loans: OverdueLoan[] = [];
    for (const loan of rows) {
      const [tool, borrower] = await Promise.all([
        ctx.db.get(loan.toolId),
        ctx.db.get(loan.borrowerId),
      ]);
      if (borrower === null || borrower.email.trim().length === 0) continue;

      const toolName = tool?.name ?? "Removed listing";
      const dueDate = formatDateInput(loan.endDate);
      // Calendar-day difference, so a loan stored at any time of day still
      // reads as "overdue by 3 days" on day three, never 2.
      const daysOverdue = Math.max(1, Math.round((today - startOfDay(loan.endDate)) / DAY_MS));
      const deepLink = deepLinkFor("my-requests", loan._id);
      const cover = tool === null ? null : (await imageSummaryForTool(ctx, tool._id)).cover;

      loans.push({
        loanRequestId: loan._id,
        toolName,
        borrowerName: borrower.name,
        borrowerEmail: borrower.email,
        startDate: loan.startDate,
        endDate: loan.endDate,
        daysOverdue,
        dueDate,
        deepLink,
        email: renderReminderEmail({
          borrowerName: borrower.name,
          toolName,
          toolImageUrl: cover === null ? null : cover.url,
          dueDate,
          daysOverdue,
          deepLink,
        }),
      });
    }

    return { asOf: args.asOf, loans };
  },
});

/**
 * T20/T23 — n8n writes a reminder back. The idempotency key is derived from
 * `(loan, dueDate, dayOffset)`, so a duplicate POST returns
 * `{ accepted: true, deduped: true }` and creates nothing.
 *
 * A loan that was returned between the fetch and the write-back is not an error:
 * `accepted: false` keeps n8n from retrying a reminder nobody needs.
 */
export const recordReminder = internalMutation({
  args: {
    loanRequestId: v.id("loanRequests"),
    dayOffset: v.number(),
    dueDate: v.string(),
    channel: automationChannelValidator,
    status: v.union(v.literal("sent"), v.literal("failed")),
    sentAt: v.number(),
  },
  returns: v.object({
    accepted: v.boolean(),
    deduped: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const loan = await ctx.db.get(args.loanRequestId);
    if (loan === null) {
      return { accepted: false, deduped: false, reason: "not_found" };
    }
    if (loan.status !== "approved" || loan.endDate >= startOfDay(Date.now())) {
      return { accepted: false, deduped: false, reason: "not_overdue" };
    }

    const result = await recordAutomationEvent(ctx, {
      loanRequestId: loan._id,
      kind: "overdue.reminder",
      channel: args.channel,
      status: args.status,
      idempotencyKey: `reminder:${loan._id}:${args.dueDate}:${args.dayOffset}`,
      detail: `day ${args.dayOffset} overdue`,
      now: args.sentAt,
    });

    return { accepted: true, deduped: result.deduped };
  },
});

/**
 * T24 — errors and run summaries from W2/W3. An error is recorded as `failed`
 * so it shows up in the admin health panel and, when linked, on the loan.
 */
export const recordWorkflowEvent = internalMutation({
  args: {
    kind: v.union(v.literal("workflow.error"), v.literal("workflow.summary")),
    workflow: v.string(),
    executionId: v.optional(v.string()),
    loanRequestId: v.optional(v.id("loanRequests")),
    message: v.optional(v.string()),
    counts: v.optional(v.object({ sent: v.number(), failed: v.number() })),
    occurredAt: v.number(),
  },
  returns: v.object({ deduped: v.boolean() }),
  handler: async (ctx, args) => {
    // A stale link (loan hard-deleted outside the app) must not drop the event.
    let loanRequestId = args.loanRequestId;
    if (loanRequestId !== undefined) {
      const loan = await ctx.db.get(loanRequestId);
      if (loan === null) loanRequestId = undefined;
    }

    const key =
      args.executionId !== undefined
        ? `n8n:${args.kind}:${args.executionId}`
        : `n8n:${args.kind}:${args.workflow}:${args.occurredAt}`;

    const detail =
      args.message ??
      (args.counts !== undefined
        ? `sent ${args.counts.sent}, failed ${args.counts.failed}`
        : undefined);

    const result = await recordAutomationEvent(ctx, {
      loanRequestId,
      kind: args.kind,
      channel: "webhook",
      status: args.kind === "workflow.error" ? "failed" : "sent",
      idempotencyKey: key,
      detail: detail === undefined ? undefined : truncateDetail(detail),
      now: args.occurredAt,
    });

    return { deduped: result.deduped };
  },
});

/**
 * Claim a batch for the drain action.
 *
 * `sending` rows carry a lease in `nextAttemptAt`. A crash leaves the row stuck
 * in `sending`, so the next drain releases expired leases before claiming new
 * work — no row is stranded and none is sent twice by two concurrent drains.
 */
export const claimOutbox = internalMutation({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("automationOutbox"),
      kind: automationEventKindValidator,
      target: outboxTargetValidator,
      payload: v.string(),
      idempotencyKey: v.string(),
      attempts: v.number(),
    }),
  ),
  handler: async (ctx, args): Promise<ClaimedOutboxRow[]> => {
    const now = Date.now();
    const limit = Math.min(Math.max(args.limit ?? OUTBOX_BATCH, 1), 25);

    const stuck = await ctx.db
      .query("automationOutbox")
      .withIndex("by_status_and_nextAttemptAt", (q) =>
        q.eq("status", "sending").lte("nextAttemptAt", now),
      )
      .take(limit);
    for (const row of stuck) {
      await ctx.db.patch(row._id, {
        status: "pending",
        nextAttemptAt: now,
        lastError: "lease expired before delivery was recorded",
        updatedAt: now,
      });
    }

    const pending = await ctx.db
      .query("automationOutbox")
      .withIndex("by_status_and_nextAttemptAt", (q) =>
        q.eq("status", "pending").lte("nextAttemptAt", now),
      )
      .take(limit);

    const claimed: ClaimedOutboxRow[] = [];
    for (const row of pending) {
      const attempts = row.attempts + 1;
      await ctx.db.patch(row._id, {
        status: "sending",
        attempts,
        // While sending, this is the lease deadline.
        nextAttemptAt: now + OUTBOX_LEASE_MS,
        updatedAt: now,
      });
      claimed.push({
        _id: row._id,
        kind: row.kind,
        target: row.target,
        payload: row.payload,
        idempotencyKey: row.idempotencyKey,
        attempts,
      });
    }
    return claimed;
  },
});

/**
 * Record the outcome of one delivery.
 *
 * - sent → event for the loan, done.
 * - retryable failure → `pending` with backoff, attempts already counted at claim.
 * - terminal (6th attempt, or a permanent config error) → `failed`, a visible
 *   event, and one alert to the error workflow. Alert rows themselves never
 *   spawn another alert, so this cannot recurse.
 */
export const finishOutbox = internalMutation({
  args: {
    id: v.id("automationOutbox"),
    outcome: v.union(v.literal("sent"), v.literal("failed")),
    error: v.optional(v.string()),
    permanent: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (row === null || row.status !== "sending") return null;

    const now = Date.now();
    const message = args.error?.trim();
    const errorDetail = message !== undefined && message.length > 0 ? message : "unknown error";

    if (args.outcome === "sent") {
      await ctx.db.patch(row._id, { status: "sent", updatedAt: now, lastError: undefined });
      await recordAutomationEvent(ctx, {
        loanRequestId: row.loanRequestId,
        kind: row.kind,
        channel: "webhook",
        status: "sent",
        idempotencyKey: `outbox:${row.idempotencyKey}:sent`,
        detail: `handed to n8n on attempt ${row.attempts}`,
        now,
      });
      return null;
    }

    const permanent = args.permanent === true || row.attempts >= MAX_ATTEMPTS;
    if (!permanent) {
      await ctx.db.patch(row._id, {
        status: "pending",
        nextAttemptAt: now + backoffMs(row.attempts),
        lastError: truncateDetail(errorDetail),
        updatedAt: now,
      });
      return null;
    }

    await ctx.db.patch(row._id, {
      status: "failed",
      lastError: truncateDetail(errorDetail),
      updatedAt: now,
    });
    await recordAutomationEvent(ctx, {
      loanRequestId: row.loanRequestId,
      kind: "automation.failed",
      channel: "webhook",
      status: "failed",
      idempotencyKey: `outbox:${row.idempotencyKey}:failed`,
      detail: `gave up after ${row.attempts} attempt(s): ${truncateDetail(errorDetail, 120)}`,
      now,
    });

    if (row.target === "n8n_request") {
      const alertKey = `outbox:${row.idempotencyKey}:alert`;
      const alert: AutomationAlertPayload = {
        kind: "automation.failed",
        idempotencyKey: alertKey,
        occurredAt: now,
        workflow: "convex-outbox",
        message: truncateDetail(errorDetail, 300),
        ...(row.loanRequestId !== undefined ? { loanRequestId: row.loanRequestId } : {}),
      };
      await enqueueOutbox(ctx, {
        kind: "automation.failed",
        target: "n8n_error",
        payload: JSON.stringify(alert),
        idempotencyKey: alertKey,
        loanRequestId: row.loanRequestId,
        now,
      });
    }
    return null;
  },
});

/**
 * T19/T24 — drain the outbox. Runs from the one-minute cron; each row is signed
 * with a fresh timestamp and sent with a 10s timeout. Failures are recorded, not
 * swallowed, and the action itself never throws on a delivery failure so one bad
 * row cannot stop the batch.
 */
export const drainOutbox = internalAction({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ claimed: v.number(), sent: v.number(), failed: v.number() }),
  handler: async (ctx, args) => {
    const secret = readEnv("N8N_HMAC_SECRET");
    const claimed: ClaimedOutboxRow[] = await ctx.runMutation(internal.automation.claimOutbox, {
      limit: args.limit ?? OUTBOX_BATCH,
    });

    let sent = 0;
    let failed = 0;

    for (const row of claimed) {
      const url = readEnv(
        row.target === "n8n_request" ? "N8N_REQUEST_WEBHOOK_URL" : "N8N_ERROR_WEBHOOK_URL",
      );

      if (!secret || !url) {
        // Configuration is not transient; retrying cannot fix it.
        await ctx.runMutation(internal.automation.finishOutbox, {
          id: row._id,
          outcome: "failed",
          error: !secret ? "N8N_HMAC_SECRET is not set" : "the webhook URL is not set",
          permanent: true,
        });
        failed += 1;
        continue;
      }

      try {
        const headers = await signedHeaders({
          secret,
          payload: row.payload,
          idempotencyKey: row.idempotencyKey,
        });
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: row.payload,
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        await ctx.runMutation(internal.automation.finishOutbox, {
          id: row._id,
          outcome: "sent",
        });
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "network error";
        await ctx.runMutation(internal.automation.finishOutbox, {
          id: row._id,
          outcome: "failed",
          error: message,
        });
        failed += 1;
      }
    }

    return { claimed: claimed.length, sent, failed };
  },
});
