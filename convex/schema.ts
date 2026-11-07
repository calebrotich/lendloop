import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  automationChannelValidator,
  automationEventKindValidator,
  automationEventStatusValidator,
  categoryValidator,
  conditionValidator,
  loanStatusValidator,
  outboxStatusValidator,
  outboxTargetValidator,
  roleValidator,
  toolStatusValidator,
} from "./lib/constants";

/**
 * Data model — see AGENTS.md §6.
 *
 * Two deliberate choices worth knowing when reading queries:
 * - Availability is derived from loanRequests, never stored on the tool.
 * - `loanRequests.ownerId` is denormalised so "incoming requests" is one indexed
 *   read instead of a join through `tools`.
 */
export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(), // Clerk's canonical identity key
    clerkId: v.string(), // identity.subject
    name: v.string(),
    email: v.string(),
    role: roleValidator,
    isTrustedLender: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
    status: toolStatusValidator,
    removedAt: v.optional(v.number()), // soft delete, admin or owner
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_status", ["status"])
    .index("by_category_and_status", ["category", "status"]),

  loanRequests: defineTable({
    toolId: v.id("tools"),
    ownerId: v.id("users"),
    borrowerId: v.id("users"),
    startDate: v.number(), // epoch ms at UTC midnight
    endDate: v.number(),
    status: loanStatusValidator,
    note: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_tool_and_status", ["toolId", "status"])
    .index("by_borrower_and_status", ["borrowerId", "status"])
    .index("by_owner_and_status", ["ownerId", "status"])
    .index("by_status_and_endDate", ["status", "endDate"]),

  auditLog: defineTable({
    actorId: v.id("users"),
    action: v.string(),
    targetType: v.string(),
    targetId: v.string(),
    metadata: v.optional(
      v.record(v.string(), v.union(v.string(), v.number(), v.boolean(), v.null())),
    ),
    createdAt: v.number(),
  })
    .index("by_targetType_and_targetId", ["targetType", "targetId"])
    .index("by_actorId", ["actorId"])
    .index("by_createdAt", ["createdAt"]),

  /**
   * The visible trail of automation: one row per thing that was delivered,
   * deduped, or failed. The activity feed and the admin health panel read this
   * table; nothing is inferred from logs.
   */
  automationEvents: defineTable({
    loanRequestId: v.optional(v.id("loanRequests")),
    kind: automationEventKindValidator,
    channel: automationChannelValidator,
    status: automationEventStatusValidator,
    // Unique by index + read-before-write (Convex has no unique constraint).
    idempotencyKey: v.string(),
    // Short, machine-ish context (e.g. "attempt 2", "HTTP 401"). Never PII.
    detail: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_loanRequestId", ["loanRequestId"])
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_createdAt", ["createdAt"]),

  /**
   * Outbox for Convex → n8n. Mutations only enqueue (fast, transactional); the
   * drain action does the network call and records the outcome. `nextAttemptAt`
   * doubles as the lease deadline while a row is `sending`, so a crashed action
   * cannot strand a row.
   */
  automationOutbox: defineTable({
    kind: automationEventKindValidator,
    target: outboxTargetValidator,
    // The exact JSON string that is signed and sent. Stored, not rebuilt, so
    // retries are byte-identical and HMAC signatures stay valid.
    payload: v.string(),
    idempotencyKey: v.string(),
    // Carried so the success/failure event can appear in the loan's feed.
    loanRequestId: v.optional(v.id("loanRequests")),
    status: outboxStatusValidator,
    attempts: v.number(),
    nextAttemptAt: v.number(),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status_and_nextAttemptAt", ["status", "nextAttemptAt"])
    .index("by_idempotencyKey", ["idempotencyKey"]),
});
