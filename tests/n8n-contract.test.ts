import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { requestNotificationSchema } from "../convex/lib/n8n";

/**
 * Contract checks for the committed n8n exports (T22/T27).
 *
 * These are intentionally structural, not decorative: they fail if a workflow
 * loses its error handler, if a credential value is ever exported, if a URL is
 * hard-coded instead of read from the environment, or if the HMAC verification
 * stops looking at the raw body.
 */

interface WorkflowNode {
  name: string;
  type: string;
  parameters: Record<string, unknown>;
  credentials?: Record<string, Record<string, unknown>>;
}

interface Workflow {
  id: string;
  name: string;
  active: boolean;
  nodes: WorkflowNode[];
  settings: Record<string, unknown>;
}

function load(file: string): Workflow {
  const raw = readFileSync(join(process.cwd(), "automation/workflows", file), "utf8");
  const parsed = JSON.parse(raw) as Workflow[];
  const workflow = parsed[0];
  if (workflow === undefined) throw new Error(`${file} contains no workflow`);
  return workflow;
}

function codeOf(node: WorkflowNode): string {
  const code = node.parameters.jsCode;
  return typeof code === "string" ? code : "";
}

const files = [
  "request-notification.json",
  "overdue-reminders.json",
  "error-handler.json",
] as const;
const workflows = files.map((file) => ({ file, workflow: load(file) }));

describe("n8n workflow exports", () => {
  it("ship all three workflows with stable ids", () => {
    expect(workflows.map(({ workflow }) => workflow.id).sort()).toEqual([
      "lendloop-error-handler",
      "lendloop-overdue-reminders",
      "lendloop-request-notification",
    ]);
    for (const { workflow } of workflows) {
      expect(workflow.nodes.length).toBeGreaterThan(0);
      expect(workflow.active).toBe(true);
    }
  });

  it("wires W1 and W2 to W3 without letting W3 recurse", () => {
    const [w1, w2, w3] = workflows.map(({ workflow }) => workflow);
    expect(w1?.settings.errorWorkflow).toBe("lendloop-error-handler");
    expect(w2?.settings.errorWorkflow).toBe("lendloop-error-handler");
    expect(w3?.settings.errorWorkflow).toBeUndefined();
  });

  it("verifies the signature over the raw body, timing-safely", () => {
    const w1 = load("request-notification.json");
    const verify = w1.nodes.find((node) => node.name === "Verify signature");
    expect(verify?.type).toBe("n8n-nodes-base.code");

    const code = codeOf(verify!);
    expect(code).toContain("x-lendloop-signature");
    expect(code).toContain("x-lendloop-timestamp");
    expect(code).toContain("Buffer.from(b64, 'base64')");
    expect(code).toContain("crypto.timingSafeEqual");
    expect(code).toContain("$env.LENDLOOP_HMAC_SECRET");
    expect(code).toContain("Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp))");

    // A rejected request must be answered before any email node runs.
    const webhook = w1.nodes.find((node) => node.type === "n8n-nodes-base.webhook");
    expect(webhook?.parameters.rawBody).toBe(true);
    expect((webhook?.parameters.options as { rawBody?: boolean } | undefined)?.rawBody).toBe(true);
    expect(w1.nodes.some((node) => node.name === "Respond 401")).toBe(true);
  });

  it("reads the notification contract the backend actually sends", () => {
    const w1 = load("request-notification.json");
    const compose = codeOf(w1.nodes.find((node) => node.name === "Compose email")!);

    for (const key of Object.keys(requestNotificationSchema.shape)) {
      if (key === "idempotencyKey" || key === "occurredAt") continue;
      expect(compose).toContain(`b.${key}`);
    }
    expect(compose).toContain("b.recipient.email");
    expect(compose).toContain("b.tool.name");
    expect(compose).toContain("b.window.start");
  });

  it("runs W2 on the documented schedule and writes back idempotently", () => {
    const w2 = load("overdue-reminders.json");
    const schedule = w2.nodes.find((node) => node.type === "n8n-nodes-base.scheduleTrigger");
    const rule = schedule?.parameters.rule as {
      interval?: Array<{ field?: string; triggerAtHour?: number; triggerAtMinute?: number }>;
    };

    expect(rule.interval?.[0]).toMatchObject({
      field: "days",
      triggerAtHour: 9,
      triggerAtMinute: 0,
    });
    expect(w2.settings.timezone).toBe("Africa/Nairobi");

    const writeBack = w2.nodes.find((node) => node.name === "Write back reminder");
    const prepare = codeOf(w2.nodes.find((node) => node.name === "Prepare reminder")!);
    expect(prepare).toContain("/n8n/reminders");
    expect(prepare).toContain("'reminder:'");
    expect(JSON.stringify(writeBack?.parameters)).toContain("X-LendLoop-Idempotency-Key");
    expect(JSON.stringify(writeBack?.parameters)).toContain("idempotencyKey");

    const summary = codeOf(w2.nodes.find((node) => node.name === "Summarise run")!);
    expect(summary).toContain("workflow.summary");
    expect(summary).toContain("$execution.id");
  });

  it("handles both n8n-internal errors and Convex outbox alerts", () => {
    const w3 = load("error-handler.json");
    expect(w3.nodes.some((node) => node.type === "n8n-nodes-base.errorTrigger")).toBe(true);
    expect(w3.nodes.some((node) => node.type === "n8n-nodes-base.webhook")).toBe(true);
    expect(w3.nodes.some((node) => node.type === "n8n-nodes-base.emailSend")).toBe(true);
    expect(codeOf(w3.nodes.find((node) => node.name === "Format error alert")!)).toContain(
      "workflow.error",
    );
    const formatError = codeOf(w3.nodes.find((node) => node.name === "Format error alert")!);
    expect(formatError).toContain("/n8n/automation-events");
  });

  it("references only allow-listed environment variables", () => {
    const allowed = new Set([
      "LENDLOOP_HMAC_SECRET",
      "LENDLOOP_CONVEX_SITE_URL",
      "LENDLOOP_APP_BASE_URL",
      "LENDLOOP_MAIL_FROM",
      "LENDLOOP_OPS_EMAIL",
      "SIGNATURE_TOLERANCE_SECONDS",
    ]);

    const referenced = new Set<string>();
    for (const { workflow } of workflows) {
      for (const match of JSON.stringify(workflow).matchAll(/\$env\.([A-Z0-9_]+)/g)) {
        referenced.add(match[1] ?? "");
      }
    }

    expect(referenced.size).toBeGreaterThan(0);
    expect([...referenced].sort()).toEqual(
      [...referenced].filter((name) => allowed.has(name)).sort(),
    );
    expect(referenced.has("LENDLOOP_HMAC_SECRET")).toBe(true);
    expect(referenced.has("LENDLOOP_CONVEX_SITE_URL")).toBe(true);
  });

  it("never carries a credential value or a hard-coded endpoint", () => {
    for (const { file, workflow } of workflows) {
      for (const node of workflow.nodes) {
        for (const credential of Object.values(node.credentials ?? {})) {
          expect(Object.keys(credential).sort()).toEqual(["id", "name"]);
        }
      }

      const text = readFileSync(join(process.cwd(), "automation/workflows", file), "utf8");
      expect(text).not.toMatch(/\bsk_(live|test)_/);
      expect(text).not.toMatch(/\bwhsec_/);
      expect(text).not.toMatch(/trycloudflare\.com/);
      expect(text).not.toMatch(/localhost:5678/);
      expect(text).not.toMatch(/"password"\s*:\s*"[^"]+"/);
    }
  });
});
