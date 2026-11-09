import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireOwnedTool, requireUser } from "./lib/authz";
import type { Availability, Category, Condition } from "./lib/constants";
import {
  availabilityValidator,
  categoryValidator,
  conditionValidator,
  toolStatusValidator,
} from "./lib/constants";
import { DAY_MS, startOfDay } from "./lib/dates";
import { appError } from "./lib/errors";
import { LIMITS } from "./lib/limits";
import {
  discardToolImages,
  imageSummaryForTool,
  imageSummaryValidator,
  listImagesForTool,
} from "./lib/media";

/** Bounded by design: the public page is a shelf, not a data export. */
const MAX_PUBLIC_TOOLS = 60;

/**
 * The public listing page is the one place a listing is more than a name and a
 * photo. It deliberately still withholds identity: the owner is a trust flag,
 * never a name, an id or an email. `listPublic` above stays minimal for the
 * legacy strip; the showcase queries feed the rich landing and detail pages.
 */
const MAX_SHOWCASE_TOOLS = 48;

const publicListingValidator = v.object({
  _id: v.id("tools"),
  name: v.string(),
  category: categoryValidator,
  condition: conditionValidator,
  description: v.string(),
  ownerTrusted: v.boolean(),
  availability: availabilityValidator,
  busyUntil: v.union(v.null(), v.number()),
  dailyRateCents: v.number(),
  createdAt: v.number(),
  images: imageSummaryValidator,
});

const publicGalleryImageValidator = v.object({
  url: v.union(v.null(), v.string()),
  width: v.number(),
  height: v.number(),
});

const publicBusyRangeValidator = v.object({
  startDate: v.number(),
  endDate: v.number(),
});

/**
 * Viewer-relative ownership, never owner identity: the query returns no
 * `ownerId`, so a signed-in visitor can be told “this is yours” without learning
 * anyone's id or name.
 */
async function viewerOwnsTool(ctx: QueryCtx, tool: Doc<"tools">): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return false;
  const viewer = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  return viewer !== null && viewer._id === tool.ownerId;
}

/** Availability is derived, never stored: same rule the authenticated view uses. */
async function deriveAvailability(
  ctx: QueryCtx,
  tool: Doc<"tools">,
  today: number,
): Promise<{ availability: Availability; busyUntil: number | null }> {
  if (tool.status === "unavailable") {
    return { availability: "paused", busyUntil: null };
  }

  const approved = await ctx.db
    .query("loanRequests")
    .withIndex("by_tool_and_status", (q) => q.eq("toolId", tool._id).eq("status", "approved"))
    .take(10);
  const out = approved.find((loan) => loan.startDate <= today && loan.endDate >= today);

  return out === undefined
    ? { availability: "available", busyUntil: null }
    : { availability: "on_loan", busyUntil: out.endDate };
}

async function toPublicListing(ctx: QueryCtx, tool: Doc<"tools">, today: number) {
  const owner = await ctx.db.get(tool.ownerId);
  const { availability, busyUntil } = await deriveAvailability(ctx, tool, today);

  return {
    _id: tool._id,
    name: tool.name,
    category: tool.category,
    condition: tool.condition,
    description: tool.description,
    ownerTrusted: owner?.isTrustedLender ?? false,
    availability,
    busyUntil,
    dailyRateCents: tool.dailyRateCents ?? 0,
    createdAt: tool.createdAt,
    images: await imageSummaryForTool(ctx, tool._id),
  };
}

/**
 * The landing shelf. Public and anonymous, bounded, and intentionally richer
 * than `listPublic`: a card that links to a detail page needs a stable id, a
 * condition and a description. Removed listings never appear; paused and
 * currently-borrowed listings do, with their availability derived so the card
 * can say so instead of silently disappearing.
 */
export const listShowcase = query({
  args: {},
  returns: v.array(publicListingValidator),
  handler: async (ctx) => {
    const today = startOfDay(Date.now());
    const rows: Doc<"tools">[] = [];

    for (const status of ["available", "unavailable"] as const) {
      const batch = await ctx.db
        .query("tools")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(MAX_SHOWCASE_TOOLS);
      rows.push(...batch);
    }

    const live = rows
      .filter((tool) => tool.removedAt === undefined)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_SHOWCASE_TOOLS);

    const shelf = [];
    for (const tool of live) {
      shelf.push(await toPublicListing(ctx, tool, today));
    }
    return shelf;
  },
});

/**
 * Dates the public calendar should block.
 *
 * Both pending and approved requests count, so two people cannot be told the
 * same days are free while a request is waiting for an answer. Only the ranges
 * are public — never who asked, or why. Declined, cancelled and returned
 * requests are excluded. Bounded and merged so a busy month is a few rows, not
 * a row per request.
 */
async function publicBusyRanges(
  ctx: QueryCtx,
  toolId: Id<"tools">,
  today: number,
): Promise<Array<{ startDate: number; endDate: number }>> {
  const collected: Array<{ startDate: number; endDate: number }> = [];

  for (const status of ["pending", "approved"] as const) {
    const requests = await ctx.db
      .query("loanRequests")
      .withIndex("by_tool_and_status", (q) => q.eq("toolId", toolId).eq("status", status))
      .take(50);
    for (const request of requests) {
      if (request.endDate < today) continue;
      collected.push({ startDate: request.startDate, endDate: request.endDate });
    }
  }

  collected.sort((a, b) => a.startDate - b.startDate);
  const merged: Array<{ startDate: number; endDate: number }> = [];
  for (const range of collected) {
    const last = merged[merged.length - 1];
    if (last !== undefined && range.startDate <= last.endDate + DAY_MS) {
      last.endDate = Math.max(last.endDate, range.endDate);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/**
 * One public listing plus its whole gallery, for `/listings/[id]`.
 *
 * A removed listing resolves to `null` rather than a placeholder: the route
 * turns that into a 404 instead of an empty page. The return validator keeps the
 * public projection narrow even if this query is edited later.
 */
export const getPublicListing = query({
  args: { toolId: v.id("tools") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("tools"),
      name: v.string(),
      category: categoryValidator,
      condition: conditionValidator,
      description: v.string(),
      ownerTrusted: v.boolean(),
      isOwner: v.boolean(),
      availability: availabilityValidator,
      busyUntil: v.union(v.null(), v.number()),
      dailyRateCents: v.number(),
      valueCents: v.number(),
      createdAt: v.number(),
      images: v.array(publicGalleryImageValidator),
      busyRanges: v.array(publicBusyRangeValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const tool = await ctx.db.get(args.toolId);
    if (tool === null || tool.removedAt !== undefined) return null;

    const today = startOfDay(Date.now());
    const owner = await ctx.db.get(tool.ownerId);
    const { availability, busyUntil } = await deriveAvailability(ctx, tool, today);
    const images = await listImagesForTool(ctx, tool._id);

    return {
      _id: tool._id,
      name: tool.name,
      category: tool.category,
      condition: tool.condition,
      description: tool.description,
      ownerTrusted: owner?.isTrustedLender ?? false,
      isOwner: await viewerOwnsTool(ctx, tool),
      availability,
      busyUntil,
      dailyRateCents: tool.dailyRateCents ?? 0,
      valueCents: tool.valueCents ?? 0,
      createdAt: tool.createdAt,
      images: images.map((image) => ({
        url: image.url,
        width: image.width,
        height: image.height,
      })),
      busyRanges: await publicBusyRanges(ctx, tool._id, today),
    };
  },
});

/**
 * T3 — the only anonymous read in the app.
 *
 * Deliberately returns a projection of the name, category and cover photo. No
 * `_id`, no `ownerId`, no `description`, no `condition`: the public page cannot
 * leak who owns what, and the return validator enforces that at runtime so a
 * future edit cannot quietly widen it. A cover image is public by design — the
 * R2 bucket is served from a public custom domain — so it adds no new identity
 * data, and the return validator still keeps every other field out.
 */
export const listPublic = query({
  args: {},
  returns: v.array(
    v.object({
      name: v.string(),
      category: categoryValidator,
      images: imageSummaryValidator,
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
      shelf.push({
        name: tool.name,
        category: tool.category,
        images: await imageSummaryForTool(ctx, tool._id),
      });
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
  valueCents: v.number(),
  dailyRateCents: v.number(),
  createdAt: v.number(),
  images: imageSummaryValidator,
});

function toMyTool(tool: Doc<"tools">) {
  return {
    _id: tool._id,
    name: tool.name,
    category: tool.category,
    condition: tool.condition,
    description: tool.description,
    status: tool.status,
    valueCents: tool.valueCents ?? 0,
    dailyRateCents: tool.dailyRateCents ?? 0,
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

/**
 * Validate an optional pricing pair. Both fields are sent together by the
 * form; keeping them optional lets pre-pricing listings remain editable, and a
 * missing pair simply means the listing reads as free.
 */
function validatePricing(
  valueCents: number | undefined,
  dailyRateCents: number | undefined,
): { valueCents: number; dailyRateCents: number } | null {
  if (valueCents === undefined && dailyRateCents === undefined) return null;
  if (valueCents === undefined || dailyRateCents === undefined) {
    appError("VALIDATION", "Enter both the replacement value and the daily rate.");
  }
  if (
    !Number.isInteger(valueCents) ||
    valueCents < LIMITS.minValueCents ||
    valueCents > LIMITS.maxValueCents
  ) {
    appError(
      "VALIDATION",
      `The replacement value must be between $${LIMITS.minValueCents / 100} and $${LIMITS.maxValueCents / 100}.`,
    );
  }
  if (
    !Number.isInteger(dailyRateCents) ||
    dailyRateCents < 0 ||
    dailyRateCents > LIMITS.maxDailyRateCents
  ) {
    appError("VALIDATION", "The daily rate must be zero or a positive amount.");
  }
  if (dailyRateCents > valueCents) {
    appError("VALIDATION", "The daily rate can’t be higher than the replacement value.");
  }
  return { valueCents, dailyRateCents };
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
    const active = tools
      .filter((tool) => tool.removedAt === undefined)
      .slice(0, LIMITS.maxListings);
    const result = [];
    for (const tool of active) {
      result.push({
        ...toMyTool(tool),
        images: await imageSummaryForTool(ctx, tool._id),
      });
    }
    return result;
  },
});

/** T5, T16 — create a listing owned by the caller. */
export const create = mutation({
  args: {
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
    valueCents: v.optional(v.number()),
    dailyRateCents: v.optional(v.number()),
  },
  returns: v.id("tools"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { name, description } = validateListing(args);
    const pricing = validatePricing(args.valueCents, args.dailyRateCents);

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
      ...(pricing === null ? {} : pricing),
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * T16 — edit one of your own listings.
 *
 * Status is limited to `available`/`unavailable`: "on loan" is owned by the loan
 * lifecycle and derived on read, so a client cannot mark their tool as out on
 * loan. An owner may edit at any time, including while a loan is active; the
 * loan window keeps availability accurate regardless of the listing edits.
 */
export const update = mutation({
  args: {
    toolId: v.id("tools"),
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
    status: v.union(v.literal("available"), v.literal("unavailable")),
    valueCents: v.optional(v.number()),
    dailyRateCents: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { tool } = await requireOwnedTool(ctx, args.toolId);
    const { name, description } = validateListing(args);
    const pricing = validatePricing(args.valueCents, args.dailyRateCents);

    await ctx.db.patch(tool._id, {
      name,
      category: args.category,
      condition: args.condition,
      description,
      status: args.status,
      ...(pricing === null ? {} : pricing),
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * T16 — soft-remove a listing. The row stays for the audit trail and for any
 * loan history that references it; `removedAt` is what every read filters on.
 *
 * An owner may remove a listing while a loan is active. The loan rows are not
 * touched: both parties can still see the request and mark it returned, and the
 * denormalised owner is unaffected.
 */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { tool } = await requireOwnedTool(ctx, args.toolId);

    const now = Date.now();
    await ctx.db.patch(tool._id, {
      removedAt: now,
      status: "unavailable",
      updatedAt: now,
    });

    // The listing is gone, so the photos must go too: rows now, objects on the
    // media cron. A pending upload is failed so it cannot attach afterwards.
    await discardToolImages(ctx, tool._id);
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
  dailyRateCents: v.number(),
  images: imageSummaryValidator,
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
  dailyRateCents: number;
  images: { imageCount: number; cover: { url: string; width: number; height: number } | null };
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
        dailyRateCents: tool.dailyRateCents ?? 0,
        images: await imageSummaryForTool(ctx, tool._id),
      });
    }

    return result;
  },
});
