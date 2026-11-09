"use client";

import type { FunctionReturnType } from "convex/server";
import {
  AlarmClock,
  ArrowRight,
  BadgeCheck,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Inbox,
  PackageCheck,
  Search,
  Shield,
  ShieldCheck,
  Undo2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Category, LoanPhase, LoanStatus } from "@/convex/lib/constants";
import { AutomationActivity } from "@/components/automation-activity";
import { ListingImage } from "@/components/listing/listing-image";
import { RequestStatusBadge } from "@/components/request-status";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button, ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, formatRange, formatRate, timeAgo } from "@/lib/format";

export type RequestMode = "mine" | "incoming";
export type RequestAction = "approve" | "decline" | "cancel" | "return";

export interface RequestView {
  _id: Id<"loanRequests">;
  toolId: string;
  toolName: string;
  toolCategory: Category;
  counterpartName: string;
  counterpartTrusted: boolean;
  startDate: number;
  endDate: number;
  dayCount: number;
  dailyRateCents: number;
  valueCents: number;
  totalCents: number;
  status: LoanStatus;
  phase: LoanPhase;
  note: string | null;
  createdAt: number;
  /** Created-at or the latest decision/return; both inboxes sort on it. */
  updatedAt: number;
  decidedAt: number | null;
  returnedAt: number | null;
  images: { imageCount: number; cover: { url: string; width: number; height: number } | null };
}

export function mineToView(
  row: FunctionReturnType<typeof api.requests.listMine>[number],
): RequestView {
  return {
    _id: row._id,
    toolId: row.toolId,
    toolName: row.toolName,
    toolCategory: row.toolCategory,
    counterpartName: row.ownerName,
    counterpartTrusted: row.ownerTrusted,
    startDate: row.startDate,
    endDate: row.endDate,
    dayCount: row.dayCount,
    dailyRateCents: row.dailyRateCents,
    valueCents: row.valueCents,
    totalCents: row.totalCents,
    status: row.status,
    phase: row.phase,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    decidedAt: row.decidedAt,
    returnedAt: row.returnedAt,
    images: row.images,
  };
}

export function incomingToView(
  row: FunctionReturnType<typeof api.requests.listIncoming>[number],
): RequestView {
  return {
    _id: row._id,
    toolId: row.toolId,
    toolName: row.toolName,
    toolCategory: row.toolCategory,
    counterpartName: row.borrowerName,
    counterpartTrusted: row.borrowerTrusted,
    startDate: row.startDate,
    endDate: row.endDate,
    dayCount: row.dayCount,
    dailyRateCents: row.dailyRateCents,
    valueCents: row.valueCents,
    totalCents: row.totalCents,
    status: row.status,
    phase: row.phase,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    decidedAt: row.decidedAt,
    returnedAt: row.returnedAt,
    images: row.images,
  };
}

type Filter = "all" | "action" | "active" | "history";

const COPY = {
  mine: {
    eyebrow: "Borrowing",
    title: "My requests",
    subtitle: "Everything you’ve asked to borrow, the total for each booking, and where it stands.",
    actionLabel: "Awaiting reply",
    emptyTitle: "No requests yet",
    emptyBody: "Browse the shelf and ask a neighbour for the dates you need.",
    emptyAction: { href: "/#shelf", label: "Browse the shelf" },
    counterpartLabel: "Lent by",
  },
  incoming: {
    eyebrow: "Lending",
    title: "Incoming requests",
    subtitle:
      "Neighbours asking for your tools. Approve or decline — the dates stay yours to decide.",
    actionLabel: "Needs your answer",
    emptyTitle: "You’re all caught up",
    emptyBody: "When a neighbour asks for one of your tools, it lands here.",
    emptyAction: { href: "/my-listings", label: "Manage my listings" },
    counterpartLabel: "Requested by",
  },
} as const;

interface RequestBoardProps {
  mode: RequestMode;
  requests: RequestView[];
  onAction: (id: Id<"loanRequests">, action: RequestAction) => Promise<void>;
  busyId: string | null;
  error: string | null;
  isAdmin?: boolean;
  /** The preview harness turns this off outside a Convex provider. */
  showActivity?: boolean;
}

/**
 * Every action on this board is a decision the other person sees, so each one
 * asks first. The copy names the tool and the dates, not just "this request".
 */
function confirmationFor(request: RequestView, action: RequestAction) {
  const range = formatRange(request.startDate, request.endDate);
  switch (action) {
    case "approve":
      return {
        title: "Approve this request?",
        description: `This books ${request.toolName} for ${range} and tells ${request.counterpartName} you said yes.`,
        detail: `${request.counterpartName} · ${request.dayCount} ${
          request.dayCount === 1 ? "day" : "days"
        }`,
        confirmLabel: "Approve request",
        cancelLabel: "Keep it waiting",
        tone: "default" as const,
        icon: CheckCircle2,
      };
    case "decline":
      return {
        title: "Decline this request?",
        description: `${request.counterpartName} will be told ${request.toolName} isn’t available for ${range}. Declining can’t be undone.`,
        detail: `${request.counterpartName} · ${request.dayCount} ${
          request.dayCount === 1 ? "day" : "days"
        }`,
        confirmLabel: "Decline request",
        cancelLabel: "Keep it waiting",
        tone: "danger" as const,
        icon: XCircle,
      };
    case "cancel":
      return {
        title: "Withdraw this request?",
        description: `Your request for ${request.toolName} (${range}) will be withdrawn, and ${request.counterpartName} will no longer see it waiting.`,
        detail: `${request.counterpartName} · ${request.dayCount} ${
          request.dayCount === 1 ? "day" : "days"
        }`,
        confirmLabel: "Withdraw request",
        cancelLabel: "Keep request",
        tone: "danger" as const,
        icon: Undo2,
      };
    case "return":
      return {
        title: "Mark this loan returned?",
        description: `This closes the loan for ${request.toolName}. Only confirm once the item is back in your hands.`,
        detail: request.counterpartName,
        confirmLabel: "Mark returned",
        cancelLabel: "Not yet",
        tone: "default" as const,
        icon: PackageCheck,
      };
  }
}

/**
 * The shared request inbox.
 *
 * Both sides of a loan need the same things: a face for the tool, the dates and
 * what they cost, who is on the other end, and one obvious next action. Sharing
 * the board keeps "my requests" and "incoming" behaviourally identical, so an
 * approval can never look different from a withdrawal.
 */
export function RequestBoard({
  mode,
  requests,
  onAction,
  busyId,
  error,
  isAdmin = false,
  showActivity = true,
}: RequestBoardProps) {
  const copy = COPY[mode];
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [confirmation, setConfirmation] = useState<{
    request: RequestView;
    action: RequestAction;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const counts = useMemo(() => {
    let pending = 0;
    let active = 0;
    let overdue = 0;
    let returned = 0;
    for (const request of requests) {
      if (request.status === "pending") pending += 1;
      if (request.phase === "active") active += 1;
      if (request.phase === "overdue") overdue += 1;
      if (request.status === "returned") returned += 1;
    }
    return { pending, active, overdue, returned, total: requests.length };
  }, [requests]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return requests.filter((request) => {
      const inFilter =
        filter === "all"
          ? true
          : filter === "action"
            ? request.status === "pending"
            : filter === "active"
              ? ["upcoming", "active", "overdue"].includes(request.phase)
              : ["returned", "declined", "cancelled"].includes(request.phase);

      if (!inFilter) return false;
      if (needle === "") return true;
      return [request.toolName, request.counterpartName, request.note ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [requests, filter, query]);

  const tabs: Array<{ key: Filter; label: string; count: number }> = [
    { key: "all", label: "All", count: counts.total },
    { key: "action", label: copy.actionLabel, count: counts.pending },
    {
      key: "active",
      label: "On loan",
      count: requests.filter((r) => ["upcoming", "active", "overdue"].includes(r.phase)).length,
    },
    {
      key: "history",
      label: "History",
      count: requests.filter((r) => ["returned", "declined", "cancelled"].includes(r.phase)).length,
    },
  ];

  function askToConfirm(request: RequestView, action: RequestAction) {
    setConfirmation({ request, action });
  }

  async function runConfirmedAction() {
    if (confirmation === null) return;
    setConfirming(true);
    try {
      await onAction(confirmation.request._id, confirmation.action);
    } finally {
      setConfirming(false);
      setConfirmation(null);
    }
  }

  const confirmCopy =
    confirmation === null ? null : confirmationFor(confirmation.request, confirmation.action);

  return (
    <div className="py-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 text-[10.5px] font-bold tracking-[0.18em] text-brand uppercase">
            <span className="h-px w-6 bg-orange" aria-hidden="true" />
            {copy.eyebrow}
          </p>
          <h1 className="font-display mt-3 text-[clamp(2rem,4.5vw,3rem)] leading-[1.02] text-balance text-navy">
            {copy.title}
          </h1>
          <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-muted">{copy.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <ButtonLink
              href="/admin"
              variant="outline"
              size="sm"
              iconLeft={<Icon icon={Shield} size={14} />}
            >
              Admin tools
            </ButtonLink>
          )}
          <ButtonLink
            href={copy.emptyAction.href}
            variant="outline"
            size="sm"
            iconRight={<Icon icon={ArrowRight} size={14} />}
          >
            {copy.emptyAction.label}
          </ButtonLink>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat
          tone={counts.pending > 0 ? "accent" : "quiet"}
          label={copy.actionLabel}
          value={counts.pending}
          icon={Inbox}
        />
        <Stat label="Out now" value={counts.active} icon={PackageCheck} />
        <Stat
          tone={counts.overdue > 0 ? "danger" : "quiet"}
          label="Overdue"
          value={counts.overdue}
          icon={AlarmClock}
        />
        <Stat label="Returned" value={counts.returned} icon={CheckCircle2} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rule/70 bg-white/75 p-2 shadow-soft">
        <div
          role="group"
          aria-label="Filter requests"
          className="flex flex-wrap items-center gap-1"
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              aria-pressed={filter === tab.key}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                filter === tab.key
                  ? "bg-navy text-white"
                  : "text-ink-muted hover:bg-page hover:text-navy"
              }`}
            >
              {tab.label}
              <span
                className={`text-[10.5px] tabular-nums ${
                  filter === tab.key ? "text-white/70" : "text-ink-muted/70"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <label className="relative flex min-w-[180px] flex-1 items-center sm:max-w-[260px]">
          <span className="sr-only">Search requests</span>
          <Icon
            icon={Search}
            size={14}
            className="pointer-events-none absolute left-3 text-ink-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tool or neighbour"
            className="h-9 w-full rounded-full border border-rule bg-page/70 pr-3 pl-8 text-[12px] font-medium text-navy outline-none transition-[border-color,box-shadow] placeholder:font-normal placeholder:text-ink-muted/70 focus:border-brand/40 focus:ring-4 focus:ring-brand/10"
          />
        </label>
      </div>

      {error !== null && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-[#f3c6bf] bg-[#fff4f2] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[#a12c1c]"
        >
          {error}
        </p>
      )}

      {filtered.length === 0 ? (
        <EmptyBoard
          mode={mode}
          filter={filter}
          query={query}
          onClear={() => {
            setFilter("all");
            setQuery("");
          }}
        />
      ) : (
        <ul className="mt-4 grid gap-3">
          {filtered.map((request) => (
            <RequestCard
              key={request._id}
              request={request}
              mode={mode}
              busy={busyId === request._id}
              onAction={askToConfirm}
              showActivity={showActivity}
            />
          ))}
        </ul>
      )}

      {confirmation !== null && confirmCopy !== null && (
        <AlertDialog
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen && !confirming) setConfirmation(null);
          }}
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmLabel={confirmCopy.confirmLabel}
          cancelLabel={confirmCopy.cancelLabel}
          tone={confirmCopy.tone}
          icon={confirmCopy.icon}
          loading={confirming}
          onConfirm={() => void runConfirmedAction()}
        >
          <div className="rounded-2xl border border-rule/70 bg-page/60 px-3.5 py-3">
            <p className="truncate text-[12.5px] font-semibold text-navy">
              {confirmation.request.toolName}
            </p>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">
              {formatRange(confirmation.request.startDate, confirmation.request.endDate)} ·{" "}
              {confirmCopy.detail}
            </p>
          </div>
        </AlertDialog>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  tone = "quiet",
}: {
  label: string;
  value: number;
  icon: typeof Inbox;
  tone?: "quiet" | "accent" | "danger";
}) {
  const styles =
    tone === "accent"
      ? "border-orange/25 bg-[linear-gradient(135deg,#fff6f1_0%,#ffffff_70%)]"
      : tone === "danger"
        ? "border-red-200 bg-red-50/70"
        : "border-rule/80 bg-white";
  const iconStyles =
    tone === "accent"
      ? "bg-orange/10 text-orange-strong"
      : tone === "danger"
        ? "bg-red-100 text-red-600"
        : "bg-mist/60 text-brand";

  return (
    <div className={`rounded-2xl border px-3.5 py-3 shadow-soft ${styles}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10.5px] font-bold tracking-[0.1em] text-ink-muted uppercase">{label}</p>
        <span className={`flex size-7 items-center justify-center rounded-full ${iconStyles}`}>
          <Icon icon={icon} size={13} />
        </span>
      </div>
      <p className="mt-1.5 font-display text-[28px] leading-none text-navy tabular-nums">{value}</p>
    </div>
  );
}

function RequestCard({
  request,
  mode,
  busy,
  onAction,
  showActivity,
}: {
  request: RequestView;
  mode: RequestMode;
  busy: boolean;
  onAction: (request: RequestView, action: RequestAction) => void;
  showActivity: boolean;
}) {
  const copy = COPY[mode];
  const pending = request.status === "pending";
  const approved = request.status === "approved";
  const priceLabel =
    request.phase === "declined" || request.phase === "cancelled"
      ? "Booking value"
      : pending
        ? "If approved"
        : "Total";

  return (
    <li>
      <article className="group overflow-hidden rounded-[26px] border border-rule/80 bg-white shadow-soft transition-shadow duration-300 hover:shadow-float">
        <div className="grid sm:grid-cols-[176px_minmax(0,1fr)]">
          <Link
            href={`/listings/${request.toolId}`}
            aria-label={`Open ${request.toolName}`}
            className="relative block h-36 overflow-hidden bg-mist/40 sm:h-full sm:min-h-[184px]"
          >
            <ListingImage
              src={request.images.cover?.url ?? null}
              alt={request.toolName}
              category={request.toolCategory}
              width={request.images.cover?.width}
              height={request.images.cover?.height}
              sizes="(max-width: 640px) 100vw, 176px"
              showArtLabel={false}
              className="absolute inset-0 h-full w-full"
            />
            <span className="absolute top-2.5 left-2.5 rounded-full bg-white/92 px-2 py-0.5 text-[9.5px] font-bold tracking-[0.08em] text-navy uppercase shadow-sm backdrop-blur-sm">
              {request.dayCount} {request.dayCount === 1 ? "day" : "days"}
            </span>
          </Link>

          <div className="min-w-0 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2.5">
              <div className="min-w-0">
                <p className="text-[10px] font-bold tracking-[0.14em] text-ink-muted uppercase">
                  {copy.counterpartLabel}
                </p>
                <Link
                  href={`/listings/${request.toolId}`}
                  className="group/title mt-1 inline-flex max-w-full items-center gap-1.5"
                >
                  <h2 className="truncate text-[16px] leading-tight font-semibold tracking-[-0.015em] text-navy group-hover/title:text-brand">
                    {request.toolName}
                  </h2>
                  <Icon
                    icon={ChevronRight}
                    size={14}
                    className="shrink-0 text-ink-muted transition-transform group-hover/title:translate-x-0.5"
                  />
                </Link>
                <p className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-muted">
                  <span className="flex size-5 items-center justify-center rounded-full bg-mist text-[9px] font-bold text-brand">
                    {request.counterpartName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="font-medium text-navy">{request.counterpartName}</span>
                  {request.counterpartTrusted && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-[#eaf3ff] px-1.5 py-0.5 text-[9.5px] font-semibold text-[#0b5fd9]">
                      <Icon icon={BadgeCheck} size={9} />
                      Trusted
                    </span>
                  )}
                </p>
              </div>
              <RequestStatusBadge phase={request.phase} />
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="flex items-center gap-2 rounded-xl bg-page/70 px-3 py-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-brand shadow-sm">
                  <Icon icon={CalendarDays} size={13} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-navy tabular-nums">
                    {formatRange(request.startDate, request.endDate)}
                  </p>
                  <p className="text-[10.5px] text-ink-muted">
                    {request.dayCount} {request.dayCount === 1 ? "day" : "days"} ·{" "}
                    {formatRate(request.dailyRateCents)}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-brand/10 bg-[#f7f8ff] px-3 py-2 sm:min-w-[132px] sm:flex-col sm:items-end sm:justify-center sm:gap-0">
                <p className="text-[9.5px] font-bold tracking-[0.12em] text-ink-muted uppercase">
                  {priceLabel}
                </p>
                <p className="font-display text-[20px] leading-none text-navy tabular-nums">
                  {request.totalCents === 0 ? "Free" : formatMoney(request.totalCents)}
                </p>
              </div>
            </div>

            {request.note !== null && (
              <p className="mt-2.5 rounded-xl border-l-2 border-lilac bg-page/60 px-3 py-2 text-[11.5px] leading-relaxed text-ink-muted">
                “{request.note}”
              </p>
            )}

            <p className="mt-2.5 text-[10.5px] text-ink-muted/85">
              Requested {timeAgo(request.createdAt)}
              {request.decidedAt !== null && <> · decided {timeAgo(request.decidedAt)}</>}
              {request.returnedAt !== null && <> · returned {timeAgo(request.returnedAt)}</>}
            </p>

            {request.valueCents > 0 && (
              <p className="mt-1.5 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-ink-muted">
                <Icon icon={ShieldCheck} size={12} className="mt-0.5 shrink-0 text-brand" />
                <span>
                  Replacement value{" "}
                  <span className="font-semibold text-navy">{formatMoney(request.valueCents)}</span>{" "}
                  — reimbursed if it’s lost or not returned.
                </span>
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-rule/70 pt-3">
              {mode === "incoming" && pending && (
                <>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => onAction(request, "approve")}
                    iconLeft={<Icon icon={CheckCircle2} size={14} />}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onAction(request, "decline")}
                  >
                    Decline
                  </Button>
                </>
              )}
              {mode === "mine" && pending && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAction(request, "cancel")}
                  className="rounded-full border border-rule px-3 py-1.5 text-[11.5px] font-medium text-ink-muted transition-colors hover:border-red-200 hover:text-red-600 disabled:opacity-60"
                >
                  Withdraw request
                </button>
              )}
              {approved && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onAction(request, "return")}
                  iconLeft={<Icon icon={PackageCheck} size={14} />}
                >
                  Mark returned
                </Button>
              )}
              <Link
                href={`/listings/${request.toolId}`}
                className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted transition-colors hover:text-navy"
              >
                View listing
                <Icon icon={ArrowRight} size={12} />
              </Link>
            </div>

            {showActivity && <RequestActivity requestId={request._id} />}
          </div>
        </div>
      </article>
    </li>
  );
}

/**
 * The notification trail is lazy: opening it is the only thing that subscribes
 * to `automation.listForLoan`. A page of 100 cards otherwise opens 100 queries
 * for a disclosure most people never touch.
 */
function RequestActivity({ requestId }: { requestId: Id<"loanRequests"> }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[10.5px] font-medium text-ink-muted transition-colors hover:text-navy"
      >
        <Icon icon={Bell} size={12} className="text-brand" />
        Notifications
        <span
          aria-hidden="true"
          className={`text-ink-muted/60 transition-transform ${open ? "rotate-90" : ""}`}
        >
          ›
        </span>
      </button>
      {open && <AutomationActivity loanRequestId={requestId} />}
    </div>
  );
}

function EmptyBoard({
  mode,
  filter,
  query,
  onClear,
}: {
  mode: RequestMode;
  filter: Filter;
  query: string;
  onClear: () => void;
}) {
  const copy = COPY[mode];
  const searching = query.trim() !== "";
  const filtered = filter !== "all" || searching;

  return (
    <div className="mt-4 rounded-[26px] border border-dashed border-rule bg-white/65 px-6 py-12 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-mist text-brand">
        <Icon icon={Inbox} size={22} />
      </span>
      <p className="font-display mt-4 text-[24px] leading-tight text-navy">
        {searching
          ? "No matches for that search"
          : filter === "action"
            ? "Nothing waiting on you"
            : filter === "active"
              ? "No tools out right now"
              : filter === "history"
                ? "Nothing in the history yet"
                : copy.emptyTitle}
      </p>
      <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-ink-muted">
        {searching
          ? "Try the tool name or the neighbour’s name."
          : filter === "action"
            ? "You’re all caught up. New requests will show here the moment they arrive."
            : copy.emptyBody}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {filtered && (
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        )}
        <ButtonLink
          href={copy.emptyAction.href}
          size="sm"
          iconRight={<Icon icon={ArrowRight} size={14} />}
        >
          {copy.emptyAction.label}
        </ButtonLink>
      </div>
    </div>
  );
}

export function RequestBoardSkeleton() {
  return (
    <div className="py-8" aria-hidden="true">
      <Skeleton className="h-4 w-28 rounded-full" />
      <Skeleton className="mt-4 h-10 w-64 rounded-2xl" />
      <Skeleton className="mt-3 h-4 w-full max-w-md rounded-full" />
      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[86px] rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-6 h-12 w-full rounded-2xl" />
      <div className="mt-4 grid gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="grid gap-0 overflow-hidden rounded-[26px] border border-rule/70 bg-white sm:grid-cols-[176px_minmax(0,1fr)]"
          >
            <Skeleton className="h-36 rounded-none sm:h-full" />
            <div className="space-y-3 p-4 sm:p-5">
              <Skeleton className="h-4 w-1/3 rounded-full" />
              <Skeleton className="h-6 w-2/3 rounded-full" />
              <div className="flex gap-2">
                <Skeleton className="h-10 flex-1 rounded-xl" />
                <Skeleton className="h-10 w-28 rounded-xl" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
