"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { Bell } from "lucide-react";
import Link from "next/link";

import { api } from "@/convex/_generated/api";
import { Icon } from "@/components/ui/icon";

interface IncomingBellProps {
  className?: string;
  /** `sm` matches the compact floating header. */
  size?: "sm" | "md";
}

/**
 * A persistent, visible answer to "is anyone waiting on me?".
 *
 * It subscribes to a bounded count rather than the full inbox, so the signal is
 * cheap enough to sit in every header. A pending request paints the orange
 * count; zero leaves a quiet bell so the destination is still discoverable.
 */
export function IncomingBell({ className = "", size = "md" }: IncomingBellProps) {
  const { isAuthenticated } = useConvexAuth();
  const summary = useQuery(api.requests.incomingSummary, isAuthenticated ? {} : "skip");

  if (!isAuthenticated) return null;

  const pending = summary?.pending ?? 0;
  const overdue = summary?.overdue ?? 0;
  const label =
    pending > 0
      ? `${pending} incoming ${pending === 1 ? "request" : "requests"} waiting for your answer`
      : overdue > 0
        ? `${overdue} overdue ${overdue === 1 ? "loan" : "loans"} · incoming requests`
        : "Incoming requests";

  return (
    <Link
      href="/incoming-requests"
      aria-label={label}
      title={label}
      className={`relative inline-flex items-center justify-center rounded-full border border-rule bg-white/80 text-navy transition-colors hover:border-brand/25 hover:text-brand ${
        size === "sm" ? "size-9" : "size-10"
      } ${pending > 0 ? "animate-pulse-ring border-orange/30" : ""} ${className}`}
    >
      <Icon icon={Bell} size={size === "sm" ? 16 : 18} />
      {pending > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-orange-strong px-1 text-[10px] leading-[18px] font-bold text-white tabular-nums shadow-sm"
        >
          {pending > 9 ? "9+" : pending}
        </span>
      )}
      {pending === 0 && overdue > 0 && (
        <span
          aria-hidden="true"
          className="absolute top-0.5 right-0.5 size-2 rounded-full bg-red-500 ring-2 ring-white"
        />
      )}
      <span className="sr-only">{summary === undefined ? "Loading requests" : ""}</span>
    </Link>
  );
}
