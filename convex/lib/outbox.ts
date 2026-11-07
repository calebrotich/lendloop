import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type {
  AutomationChannel,
  AutomationEventKind,
  AutomationEventStatus,
  OutboxTarget,
  RequestEventKind,
} from "./constants";
import { formatDateInput } from "./dates";
import { deepLinkFor, type RequestNotificationPayload } from "./n8n";

/**
 * Outbox + event helpers shared by request mutations and the drain action.
 *
 * Two rules make this trustworthy:
 * 1. A mutation only *enqueues*; it never performs I/O. The write is in the same
 *    transaction as the status change, so a request cannot be approved without
 *    its notification being queued.
 * 2. Every insert is guarded by a read of its idempotency key. Convex has no
 *    unique constraint, so the index lookup + insert in one transaction is the
 *    uniqueness guarantee (T23).
 */

export const MAX_ATTEMPTS = 6;
export const OUTBOX_LEASE_MS = 5 * 60_000;
export const OUTBOX_BATCH = 10;

/** Retry delays after the 1st..5th failure; the 6th is terminal. */
const BACKOFF_MS = [60_000, 120_000, 300_000, 900_000, 1_800_000] as const;

export function backoffMs(attempt: number): number {
  const index = Math.min(Math.max(attempt - 1, 0), BACKOFF_MS.length - 1);
  return BACKOFF_MS[index] ?? 1_800_000;
}

/** Just the fields a notification needs — callers may pass a freshly built row. */
export interface NotifiableRequest {
  _id: Id<"loanRequests">;
  toolId: Id<"tools">;
  ownerId: Id<"users">;
  borrowerId: Id<"users">;
  startDate: number;
  endDate: number;
}

export interface EventInput {
  loanRequestId?: Id<"loanRequests">;
  kind: AutomationEventKind;
  channel: AutomationChannel;
  status: AutomationEventStatus;
  idempotencyKey: string;
  detail?: string;
  now: number;
}

/**
 * Insert an event unless its key already exists. Returns `deduped: true` for a
 * duplicate — the caller treats that as success, not as an error (T23).
 */
export async function recordAutomationEvent(
  ctx: MutationCtx,
  input: EventInput,
): Promise<{ deduped: boolean; id: Id<"automationEvents"> }> {
  const existing = await ctx.db
    .query("automationEvents")
    .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", input.idempotencyKey))
    .unique();

  if (existing !== null) return { deduped: true, id: existing._id };

  const id = await ctx.db.insert("automationEvents", {
    loanRequestId: input.loanRequestId,
    kind: input.kind,
    channel: input.channel,
    status: input.status,
    idempotencyKey: input.idempotencyKey,
    detail: input.detail,
    createdAt: input.now,
  });
  return { deduped: false, id };
}

export interface EnqueueInput {
  kind: AutomationEventKind;
  target: OutboxTarget;
  payload: string;
  idempotencyKey: string;
  loanRequestId?: Id<"loanRequests">;
  now: number;
}

/** What the drain action receives for each claimed row. */
export interface ClaimedOutboxRow {
  _id: Id<"automationOutbox">;
  kind: AutomationEventKind;
  target: OutboxTarget;
  payload: string;
  idempotencyKey: string;
  attempts: number;
}

/** Insert an outbox row unless its key exists. Returns the row id either way. */
export async function enqueueOutbox(
  ctx: MutationCtx,
  input: EnqueueInput,
): Promise<{ id: Id<"automationOutbox">; deduped: boolean }> {
  const existing = await ctx.db
    .query("automationOutbox")
    .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", input.idempotencyKey))
    .unique();

  if (existing !== null) return { id: existing._id, deduped: true };

  const id = await ctx.db.insert("automationOutbox", {
    kind: input.kind,
    target: input.target,
    payload: input.payload,
    idempotencyKey: input.idempotencyKey,
    loanRequestId: input.loanRequestId,
    status: "pending",
    attempts: 0,
    nextAttemptAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
  });
  return { id, deduped: false };
}

/**
 * Queue the notification for one request transition.
 *
 * Who hears about it:
 * - created  → the owner ("someone wants your drill")
 * - approved / declined / cancelled → the borrower (the decision affects them)
 * - returned → the owner ("it is back and relisted")
 *
 * Payload minimisation: recipient name + address, tool name, dates, deep link.
 * No descriptions, no third-party addresses, no listing or loan IDs beyond the
 * idempotency key.
 */
export async function enqueueRequestNotification(
  ctx: MutationCtx,
  event: RequestEventKind,
  request: NotifiableRequest,
  now: number,
): Promise<void> {
  const suffix = event.slice("request.".length);
  const idempotencyKey = `request:${request._id}:${suffix}`;

  const existing = await ctx.db
    .query("automationOutbox")
    .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
    .unique();
  if (existing !== null) return;

  const notifyOwner = event === "request.created" || event === "request.returned";
  const [tool, owner, borrower] = await Promise.all([
    ctx.db.get(request.toolId),
    ctx.db.get(request.ownerId),
    ctx.db.get(request.borrowerId),
  ]);
  const recipient = notifyOwner ? owner : borrower;
  const recipientName = recipient?.name ?? "A neighbour";

  if (recipient === null || recipient.email.trim().length === 0) {
    // Visible, not silent: the feed shows why nothing was delivered, and there is
    // nothing to retry.
    await recordAutomationEvent(ctx, {
      loanRequestId: request._id,
      kind: event,
      channel: "email",
      status: "failed",
      idempotencyKey,
      detail: "recipient has no email address",
      now,
    });
    return;
  }

  const payload: RequestNotificationPayload = {
    event,
    idempotencyKey,
    occurredAt: now,
    recipient: { name: recipientName, email: recipient.email },
    tool: { name: tool?.name ?? "Removed listing" },
    window: {
      start: formatDateInput(request.startDate),
      end: formatDateInput(request.endDate),
    },
    deepLink: deepLinkFor(notifyOwner ? "incoming-requests" : "my-requests", request._id),
  };

  await enqueueOutbox(ctx, {
    kind: event,
    target: "n8n_request",
    payload: JSON.stringify(payload),
    idempotencyKey,
    loanRequestId: request._id,
    now,
  });
}
