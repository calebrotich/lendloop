import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  MapPin,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import Link from "next/link";

import { CONDITION_LABELS, CATEGORY_LABELS } from "@/lib/options";
import { ListingActions } from "@/components/listing/listing-actions";
import { ListingCard } from "@/components/listing/listing-card";
import { ListingGallery } from "@/components/listing/listing-gallery";
import { MobileRequestBar } from "@/components/listing/mobile-request-bar";
import { RequestCard } from "@/components/listing/request-card";
import { CONTAINER } from "@/components/ui/container";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";
import { formatMoney, formatRange, formatRate } from "@/lib/format";
import {
  AVAILABILITY,
  listedAgo,
  type PublicListing,
  type ShowcaseListing,
} from "@/lib/public-listings";

interface ListingDetailProps {
  listing: PublicListing;
  related: ShowcaseListing[];
}

const DETAILS = [
  { key: "category", label: "Category", icon: Sparkles },
  { key: "condition", label: "Condition", icon: BadgeCheck },
  { key: "cost", label: "Daily rate", icon: Wallet },
  { key: "value", label: "Replacement value", icon: ShieldCheck },
] as const;

export function ListingDetail({ listing, related }: ListingDetailProps) {
  const availability = AVAILABILITY[listing.availability];
  const categoryHref = `/?category=${listing.category}#shelf`;

  const values: Record<(typeof DETAILS)[number]["key"], string> = {
    category: CATEGORY_LABELS[listing.category],
    condition: CONDITION_LABELS[listing.condition],
    cost: formatRate(listing.dailyRateCents),
    value: listing.valueCents > 0 ? formatMoney(listing.valueCents) : "Not set",
  };

  return (
    <>
      <div className={CONTAINER}>
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-1.5 pt-6 text-[12px]"
        >
          <Link href="/" className="text-ink-muted transition-colors hover:text-navy">
            Home
          </Link>
          <Icon icon={ChevronRight} size={12} className="text-ink-muted/50" />
          <Link href="/#shelf" className="text-ink-muted transition-colors hover:text-navy">
            Browse
          </Link>
          <Icon icon={ChevronRight} size={12} className="text-ink-muted/50" />
          <Link href={categoryHref} className="text-ink-muted transition-colors hover:text-navy">
            {CATEGORY_LABELS[listing.category]}
          </Link>
          <Icon icon={ChevronRight} size={12} className="text-ink-muted/50" />
          <span className="max-w-[220px] truncate font-medium text-navy" aria-current="page">
            {listing.name}
          </span>
        </nav>

        <header className="mt-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">
              <span>{CATEGORY_LABELS[listing.category]}</span>
              <span aria-hidden="true" className="text-ink-muted/40">
                ·
              </span>
              <span className="normal-case tracking-normal">{listedAgo(listing.createdAt)}</span>
            </p>
            <h1 className="font-display mt-2.5 max-w-3xl text-[clamp(2.35rem,5vw,4rem)] leading-[0.98] text-balance text-navy">
              {listing.name}
            </h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-ink-muted">
              <span className="inline-flex items-center gap-1.5 font-medium text-navy">
                <span aria-hidden="true" className={`size-1.5 rounded-full ${availability.dot}`} />
                {availability.label}
              </span>
              <span aria-hidden="true" className="text-ink-muted/40">
                ·
              </span>
              <span>{CONDITION_LABELS[listing.condition]} condition</span>
              <span aria-hidden="true" className="text-ink-muted/40">
                ·
              </span>
              <span className="font-semibold text-navy">{formatRate(listing.dailyRateCents)}</span>
              <span aria-hidden="true" className="text-ink-muted/40">
                ·
              </span>
              <span className="inline-flex items-center gap-1">
                <Icon icon={MapPin} size={13} />
                Near you
              </span>
            </p>
          </div>

          <ListingActions id={listing._id} name={listing.name} />
        </header>

        <div className="mt-6">
          <ListingGallery images={listing.images} name={listing.name} category={listing.category} />
        </div>

        <div className="mt-11 grid gap-12 lg:grid-cols-[minmax(0,1fr)_382px] lg:gap-14">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-[22px] border border-rule/80 bg-white px-4 py-4 sm:px-5">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-full bg-mist text-brand">
                  <Icon icon={listing.ownerTrusted ? BadgeCheck : ShieldCheck} size={19} />
                </span>
                <div>
                  <p className="text-[14px] font-semibold text-navy">
                    {listing.ownerTrusted ? "Trusted lender" : "A neighbour on your shelf"}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-ink-muted">
                    {listing.ownerTrusted ? "A neighbour you can count on" : "A neighbour"}
                  </p>
                </div>
              </div>
              <span className="text-[11px] text-ink-muted">{listedAgo(listing.createdAt)}</span>
            </div>

            <section aria-labelledby="about-heading" className="mt-9">
              <h2
                id="about-heading"
                className="font-display text-[30px] leading-tight text-navy sm:text-[34px]"
              >
                About this listing
              </h2>
              <p className="mt-3 max-w-2xl text-[14.5px] leading-[1.8] whitespace-pre-line text-ink-muted">
                {listing.description}
              </p>
            </section>

            <section aria-labelledby="details-heading" className="mt-9">
              <h2
                id="details-heading"
                className="text-[10.5px] font-bold tracking-[0.16em] text-ink-muted uppercase"
              >
                The details
              </h2>
              <dl className="mt-3.5 grid grid-cols-2 gap-2.5">
                {DETAILS.map((detail) => (
                  <div
                    key={detail.key}
                    className="rounded-2xl border border-rule/80 bg-white px-4 py-3.5"
                  >
                    <dt className="flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
                      <Icon icon={detail.icon} size={13} className="text-brand" />
                      {detail.label}
                    </dt>
                    <dd className="mt-1 text-[14px] font-semibold text-navy">
                      {values[detail.key]}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 flex items-start gap-2 rounded-2xl bg-mist/45 px-4 py-3 text-[11.5px] leading-relaxed text-ink-muted">
                <Icon icon={ShieldCheck} size={14} className="mt-0.5 shrink-0 text-brand" />
                The replacement value is what a borrower agrees to reimburse if the item is lost or
                not returned.
              </p>
            </section>

            <section
              aria-labelledby="availability-heading"
              className="mt-9 rounded-[22px] border border-rule/80 bg-white p-5"
            >
              <h2
                id="availability-heading"
                className="text-[10.5px] font-bold tracking-[0.16em] text-ink-muted uppercase"
              >
                Availability
              </h2>
              <p className="mt-2 flex items-center gap-2 text-[14px] font-semibold text-navy">
                <span aria-hidden="true" className={`size-2 rounded-full ${availability.dot}`} />
                {listing.availability === "available"
                  ? "Available to book right now"
                  : listing.availability === "on_loan" && listing.busyUntil !== null
                    ? `Out until ${formatRange(listing.busyUntil, listing.busyUntil)}`
                    : "The owner has paused this listing"}
              </p>
              <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-ink-muted">
                {listing.availability === "available"
                  ? "Ask for the dates you need. The owner sees your request and approves or declines in the app."
                  : listing.availability === "on_loan"
                    ? "You can still request later dates — the owner will see the next free window."
                    : "Check back later, or browse another tool from the shelf."}
              </p>
            </section>

            <section aria-labelledby="borrowing-heading" className="mt-9">
              <h2
                id="borrowing-heading"
                className="font-display text-[26px] leading-tight text-navy"
              >
                How borrowing works
              </h2>
              <ol className="mt-4 space-y-3">
                {[
                  {
                    title: "Ask for dates",
                    body: "Choose a start and an end. The total is the owner’s daily rate times the days you book.",
                  },
                  {
                    title: "The owner answers",
                    body: "You both get an email the moment the request is approved or declined.",
                  },
                  {
                    title: "Pick up, return, done",
                    body: "A reminder arrives before it's due. Then the tool goes back on the shelf.",
                  },
                ].map((step, index) => (
                  <li key={step.title} className="flex gap-3.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-mist text-[11px] font-bold text-brand">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-[13.5px] font-semibold text-navy">{step.title}</p>
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-muted">
                        {step.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-5 flex items-start gap-2 rounded-2xl bg-mist/45 px-4 py-3 text-[11.5px] leading-relaxed text-ink-muted">
                <Icon icon={CalendarDays} size={14} className="mt-0.5 shrink-0 text-brand" />
                Your request shares only your name, the dates, the total and your note.
              </p>
            </section>
          </div>

          <div>
            <RequestCard listing={listing} />
          </div>
        </div>

        <div className="mt-12 flex items-center justify-between border-t border-rule/70 pt-6">
          <Link
            href="/#shelf"
            className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-navy transition-colors hover:text-brand"
          >
            <Icon icon={ArrowLeft} size={14} />
            Back to the shelf
          </Link>
          <span className="text-[11px] text-ink-muted">Neighbour-to-neighbour lending</span>
        </div>
      </div>

      <MobileRequestBar listing={listing} />

      {related.length > 0 && (
        <section aria-labelledby="related-heading" className={CONTAINER}>
          <Reveal>
            <div className="mt-16 border-t border-rule/70 pt-10">
              <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[10.5px] font-bold tracking-[0.16em] text-brand uppercase">
                    Keep looking
                  </p>
                  <h2
                    id="related-heading"
                    className="font-display mt-2 text-[30px] leading-tight text-navy"
                  >
                    {related.every((item) => item.category === listing.category)
                      ? `More in ${CATEGORY_LABELS[listing.category]}`
                      : "More to borrow nearby"}
                  </h2>
                </div>
                <Link
                  href="/#shelf"
                  className="hidden text-[12px] font-semibold text-ink-muted underline decoration-rule underline-offset-4 transition-colors hover:text-navy sm:inline"
                >
                  Browse all
                </Link>
              </div>
              <ul className="grid gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((item) => (
                  <li key={item._id}>
                    <ListingCard listing={item} />
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </section>
      )}
    </>
  );
}
