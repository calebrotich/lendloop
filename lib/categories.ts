import type { Category } from "@/convex/lib/constants";

/**
 * Human labels for the stored enum values. Kept out of `convex/lib/constants.ts`
 * so UI copy never ships into the backend bundle.
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
