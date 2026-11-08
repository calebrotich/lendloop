/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import type { UserIdentity } from "convex/server";
import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { IMAGE_CACHE_CONTROL } from "./lib/mediaConstants";
import { LIMITS } from "./lib/limits";

const modules = import.meta.glob("./**/*.ts");

// The test VM has no deployment env. Stub the values the read paths and the
// presigner read; no network call is made by these tests.
const runtime = globalThis as { process?: { env?: Record<string, string | undefined> } };
runtime.process ??= { env: {} };
runtime.process.env ??= {};
Object.assign(runtime.process.env, {
  R2_PUBLIC_HOST: "https://cdn.example.test",
  R2_BUCKET_NAME: "test-bucket",
  R2_ACCOUNT_ID: "test-account",
  R2_ACCESS_KEY_ID: "AKIDEXAMPLE",
  R2_SECRET_ACCESS_KEY: "test-secret",
});

const ISSUER = "https://clerk.example.test";

function identity(token: string, email: string): Partial<UserIdentity> {
  return {
    tokenIdentifier: `${ISSUER}|${token}`,
    subject: token,
    issuer: ISSUER,
    name: token,
    email,
  };
}

type Tester = TestConvex<typeof schema>;

async function provision(t: Tester, token: string, email: string) {
  const id = await t.run(
    async (ctx) =>
      await ctx.db.insert("users", {
        tokenIdentifier: `${ISSUER}|${token}`,
        clerkId: token,
        name: token,
        email,
        role: "user",
        isTrustedLender: false,
        createdAt: 1_700_000_000_000,
      }),
  );
  return { id, as: t.withIdentity(identity(token, email)) };
}

async function insertTool(t: Tester, ownerId: Id<"users">, removedAt?: number) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("tools", {
        ownerId,
        name: "Cordless drill",
        category: "power_tools",
        condition: "good",
        description: "18V with two batteries.",
        status: "available",
        removedAt,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      }),
  );
}

async function insertImage(
  t: Tester,
  toolId: Id<"tools">,
  ownerId: Id<"users">,
  overrides: { objectKey?: string; sortOrder?: number; width?: number; height?: number } = {},
) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("toolImages", {
        toolId,
        ownerId,
        objectKey: overrides.objectKey ?? `tools/${toolId}/${crypto.randomUUID()}.webp`,
        contentType: "image/webp",
        byteSize: 1_024,
        width: overrides.width ?? 800,
        height: overrides.height ?? 600,
        sortOrder: overrides.sortOrder ?? 0,
        createdAt: 1_700_000_000_000,
      }),
  );
}

async function insertTicket(
  t: Tester,
  toolId: Id<"tools">,
  ownerId: Id<"users">,
  overrides: Partial<{ status: "pending" | "failed"; expiresAt: number }> = {},
) {
  const now = Date.now();
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("toolImageUploads", {
        toolId,
        ownerId,
        objectKey: `tools/${toolId}/${crypto.randomUUID()}.webp`,
        contentType: "image/webp",
        byteSize: 1_024,
        width: 800,
        height: 600,
        status: overrides.status ?? "pending",
        createdAt: now,
        expiresAt: overrides.expiresAt ?? now + 60_000,
      }),
  );
}

async function capturedError(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

function codeOf(error: unknown): string | undefined {
  if (error instanceof ConvexError) {
    return (error.data as { code?: string } | undefined)?.code;
  }
  return undefined;
}

async function ticketFor(tester: ReturnType<Tester["withIdentity"]>, toolId: Id<"tools">) {
  return await tester.mutation(api.toolImages.createUploadTicket, {
    toolId,
    contentType: "image/webp",
    byteSize: 1_024,
    width: 800,
    height: 600,
  });
}

describe("toolImages.listForTool", () => {
  it("returns ordered rows with public URLs", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const toolId = await insertTool(t, sam.id);
    await insertImage(t, toolId, sam.id, { objectKey: "tools/back.webp", sortOrder: 1 });
    await insertImage(t, toolId, sam.id, { objectKey: "tools/cover.webp", sortOrder: 0 });

    const images = await sam.as.query(api.toolImages.listForTool, { toolId });

    expect(images.map((image) => image.url)).toEqual([
      "https://cdn.example.test/tools/cover.webp",
      "https://cdn.example.test/tools/back.webp",
    ]);
    expect(images[0]?.sortOrder).toBe(0);
  });

  it("refuses anonymous callers", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const toolId = await insertTool(t, sam.id);

    const error = await capturedError(t.query(api.toolImages.listForTool, { toolId }));

    expect(codeOf(error)).toBe("UNAUTHORIZED");
  });

  it("reports a removed listing as missing", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const toolId = await insertTool(t, sam.id, 1_700_000_000_900);

    const error = await capturedError(sam.as.query(api.toolImages.listForTool, { toolId }));

    expect(codeOf(error)).toBe("NOT_FOUND");
  });
});

describe("toolImages.createUploadTicket", () => {
  it("reserves a slot with an unguessable, typed object key", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const toolId = await insertTool(t, sam.id);

    const ticket = await ticketFor(sam.as, toolId);
    const row = await t.run(async (ctx) => await ctx.db.get(ticket.uploadId));

    expect(ticket.expiresAt).toBeGreaterThan(Date.now());
    expect(row).toMatchObject({
      toolId,
      ownerId: sam.id,
      contentType: "image/webp",
      byteSize: 1_024,
      status: "pending",
    });
    expect(row?.objectKey).toMatch(/^listing-images\/[a-f0-9]{32}\.webp$/);
  });

  it("rejects an unsupported type and an oversized file", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const toolId = await insertTool(t, sam.id);

    const typeError = await capturedError(
      sam.as.mutation(api.toolImages.createUploadTicket, {
        toolId,
        contentType: "image/svg+xml",
        byteSize: 1_024,
        width: 800,
        height: 600,
      }),
    );
    const sizeError = await capturedError(
      sam.as.mutation(api.toolImages.createUploadTicket, {
        toolId,
        contentType: "image/webp",
        byteSize: LIMITS.maxImageBytes + 1,
        width: 800,
        height: 600,
      }),
    );

    expect(codeOf(typeError)).toBe("VALIDATION");
    expect(codeOf(sizeError)).toBe("VALIDATION");
  });

  it("refuses someone else's listing", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const alex = await provision(t, "user_alex", "alex@example.test");
    const toolId = await insertTool(t, sam.id);

    const error = await capturedError(ticketFor(alex.as, toolId));

    expect(codeOf(error)).toBe("FORBIDDEN");
  });

  it("refuses a seventh photo", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const toolId = await insertTool(t, sam.id);
    for (let index = 0; index < LIMITS.maxImagesPerTool; index += 1) {
      await insertImage(t, toolId, sam.id, { sortOrder: index });
    }

    const error = await capturedError(ticketFor(sam.as, toolId));

    expect(codeOf(error)).toBe("VALIDATION");
  });

  it("allows the owner to add a photo while the tool is out on loan", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const borrower = await provision(t, "user_borrower", "borrower@example.test");
    const toolId = await insertTool(t, sam.id);
    const now = Date.now();
    await t.run(
      async (ctx) =>
        await ctx.db.insert("loanRequests", {
          toolId,
          ownerId: sam.id,
          borrowerId: borrower.id,
          startDate: now - 86_400_000,
          endDate: now + 86_400_000,
          status: "approved",
          createdAt: now,
        }),
    );

    const ticket = await ticketFor(sam.as, toolId);

    expect(ticket.uploadId).toBeDefined();
  });
});

describe("toolImages.prepareUpload", () => {
  it("returns a presigned PUT with the signed content type and cache policy", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const toolId = await insertTool(t, sam.id);
    const ticket = await ticketFor(sam.as, toolId);

    const target = await sam.as.action(api.toolImages.prepareUpload, {
      uploadId: ticket.uploadId,
    });

    expect(target.url).toContain(
      "https://test-account.r2.cloudflarestorage.com/test-bucket/listing-images/",
    );
    expect(target.url).toContain("X-Amz-Signature=");
    expect(target.headers).toEqual(
      expect.arrayContaining([
        { name: "content-type", value: "image/webp" },
        { name: "cache-control", value: IMAGE_CACHE_CONTROL },
      ]),
    );
    expect(target.byteSize).toBe(1_024);
    expect(target.expiresAt).toBe(ticket.expiresAt);
  });

  it("refuses another user's ticket", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const alex = await provision(t, "user_alex", "alex@example.test");
    const toolId = await insertTool(t, sam.id);
    const ticket = await ticketFor(sam.as, toolId);

    const error = await capturedError(
      alex.as.action(api.toolImages.prepareUpload, { uploadId: ticket.uploadId }),
    );

    expect(codeOf(error)).toBe("FORBIDDEN");
  });
});

describe("toolImages.confirmUpload", () => {
  it("inserts the image, orders it last and consumes the ticket", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const toolId = await insertTool(t, sam.id);
    await insertImage(t, toolId, sam.id, { sortOrder: 0 });
    const ticket = await ticketFor(sam.as, toolId);

    const imageId = await sam.as.mutation(internal.toolImages.confirmUpload, {
      uploadId: ticket.uploadId,
      contentType: "image/webp",
      byteSize: 1_024,
    });

    const images = await sam.as.query(api.toolImages.listForTool, { toolId });
    expect(images).toHaveLength(2);
    expect(images[1]?._id).toBe(imageId);
    expect(images[1]?.sortOrder).toBe(1);
    expect(await t.run(async (ctx) => await ctx.db.get(ticket.uploadId))).toBeNull();
  });

  it("refuses to exceed the cap even if a ticket was created before it filled", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const toolId = await insertTool(t, sam.id);
    for (let index = 0; index < LIMITS.maxImagesPerTool - 1; index += 1) {
      await insertImage(t, toolId, sam.id, { sortOrder: index });
    }
    const ticket = await ticketFor(sam.as, toolId);
    await insertImage(t, toolId, sam.id, { sortOrder: LIMITS.maxImagesPerTool - 1 });

    const error = await capturedError(
      sam.as.mutation(internal.toolImages.confirmUpload, {
        uploadId: ticket.uploadId,
        contentType: "image/webp",
        byteSize: 1_024,
      }),
    );

    expect(codeOf(error)).toBe("VALIDATION");
  });

  it("refuses an expired ticket", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const toolId = await insertTool(t, sam.id);
    const ticket = await insertTicket(t, toolId, sam.id, { expiresAt: Date.now() - 1 });

    const error = await capturedError(
      sam.as.mutation(internal.toolImages.confirmUpload, {
        uploadId: ticket,
        contentType: "image/webp",
        byteSize: 1_024,
      }),
    );

    expect(codeOf(error)).toBe("CONFLICT");
  });
});

describe("toolImages.setCover", () => {
  it("promotes a photo and reassigns contiguous order", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const toolId = await insertTool(t, sam.id);
    await insertImage(t, toolId, sam.id, { objectKey: "tools/one.webp", sortOrder: 0 });
    const second = await insertImage(t, toolId, sam.id, {
      objectKey: "tools/two.webp",
      sortOrder: 1,
    });

    await sam.as.mutation(api.toolImages.setCover, { imageId: second });

    const images = await sam.as.query(api.toolImages.listForTool, { toolId });
    expect(images.map((image) => image.url)).toEqual([
      "https://cdn.example.test/tools/two.webp",
      "https://cdn.example.test/tools/one.webp",
    ]);
    expect(images.map((image) => image.sortOrder)).toEqual([0, 1]);
  });

  it("refuses another owner", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const alex = await provision(t, "user_alex", "alex@example.test");
    const toolId = await insertTool(t, sam.id);
    const imageId = await insertImage(t, toolId, sam.id);

    const error = await capturedError(alex.as.mutation(api.toolImages.setCover, { imageId }));

    expect(codeOf(error)).toBe("FORBIDDEN");
  });
});

describe("toolImages.removeImage", () => {
  it("deletes the row and queues the object for deletion", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const toolId = await insertTool(t, sam.id);
    const imageId = await insertImage(t, toolId, sam.id, { objectKey: "tools/gone.webp" });

    await sam.as.mutation(api.toolImages.removeImage, { imageId });

    expect(await t.run(async (ctx) => await ctx.db.get(imageId))).toBeNull();
    const queued = await t.run(
      async (ctx) =>
        await ctx.db
          .query("storageDeletes")
          .withIndex("by_objectKey", (q) => q.eq("objectKey", "tools/gone.webp"))
          .unique(),
    );
    expect(queued).toMatchObject({ status: "pending", reason: "image_removed" });
  });

  it("refuses another owner", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const alex = await provision(t, "user_alex", "alex@example.test");
    const toolId = await insertTool(t, sam.id);
    const imageId = await insertImage(t, toolId, sam.id);

    const error = await capturedError(alex.as.mutation(api.toolImages.removeImage, { imageId }));

    expect(codeOf(error)).toBe("FORBIDDEN");
  });
});

describe("toolImages.abandonUpload", () => {
  it("fails the ticket and queues its object", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const toolId = await insertTool(t, sam.id);
    const ticket = await ticketFor(sam.as, toolId);
    const row = await t.run(async (ctx) => await ctx.db.get(ticket.uploadId));

    await sam.as.mutation(api.toolImages.abandonUpload, { uploadId: ticket.uploadId });

    const after = await t.run(async (ctx) => await ctx.db.get(ticket.uploadId));
    expect(after?.status).toBe("failed");
    expect(row?.objectKey).toBeDefined();
    const queued = await t.run(
      async (ctx) =>
        await ctx.db
          .query("storageDeletes")
          .withIndex("by_objectKey", (q) => q.eq("objectKey", row?.objectKey ?? ""))
          .unique(),
    );
    expect(queued?.reason).toBe("upload_cancelled");
  });
});

describe("listing removal cleans up media", () => {
  it("deletes image rows, fails pending uploads and queues every object", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const toolId = await insertTool(t, sam.id);
    await insertImage(t, toolId, sam.id, { objectKey: "tools/one.webp" });
    await insertImage(t, toolId, sam.id, { objectKey: "tools/two.webp", sortOrder: 1 });
    const ticket = await ticketFor(sam.as, toolId);
    const ticketRow = await t.run(async (ctx) => await ctx.db.get(ticket.uploadId));

    await sam.as.mutation(api.tools.remove, { toolId });

    expect(
      await t.run(
        async (ctx) =>
          await ctx.db
            .query("toolImages")
            .withIndex("by_toolId_and_sortOrder", (q) => q.eq("toolId", toolId))
            .take(10),
      ),
    ).toEqual([]);

    const pendingAfter = await t.run(async (ctx) => await ctx.db.get(ticket.uploadId));
    expect(pendingAfter?.status).toBe("failed");

    const queued = await t.run(
      async (ctx) =>
        await ctx.db
          .query("storageDeletes")
          .withIndex("by_status_and_nextAttemptAt", (q) => q.eq("status", "pending"))
          .take(10),
    );
    const keys = queued.map((row) => row.objectKey).sort();
    expect(keys).toEqual(["tools/one.webp", "tools/two.webp", ticketRow?.objectKey ?? ""].sort());
  });
});

describe("tools.listMine photo summary", () => {
  it("includes the cover and count without exposing object keys", async () => {
    const t = convexTest(schema, modules);
    const sam = await provision(t, "user_sam", "sam@example.test");
    const toolId = await insertTool(t, sam.id);
    await insertImage(t, toolId, sam.id, { objectKey: "tools/cover.webp", sortOrder: 0 });

    const [mine] = await sam.as.query(api.tools.listMine, {});

    expect(mine?.images).toEqual({
      imageCount: 1,
      cover: {
        url: "https://cdn.example.test/tools/cover.webp",
        width: 800,
        height: 600,
      },
    });
    expect(JSON.stringify(mine)).not.toContain("objectKey");
  });
});
