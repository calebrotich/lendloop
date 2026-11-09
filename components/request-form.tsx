"use client";

import { useMutation } from "convex/react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  DateRangePicker,
  type BusyRange,
  type DateRangeValue,
} from "@/components/listing/date-range-picker";
import { bookingTotalCents } from "@/convex/lib/pricing";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { appErrorMessage } from "@/lib/convex-error";
import { formatMoney } from "@/lib/format";

const MAX_NOTE = 300;
const MAX_DAYS = 30;
const DAY_MS = 86_400_000;

function toUtcDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function overlapsBusy(from: Date, to: Date, busyRanges: BusyRange[]): boolean {
  const start = toUtcDay(from);
  const end = toUtcDay(to);
  return busyRanges.some((range) => start <= range.endDate && range.startDate <= end);
}

export function RequestForm({
  toolId,
  busyRanges = [],
  dailyRateCents = 0,
  valueCents = 0,
  onDone,
  onCancel,
}: {
  toolId: Id<"tools">;
  busyRanges?: BusyRange[];
  dailyRateCents?: number;
  /** Replacement value; shown as the reimbursement commitment. */
  valueCents?: number;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const create = useMutation(api.requests.create);
  const [range, setRange] = useState<DateRangeValue>({ from: null, to: null });
  const [note, setNote] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);
  const [rootError, setRootError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateRange(next: DateRangeValue) {
    setRange(next);
    setDateError(null);
    setRootError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRootError(null);
    setDateError(null);

    if (range.from === null || range.to === null) {
      setDateError("Pick both a pick-up day and a return day.");
      return;
    }
    if (toUtcDay(range.from) < toUtcDay(new Date())) {
      setDateError("The pick-up day can’t be in the past.");
      return;
    }
    if (toUtcDay(range.to) < toUtcDay(range.from)) {
      setDateError("The return day must be on or after the pick-up day.");
      return;
    }
    const days = Math.round((toUtcDay(range.to) - toUtcDay(range.from)) / DAY_MS) + 1;
    if (days > MAX_DAYS) {
      setDateError(`Loans are capped at ${MAX_DAYS} days. Pick a shorter window.`);
      return;
    }
    if (overlapsBusy(range.from, range.to, busyRanges)) {
      setDateError("Those dates include a booked stretch. Pick the days around it.");
      return;
    }
    if (note.length > MAX_NOTE) {
      setRootError(`The note can be up to ${MAX_NOTE} characters.`);
      return;
    }

    setSubmitting(true);
    try {
      await create({
        toolId,
        startDate: toDateInput(range.from),
        endDate: toDateInput(range.to),
        note: note.trim() === "" ? undefined : note.trim(),
      });
      toast.success("Request sent", {
        description: "The owner will approve or decline it in the app.",
      });
      onDone();
    } catch (error) {
      const message = appErrorMessage(error);
      setRootError(message);
      toast.error("Couldn’t send that request", { description: message });
    } finally {
      setSubmitting(false);
    }
  }

  const estimateDays =
    range.from === null || range.to === null
      ? null
      : Math.round((toUtcDay(range.to) - toUtcDay(range.from)) / DAY_MS) + 1;
  const estimateTotalCents =
    estimateDays === null ? 0 : bookingTotalCents(dailyRateCents, estimateDays);

  return (
    <form noValidate onSubmit={submit} className="grid gap-3.5">
      {rootError !== null && (
        <p
          role="alert"
          className="rounded-xl border border-[#f3c6bf] bg-[#fff4f2] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[#a12c1c]"
        >
          {rootError}
        </p>
      )}

      <DateRangePicker
        value={range}
        onChange={updateRange}
        busyRanges={busyRanges}
        dailyRateCents={dailyRateCents}
        error={dateError}
      />

      <label className="grid gap-1.5">
        <span className="flex items-baseline justify-between gap-2 text-[11px] font-bold tracking-[0.12em] text-ink-muted uppercase">
          Note <span className="font-normal tracking-normal normal-case">(optional)</span>
          <span className="ml-auto text-[10px] font-normal tracking-normal text-ink-muted/70 tabular-nums">
            {note.length}/{MAX_NOTE}
          </span>
        </span>
        <textarea
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            setRootError(null);
          }}
          rows={3}
          maxLength={MAX_NOTE}
          placeholder="What you need it for, and when you can pick it up."
          className="w-full resize-none rounded-xl border border-rule bg-white px-3.5 py-2.5 text-[13.5px] font-medium text-navy outline-none transition-[border-color,box-shadow] placeholder:font-normal placeholder:text-ink-muted/70 focus:border-brand/50 focus:ring-4 focus:ring-brand/10"
        />
      </label>

      {estimateDays !== null && estimateDays > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand/10 bg-page/70 px-3.5 py-3">
          <div>
            <p className="text-[12px] font-semibold text-navy">
              {dailyRateCents === 0
                ? "Free to borrow"
                : `${formatMoney(dailyRateCents)} × ${estimateDays} ${
                    estimateDays === 1 ? "day" : "days"
                  }`}
            </p>
            <p className="mt-0.5 text-[10.5px] text-ink-muted">
              {dailyRateCents === 0
                ? "No charge for these dates."
                : "Pay the owner when you collect."}
            </p>
          </div>
          <p className="font-display text-[22px] leading-none text-navy tabular-nums">
            {estimateTotalCents === 0 ? "Free" : formatMoney(estimateTotalCents)}
          </p>
        </div>
      )}

      {valueCents > 0 && (
        <p className="flex items-start gap-1.5 rounded-xl border border-brand/10 bg-[#f7f8ff] px-3 py-2.5 text-[10.5px] leading-relaxed text-ink-muted">
          <Icon icon={ShieldCheck} size={13} className="mt-0.5 shrink-0 text-brand" />
          <span>
            You agree to return it by the end date, or reimburse the{" "}
            <span className="font-semibold text-navy">{formatMoney(valueCents)}</span> replacement
            value if it’s lost or not returned.
          </span>
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        loading={submitting}
        className="mt-0.5 w-full"
        iconRight={submitting ? undefined : <Icon icon={ArrowRight} size={16} />}
      >
        {submitting
          ? "Sending request"
          : estimateDays !== null && estimateDays > 0 && estimateTotalCents > 0
            ? `Send request · ${formatMoney(estimateTotalCents)}`
            : "Send request"}
      </Button>

      {onCancel !== undefined && (
        <button
          type="button"
          onClick={onCancel}
          className="text-[12px] font-medium text-ink-muted underline decoration-transparent underline-offset-4 transition-colors hover:text-navy hover:decoration-rule"
        >
          Not yet
        </button>
      )}

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-muted">
        <Icon icon={ShieldCheck} size={13} className="mt-0.5 shrink-0 text-brand" />
        The owner sees your name, the dates, the total and this note.
      </p>
    </form>
  );
}
