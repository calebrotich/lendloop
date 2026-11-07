/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type Tester = TestConvex<typeof schema>;

async function insertOwner(t: Tester): Promise<string> {
  const id = await t.run(
    async (ctx) =>
      await ctx.db.insert("users", {
        tokenIdentifier: "https://clerk.example.test|owner_1",
        clerkId: "owner_1",
        name: "Sam Rivera",
        email: "sam@example.test",
        role: "user",
        isTrustedLender: false,
        createdAt: 1_700_000_000_000,
      }),
  );
  return id;
}

async function insertTool(
  t: Tester,
  overrides: Partial<{
    ownerId: string;
    name: string;
    category: string;
    condition: string;
    description: string;
    status: "available" | "lent" | "unavailable";
    removedAt: number;
    createdAt: number;
  }> = {},
) {
  const ownerId = overrides.ownerId ?? (await insertOwner(t));
  await t.run(
    async (ctx) =>
      await ctx.db.insert("tools", {
        ownerId: ownerId as never,
        name: overrides.name ?? "Cordless drill",
        category: (overrides.category ?? "power_tools") as never,
        condition: (overrides.condition ?? "good") as never,
        description: overrides.description ?? "A drill that bites.",
        status: overrides.status ?? "available",
        removedAt: overrides.removedAt,
        createdAt: overrides.createdAt ?? 1_700_000_000_000,
        updatedAt: overrides.createdAt ?? 1_700_000_000_000,
      }),
  );
}

describe("tools.listPublic", () => {
  it("returns exactly name and category — nothing else", async () => {
    const t = convexTest(schema, modules);
    await insertTool(t);

    const shelf = await t.query(api.tools.listPublic, {});

    expect(shelf).toHaveLength(1);
    expect(Object.keys(shelf[0] ?? {}).sort()).toEqual(["category", "name"]);
    expect(shelf[0]).toEqual({ name: "Cordless drill", category: "power_tools" });
  });

  it("is readable by anonymous callers", async () => {
    const t = convexTest(schema, modules);
    await insertTool(t);

    await expect(t.query(api.tools.listPublic, {})).resolves.toHaveLength(1);
  });

  it("hides removed listings", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await insertOwner(t);
    await insertTool(t, { ownerId, name: "Still here" });
    await insertTool(t, { ownerId, name: "Gone", removedAt: 1_700_000_000_100 });

    const shelf = await t.query(api.tools.listPublic, {});

    expect(shelf.map((tool) => tool.name)).toEqual(["Still here"]);
  });

  it("hides tools the owner has taken off the shelf", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await insertOwner(t);
    await insertTool(t, { ownerId, name: "On the shelf" });
    await insertTool(t, { ownerId, name: "Packed away", status: "unavailable" });
    await insertTool(t, { ownerId, name: "On loan", status: "lent" });

    const shelf = await t.query(api.tools.listPublic, {});

    expect(shelf.map((tool) => tool.name)).toEqual(["On the shelf"]);
  });

  it("returns the newest listing first", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await insertOwner(t);
    await insertTool(t, { ownerId, name: "Older", createdAt: 1_700_000_000_000 });
    await insertTool(t, { ownerId, name: "Newer", createdAt: 1_700_000_000_500 });

    const shelf = await t.query(api.tools.listPublic, {});

    expect(shelf.map((tool) => tool.name)).toEqual(["Newer", "Older"]);
  });

  it("never widens the projection when a description exists", async () => {
    const t = convexTest(schema, modules);
    await insertTool(t, { description: "Owner's home address is in here" });

    const [tool] = await t.query(api.tools.listPublic, {});

    expect(tool).toBeDefined();
    expect(JSON.stringify(tool)).not.toContain("Owner's home address");
  });
});
