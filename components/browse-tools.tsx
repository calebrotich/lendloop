"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Category } from "@/convex/lib/constants";
import { RequestForm } from "@/components/request-form";
import { formatRange } from "@/lib/format";
import { CATEGORIES, CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/options";

const AVAILABILITY = {
  available: { label: "Available", className: "border-accent/30 bg-accent/10 text-accent-strong" },
  on_loan: { label: "On loan", className: "border-line bg-surface text-ink-muted" },
  paused: { label: "Paused", className: "border-line bg-surface text-ink-muted" },
} as const;

export function BrowseTools() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [category, setCategory] = useState<Category | "all">("all");
  const [requesting, setRequesting] = useState<Id<"tools"> | null>(null);

  const tools = useQuery(
    api.tools.listAvailable,
    isAuthenticated ? (category === "all" ? {} : { category }) : "skip",
  );

  if (isLoading || !isAuthenticated || tools === undefined) {
    return <Skeleton />;
  }

  return (
    <section aria-labelledby="browse-heading" className="mt-6">
      <h2 id="browse-heading" className="sr-only">
        Tools neighbours are lending
      </h2>

      <div className="flex flex-wrap gap-2">
        {(["all", ...CATEGORIES] as const).map((option) => {
          const active = option === category;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setCategory(option)}
              aria-pressed={active}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                active
                  ? "border-accent bg-accent text-white"
                  : "border-line text-ink-muted hover:text-ink"
              }`}
            >
              {option === "all" ? "All" : CATEGORY_LABELS[option]}
            </button>
          );
        })}
      </div>

      {tools.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line px-5 py-10 text-center">
          <p className="text-sm font-medium">Nothing here yet.</p>
          <p className="mt-1 text-xs text-ink-muted">
            {category === "all"
              ? "No tools are being lent right now."
              : "No tools in this category right now — try another."}
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {tools.map((tool) => {
            const availability = AVAILABILITY[tool.availability];
            const isRequesting = requesting === tool._id;

            return (
              <li key={tool._id} className="rounded-xl border border-line bg-surface-raised p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium tracking-tight">{tool.name}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {CATEGORY_LABELS[tool.category]} · {CONDITION_LABELS[tool.condition]} ·{" "}
                      {tool.ownerName}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs ${availability.className}`}
                  >
                    {availability.label}
                  </span>
                </div>

                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{tool.description}</p>

                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                  {tool.availability === "available" && !isRequesting && (
                    <button
                      type="button"
                      onClick={() => setRequesting(tool._id)}
                      className="rounded-full bg-accent px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-strong"
                    >
                      Request these dates
                    </button>
                  )}
                  {tool.availability === "on_loan" && tool.busyUntil !== null && (
                    <span className="text-ink-muted">
                      Back from {formatRange(tool.busyUntil, tool.busyUntil)}
                    </span>
                  )}
                  {tool.availability === "paused" && (
                    <span className="text-ink-muted">
                      The owner isn&apos;t lending this right now.
                    </span>
                  )}
                </div>

                {isRequesting && (
                  <RequestForm
                    toolId={tool._id}
                    onDone={() => setRequesting(null)}
                    onCancel={() => setRequesting(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Skeleton() {
  return (
    <div aria-hidden="true" className="mt-6 grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="h-40 animate-pulse rounded-xl border border-line bg-surface-raised"
        />
      ))}
    </div>
  );
}
