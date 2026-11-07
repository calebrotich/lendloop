import { v, type Infer } from "convex/values";

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

/** `lent` is only ever set by an approved/active loan, never by hand. */
export const toolStatusValidator = v.union(
  v.literal("available"),
  v.literal("lent"),
  v.literal("unavailable"),
);
export type ToolStatus = Infer<typeof toolStatusValidator>;

/**
 * `overdue` is not persisted: it is derived from `endDate < now` on an
 * approved/active loan. It appears here because the UI renders it as a status.
 */
export const loanStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("active"),
  v.literal("returned"),
  v.literal("overdue"),
);
export type LoanStatus = Infer<typeof loanStatusValidator>;
