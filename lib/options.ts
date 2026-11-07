import type { Category, Condition } from "@/convex/lib/constants";

/**
 * UI labels and ordered option lists for the stored enums.
 *
 * Kept out of `convex/lib/constants.ts` so display copy never ships into the
 * backend bundle, and kept as explicit tuples so `<select>` order is deliberate
 * rather than whatever `Object.keys` happens to return.
 */
export const CATEGORY_LABELS: Record<Category, string> = {
  power_tools: "Power tools",
  hand_tools: "Hand tools",
  garden: "Garden",
  kitchen: "Kitchen",
  camping: "Camping",
  cleaning: "Cleaning",
  automotive: "Automotive",
  other: "Other",
};

export const CATEGORIES = [
  "power_tools",
  "hand_tools",
  "garden",
  "kitchen",
  "camping",
  "cleaning",
  "automotive",
  "other",
] as const satisfies readonly Category[];

export const CONDITION_LABELS: Record<Condition, string> = {
  new: "New",
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
  worn: "Worn",
};

export const CONDITIONS = [
  "new",
  "like_new",
  "good",
  "fair",
  "worn",
] as const satisfies readonly Condition[];
