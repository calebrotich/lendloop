import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireOwnedTool, requireUser } from "./lib/authz";
import type { Availability, Category, Condition } from "./lib/constants";
import {
  availabilityValidator,
  categoryValidator,
  conditionValidator,
  toolStatusValidator,
} from "./lib/constants";
import { startOfDay } from "./lib/dates";
import { appError } from "./lib/errors";
import { LIMITS } from "./lib/limits";
import { isToolOutOnLoan } from "./lib/loans";

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

    // A tool that is out on loan is not available, even if its owner left the
    // status alone. Derived here for the same reason the browse view does it.
    const today = startOfDay(Date.now());
    const shelf = [];
    for (const tool of tools) {
      if (tool.removedAt !== undefined) continue;
      const approved = await ctx.db
        .query("loanRequests")
        .withIndex("by_tool_and_status", (q) => q.eq("toolId", tool._id).eq("status", "approved"))
        .take(5);
      if (approved.some((loan) => loan.startDate <= today && loan.endDate >= today)) continue;
      shelf.push({ name: tool.name, category: tool.category });
    }
    return shelf;
  },
});

const myToolValidator = v.object({
  _id: v.id("tools"),
  name: v.string(),
  category: categoryValidator,
  condition: conditionValidator,
  description: v.string(),
  status: toolStatusValidator,
  createdAt: v.number(),
});

function toMyTool(tool: Doc<"tools">) {
  return {
    _id: tool._id,
    name: tool.name,
    category: tool.category,
    condition: tool.condition,
    description: tool.description,
    status: tool.status,
    createdAt: tool.createdAt,
  };
}

/** Trim, and validate the two free-text fields against the shared limits. */
function validateListing(args: { name: string; description: string }) {
  const name = args.name.trim();
  const description = args.description.trim();

  if (name.length < LIMITS.nameMin || name.length > LIMITS.nameMax) {
    appError("VALIDATION", `Name must be ${LIMITS.nameMin}–${LIMITS.nameMax} characters.`);
  }
  if (description.length < LIMITS.descriptionMin || description.length > LIMITS.descriptionMax) {
    appError(
      "VALIDATION",
      `Description must be ${LIMITS.descriptionMin}–${LIMITS.descriptionMax} characters.`,
    );
  }

  return { name, description };
}

/** T10 — My listings. Scoped to the caller by `ownerId`, never by an argument. */
export const listMine = query({
  args: {},
  returns: v.array(myToolValidator),
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .take(LIMITS.maxListings + 1);

    // Soft-removed listings stay in the database for the audit trail but are
    // never shown back to their owner.
    return tools
      .filter((tool) => tool.removedAt === undefined)
      .slice(0, LIMITS.maxListings)
      .map(toMyTool);
  },
});

/** T5, T16 — create a listing owned by the caller. */
export const create = mutation({
  args: {
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
  },
  returns: v.id("tools"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { name, description } = validateListing(args);

    const existing = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .take(LIMITS.maxListings + 1);
    const activeCount = existing.filter((tool) => tool.removedAt === undefined).length;
    if (activeCount >= LIMITS.maxListings) {
      appError("VALIDATION", `You can list up to ${LIMITS.maxListings} tools.`);
    }

    const now = Date.now();
    return await ctx.db.insert("tools", {
      ownerId: user._id,
      name,
      category: args.category,
      condition: args.condition,
      description,
      status: "available",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * T16 — edit one of your own listings.
 *
 * Status is limited to `available`/`unavailable`: `lent` is owned by the loan
 * lifecycle (Stage 3), so a client cannot mark their tool as out on loan.
 */
export const update = mutation({
  args: {
    toolId: v.id("tools"),
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
    status: v.union(v.literal("available"), v.literal("unavailable")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { tool } = await requireOwnedTool(ctx, args.toolId);
    const { name, description } = validateListing(args);

    if (await isToolOutOnLoan(ctx, tool._id, Date.now())) {
      appError("CONFLICT", "This tool is out on loan. Mark it returned before editing it.");
    }

    await ctx.db.patch(tool._id, {
      name,
      category: args.category,
      condition: args.condition,
      description,
      status: args.status,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * T16 — soft-remove a listing. The row stays for the audit trail and for any
 * loan history that references it; `removedAt` is what every read filters on.
 */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { tool } = await requireOwnedTool(ctx, args.toolId);

    if (await isToolOutOnLoan(ctx, tool._id, Date.now())) {
      appError("CONFLICT", "This tool is out on loan. Mark it returned before removing it.");
    }

    const now = Date.now();
    await ctx.db.patch(tool._id, {
      removedAt: now,
      status: "unavailable",
      updatedAt: now,
    });
    return null;
  },
});

const BROWSE_LIMIT = 60;

const browseToolValidator = v.object({
  _id: v.id("tools"),
  name: v.string(),
  category: categoryValidator,
  condition: conditionValidator,
  description: v.string(),
  ownerName: v.string(),
  availability: availabilityValidator,
  busyUntil: v.union(v.null(), v.number()),
});

interface BrowseTool {
  _id: Id<"tools">;
  name: string;
  category: Category;
  condition: Condition;
  description: string;
  ownerName: string;
  availability: Availability;
  busyUntil: number | null;
}

/**
 * T9 — every listing with its *derived* availability, optionally by category.
 *
 * `on_loan` comes from an approved request covering today, `paused` from the
 * owner's own status. There is no stored availability flag that a missed cron
 * could leave stale, and an overdue loan still reads as on_loan until it is
 * marked returned.
 */
export const listAvailable = query({
  args: { category: v.optional(categoryValidator) },
  returns: v.array(browseToolValidator),
  handler: async (ctx, args) => {
    await requireUser(ctx);

    const category = args.category;
    const now = Date.now();
    const today = startOfDay(now);
    const rows = [];

    for (const status of ["available", "unavailable"] as const) {
      const batch =
        category === undefined
          ? await ctx.db
              .query("tools")
              .withIndex("by_status", (q) => q.eq("status", status))
              .take(BROWSE_LIMIT)
          : await ctx.db
              .query("tools")
              .withIndex("by_category_and_status", (q) =>
                q.eq("category", category).eq("status", status),
              )
              .take(BROWSE_LIMIT);
      rows.push(...batch);
    }

    const live = rows
      .filter((tool) => tool.removedAt === undefined)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, BROWSE_LIMIT);

    const result: BrowseTool[] = [];
    for (const tool of live) {
      const owner = await ctx.db.get(tool.ownerId);
      const approved = await ctx.db
        .query("loanRequests")
        .withIndex("by_tool_and_status", (q) => q.eq("toolId", tool._id).eq("status", "approved"))
        .take(10);
      const out = approved.find((loan) => loan.startDate <= today && loan.endDate >= today);

      result.push({
        _id: tool._id,
        name: tool.name,
        category: tool.category,
        condition: tool.condition,
        description: tool.description,
        ownerName: owner?.name ?? "A neighbour",
        availability:
          tool.status === "unavailable" ? "paused" : out !== undefined ? "on_loan" : "available",
        busyUntil: out?.endDate ?? null,
      });
    }

    return result;
  },
});
