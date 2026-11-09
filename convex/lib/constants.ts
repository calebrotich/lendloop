import type { Infer } from "convex/values";
import { v } from "convex/values";

/**
 * Single source of truth for every enum used by the schema and by function
 * arguments. Types are derived from the validators so they cannot drift.
 */

export const roleValidator = v.union(v.literal("user"), v.literal("admin"));
export type Role = Infer<typeof roleValidator>;

export const categoryValidator = v.union(
  v.literal("power_tools"),
  v.literal("hand_tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("cleaning"),
  v.literal("automotive"),
  v.literal("electronics"),
  v.literal("sports_fitness"),
  v.literal("bikes"),
  v.literal("music"),
  v.literal("photography"),
  v.literal("party_events"),
  v.literal("other"),
);
export type Category = Infer<typeof categoryValidator>;

export const conditionValidator = v.union(
  v.literal("new"),
  v.literal("like_new"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("worn"),
);
export type Condition = Infer<typeof conditionValidator>;

/**
 * The owner's intent only. "On loan" is never stored here — it is derived from
 * approved requests (see `loanPhase`), so a missed transition cannot leave a
 * tool permanently marked as lent.
 */
export const toolStatusValidator = v.union(v.literal("available"), v.literal("unavailable"));
export type ToolStatus = Infer<typeof toolStatusValidator>;

/**
 * Stored lifecycle states — every one of them is the result of a mutation.
 * Display states (`upcoming`, `active`, `overdue`) are derived from these plus
 * the date window, so there is no cron that can corrupt them.
 */
export const loanStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
);
export type LoanStatus = Infer<typeof loanStatusValidator>;

/** What the UI shows: stored status, or the derived phase of an approval. */
export const loanPhaseValidator = v.union(
  v.literal("pending"),
  v.literal("upcoming"),
  v.literal("active"),
  v.literal("overdue"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
);
export type LoanPhase = Infer<typeof loanPhaseValidator>;

/** Derived availability of a listing, computed from approved loans. */
export const availabilityValidator = v.union(
  v.literal("available"),
  v.literal("on_loan"),
  v.literal("paused"),
);
export type Availability = Infer<typeof availabilityValidator>;

/**
 * Every automation event the app can record. The `request.*` kinds are also the
 * outbound n8n event names; `overdue.reminder` and the `workflow.*` kinds come
 * back from n8n. Adding a kind here is the only place a new event type is
 * declared — the schema, the outbox and the workflows all read this union.
 */
export const automationEventKindValidator = v.union(
  v.literal("request.created"),
  v.literal("request.approved"),
  v.literal("request.declined"),
  v.literal("request.cancelled"),
  v.literal("request.returned"),
  v.literal("overdue.reminder"),
  v.literal("automation.failed"),
  v.literal("workflow.error"),
  v.literal("workflow.summary"),
);
export type AutomationEventKind = Infer<typeof automationEventKindValidator>;

/** The four loan transitions that produce a notification. */
export type RequestEventKind = Extract<
  AutomationEventKind,
  | "request.created"
  | "request.approved"
  | "request.declined"
  | "request.cancelled"
  | "request.returned"
>;

/** How an automation event reached (or failed to reach) a person. */
export const automationChannelValidator = v.union(
  v.literal("email"),
  v.literal("slack"),
  v.literal("webhook"),
  v.literal("log"),
);
export type AutomationChannel = Infer<typeof automationChannelValidator>;

export const automationEventStatusValidator = v.union(v.literal("sent"), v.literal("failed"));
export type AutomationEventStatus = Infer<typeof automationEventStatusValidator>;

export const outboxTargetValidator = v.union(v.literal("n8n_request"), v.literal("n8n_error"));
export type OutboxTarget = Infer<typeof outboxTargetValidator>;

export const outboxStatusValidator = v.union(
  v.literal("pending"),
  v.literal("sending"),
  v.literal("sent"),
  v.literal("failed"),
);
export type OutboxStatus = Infer<typeof outboxStatusValidator>;

/** A short-lived permission to upload one object (see `toolImageUploads`). */
export const imageUploadStatusValidator = v.union(
  v.literal("pending"),
  v.literal("failed"),
  v.literal("expired"),
);
export type ImageUploadStatus = Infer<typeof imageUploadStatusValidator>;

/** A storage delete is either waiting for the media cron or has given up. */
export const storageDeleteStatusValidator = v.union(v.literal("pending"), v.literal("failed"));
export type StorageDeleteStatus = Infer<typeof storageDeleteStatusValidator>;
