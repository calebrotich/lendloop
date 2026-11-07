import { v } from "convex/values";

import { query } from "./_generated/server";
import { categoryValidator } from "./lib/constants";

/** Bounded by design: the public page is a shelf, not a data export. */
const MAX_PUBLIC_TOOLS = 60;

/**
 * T3 — the only anonymous read in the app.
 *
 * Deliberately returns a projection of exactly `name` and `category`. No
 * `_id`, no `ownerId`, no `description`, no `condition`: the public page cannot
 * leak who owns what, and the return validator enforces that at runtime so a
 * future edit cannot quietly widen it.
 */
export const listPublic = query({
  args: {},
  returns: v.array(
    v.object({
      name: v.string(),
      category: categoryValidator,
    }),
  ),
  handler: async (ctx) => {
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_status", (q) => q.eq("status", "available"))
      .order("desc")
      .take(MAX_PUBLIC_TOOLS);

    return tools
      .filter((tool) => tool.removedAt === undefined)
      .map((tool) => ({ name: tool.name, category: tool.category }));
  },
});
