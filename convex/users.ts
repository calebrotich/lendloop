import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireIdentity } from "./lib/authz";
import { roleValidator } from "./lib/constants";
import { readCsvEnv } from "./lib/env";

const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 80;

/** Trim, lower-case, and reject anything that is not plausibly an email. */
function normaliseEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) return null;
  return email.includes("@") ? email : null;
}

function pickName(candidates: Array<string | null | undefined>, email: string): string {
  for (const candidate of candidates) {
    const name = typeof candidate === "string" ? candidate.trim() : "";
    if (name.length > 0) return name.slice(0, MAX_NAME_LENGTH);
  }
  const localPart = email.split("@")[0] ?? "";
  return (localPart.length > 0 ? localPart : "Neighbour").slice(0, MAX_NAME_LENGTH);
}

/**
 * Projection shared by every read of a user. Deliberately excludes
 * `tokenIdentifier` and `clerkId`: they are identifiers for the server, not the
 * client, and nothing in the UI needs them.
 */
const publicUserValidator = v.object({
  _id: v.id("users"),
  name: v.string(),
  email: v.string(),
  role: roleValidator,
  isTrustedLender: v.boolean(),
});

/**
 * Provision the local profile for the signed-in Clerk user. Idempotent: the
 * unique `tokenIdentifier` lookup runs first, so repeated mounts and retries
 * return the same row instead of creating duplicates.
 *
 * `name` and `email` are display fallbacks for deployments whose Clerk JWT has
 * no `email`/`name` claims. They can never grant a role — see below.
 */
export const ensureCurrent = mutation({
  args: {
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);

    const existing = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (existing !== null) return existing._id;

    // Admin comes only from the token's own email claim. A value supplied by the
    // client is untrusted: accepting it here would let anyone claim an
    // allowlisted address and self-promote.
    const verifiedEmail = normaliseEmail(identity.email);
    const suppliedEmail = normaliseEmail(args.email);
    const email = verifiedEmail ?? suppliedEmail ?? "";

    const allowlist = readCsvEnv("ADMIN_EMAIL_ALLOWLIST");
    const role = verifiedEmail !== null && allowlist.includes(verifiedEmail) ? "admin" : "user";

    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      clerkId: identity.subject,
      name: pickName([identity.name, args.name], email),
      email,
      role,
      isTrustedLender: false,
      createdAt: Date.now(),
    });
  },
});

/**
 * The current user, or `null`. A query rather than a mutation so the client can
 * call it unconditionally before the profile exists.
 */
export const me = query({
  args: {},
  returns: v.union(v.null(), publicUserValidator),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (user === null) return null;

    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isTrustedLender: user.isTrustedLender,
    };
  },
});
