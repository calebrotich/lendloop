import { SeverityNumber } from "@opentelemetry/api-logs";
import { after } from "next/server";

import { posthogLogProvider, posthogLogsLogger } from "@/instrumentation";

export const dynamic = "force-dynamic";

const SERVICE = "lendloop";

/**
 * Liveness endpoint (T7/J7). Deliberately dependency-free for now: it must not
 * fail because Convex or n8n is down. Deeper checks land in Stage 6.
 */
export function GET() {
  posthogLogsLogger?.emit({
    body: "Liveness check served",
    severityNumber: SeverityNumber.INFO,
    attributes: { endpoint: "/api/health", status_code: 200 },
  });

  after(() => posthogLogProvider?.forceFlush().catch(() => undefined));

  return Response.json(
    {
      status: "ok",
      service: SERVICE,
      checkedAt: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
