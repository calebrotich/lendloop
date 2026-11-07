import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { DAY_MS, startOfDay } from "./lib/dates";

/**
 * Demo shelf for local development and the recorded walkthrough.
 *
 * `internal` on purpose: seeding is an operator action (`convex run
 * seed:seedDemoShelf`), never a client-callable mutation. Idempotent — a second
 * run reuses the demo owner and creates nothing.
 *
 * Loans are seeded in Stage 3, once the request lifecycle exists.
 */
const DEMO_OWNER = {
  tokenIdentifier: "seed|demo-neighbour",
  clerkId: "seed_demo_neighbour",
  name: "Demo neighbour",
  email: "demo@lendloop.test",
} as const;

const DEMO_TOOLS = [
  {
    name: "Cordless drill",
    category: "power_tools",
    condition: "good",
    description: "18V, two batteries and a bit set. The chuck is a little worn but it bites.",
  },
  {
    name: "Hedge trimmer",
    category: "garden",
    condition: "like_new",
    description: "Corded, 500W, 10m of cable. Good for the front hedge, not for a tree.",
  },
  {
    name: "Extension ladder",
    category: "other",
    condition: "good",
    description: "Aluminium, extends to 3.5m. Please bring it back dry.",
  },
  {
    name: "Stand mixer",
    category: "kitchen",
    condition: "fair",
    description: "Bowl and whisk included. The slow speed is the only speed.",
  },
  {
    name: "Two-person tent",
    category: "camping",
    condition: "good",
    description: "Three-season, sleeps two tightly. Fly sheet has one patched corner.",
  },
  {
    name: "Pressure washer",
    category: "cleaning",
    condition: "worn",
    description: "Works well on steps and bikes. Noisy, needs an outdoor tap.",
  },
] as const;

export const seedDemoShelf = internalMutation({
  args: {},
  returns: v.object({ ownerId: v.id("users"), created: v.number() }),
  handler: async (ctx) => {
    const existingOwner = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", DEMO_OWNER.email))
      .unique();

    const ownerId =
      existingOwner?._id ??
      (await ctx.db.insert("users", {
        ...DEMO_OWNER,
        role: "user",
        isTrustedLender: false,
        createdAt: Date.now(),
      }));

    const existingTool = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(1);

    if (existingTool.length > 0) {
      return { ownerId, created: 0 };
    }

    const now = Date.now();
    let created = 0;
    for (const tool of DEMO_TOOLS) {
      await ctx.db.insert("tools", {
        ownerId,
        ...tool,
        status: "available",
        // Monotonic timestamps keep the "newest first" order deterministic.
        createdAt: now + created,
        updatedAt: now + created,
      });
      created += 1;
    }

    return { ownerId, created };
  },
});

const DEMO_BORROWER = {
  tokenIdentifier: "seed|demo-borrower",
  clerkId: "seed_demo_borrower",
  name: "Demo borrower",
  email: "borrower@lendloop.test",
} as const;

/**
 * Demo loans for the walkthrough and for exercising W1/W2 without clicking.
 *
 * Creates one pending request, one approved loan in the future, and one approved
 * loan that is already overdue so a reminder can be demonstrated immediately.
 * Idempotent: if the demo owner already has any loan, it does nothing.
 */
export const seedDemoLoans = internalMutation({
  args: {},
  returns: v.object({
    ownerId: v.id("users"),
    borrowerId: v.id("users"),
    created: v.number(),
  }),
  handler: async (ctx) => {
    const owner = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", DEMO_OWNER.email))
      .unique();
    if (owner === null) {
      throw new Error("Run seed:seedDemoShelf first — the demo owner does not exist.");
    }

    const existingBorrower = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", DEMO_BORROWER.email))
      .unique();
    const borrowerId =
      existingBorrower?._id ??
      (await ctx.db.insert("users", {
        ...DEMO_BORROWER,
        role: "user",
        isTrustedLender: false,
        createdAt: Date.now(),
      }));

    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", owner._id))
      .take(3);
    if (tools.length < 3) {
      throw new Error("Run seed:seedDemoShelf first — the demo shelf is incomplete.");
    }

    const existingLoans = await ctx.db
      .query("loanRequests")
      .withIndex("by_owner_and_status", (q) => q.eq("ownerId", owner._id))
      .take(1);
    if (existingLoans.length > 0) {
      return { ownerId: owner._id, borrowerId, created: 0 };
    }

    const today = startOfDay(Date.now());
    const loans = [
      {
        toolId: tools[0]!._id,
        status: "pending" as const,
        startDate: today + 2 * DAY_MS,
        endDate: today + 4 * DAY_MS,
        createdAt: Date.now(),
        decidedAt: undefined,
      },
      {
        toolId: tools[1]!._id,
        status: "approved" as const,
        startDate: today + 5 * DAY_MS,
        endDate: today + 7 * DAY_MS,
        createdAt: Date.now(),
        decidedAt: Date.now(),
      },
      {
        toolId: tools[2]!._id,
        status: "approved" as const,
        startDate: today - 6 * DAY_MS,
        endDate: today - 3 * DAY_MS,
        createdAt: Date.now() - 6 * DAY_MS,
        decidedAt: Date.now() - 6 * DAY_MS,
      },
    ];

    for (const loan of loans) {
      await ctx.db.insert("loanRequests", {
        toolId: loan.toolId,
        ownerId: owner._id,
        borrowerId,
        startDate: loan.startDate,
        endDate: loan.endDate,
        status: loan.status,
        createdAt: loan.createdAt,
        decidedAt: loan.decidedAt,
      });
    }

    return { ownerId: owner._id, borrowerId, created: loans.length };
  },
});
