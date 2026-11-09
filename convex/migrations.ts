import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { suggestedDailyRateCents } from "./lib/pricing";

/**
 * One-off backfill for listings created before pricing existed.
 *
 * Pricing is stored in cents. Listings with neither field get a category-typical
 * value and the 4% suggested rate; a listing that only has one of the two gets
 * the other derived from it. An explicit zero daily rate is left alone — that is
 * an owner choosing to lend for free, not missing data.
 *
 * Operator action, never client-callable:
 *   pnpm exec convex run migrations:backfillPricing
 */
const CATEGORY_VALUE_CENTS: Record<string, number> = {
  power_tools: 12_000,
  hand_tools: 4_000,
  garden: 8_000,
  kitchen: 6_000,
  camping: 15_000,
  cleaning: 20_000,
  automotive: 10_000,
  other: 7_000,
};

export const backfillPricing = internalMutation({
  args: {},
  returns: v.object({ scanned: v.number(), updated: v.number() }),
  handler: async (ctx) => {
    const tools = await ctx.db.query("tools").take(500);
    let updated = 0;

    for (const tool of tools) {
      const hasValue = tool.valueCents !== undefined;
      const hasRate = tool.dailyRateCents !== undefined;
      if (hasValue && hasRate) continue;

      const impliedFromRate = (tool.dailyRateCents ?? 0) * 25;
      const valueCents =
        tool.valueCents ??
        (impliedFromRate > 0 ? impliedFromRate : (CATEGORY_VALUE_CENTS[tool.category] ?? 5_000));
      const dailyRateCents = tool.dailyRateCents ?? suggestedDailyRateCents(valueCents);

      await ctx.db.patch(tool._id, { valueCents, dailyRateCents });
      updated += 1;
    }

    return { scanned: tools.length, updated };
  },
});
