"use client";

import { useReducedMotion } from "motion/react";
import { ArrowDown, ShieldCheck } from "lucide-react";

import { ListingImage } from "@/components/listing/listing-image";
import { LoopMark } from "@/components/ui/brand";
import { Icon } from "@/components/ui/icon";
import { formatMoney } from "@/lib/format";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/options";
import type { ShowcaseListing } from "@/lib/public-listings";

interface HeroLoopProps {
  listings: ShowcaseListing[];
  onCategorySelect: (category: ShowcaseListing["category"]) => void;
}

const POSITIONS = [
  {
    index: 0,
    className: "left-[calc(50%-110px)] top-[22px] z-20 w-[220px] hover:z-30",
    rotate: 1.5,
    float: 8,
  },
  {
    index: 1,
    className: "left-0 top-[132px] z-10 w-[192px] hover:z-30",
    rotate: -9,
    float: 7,
  },
  {
    index: 2,
    className: "right-0 top-[108px] z-10 w-[198px] hover:z-30",
    rotate: 8,
    float: 6.5,
  },
] as const;

/**
 * A fan of real listing cards around a quiet orbit. The orbit dot and the
 * cards' slow float are the only motion; hover brings a card forward and
 * straightens it. Reduced-motion users get the static composition.
 */
export function HeroLoop({ listings, onCategorySelect }: HeroLoopProps) {
  const reduce = useReducedMotion();
  const cards = listings.slice(0, 3);

  return (
    <div className="hidden xl:block">
      <div className="relative mx-auto h-[474px] w-full max-w-[460px]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(58% 56% at 50% 48%, rgba(224,234,248,0.9) 0%, rgba(224,234,248,0) 72%)",
          }}
        />

        <svg
          aria-hidden="true"
          viewBox="0 0 460 474"
          className="pointer-events-none absolute inset-0 h-full w-full"
          fill="none"
        >
          <g transform="rotate(-13 230 237)">
            <ellipse
              cx="230"
              cy="237"
              rx="200"
              ry="162"
              stroke="var(--color-brand)"
              strokeOpacity="0.36"
              strokeWidth="1"
              strokeDasharray="3 9"
              strokeLinecap="round"
            />
            {reduce !== true && (
              <circle r="3.4" fill="var(--color-orange)">
                <animateMotion
                  dur="19s"
                  repeatCount="indefinite"
                  path="M 30,237 a 200,162 0 1,1 400,0 a 200,162 0 1,1 -400,0"
                />
              </circle>
            )}
          </g>
        </svg>

        {POSITIONS.map((position) => {
          const listing = cards[position.index];
          if (listing === undefined) return null;

          return (
            <div
              key={listing._id}
              className={`hero-float absolute ${position.className}`}
              style={{
                animationDuration: `${position.float}s`,
                animationDelay: `${position.index * 0.5}s`,
              }}
            >
              <div style={{ rotate: `${position.rotate}deg` }}>
                <HeroListingCard
                  listing={listing}
                  preload={position.index === 0}
                  onCategorySelect={onCategorySelect}
                />
              </div>
            </div>
          );
        })}

        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 text-[9.5px] font-bold tracking-[0.18em] text-ink-muted uppercase">
          <LoopMark className="size-3.5 text-brand" />
          Borrow · Lend · Return
        </div>
      </div>
    </div>
  );
}

export function HeroMiniStack({ listings, onCategorySelect }: HeroLoopProps) {
  const cards = listings.slice(0, 3);
  if (cards.length === 0) return null;

  return (
    <div className="mt-5 flex items-center gap-3 sm:hidden">
      <div className="flex -space-x-2.5">
        {cards.map((listing) => (
          <button
            key={listing._id}
            type="button"
            onClick={() => onCategorySelect(listing.category)}
            aria-label={`Show ${CATEGORY_LABELS[listing.category]} on the shelf`}
            title={`Show ${CATEGORY_LABELS[listing.category]} on the shelf`}
            className="relative size-10 shrink-0 overflow-hidden rounded-xl border-2 border-white shadow-soft transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <ListingImage
              src={listing.images.cover?.url ?? null}
              alt={listing.name}
              category={listing.category}
              width={listing.images.cover?.width}
              height={listing.images.cover?.height}
              compactArt
              showArtLabel={false}
              sizes="40px"
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>
      <p className="text-[11px] leading-tight text-ink-muted">
        <span className="block font-semibold text-navy">Real shelves, right nearby</span>
        From neighbours on your street.
      </p>
    </div>
  );
}

export function HeroLoopMobile({ listings, onCategorySelect }: HeroLoopProps) {
  const cards = listings.slice(0, 3);
  if (cards.length === 0) return null;

  return (
    <div className="mt-8 xl:hidden">
      <div className="mb-3 flex items-center justify-between">
        <p className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.16em] text-ink-muted uppercase">
          <LoopMark className="size-3.5 text-brand" />
          From the shelf
        </p>
        <span className="text-[10px] font-medium text-ink-muted/70 sm:hidden">Swipe →</span>
      </div>
      <div
        aria-label="Featured listings"
        className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((listing) => (
          <div
            key={listing._id}
            className="w-[210px] shrink-0 snap-center sm:w-auto sm:min-w-0 sm:flex-1"
          >
            <HeroListingCard listing={listing} onCategorySelect={onCategorySelect} />
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroListingCard({
  listing,
  preload = false,
  onCategorySelect,
}: {
  listing: ShowcaseListing;
  preload?: boolean;
  onCategorySelect: (category: ShowcaseListing["category"]) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onCategorySelect(listing.category)}
      aria-label={`Show ${CATEGORY_LABELS[listing.category]} on the shelf`}
      title={`Show ${CATEGORY_LABELS[listing.category]} on the shelf`}
      className="group block w-full cursor-pointer rounded-[24px] bg-white p-[6px] text-left shadow-float transition-[box-shadow,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:shadow-[0_30px_70px_-22px_rgb(22_33_91/0.32)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-[19px] bg-mist/40">
        <ListingImage
          src={listing.images.cover?.url ?? null}
          alt={listing.name}
          category={listing.category}
          width={listing.images.cover?.width}
          height={listing.images.cover?.height}
          preload={preload}
          showArtLabel={false}
          sizes="220px"
          className="h-full w-full object-cover transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.045]"
        />
        <span className="absolute top-2.5 left-2.5 rounded-full bg-white/92 px-2 py-1 text-[9px] font-semibold tracking-[0.04em] text-navy uppercase shadow-sm backdrop-blur-sm">
          {CATEGORY_LABELS[listing.category]}
        </span>
        <span className="absolute top-2.5 right-2.5 flex size-7 translate-y-1 items-center justify-center rounded-full bg-white/90 text-navy opacity-0 shadow-sm backdrop-blur-sm transition-[opacity,transform] duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <Icon icon={ArrowDown} size={13} />
        </span>
      </div>
      <div className="px-1.5 pt-2.5 pb-1.5">
        <p className="truncate text-[12.5px] leading-tight font-semibold tracking-[-0.01em] text-navy">
          {listing.name}
        </p>
        <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-ink-muted">
          <span className="truncate">{CONDITION_LABELS[listing.condition]}</span>
          {listing.ownerTrusted && (
            <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-brand">
              <Icon icon={ShieldCheck} size={10} /> Trusted lender
            </span>
          )}
        </p>
        <p className="mt-1 truncate text-[10px] font-semibold text-brand">
          {listing.dailyRateCents === 0
            ? "Free to borrow"
            : `${formatMoney(listing.dailyRateCents)} per day`}
        </p>
      </div>
    </button>
  );
}
