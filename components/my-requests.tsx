"use client";

import type { FunctionReturnType } from "convex/server";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { api } from "@/convex/_generated/api";
import { AutomationActivity } from "@/components/automation-activity";
import { RequestStatusBadge } from "@/components/request-status";
import { appErrorMessage } from "@/lib/convex-error";
import { formatRange } from "@/lib/format";

type BorrowRequest = FunctionReturnType<typeof api.requests.listMine>[number];

export function MyRequests() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const requests = useQuery(api.requests.listMine, isAuthenticated ? {} : "skip");
  const cancel = useMutation(api.requests.cancel);
  const markReturned = useMutation(api.requests.markReturned);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (request: BorrowRequest, action: "cancel" | "return") => {
    setBusy(request._id);
    setError(null);
    try {
      if (action === "cancel") await cancel({ requestId: request._id });
      else await markReturned({ requestId: request._id });
    } catch (caught) {
      setError(appErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  if (isLoading || !isAuthenticated || requests === undefined) {
    return <Skeleton />;
  }

  if (requests.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-line px-5 py-10 text-center">
        <p className="text-sm font-medium">No requests yet.</p>
        <p className="mt-1 text-xs text-ink-muted">
          Browse the shelf and ask a neighbour for the dates you need.
        </p>
      </div>
    );
  }

  return (
    <section className="mt-6">
      {error !== null && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <ul className="grid gap-3">
        {requests.map((request) => (
          <li key={request._id} className="rounded-xl border border-line bg-surface-raised p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium tracking-tight">{request.toolName}</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  From {request.ownerName} · {formatRange(request.startDate, request.endDate)}
                </p>
              </div>
              <RequestStatusBadge phase={request.phase} />
            </div>

            {request.note !== null && (
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{request.note}</p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              {request.status === "pending" && (
                <button
                  type="button"
                  disabled={busy === request._id}
                  onClick={() => void act(request, "cancel")}
                  className="text-ink-muted underline underline-offset-4 hover:text-ink disabled:opacity-60"
                >
                  Withdraw request
                </button>
              )}
              {request.status === "approved" && (
                <button
                  type="button"
                  disabled={busy === request._id}
                  onClick={() => void act(request, "return")}
                  className="underline underline-offset-4 hover:text-ink disabled:opacity-60"
                >
                  Mark returned
                </button>
              )}
            </div>

            <AutomationActivity loanRequestId={request._id} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Skeleton() {
  return (
    <div aria-hidden="true" className="mt-6 grid gap-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="h-24 animate-pulse rounded-xl border border-line bg-surface-raised"
        />
      ))}
    </div>
  );
}
