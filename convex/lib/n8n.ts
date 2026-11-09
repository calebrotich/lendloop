import { z } from "zod";

import type { Id } from "../_generated/dataModel";
import { DEFAULT_APP_BASE_URL } from "./appUrl";
import type { RequestEventKind } from "./constants";
import { readEnv } from "./env";

/**
 * The wire contract between Convex and n8n, in one file.
 *
 * `docs/n8n.md` is the human-readable copy; this module is the executable one.
 * The outbox stores exactly `JSON.stringify(payload)`, and the workflows verify
 * the signature over those bytes, so nothing here may be rebuilt at send time.
 */

export const requestEventKinds = [
  "request.created",
  "request.approved",
  "request.declined",
  "request.cancelled",
  "request.returned",
] as const satisfies readonly RequestEventKind[];

export interface RequestNotificationPayload {
  event: RequestEventKind;
  idempotencyKey: string;
  occurredAt: number;
  /** Only the recipient's own address: no third-party emails leave the app. */
  recipient: { name: string; email: string };
  tool: { name: string };
  window: { start: string; end: string };
  deepLink: string;
  /**
   * The finished message, rendered by Convex. n8n transports it verbatim and
   * never re-renders, so the design lives in one place (`emailTemplates.ts`)
   * instead of being duplicated across workflow JSON.
   */
  email: { subject: string; html: string; text: string };
}

/** Convex IDs are opaque; this only rejects obvious junk before a DB lookup. */
const convexId = z.string().regex(/^[a-z0-9]{10,64}$/i, "invalid id");

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

/**
 * Validator for the outbound payload. Used by tests to prove the shape never
 * drifts; the HTTP side never receives this document.
 */
export const requestNotificationSchema = z.object({
  event: z.enum(requestEventKinds),
  idempotencyKey: z.string().min(1).max(200),
  occurredAt: z.number().int().nonnegative(),
  recipient: z.object({
    name: z.string().min(1).max(80),
    email: z.string().min(3).max(254),
  }),
  tool: z.object({ name: z.string().min(1).max(80) }),
  window: z.object({ start: isoDay, end: isoDay }),
  deepLink: z.string().min(1).max(500),
  email: z.object({
    subject: z.string().min(1).max(200),
    html: z.string().min(1).max(200_000),
    text: z.string().min(1).max(20_000),
  }),
});

/** `POST /n8n/overdue-loans` — body is optional because n8n can omit it. */
export const overdueRequestSchema = z.object({
  asOf: z.number().int().positive().optional(),
});

/**
 * `POST /n8n/reminders` — n8n reports one reminder it has just sent.
 *
 * The server derives the idempotency key from `(loan, dueDate, dayOffset)`
 * instead of trusting the one in the body, so a bug in one n8n expression cannot
 * collide two loans' reminders.
 */
export const reminderSchema = z.object({
  loanRequestId: convexId,
  kind: z.literal("overdue_reminder"),
  dayOffset: z.number().int().min(0).max(365),
  dueDate: isoDay,
  channel: z.enum(["email", "slack", "log"]),
  status: z.enum(["sent", "failed"]),
  sentAt: z.number().int().positive(),
});

/** `POST /n8n/automation-events` — errors and run summaries from W2/W3. */
export const workflowEventSchema = z.object({
  kind: z.enum(["workflow.error", "workflow.summary"]),
  workflow: z.string().min(1).max(120),
  executionId: z.string().min(1).max(120).optional(),
  loanRequestId: convexId.optional(),
  message: z.string().max(500).optional(),
  counts: z
    .object({
      sent: z.number().int().min(0).max(5000),
      failed: z.number().int().min(0).max(5000),
    })
    .optional(),
  occurredAt: z.number().int().positive(),
});

export type WorkflowEventBody = z.infer<typeof workflowEventSchema>;
export type ReminderBody = z.infer<typeof reminderSchema>;

/** A loan as W2 consumes it. Minimised: no description, no listing metadata. */
export interface OverdueLoan {
  loanRequestId: Id<"loanRequests">;
  toolName: string;
  borrowerName: string;
  borrowerEmail: string;
  startDate: number;
  endDate: number;
  daysOverdue: number;
  dueDate: string;
  /** Deep link into the borrower's requests page. */
  deepLink: string;
  /** Reminder message, rendered by Convex (see `emailTemplates.ts`). */
  email: { subject: string; html: string; text: string };
}

/**
 * Alert sent to the error workflow when an outbox row exhausts its retries
 * Deliberately small: a human needs to know what failed, not the payload.
 */
export interface AutomationAlertPayload {
  kind: "automation.failed";
  idempotencyKey: string;
  occurredAt: number;
  workflow: string;
  message: string;
  loanRequestId?: string;
}

export function appBaseUrl(): string {
  const configured = readEnv("APP_BASE_URL") ?? DEFAULT_APP_BASE_URL;
  return configured.replace(/\/+$/, "");
}

/**
 * Links point at the routed view that contains the request. The `request` query
 * parameter is a stable hook for a future detail page; today the lists ignore it.
 */
export function deepLinkFor(path: "incoming-requests" | "my-requests", requestId: string): string {
  return `${appBaseUrl()}/${path}?request=${requestId}`;
}

/** Keep free-text fields out of the events table's detail column. */
export function truncateDetail(value: string, max = 200): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export function requestEventLabel(event: RequestEventKind): string {
  switch (event) {
    case "request.created":
      return "Request sent";
    case "request.approved":
      return "Approved";
    case "request.declined":
      return "Declined";
    case "request.cancelled":
      return "Withdrawn";
    case "request.returned":
      return "Returned";
  }
}
