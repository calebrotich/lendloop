"use client";

import { SignInButton, Show } from "@clerk/nextjs";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, SearchX } from "lucide-react";

import type { Category } from "@/convex/lib/constants";
import { ListingCard } from "@/components/listing/listing-card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ListingCardSkeleton } from "@/components/ui/skeleton";
import { CATEGORY_LABELS } from "@/lib/options";
import type { ShowcaseListing } from "@/lib/public-listings";

interface ListingShelfProps {
  listings: ShowcaseListing[];
  total: number;
  loading: boolean;
  category: Category | "all";
  query: string;
  onClear: () => void;
}

export function ListingShelf({
  listings,
  total,
  loading,
  category,
  query,
  onClear,
}: ListingShelfProps) {
  const reduce = useReducedMotion();
  const filtered = query.trim() !== "" || category !== "all";
  const heading = query.trim()
    ? `Results for “${query.trim()}”`
    : category === "all"
      ? "Tools on the shelf"
      : `${CATEGORY_LABELS[category]} near you`;

  return (
    <section id="shelf" aria-labelledby="shelf-heading" className="">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <p className="mb-2.5 inline-flex items-center gap-2 text-[10.5px] font-bold tracking-[0.16em] text-brand uppercase">
            <span className="size-1.5 animate-pulse rounded-full bg-orange" aria-hidden="true" />
            Near you
          </p>
          <h2
            id="shelf-heading"
            className="font-display max-w-2xl text-[34px] leading-[1.02] text-balance text-navy sm:text-[42px]"
          >
            {heading}
          </h2>
          <p className="mt-2.5 max-w-xl text-[13.5px] leading-relaxed text-ink-muted">
            {filtered
              ? "Every match shows the owner’s daily rate. Pick one to see the details and ask for dates."
              : "Everything here belongs to a neighbour. Pick something, choose your dates, and ask."}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[12px] font-medium text-ink-muted tabular-nums" aria-live="polite">
            {loading ? "Loading…" : `${listings.length} of ${total} tools`}
          </span>
          {filtered && !loading && (
            <Button variant="ghost" size="sm" onClick={onClear} className="px-3">
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 8 }, (_, index) => (
            <ListingCardSkeleton key={index} index={index} />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <EmptyShelf filtered={filtered} onClear={onClear} />
      ) : (
        <motion.ul
          layout={reduce !== true}
          className="grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3"
        >
          <AnimatePresence initial={false} mode="popLayout">
            {listings.map((listing, index) => (
              <motion.li
                key={listing._id}
                layout={reduce !== true}
                initial={reduce === true ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce === true ? undefined : { opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.32, delay: Math.min(index * 0.03, 0.18) }}
              >
                <ListingCard listing={listing} priority={index < 4} />
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}
    </section>
  );
}

function EmptyShelf({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-rule bg-white px-6 py-16 text-center sm:px-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background: "radial-gradient(60% 120% at 50% 0%, #e0eaf8 0%, rgba(224,234,248,0) 65%)",
        }}
      />
      <div className="relative mx-auto flex size-14 items-center justify-center rounded-2xl bg-white text-brand shadow-soft">
        <Icon icon={SearchX} size={24} />
      </div>
      <h3 className="font-display relative mt-5 text-[28px] leading-tight text-navy">
        Nothing on this shelf yet
      </h3>
      <p className="relative mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-ink-muted">
        {filtered
          ? "Try a broader word, a different category, or clear the filters to see everything nearby."
          : "The first neighbour hasn’t added a tool yet. You could be the one who starts it."}
      </p>
      <div className="relative mt-6 flex flex-wrap items-center justify-center gap-2.5">
        {filtered ? (
          <Button
            onClick={onClear}
            variant="primary"
            size="sm"
            iconRight={<Icon icon={ArrowRight} size={15} />}
          >
            See the whole shelf
          </Button>
        ) : (
          <>
            <Show when="signed-in">
              <ButtonLink
                href="/my-listings"
                variant="primary"
                size="sm"
                iconRight={<Icon icon={ArrowRight} size={15} />}
              >
                List the first tool
              </ButtonLink>
            </Show>
            <Show when="signed-out">
              <SignInButton mode="modal" fallbackRedirectUrl="/my-listings">
                <Button
                  variant="primary"
                  size="sm"
                  iconRight={<Icon icon={ArrowRight} size={15} />}
                >
                  List the first tool
                </Button>
              </SignInButton>
            </Show>
          </>
        )}
      </div>
    </div>
  );
}
