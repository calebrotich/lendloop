import { httpRouter } from "convex/server";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { readEnv } from "./lib/env";
import {
  DEFAULT_TOLERANCE_SECONDS,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifySignature,
} from "./lib/hmac";
import { overdueRequestSchema, reminderSchema, workflowEventSchema } from "./lib/n8n";

/**
 * Inbound n8n endpoints.
 *
 * Every route is POST with a JSON body. That is deliberate: the signature covers
 * `${timestamp}.${rawBody}`, so a GET would have to sign an empty body and lose
 * the one rule both sides implement. The body also lets W2 pass `asOf`, which
 * makes the "overdue" cut-off testable.
 *
 * Order of operations is non-negotiable: read the raw bytes, verify the HMAC and
 * the timestamp window, and only then parse and touch the database. A request
 * that fails verification has no side effect at all.
 */

const JSON_HEADERS = { "content-type": "application/json" } as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function toleranceSeconds(): number {
  const raw = readEnv("SIGNATURE_TOLERANCE_SECONDS");
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TOLERANCE_SECONDS;
}

type Gate = { ok: true; body: unknown } | { ok: false; response: Response };

async function verifiedJson(req: Request): Promise<Gate> {
  const rawBody = await req.text();
  const verdict = await verifySignature({
    secret: readEnv("N8N_HMAC_SECRET"),
    timestamp: req.headers.get(TIMESTAMP_HEADER),
    signature: req.headers.get(SIGNATURE_HEADER),
    rawBody,
    nowSeconds: Math.floor(Date.now() / 1000),
    toleranceSeconds: toleranceSeconds(),
  });

  if (!verdict.ok) {
    // IDs and reasons only — never the body, which may contain an address.
    console.warn("n8n inbound rejected", { reason: verdict.reason });
    return {
      ok: false,
      response: jsonResponse(
        { error: "unauthorized" },
        verdict.reason === "not_configured" ? 503 : 401,
      ),
    };
  }

  try {
    return { ok: true, body: JSON.parse(rawBody) as unknown };
  } catch {
    return { ok: false, response: jsonResponse({ error: "invalid_json" }, 400) };
  }
}

const http = httpRouter();

/** W2 fetches the loans that need a reminder. */
http.route({
  path: "/n8n/overdue-loans",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const gate = await verifiedJson(req);
    if (!gate.ok) return gate.response;

    const parsed = overdueRequestSchema.safeParse(gate.body);
    if (!parsed.success) return jsonResponse({ error: "invalid_payload" }, 400);

    const asOf = parsed.data.asOf ?? Date.now();
    const result = await ctx.runQuery(internal.automation.listOverdue, { asOf });
    return jsonResponse(result);
  }),
});

/** W2 writes one reminder back. Duplicates are a 200, not a 500. */
http.route({
  path: "/n8n/reminders",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const gate = await verifiedJson(req);
    if (!gate.ok) return gate.response;

    const parsed = reminderSchema.safeParse(gate.body);
    if (!parsed.success) return jsonResponse({ error: "invalid_payload" }, 400);

    const result = await ctx.runMutation(internal.automation.recordReminder, {
      loanRequestId: parsed.data.loanRequestId as Id<"loanRequests">,
      dayOffset: parsed.data.dayOffset,
      dueDate: parsed.data.dueDate,
      channel: parsed.data.channel,
      status: parsed.data.status,
      sentAt: parsed.data.sentAt,
    });

    return jsonResponse({ ok: true, ...result });
  }),
});

/** W3 reports errors and run summaries; both are deduped on execution id. */
http.route({
  path: "/n8n/automation-events",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const gate = await verifiedJson(req);
    if (!gate.ok) return gate.response;

    const parsed = workflowEventSchema.safeParse(gate.body);
    if (!parsed.success) return jsonResponse({ error: "invalid_payload" }, 400);

    const result = await ctx.runMutation(internal.automation.recordWorkflowEvent, {
      kind: parsed.data.kind,
      workflow: parsed.data.workflow,
      executionId: parsed.data.executionId,
      loanRequestId:
        parsed.data.loanRequestId === undefined
          ? undefined
          : (parsed.data.loanRequestId as Id<"loanRequests">),
      message: parsed.data.message,
      counts: parsed.data.counts,
      occurredAt: parsed.data.occurredAt,
    });

    return jsonResponse({ ok: true, ...result });
  }),
});

export default http;
