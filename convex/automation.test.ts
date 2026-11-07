/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import type { UserIdentity } from "convex/server";
import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { verifySignature } from "./lib/hmac";
import { requestNotificationSchema } from "./lib/n8n";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ISSUER = "https://clerk.example.test";
const DAY = 86_400_000;
const SECRET = "0123456789abcdef0123456789abcdef";
const REQUEST_URL = "https://n8n.example.test/webhook/lendloop-request";
const ERROR_URL = "https://n8n.example.test/webhook/lendloop-error-alert";

type Tester = TestConvex<typeof schema>;

function identity(token: string, email: string): Partial<UserIdentity> {
  return {
    tokenIdentifier: `${ISSUER}|${token}`,
    subject: token,
    issuer: ISSUER,
    name: token,
    email,
  };
}

async function provision(t: Tester, token: string, email: string, role: "user" | "admin" = "user") {
  const id = await t.run(
    async (ctx) =>
      await ctx.db.insert("users", {
        tokenIdentifier: `${ISSUER}|${token}`,
        clerkId: token,
        name: token,
        email,
        role,
        isTrustedLender: false,
        createdAt: 1_700_000_000_000,
      }),
  );
  return { id, as: t.withIdentity(identity(token, email)) };
}

async function insertTool(t: Tester, ownerId: Id<"users">, name = "Cordless drill") {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("tools", {
        ownerId,
        name,
        category: "power_tools",
        condition: "good",
        description: "18V with two batteries. Never leaves the house with the case.",
        status: "available",
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      }),
  );
}

async function insertRequest(
  t: Tester,
  args: {
    toolId: Id<"tools">;
    ownerId: Id<"users">;
    borrowerId: Id<"users">;
    status?: "pending" | "approved" | "declined" | "returned";
    startDate?: number;
    endDate?: number;
  },
) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("loanRequests", {
        toolId: args.toolId,
        ownerId: args.ownerId,
        borrowerId: args.borrowerId,
        startDate: args.startDate ?? Date.now() + DAY,
        endDate: args.endDate ?? Date.now() + 2 * DAY,
        status: args.status ?? "approved",
        createdAt: 1_700_000_000_000,
      }),
  );
}

const date = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

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

async function shelf(t: Tester) {
  const owner = await provision(t, "user_owner", "owner@example.test");
  const borrower = await provision(t, "user_borrower", "borrower@example.test");
  const toolId = await insertTool(t, owner.id);
  return { owner, borrower, toolId };
}

async function outboxRows(t: Tester) {
  return await t.run(async (ctx) => await ctx.db.query("automationOutbox").take(20));
}

async function eventRows(t: Tester) {
  return await t.run(async (ctx) => await ctx.db.query("automationEvents").take(20));
}

/** Sign a body exactly as the drain action does, and POST it as n8n would. */
async function signedPost(
  t: Tester,
  path: string,
  body: unknown,
  options: { timestamp?: number; secret?: string } = {},
) {
  const raw = JSON.stringify(body);
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  const { signRequest } = await import("./lib/hmac");
  const signature = await signRequest(options.secret ?? SECRET, timestamp, raw);
  return await t.fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-LendLoop-Timestamp": timestamp,
      "X-LendLoop-Signature": signature,
    },
    body: raw,
  });
}

beforeEach(() => {
  vi.stubEnv("N8N_HMAC_SECRET", SECRET);
  vi.stubEnv("N8N_REQUEST_WEBHOOK_URL", REQUEST_URL);
  vi.stubEnv("N8N_ERROR_WEBHOOK_URL", ERROR_URL);
  vi.stubEnv("APP_BASE_URL", "https://app.example.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("outbox enqueue", () => {
  it("queues exactly one minimised notification for a new request", async () => {
    const t = convexTest(schema, modules);
    const { owner, borrower, toolId } = await shelf(t);

    const requestId = await borrower.as.mutation(api.requests.create, {
      toolId,
      startDate: date(1),
      endDate: date(3),
    });

    const rows = await outboxRows(t);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row).toMatchObject({
      kind: "request.created",
      target: "n8n_request",
      status: "pending",
      attempts: 0,
      idempotencyKey: `request:${requestId}:created`,
      loanRequestId: requestId,
    });

    const payload = requestNotificationSchema.parse(JSON.parse(row.payload));
    expect(Object.keys(payload).sort()).toEqual([
      "deepLink",
      "event",
      "idempotencyKey",
      "occurredAt",
      "recipient",
      "tool",
      "window",
    ]);
    expect(payload.recipient).toEqual({ name: "user_owner", email: "owner@example.test" });
    expect(payload.tool).toEqual({ name: "Cordless drill" });
    expect(payload.window).toEqual({ start: date(1), end: date(3) });
    expect(payload.deepLink).toBe(
      `https://app.example.test/incoming-requests?request=${requestId}`,
    );

    // Data minimisation: no description, no internal ids, no other party.
    expect(row.payload).not.toContain("18V");
    expect(row.payload).not.toContain(borrower.id);
    expect(row.payload).not.toContain(owner.id);
  });

  it("notifies the borrower on a decision and the owner when it comes back", async () => {
    const t = convexTest(schema, modules);
    const { owner, borrower, toolId } = await shelf(t);

    const requestId = await borrower.as.mutation(api.requests.create, {
      toolId,
      startDate: date(1),
      endDate: date(2),
    });
    await owner.as.mutation(api.requests.approve, { requestId });

    const afterApprove = await outboxRows(t);
    expect(afterApprove.map((row) => row.kind)).toEqual(["request.created", "request.approved"]);
    const approvedPayload = requestNotificationSchema.parse(JSON.parse(afterApprove[1]!.payload));
    expect(approvedPayload.recipient.email).toBe("borrower@example.test");
    expect(approvedPayload.deepLink).toBe(
      `https://app.example.test/my-requests?request=${requestId}`,
    );

    await borrower.as.mutation(api.requests.markReturned, { requestId });

    const afterReturn = await outboxRows(t);
    expect(afterReturn.map((row) => row.kind)).toEqual([
      "request.created",
      "request.approved",
      "request.returned",
    ]);
    const returnedPayload = requestNotificationSchema.parse(JSON.parse(afterReturn[2]!.payload));
    expect(returnedPayload.recipient.email).toBe("owner@example.test");
  });

  it("never queues a notification without an address, and records why", async () => {
    const t = convexTest(schema, modules);
    // `request.created` notifies the owner, so make the owner the one without an
    // address — the borrower is irrelevant to this event.
    const owner = await provision(t, "user_owner", "");
    const borrower = await provision(t, "user_borrower", "borrower@example.test");
    const toolId = await insertTool(t, owner.id);

    await borrower.as.mutation(api.requests.create, {
      toolId,
      startDate: date(1),
      endDate: date(2),
    });

    expect(await outboxRows(t)).toHaveLength(0);
    const events = await eventRows(t);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "request.created",
      status: "failed",
      detail: "recipient has no email address",
    });
  });
});

describe("outbox drain", () => {
  async function requestWithQueuedNotification(t: Tester) {
    const { owner, borrower, toolId } = await shelf(t);
    const requestId = await borrower.as.mutation(api.requests.create, {
      toolId,
      startDate: date(1),
      endDate: date(2),
    });
    return { owner, borrower, toolId, requestId };
  }

  it("delivers with a verifiable signature and records a sent event", async () => {
    const t = convexTest(schema, modules);
    const { requestId } = await requestWithQueuedNotification(t);

    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(input), init: init ?? {} });
        return new Response("ok", { status: 200 });
      }),
    );

    const result = await t.action(internal.automation.drainOutbox, {});
    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(REQUEST_URL);

    const headers = calls[0]!.init.headers as Record<string, string>;
    const rawBody = String(calls[0]!.init.body);
    const verdict = await verifySignature({
      secret: SECRET,
      timestamp: headers["X-LendLoop-Timestamp"] ?? null,
      signature: headers["X-LendLoop-Signature"] ?? null,
      rawBody,
      nowSeconds: Math.floor(Date.now() / 1000),
    });
    expect(verdict).toEqual({ ok: true });
    expect(headers["X-LendLoop-Idempotency-Key"]).toBe(`request:${requestId}:created`);

    const rows = await outboxRows(t);
    expect(rows[0]?.status).toBe("sent");
    expect(rows[0]?.attempts).toBe(1);

    const events = await eventRows(t);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "request.created",
      channel: "webhook",
      status: "sent",
      loanRequestId: requestId,
    });
  });

  it("backs off after a transient failure instead of dropping the row", async () => {
    const t = convexTest(schema, modules);
    await requestWithQueuedNotification(t);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 503 })),
    );

    const before = Date.now();
    const result = await t.action(internal.automation.drainOutbox, {});
    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1 });

    const rows = await outboxRows(t);
    expect(rows[0]?.status).toBe("pending");
    expect(rows[0]?.attempts).toBe(1);
    expect(rows[0]?.lastError).toContain("HTTP 503");
    expect(rows[0]!.nextAttemptAt).toBeGreaterThan(before);

    // A retry before the backoff deadline claims nothing.
    expect(await t.action(internal.automation.drainOutbox, {})).toEqual({
      claimed: 0,
      sent: 0,
      failed: 0,
    });
  });

  it("gives up on the final attempt and alerts the error workflow once", async () => {
    const t = convexTest(schema, modules);
    const { requestId } = await requestWithQueuedNotification(t);
    await t.run(async (ctx) => {
      const row = await ctx.db.query("automationOutbox").first();
      await ctx.db.patch(row!._id, { attempts: 5 });
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );

    const result = await t.action(internal.automation.drainOutbox, {});
    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1 });

    const rows = await outboxRows(t);
    const original = rows.find((row) => row.target === "n8n_request");
    const alert = rows.find((row) => row.target === "n8n_error");
    expect(original?.status).toBe("failed");
    expect(original?.attempts).toBe(6);
    expect(alert?.status).toBe("pending");
    expect(alert?.kind).toBe("automation.failed");

    const alertPayload = JSON.parse(alert!.payload) as {
      kind: string;
      workflow: string;
      loanRequestId?: string;
    };
    expect(alertPayload).toMatchObject({
      kind: "automation.failed",
      workflow: "convex-outbox",
      loanRequestId: requestId,
    });

    const failureEvents = (await eventRows(t)).filter(
      (event) => event.kind === "automation.failed",
    );
    expect(failureEvents).toHaveLength(1);
    expect(failureEvents[0]?.loanRequestId).toBe(requestId);

    // The alert row must not itself spawn another alert.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    await t.action(internal.automation.drainOutbox, {});
    const after = await outboxRows(t);
    expect(after.filter((row) => row.target === "n8n_error")).toHaveLength(1);
  });

  it("fails permanently when the webhook is not configured", async () => {
    const t = convexTest(schema, modules);
    await requestWithQueuedNotification(t);
    vi.stubEnv("N8N_REQUEST_WEBHOOK_URL", "");

    const result = await t.action(internal.automation.drainOutbox, {});
    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1 });

    const rows = await outboxRows(t);
    expect(rows[0]?.status).toBe("failed");
    expect(rows[0]?.attempts).toBe(1);
    expect(rows[0]?.lastError).toContain("webhook URL");
  });
});

describe("overdue loans + reminder write-back", () => {
  async function overdueLoan(t: Tester) {
    const owner = await provision(t, "user_owner", "owner@example.test");
    const borrower = await provision(t, "user_borrower", "borrower@example.test");
    const toolId = await insertTool(t, owner.id);
    const loanRequestId = await insertRequest(t, {
      toolId,
      ownerId: owner.id,
      borrowerId: borrower.id,
      status: "approved",
      startDate: Date.now() - 5 * DAY,
      endDate: Date.now() - 3 * DAY,
    });
    return { owner, borrower, toolId, loanRequestId };
  }

  it("projects only the fields W2 needs, and only genuinely overdue loans", async () => {
    const t = convexTest(schema, modules);
    const { owner, borrower, toolId, loanRequestId } = await overdueLoan(t);

    const future = await insertRequest(t, {
      toolId,
      ownerId: owner.id,
      borrowerId: borrower.id,
      status: "approved",
      startDate: Date.now() + DAY,
      endDate: Date.now() + 2 * DAY,
    });
    const returned = await insertRequest(t, {
      toolId,
      ownerId: owner.id,
      borrowerId: borrower.id,
      status: "returned",
      startDate: Date.now() - 4 * DAY,
      endDate: Date.now() - 2 * DAY,
    });

    const result = await t.query(internal.automation.listOverdue, { asOf: Date.now() });
    expect(result.loans).toHaveLength(1);
    const loan = result.loans[0]!;
    expect(loan).toMatchObject({
      loanRequestId,
      toolName: "Cordless drill",
      borrowerName: "user_borrower",
      borrowerEmail: "borrower@example.test",
      daysOverdue: 3,
    });
    expect(Object.keys(loan).sort()).toEqual([
      "borrowerEmail",
      "borrowerName",
      "daysOverdue",
      "dueDate",
      "endDate",
      "loanRequestId",
      "startDate",
      "toolName",
    ]);
    expect(result.loans.map((row) => row.loanRequestId)).not.toContain(future);
    expect(result.loans.map((row) => row.loanRequestId)).not.toContain(returned);
  });

  it("dedupes a reminder write-back on (loan, dueDate, dayOffset)", async () => {
    const t = convexTest(schema, modules);
    const { loanRequestId } = await overdueLoan(t);
    const args = {
      loanRequestId,
      dayOffset: 3,
      dueDate: date(-3),
      channel: "email" as const,
      status: "sent" as const,
      sentAt: Date.now(),
    };

    expect(await t.mutation(internal.automation.recordReminder, args)).toEqual({
      accepted: true,
      deduped: false,
    });
    expect(await t.mutation(internal.automation.recordReminder, args)).toEqual({
      accepted: true,
      deduped: true,
    });

    const events = await eventRows(t);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "overdue.reminder", status: "sent" });
  });

  it("accepts a returned loan's write-back as a no-op rather than an error", async () => {
    const t = convexTest(schema, modules);
    const { loanRequestId } = await overdueLoan(t);
    await t.run(
      async (ctx) =>
        await ctx.db.patch(loanRequestId, { status: "returned", returnedAt: Date.now() }),
    );

    const result = await t.mutation(internal.automation.recordReminder, {
      loanRequestId,
      dayOffset: 3,
      dueDate: date(-3),
      channel: "email",
      status: "sent",
      sentAt: Date.now(),
    });

    expect(result).toEqual({ accepted: false, deduped: false, reason: "not_overdue" });
    expect(await eventRows(t)).toHaveLength(0);
  });
});

describe("activity feed + admin health", () => {
  it("shows the feed to both parties and to admins, and to nobody else", async () => {
    const t = convexTest(schema, modules);
    const { owner, borrower, toolId } = await shelf(t);
    const admin = await provision(t, "user_admin", "admin@example.test", "admin");
    const outsider = await provision(t, "user_other", "other@example.test");
    const loanRequestId = await insertRequest(t, {
      toolId,
      ownerId: owner.id,
      borrowerId: borrower.id,
      status: "approved",
    });

    await t.mutation(internal.automation.recordWorkflowEvent, {
      kind: "workflow.error",
      workflow: "overdue-reminders",
      executionId: "exec-1",
      loanRequestId,
      message: "SMTP refused the connection",
      occurredAt: Date.now(),
    });

    for (const actor of [owner.as, borrower.as, admin.as]) {
      const feed = await actor.query(api.automation.listForLoan, { loanRequestId });
      expect(feed).toHaveLength(1);
      expect(feed[0]).toMatchObject({ kind: "workflow.error", status: "failed" });
    }

    expect(
      codeOf(await capturedError(outsider.as.query(api.automation.listForLoan, { loanRequestId }))),
    ).toBe("FORBIDDEN");
    expect(
      codeOf(await capturedError(t.query(api.automation.listForLoan, { loanRequestId }))),
    ).toBe("UNAUTHORIZED");
  });

  it("keeps automation health admin-only", async () => {
    const t = convexTest(schema, modules);
    const user = await provision(t, "user_plain", "plain@example.test");
    const admin = await provision(t, "user_admin", "admin@example.test", "admin");

    expect(codeOf(await capturedError(user.as.query(api.automation.adminHealth, {})))).toBe(
      "FORBIDDEN",
    );
    expect(codeOf(await capturedError(t.query(api.automation.adminHealth, {})))).toBe(
      "UNAUTHORIZED",
    );

    const health = await admin.as.query(api.automation.adminHealth, {});
    expect(health).toMatchObject({ pending: 0, failed: 0, recent: [] });
  });
});

describe("inbound HTTP endpoints", () => {
  it("rejects unsigned, stale and tampered calls before any side effect", async () => {
    const t = convexTest(schema, modules);
    await shelf(t);

    const unsigned = await t.fetch("/n8n/overdue-loans", { method: "POST", body: "{}" });
    expect(unsigned.status).toBe(401);

    const stale = await signedPost(
      t,
      "/n8n/overdue-loans",
      {},
      { timestamp: Math.floor(Date.now() / 1000) - 3_600 },
    );
    expect(stale.status).toBe(401);

    const timestamp = String(Math.floor(Date.now() / 1000));
    const raw = JSON.stringify({ asOf: Date.now() });
    const wrongSecret = await t.fetch("/n8n/overdue-loans", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-LendLoop-Timestamp": timestamp,
        "X-LendLoop-Signature": `v1=${"a".repeat(64)}`,
      },
      body: raw,
    });
    expect(wrongSecret.status).toBe(401);

    // Tampering with the body after signing must fail as well.
    const { signRequest } = await import("./lib/hmac");
    const signature = await signRequest(SECRET, timestamp, raw);
    const tampered = await t.fetch("/n8n/overdue-loans", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-LendLoop-Timestamp": timestamp,
        "X-LendLoop-Signature": signature,
      },
      body: JSON.stringify({ asOf: Date.now() + 1 }),
    });
    expect(tampered.status).toBe(401);

    expect(await eventRows(t)).toHaveLength(0);
    expect(await outboxRows(t)).toHaveLength(0);
  });

  it("serves overdue loans to a signed caller", async () => {
    const t = convexTest(schema, modules);
    const owner = await provision(t, "user_owner", "owner@example.test");
    const borrower = await provision(t, "user_borrower", "borrower@example.test");
    const toolId = await insertTool(t, owner.id);
    const loanRequestId = await insertRequest(t, {
      toolId,
      ownerId: owner.id,
      borrowerId: borrower.id,
      status: "approved",
      startDate: Date.now() - 5 * DAY,
      endDate: Date.now() - 3 * DAY,
    });

    const response = await signedPost(t, "/n8n/overdue-loans", { asOf: Date.now() });
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      asOf: number;
      loans: Array<Record<string, unknown>>;
    };
    expect(body.loans).toHaveLength(1);
    expect(body.loans[0]).toMatchObject({
      loanRequestId,
      borrowerEmail: "borrower@example.test",
      daysOverdue: 3,
    });
    // No description, no borrower/owner ids in the projection.
    expect(body.loans[0]).not.toHaveProperty("description");
    expect(body.loans[0]).not.toHaveProperty("borrowerId");
  });

  it("accepts a signed reminder and treats the duplicate as success", async () => {
    const t = convexTest(schema, modules);
    const owner = await provision(t, "user_owner", "owner@example.test");
    const borrower = await provision(t, "user_borrower", "borrower@example.test");
    const toolId = await insertTool(t, owner.id);
    const loanRequestId = await insertRequest(t, {
      toolId,
      ownerId: owner.id,
      borrowerId: borrower.id,
      status: "approved",
      startDate: Date.now() - 5 * DAY,
      endDate: Date.now() - 3 * DAY,
    });

    const body = {
      loanRequestId,
      kind: "overdue_reminder",
      dayOffset: 3,
      dueDate: date(-3),
      channel: "email",
      status: "sent",
      sentAt: Date.now(),
    };

    const first = await signedPost(t, "/n8n/reminders", body);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, accepted: true, deduped: false });

    const second = await signedPost(t, "/n8n/reminders", body);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, accepted: true, deduped: true });

    const events = await eventRows(t);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "overdue.reminder", channel: "email" });
  });

  it("rejects an invalid payload with 400 after a valid signature", async () => {
    const t = convexTest(schema, modules);
    const response = await signedPost(t, "/n8n/reminders", {
      loanRequestId: "not-an-id",
      kind: "overdue_reminder",
    });
    expect(response.status).toBe(400);
    expect(await eventRows(t)).toHaveLength(0);
  });

  it("records a workflow error once per execution", async () => {
    const t = convexTest(schema, modules);
    const owner = await provision(t, "user_owner", "owner@example.test");
    const borrower = await provision(t, "user_borrower", "borrower@example.test");
    const toolId = await insertTool(t, owner.id);
    const loanRequestId = await insertRequest(t, {
      toolId,
      ownerId: owner.id,
      borrowerId: borrower.id,
      status: "approved",
    });

    const body = {
      kind: "workflow.error",
      workflow: "overdue-reminders",
      executionId: "exec-42",
      loanRequestId,
      message: "SMTP refused the connection",
      occurredAt: Date.now(),
    };

    expect(await (await signedPost(t, "/n8n/automation-events", body)).json()).toEqual({
      ok: true,
      deduped: false,
    });
    expect(await (await signedPost(t, "/n8n/automation-events", body)).json()).toEqual({
      ok: true,
      deduped: true,
    });

    const events = await eventRows(t);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "workflow.error",
      status: "failed",
      loanRequestId,
      detail: "SMTP refused the connection",
    });
  });

  it("serves nothing when the shared secret is not configured", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("N8N_HMAC_SECRET", "");
    const response = await signedPost(t, "/n8n/overdue-loans", {});
    expect(response.status).toBe(503);
  });
});
