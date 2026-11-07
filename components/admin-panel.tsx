"use client";

import type { FunctionReturnType } from "convex/server";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { api } from "@/convex/_generated/api";
import { RequestStatusBadge } from "@/components/request-status";
import { appErrorMessage } from "@/lib/convex-error";
import { formatRange } from "@/lib/format";

type Listing = FunctionReturnType<typeof api.tools.listAvailable>[number];

export function AdminPanel() {
  const me = useQuery(api.users.me, {});
  const isAdmin = me?.role === "admin";

  const loans = useQuery(api.admin.listAllLoans, isAdmin ? {} : "skip");
  const users = useQuery(api.admin.listUsers, isAdmin ? {} : "skip");
  const audit = useQuery(api.admin.listAudit, isAdmin ? {} : "skip");
  const listings = useQuery(api.tools.listAvailable, isAdmin ? {} : "skip");

  const removeListing = useMutation(api.admin.removeListing);
  const setTrusted = useMutation(api.admin.setTrustedLender);

  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (run: () => Promise<unknown>, done?: () => void) => {
    setError(null);
    try {
      await run();
      done?.();
    } catch (caught) {
      setError(appErrorMessage(caught));
    }
  };

  if (me === undefined) {
    return <p className="mt-8 text-sm text-ink-muted">Checking your access…</p>;
  }

  if (!isAdmin) {
    return (
      <div className="mt-8 rounded-xl border border-dashed border-line px-5 py-10 text-center">
        <p className="text-sm font-medium">This area is for admins.</p>
        <p className="mt-1 text-xs text-ink-muted">
          Ask an admin to raise your role if you need access.
        </p>
      </div>
    );
  }

  if (loans === undefined || users === undefined || audit === undefined || listings === undefined) {
    return <p className="mt-8 text-sm text-ink-muted">Loading the admin view…</p>;
  }

  return (
    <div className="mt-8 grid gap-10">
      {error !== null && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <section aria-labelledby="loans-heading">
        <h2 id="loans-heading" className="text-sm font-medium text-ink-muted uppercase">
          All loans ({loans.length})
        </h2>
        {loans.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">No loans yet.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {loans.map((loan) => (
              <li
                key={loan._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-raised px-4 py-3"
              >
                <div className="text-sm">
                  <span className="font-medium">{loan.toolName}</span>
                  <span className="text-ink-muted">
                    {" "}
                    · {loan.ownerName} → {loan.borrowerName} ·{" "}
                    {formatRange(loan.startDate, loan.endDate)}
                  </span>
                </div>
                <RequestStatusBadge phase={loan.phase} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="listings-heading">
        <h2 id="listings-heading" className="text-sm font-medium text-ink-muted uppercase">
          Listings ({listings.length})
        </h2>
        <ul className="mt-3 grid gap-2">
          {listings.map((listing: Listing) => (
            <li
              key={listing._id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-raised px-4 py-3"
            >
              <div className="text-sm">
                <span className="font-medium">{listing.name}</span>
                <span className="text-ink-muted">
                  {" "}
                  · {listing.ownerName} · {listing.availability.replace("_", " ")}
                </span>
              </div>
              {confirming === listing._id ? (
                <span className="flex items-center gap-3 text-xs">
                  <span className="text-ink-muted">Remove this listing?</span>
                  <button
                    type="button"
                    onClick={() =>
                      void act(
                        () => removeListing({ toolId: listing._id }),
                        () => setConfirming(null),
                      )
                    }
                    className="font-medium text-red-600 underline underline-offset-4"
                  >
                    Yes, remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="text-ink-muted underline underline-offset-4"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(listing._id)}
                  className="text-xs text-ink-muted underline underline-offset-4 hover:text-red-600"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="neighbours-heading">
        <h2 id="neighbours-heading" className="text-sm font-medium text-ink-muted uppercase">
          Neighbours ({users.length})
        </h2>
        <ul className="mt-3 grid gap-2">
          {users.map((user) => (
            <li
              key={user._id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-raised px-4 py-3"
            >
              <div className="text-sm">
                <span className="font-medium">{user.name}</span>
                <span className="text-ink-muted"> · {user.email}</span>
                {user.role === "admin" && (
                  <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs text-ink-muted">
                    Admin
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() =>
                  void act(() => setTrusted({ userId: user._id, trusted: !user.isTrustedLender }))
                }
                aria-pressed={user.isTrustedLender}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  user.isTrustedLender
                    ? "border-accent/30 bg-accent/10 text-accent-strong"
                    : "border-line text-ink-muted hover:text-ink"
                }`}
              >
                {user.isTrustedLender ? "Trusted lender" : "Mark trusted"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="audit-heading">
        <h2 id="audit-heading" className="text-sm font-medium text-ink-muted uppercase">
          Recent admin actions
        </h2>
        {audit.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Nothing logged yet.</p>
        ) : (
          <ul className="mt-3 grid gap-1 text-sm text-ink-muted">
            {audit.map((entry) => (
              <li key={entry._id}>
                {entry.actorName} · {entry.action} · {entry.targetType} {entry.targetId.slice(-6)} ·{" "}
                {new Date(entry.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
