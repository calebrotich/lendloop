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
