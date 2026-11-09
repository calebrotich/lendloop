import type { FunctionReturnType } from "convex/server";

import type { api } from "@/convex/_generated/api";

/** Shapes returned by the public queries, derived so they cannot drift. */
export type ShowcaseListing = FunctionReturnType<typeof api.tools.listShowcase>[number];

export type PublicListing = NonNullable<FunctionReturnType<typeof api.tools.getPublicListing>>;

export type ListingAvailability = ShowcaseListing["availability"];

/** One label/class pair for availability, used by cards and the detail page. */
export const AVAILABILITY: Record<
  ListingAvailability,
  { label: string; dot: string; pill: string }
> = {
  available: {
    label: "Available now",
    dot: "bg-[#0373ff]",
    pill: "bg-[#eaf3ff] text-[#0b5fd9]",
  },
  on_loan: {
    label: "Out on loan",
    dot: "bg-orange",
    pill: "bg-[#fff1ec] text-[#c8451b]",
  },
  paused: {
    label: "Paused",
    dot: "bg-ink-muted",
    pill: "bg-[#eef0f8] text-ink-muted",
  },
};

/** "Just listed" for the first couple of weeks, otherwise a plain date. */
export function listedAgo(createdAt: number, now: number = Date.now()): string {
  const days = Math.max(0, Math.floor((now - createdAt) / 86_400_000));
  if (days === 0) return "Listed today";
  if (days === 1) return "Listed yesterday";
  if (days < 14) return `Listed ${days} days ago`;
  return `Listed ${new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(createdAt)}`;
}

const FEATURED_CATEGORIES: ShowcaseListing["category"][] = [
  "power_tools",
  "kitchen",
  "camping",
  "garden",
];

/**
 * Three real listings for the hero loop. Prefer available tools with a cover
 * photo, one per category, then fill from the rest of the shelf. This is
 * selection, not mock data: the cards link to the actual item pages.
 */
export function pickFeaturedListings(listings: ShowcaseListing[], limit = 3): ShowcaseListing[] {
  if (listings.length === 0) return [];

  const withCovers = listings.filter((listing) => listing.images.cover !== null);
  // Prefer established listings: the hero is a curated window, not the newest
  // five rows of the shelf. New listings still appear immediately in the grid.
  const source = [...(withCovers.length >= limit ? withCovers : listings)].sort(
    (a, b) => a.createdAt - b.createdAt,
  );
  const chosen: ShowcaseListing[] = [];

  for (const category of FEATURED_CATEGORIES) {
    if (chosen.length === limit) break;
    const match =
      source.find(
        (listing) => listing.category === category && listing.availability === "available",
      ) ?? source.find((listing) => listing.category === category);
    if (match !== undefined && !chosen.some((listing) => listing._id === match._id)) {
      chosen.push(match);
    }
  }

  for (const listing of source) {
    if (chosen.length === limit) break;
    if (!chosen.some((item) => item._id === listing._id)) chosen.push(listing);
  }

  return chosen.slice(0, limit);
}
