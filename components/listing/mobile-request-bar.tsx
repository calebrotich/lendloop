"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";

import { api } from "@/convex/_generated/api";

import { Button, ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { formatMoney } from "@/lib/format";
import { AVAILABILITY, type PublicListing } from "@/lib/public-listings";

/**
 * A small mobile action bar that appears while the request card is still below
 * the fold, then gets out of the way once it is on screen. It is an accelerator,
 * not a second request flow.
 */
export function MobileRequestBar({ listing }: { listing: PublicListing }) {
  const [visible, setVisible] = useState(true);
  const live = useQuery(api.tools.getPublicListing, { toolId: listing._id });
  const isOwner = live?.isOwner ?? listing.isOwner;
  const availability = AVAILABILITY[listing.availability];

  useEffect(() => {
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const card = document.getElementById("request");
        if (card === null) {
          setVisible(false);
          return;
        }
        const rect = card.getBoundingClientRect();
        setVisible(rect.top > window.innerHeight * 0.92);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  function goToRequest() {
    document.getElementById("request")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 90 }}
          animate={{ y: 0 }}
          exit={{ y: 90 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-rule/80 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-navy">
                {isOwner
                  ? "Your listing"
                  : listing.dailyRateCents === 0
                    ? "Free to borrow"
                    : `${formatMoney(listing.dailyRateCents)}/day`}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-muted">
                <span aria-hidden="true" className={`size-1.5 rounded-full ${availability.dot}`} />
                <span className="truncate">{availability.label}</span>
              </p>
            </div>
            {isOwner ? (
              <ButtonLink
                href="/incoming-requests"
                size="md"
                className="shrink-0"
                iconRight={<Icon icon={ArrowRight} size={15} />}
              >
                Incoming requests
              </ButtonLink>
            ) : (
              <Button
                size="md"
                onClick={goToRequest}
                className="shrink-0"
                iconRight={<Icon icon={ArrowRight} size={15} />}
              >
                Ask for dates
              </Button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
