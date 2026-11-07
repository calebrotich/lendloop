import { v } from "convex/values";

import { internalMutation } from "./_generated/server";

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
