"use client";

import { Show, SignInButton, useAuth } from "@clerk/nextjs";
import { ArrowRight, Bell, CalendarCheck2, Inbox, ShieldCheck, Wallet } from "lucide-react";
import { useQuery } from "convex/react";
import { useState } from "react";

import { api } from "@/convex/_generated/api";

import { RequestForm } from "@/components/request-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { SuccessBurst } from "@/components/ui/success-burst";
import { formatMoney, formatRange } from "@/lib/format";
import { AVAILABILITY, type PublicListing } from "@/lib/public-listings";

export function RequestCard({ listing }: { listing: PublicListing }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [sent, setSent] = useState(false);
  // Keep the calendar's busy ranges fresh: a booking made in another tab or by
  // another neighbour should remove those days without a page refresh.
  const live = useQuery(api.tools.getPublicListing, { toolId: listing._id });
  const busyRanges = live?.busyRanges ?? listing.busyRanges;
  const isOwner = live?.isOwner ?? listing.isOwner;
  const availability = AVAILABILITY[listing.availability];
  const paused = listing.availability === "paused";
  const dailyRateCents = live?.dailyRateCents ?? listing.dailyRateCents;
  const replacementValueCents = live?.valueCents ?? listing.valueCents;
  const free = dailyRateCents === 0;

  return (
    <aside
      id="request"
      aria-label={isOwner ? "Your listing" : "Request this tool"}
      className="rounded-[28px] border border-rule/80 bg-white p-5 shadow-float sm:p-6 lg:sticky lg:top-24"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">
            {free ? "Free to borrow" : "Daily rate"}
          </p>
          <p className="font-display mt-1 flex items-baseline gap-1 text-[34px] leading-none text-navy">
            {free ? "Free" : formatMoney(dailyRateCents)}
            {!free && (
              <span className="text-[15px] font-sans font-medium text-ink-muted">/ day</span>
            )}
          </p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-muted">
            {free
              ? "No charge — just bring it back on time."
              : isOwner
                ? "What a borrower pays for each day they keep it."
                : "The total is the daily rate times the days you book."}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${availability.pill}`}
        >
          <span aria-hidden="true" className={`size-1.5 rounded-full ${availability.dot}`} />
          {availability.label}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2.5 rounded-2xl bg-page/80 px-3 py-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-white">
          <Icon icon={isOwner ? Inbox : ShieldCheck} size={14} />
        </span>
        <p className="min-w-0 text-[12px] text-ink-muted">
          <span className="font-semibold text-navy">
            {isOwner
              ? "This is your listing"
              : listing.ownerTrusted
                ? "Trusted lender"
                : "Your neighbour"}
          </span>
          <span className="block text-[11px]">
            {listing.availability === "on_loan" && listing.busyUntil !== null
              ? `Back ${formatRange(listing.busyUntil, listing.busyUntil)}`
              : listing.availability === "paused"
                ? "Not lending right now"
                : "Ready when you are"}
          </span>
        </p>
      </div>

      <div className="my-4 h-px bg-rule/80" />

      {isOwner ? (
        <div className="rounded-2xl bg-page p-4">
          <p className="text-[13px] font-semibold text-navy">This one is yours</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
            You can’t request your own tool. When a neighbour asks to borrow it, the request lands
            in your inbox — approve or decline it there.
          </p>
          <ButtonLink
            href="/incoming-requests"
            size="md"
            className="mt-3 w-full"
            iconRight={<Icon icon={ArrowRight} size={14} />}
          >
            View incoming requests
          </ButtonLink>
          <ButtonLink href="/my-listings" variant="outline" size="sm" className="mt-2 w-full">
            Manage my listings
          </ButtonLink>
        </div>
      ) : sent ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-[#cfe3ff] bg-[linear-gradient(160deg,#eef6ff_0%,#ffffff_78%)] p-4 text-center"
        >
          <SuccessBurst className="mx-auto" />
          <p className="mt-2.5 text-[13px] font-semibold text-[#0b5fd9]">Request sent</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
            The owner will approve or decline in the app. You&apos;ll get an email either way.
          </p>
          <ButtonLink
            href="/my-requests"
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            iconRight={<Icon icon={ArrowRight} size={14} />}
          >
            Track my request
          </ButtonLink>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="mt-2 w-full text-[11.5px] font-medium text-ink-muted underline decoration-transparent underline-offset-4 hover:text-navy hover:decoration-rule"
          >
            Ask for different dates
          </button>
        </div>
      ) : paused ? (
        <div className="rounded-2xl bg-page p-4">
          <p className="text-[13px] font-semibold text-navy">This shelf is paused</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
            The owner isn&apos;t lending this tool at the moment. Have a look at the rest of the
            shelf instead.
          </p>
          <ButtonLink href="/#shelf" variant="outline" size="sm" className="mt-3 w-full">
            Browse other tools
          </ButtonLink>
        </div>
      ) : !isLoaded || (isSignedIn === true && live === undefined) ? (
        <div aria-hidden="true" className="space-y-2.5">
          <div className="skeleton h-10 rounded-xl" />
          <div className="skeleton h-10 rounded-xl" />
          <div className="skeleton h-12 rounded-full" />
        </div>
      ) : (
        <>
          <div className="mb-3.5 flex items-center justify-between gap-2">
            <p className="text-[12.5px] font-semibold text-navy">Ask for these dates</p>
            <span className="text-[11px] text-ink-muted">Up to 30 days</span>
          </div>

          <Show when="signed-in">
            <RequestForm
              toolId={listing._id}
              busyRanges={busyRanges}
              dailyRateCents={dailyRateCents}
              valueCents={replacementValueCents}
              onDone={() => setSent(true)}
            />
          </Show>

          <Show when="signed-out">
            <p className="text-[12.5px] leading-relaxed text-ink-muted">
              Sign in to ask for these dates. It takes a moment, and the owner only sees your name,
              the dates and your note.
            </p>
            <SignInButton mode="modal">
              <Button
                size="lg"
                className="mt-4 w-full"
                iconRight={<Icon icon={ArrowRight} size={16} />}
              >
                Sign in to request
              </Button>
            </SignInButton>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-ink-muted">
              <Icon icon={CalendarCheck2} size={12} />
              {free ? "Free" : `${formatMoney(dailyRateCents)}/day`} · No deposit · Owner approves
            </p>
          </Show>
        </>
      )}

      <ul hidden={isOwner} className="mt-5 space-y-2 border-t border-rule/70 pt-4">
        <li className="flex items-center gap-2 text-[11.5px] text-ink-muted">
          <Icon icon={Wallet} size={13} className="text-brand" />
          {free
            ? "No fee and no deposit — it’s a favour between neighbours."
            : "No deposit. Settle the total with the owner when you collect."}
        </li>
        <li className="flex items-center gap-2 text-[11.5px] text-ink-muted">
          <Icon icon={Bell} size={13} className="text-brand" />A reminder before it&apos;s due, so
          nothing slips.
        </li>
        {replacementValueCents > 0 && (
          <li className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-muted">
            <Icon icon={ShieldCheck} size={13} className="mt-0.5 shrink-0 text-brand" />
            <span>
              Replacement value {formatMoney(replacementValueCents)} — reimbursed if it’s lost or
              not returned.
            </span>
          </li>
        )}
      </ul>

      {listing.availability === "on_loan" && listing.busyUntil !== null && (
        <p className="mt-3 rounded-xl bg-[#fff4ef] px-3 py-2 text-[11px] leading-relaxed text-[#a13d1f]">
          It&apos;s out until {formatRange(listing.busyUntil, listing.busyUntil)}. You can still ask
          for later dates.
        </p>
      )}
    </aside>
  );
}
