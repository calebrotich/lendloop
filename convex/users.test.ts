/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import type { UserIdentity } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ISSUER = "https://clerk.example.test";

function identity(overrides: Partial<UserIdentity> = {}): Partial<UserIdentity> {
  return {
    tokenIdentifier: `${ISSUER}|user_sam`,
    subject: "user_sam",
    issuer: ISSUER,
    name: "Sam Rivera",
    email: "sam@example.test",
    ...overrides,
  };
}

/** The edge-runtime VM may not expose process.env, so set it defensively. */
function setEnv(name: string, value: string | undefined) {
  const runtime = globalThis as { process?: { env?: Record<string, string | undefined> } };
  runtime.process ??= {};
  runtime.process.env ??= {};
  if (value === undefined) delete runtime.process.env[name];
  else runtime.process.env[name] = value;
}

async function capturedError(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

afterEach(() => setEnv("ADMIN_EMAIL_ALLOWLIST", undefined));

describe("users.ensureCurrent", () => {
  it("creates exactly one profile per identity, idempotently", async () => {
    const t = convexTest(schema, modules);
    const asSam = t.withIdentity(identity());

    const first = await asSam.mutation(api.users.ensureCurrent, {});
    const second = await asSam.mutation(api.users.ensureCurrent, {});

    expect(second).toBe(first);

    const rows = await t.run(async (ctx) => await ctx.db.query("users").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.role).toBe("user");
    expect(rows[0]?.isTrustedLender).toBe(false);
  });

  it("refuses anonymous callers with UNAUTHORIZED", async () => {
    const t = convexTest(schema, modules);

    const error = await capturedError(t.mutation(api.users.ensureCurrent, {}));

    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<{ code: string }>).data.code).toBe("UNAUTHORIZED");
  });

  it("promotes an allowlisted, verified email to admin", async () => {
    setEnv("ADMIN_EMAIL_ALLOWLIST", "alex@example.test, SAM@example.test");
    const t = convexTest(schema, modules);
    const asSam = t.withIdentity(identity());

    await asSam.mutation(api.users.ensureCurrent, {});
    const me = await asSam.query(api.users.me, {});

    expect(me?.role).toBe("admin");
  });

  it("never grants admin from a client-supplied email", async () => {
    setEnv("ADMIN_EMAIL_ALLOWLIST", "sam@example.test");
    const t = convexTest(schema, modules);
    // A token that carries no email claim, plus a spoofed fallback argument.
    const asSam = t.withIdentity(identity({ email: undefined, name: undefined }));

    await asSam.mutation(api.users.ensureCurrent, {
      email: "sam@example.test",
      name: "Sam",
    });
    const me = await asSam.query(api.users.me, {});

    expect(me?.email).toBe("sam@example.test"); // stored for display only
    expect(me?.role).toBe("user");
  });

  it("keeps separate profiles for separate identities", async () => {
    const t = convexTest(schema, modules);
    const sam = identity();
    const alex = identity({
      tokenIdentifier: `${ISSUER}|user_alex`,
      subject: "user_alex",
      name: "Alex Chen",
      email: "alex@example.test",
    });

    const samId = await t.withIdentity(sam).mutation(api.users.ensureCurrent, {});
    const alexId = await t.withIdentity(alex).mutation(api.users.ensureCurrent, {});

    expect(samId).not.toBe(alexId);
    expect((await t.withIdentity(sam).query(api.users.me, {}))?.name).toBe("Sam Rivera");
    expect((await t.withIdentity(alex).query(api.users.me, {}))?.name).toBe("Alex Chen");
  });

  it("falls back to the email local part when no name is available", async () => {
    const t = convexTest(schema, modules);
    const asSam = t.withIdentity(identity({ name: undefined }));

    await asSam.mutation(api.users.ensureCurrent, {});
    const me = await asSam.query(api.users.me, {});

    expect(me?.name).toBe("sam");
  });
});

describe("users.me", () => {
  it("returns null when signed out", async () => {
    const t = convexTest(schema, modules);

    expect(await t.query(api.users.me, {})).toBeNull();
  });

  it("returns null until the profile is provisioned", async () => {
    const t = convexTest(schema, modules);

    expect(await t.withIdentity(identity()).query(api.users.me, {})).toBeNull();
  });

  it("projects only display fields, never the token identifier", async () => {
    const t = convexTest(schema, modules);
    const asSam = t.withIdentity(identity());
    await asSam.mutation(api.users.ensureCurrent, {});

    const me = await asSam.query(api.users.me, {});

    expect(me).not.toBeNull();
    expect(Object.keys(me ?? {}).sort()).toEqual([
      "_id",
      "email",
      "isTrustedLender",
      "name",
      "role",
    ]);
  });
});
