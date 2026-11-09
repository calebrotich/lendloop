"use client";

import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { timeAgo } from "@/lib/format";

type AutomationEvent = FunctionReturnType<typeof api.automation.listForLoan>[number];

const NOTIFICATION_LABELS: Partial<Record<AutomationEvent["kind"], string>> = {
  "request.created": "Request notification",
  "request.approved": "Approval notification",
  "request.declined": "Decline notification",
  "request.cancelled": "Withdrawal notification",
  "request.returned": "Return notification",
};

function describe(event: AutomationEvent): string {
  if (event.kind === "overdue.reminder") {
    return event.status === "failed" ? "Reminder failed" : "Reminder sent";
  }
  if (event.kind === "workflow.summary") return "Reminder run";
  if (event.kind === "workflow.error") return "Workflow error";
  if (event.kind === "automation.failed") return "Delivery failed";
  return NOTIFICATION_LABELS[event.kind] ?? "Automation";
}

/**
 * The automation trail under one loan ("Reminder sent 2 days ago").
 *
 * Renders nothing while loading or when nothing has happened, so a loan card
 * does not grow a permanent empty heading. Rows are already participant-scoped
 * by `automation.listForLoan`; this component makes no access decision.
 */
export function AutomationActivity({ loanRequestId }: { loanRequestId: Id<"loanRequests"> }) {
  const events = useQuery(api.automation.listForLoan, { loanRequestId });

  if (events === undefined || events.length === 0) return null;

  return (
    <ul
      aria-label="Automation activity"
      className="mt-2 grid gap-1 rounded-xl bg-page/60 px-3 py-2 text-[10.5px] text-ink-muted"
    >
      {events.map((event) => (
        <li key={event._id} className="flex flex-wrap items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`inline-block size-1.5 rounded-full ${
              event.status === "failed" ? "bg-red-500" : "bg-brand"
            }`}
          />
          <span className={event.status === "failed" ? "text-red-700" : "font-medium text-navy"}>
            {describe(event)}
          </span>
          <span aria-hidden="true">·</span>
          <span>{timeAgo(event.createdAt)}</span>
          {event.status === "failed" && event.detail !== null && (
            <span className="text-red-700/80">({event.detail})</span>
          )}
        </li>
      ))}
    </ul>
  );
}
