"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, BellRing, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { api } from "@/convex/_generated/api";
import { Icon } from "@/components/ui/icon";

/**
 * The "you have a request" strip shown as soon as a signed-in owner lands.
 *
 * It is dismissible for the current view. It hides itself on the inbox page,
 * where the inbox already is the message.
 */
/**
 * Remembered for the tab's lifetime, not the component's. The header remounts
 * across routes, and a dismissal should not reappear on the next navigation.
 */
let rememberedNoticeKey: string | null = null;

export function IncomingBanner({ className = "" }: { className?: string }) {
  const { isAuthenticated } = useConvexAuth();
  const summary = useQuery(api.requests.incomingSummary, isAuthenticated ? {} : "skip");
  const pathname = usePathname();
  const [dismissedKey, setDismissedKey] = useState<string | null>(() => rememberedNoticeKey);

  const pending = summary?.pending ?? 0;
  const overdue = summary?.overdue ?? 0;
  // Dismissing covers the requests seen at that moment. A new request changes
  // the timestamp, so the banner comes back even if the count is unchanged.
  const noticeKey = summary === undefined ? null : `${pending}:${summary.latestPendingAt ?? 0}`;
  const dismissed = noticeKey !== null && dismissedKey === noticeKey;
  const hidden =
    !isAuthenticated || pending === 0 || pathname === "/incoming-requests" || dismissed;

  return (
    <AnimatePresence initial={false}>
      {!hidden && (
        <motion.aside
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          aria-live="polite"
          className={`relative overflow-hidden rounded-2xl border border-brand/15 bg-[linear-gradient(100deg,#eef2ff_0%,#ffffff_52%,#fff4ee_100%)] px-3.5 py-3 shadow-soft sm:px-4 ${className}`}
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-white">
              <Icon icon={BellRing} size={16} />
              <span
                aria-hidden="true"
                className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-orange ring-2 ring-white"
              />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-navy sm:text-[13px]">
                {pending} {pending === 1 ? "neighbour is" : "neighbours are"} waiting on your answer
                {overdue > 0 && (
                  <span className="font-medium text-[#a13d1f]">
                    {" "}
                    · {overdue} {overdue === 1 ? "loan is" : "loans are"} overdue
                  </span>
                )}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                Approve or decline in a tap. The dates stay yours to decide.
              </p>
            </div>

            <Link
              href="/incoming-requests"
              className="inline-flex items-center gap-1.5 rounded-full bg-navy px-3.5 py-2 text-[11.5px] font-semibold text-white transition-colors hover:bg-brand"
            >
              Review {pending === 1 ? "request" : "requests"}
              <Icon icon={ArrowRight} size={13} />
            </Link>

            <button
              type="button"
              onClick={() => {
                rememberedNoticeKey = noticeKey;
                setDismissedKey(noticeKey);
              }}
              aria-label="Dismiss incoming request notice"
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-white hover:text-navy"
            >
              <Icon icon={X} size={15} />
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
