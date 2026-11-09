"use client";

import { Heart, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { ListingImage } from "@/components/listing/listing-image";
import { Icon } from "@/components/ui/icon";
import { formatMoney } from "@/lib/format";
import { CONDITION_LABELS, CATEGORY_LABELS } from "@/lib/options";
import { AVAILABILITY, type ShowcaseListing } from "@/lib/public-listings";
import { useSavedListing } from "@/lib/use-saved-listing";

interface ListingCardProps {
  listing: ShowcaseListing;
  preload?: boolean;
}

/**
 * The browse card. One link covers the card; the save control sits above it so
 * the whole surface stays clickable without nesting a button inside an anchor.
 */
export function ListingCard({ listing, preload = false }: ListingCardProps) {
  const { saved, toggle } = useSavedListing(listing._id);
  const availability = AVAILABILITY[listing.availability];

  return (
    <article className="group relative transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1">
      <Link
        href={`/listings/${listing._id}`}
        aria-label={`${listing.name}, ${CATEGORY_LABELS[listing.category]}, ${
          listing.dailyRateCents === 0
            ? "free to borrow"
            : `${formatMoney(listing.dailyRateCents)} per day`
        }`}
        className="absolute inset-0 z-10 rounded-[22px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
      />

      <div className="relative overflow-hidden rounded-[22px] bg-mist/40 shadow-soft transition-shadow duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:shadow-float">
        <div className="aspect-[4/3] w-full overflow-hidden">
          <ListingImage
            src={listing.images.cover?.url ?? null}
            alt={listing.name}
            category={listing.category}
            width={listing.images.cover?.width}
            height={listing.images.cover?.height}
            preload={preload}
            showArtLabel={false}
            className="h-full w-full transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
          />
        </div>

        <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold tracking-tight text-navy shadow-sm backdrop-blur-sm">
          {CATEGORY_LABELS[listing.category]}
        </span>
      </div>

      <button
        type="button"
        onClick={toggle}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${listing.name} from your list` : `Save ${listing.name}`}
        className="absolute top-2.5 right-2.5 z-20 flex size-9 items-center justify-center rounded-full bg-white/90 text-navy shadow-sm backdrop-blur-sm transition-[transform,background-color,color] duration-300 hover:scale-105 hover:bg-white active:scale-95"
      >
        <Icon
          icon={Heart}
          size={17}
          className={`transition-colors ${saved ? "fill-orange text-orange" : "text-navy"}`}
        />
      </button>

      <div className="mt-3.5 flex items-start justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] leading-snug font-semibold tracking-[-0.01em] text-navy">
            {listing.name}
          </h3>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-ink-muted">
            <span className="truncate">{CONDITION_LABELS[listing.condition]} condition</span>
            {listing.ownerTrusted && (
              <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand">
                <Icon icon={ShieldCheck} size={11} /> Trusted lender
              </span>
            )}
          </p>
        </div>
        <p className="shrink-0 text-right text-[13px] leading-snug font-semibold text-navy">
          {listing.dailyRateCents === 0 ? "Free" : formatMoney(listing.dailyRateCents)}
          <span className="block text-[11px] font-medium text-ink-muted">
            {listing.dailyRateCents === 0 ? "to borrow" : "per day"}
          </span>
        </p>
      </div>

      <p className="mt-2 flex items-center gap-1.5 px-0.5 text-[12px] font-medium text-ink-muted">
        <span aria-hidden="true" className={`size-1.5 rounded-full ${availability.dot}`} />
        {availability.label}
      </p>
    </article>
  );
}
