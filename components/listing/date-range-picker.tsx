"use client";

import { addDays, addMonths, startOfMonth } from "date-fns";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DayPicker, type DateRange, type DayButtonProps, type Matcher } from "react-day-picker";

import { bookingTotalCents } from "@/convex/lib/pricing";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { formatMoney } from "@/lib/format";

export interface DateRangeValue {
  from: Date | null;
  to: Date | null;
}

export interface BusyRange {
  startDate: number;
  endDate: number;
}

interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  busyRanges: BusyRange[];
  /** Adds the running booking total to the hint; zero reads as free. */
  dailyRateCents?: number;
  error?: string | null;
}

const DAY_MS = 86_400_000;
const MAX_LOAN_DAYS = 30;
const FULL_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const SHORT_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/** Backend days are UTC midnight; calendars work in local calendar days. */
function fromUtcDay(ms: number): Date {
  const date = new Date(ms);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function toUtcDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function todayLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function dayCount(from: Date, to: Date): number {
  return Math.round((toUtcDay(to) - toUtcDay(from)) / DAY_MS) + 1;
}

/**
 * RDP's default day button has no `type`, which would submit the request form
 * when a day is clicked. Keep its focus-follows-keyboard behaviour and make the
 * button explicit.
 */
function RangeDayButton({ day, modifiers, ...props }: DayButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <button
      ref={ref}
      {...props}
      type="button"
      title={
        modifiers.booked
          ? `${FULL_DATE.format(day.date)} — already booked or pending`
          : modifiers.beyondLimit
            ? `${FULL_DATE.format(day.date)} — beyond the 30-day loan window`
            : undefined
      }
    />
  );
}

function useWideCalendar(): boolean {
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 640px)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return wide;
}

/**
 * A range field pair that behaves like one control: click From or To, then
 * choose days in a calendar. The highlight slides between the two fields as
 * the selection advances, and busy days are visible and unselectable.
 */
export function DateRangePicker({
  value,
  onChange,
  busyRanges,
  dailyRateCents = 0,
  error,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<"start" | "end" | null>("start");
  const [month, setMonth] = useState<Date>(startOfMonth(value.from ?? todayLocal()));
  const [notice, setNotice] = useState<string | null>(null);
  const [side, setSide] = useState<"up" | "down">("down");
  const [hovered, setHovered] = useState<Date | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const wide = useWideCalendar();
  const reduce = useReducedMotion();

  const today = todayLocal();

  const busyMatchers = useMemo(
    () =>
      busyRanges.map((range) => ({
        from: fromUtcDay(range.startDate),
        to: fromUtcDay(range.endDate),
      })),
    [busyRanges],
  );

  const maxEnd = value.from === null ? null : addDays(value.from, MAX_LOAN_DAYS - 1);
  const beyondLimit = maxEnd === null ? undefined : { after: maxEnd };

  const disabled = useMemo(
    () =>
      [
        { before: today },
        ...busyMatchers,
        ...(beyondLimit === undefined ? [] : [beyondLimit]),
      ] as Matcher[],
    // today is recreated per render but is the same calendar day; the ranges are
    // the only thing that changes while the calendar is open.
    [busyMatchers, beyondLimit], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const selected: DateRange | undefined = value.from
    ? { from: value.from, to: value.to ?? undefined }
    : undefined;

  const days = value.from !== null && value.to !== null ? dayCount(value.from, value.to) : 0;

  const previewMatcher =
    value.from !== null && value.to === null && active === "end" && hovered !== null
      ? { from: value.from, to: hovered }
      : undefined;

  function openPicker(field: "start" | "end") {
    setActive(field);
    setNotice(null);
    setHovered(null);
    setMonth(startOfMonth(value.from ?? value.to ?? todayLocal()));
    // The request card is narrow and often near the bottom of the viewport.
    // Flip the desktop calendar above the fields when there isn't room below.
    const rect = rootRef.current?.getBoundingClientRect();
    const spaceBelow = window.innerHeight - (rect?.bottom ?? window.innerHeight);
    setSide(spaceBelow < 480 ? "up" : "down");
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setHovered(null);
  }

  function canPreview(from: Date, to: Date): boolean {
    const start = toUtcDay(from);
    const end = toUtcDay(to);
    if (end < start) return false;
    if (Math.round((end - start) / DAY_MS) + 1 > MAX_LOAN_DAYS) return false;
    return !busyRanges.some((range) => start <= range.endDate && range.startDate <= end);
  }

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        close();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || wide) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open, wide]);

  function handleSelect(_next: DateRange | undefined, triggerDate: Date) {
    setNotice(null);
    setHovered(null);
    const from = value.from;

    // A click after a completed range starts a new range. Clicking the To field
    // first is the explicit way to refine an existing return date.
    if (active === "start" || from === null || (value.to !== null && active === null)) {
      onChange({ from: triggerDate, to: null });
      setActive("end");
      return;
    }

    // Clicking before the start restarts the range at that earlier day.
    if (toUtcDay(triggerDate) < toUtcDay(from)) {
      onChange({ from: triggerDate, to: null });
      setActive("end");
      return;
    }

    const start = toUtcDay(from);
    const end = toUtcDay(triggerDate);
    const crossesBooking = busyRanges.some(
      (range) => start <= range.endDate && range.startDate <= end,
    );
    if (crossesBooking) {
      setNotice("That range crosses a booked stretch. Pick the days around it.");
      return;
    }

    if (Math.round((end - start) / DAY_MS) + 1 > MAX_LOAN_DAYS) {
      setNotice("Loans can be up to 30 days. Pick a closer return day.");
      return;
    }

    onChange({ from, to: triggerDate });
    // Keep the panel open, but leave neither field active: the next click is a
    // new start date unless the person clicks To to refine the return first.
    setActive(null);
  }

  function clearDates() {
    onChange({ from: null, to: null });
    setActive("start");
    setNotice(null);
    setHovered(null);
  }

  const hint = (() => {
    if (error) return error;
    if (notice) return notice;
    if (value.from === null) return "Choose the day you'd like to pick it up.";
    if (value.to === null) return "Now choose the day you'll bring it back.";
    if (days > 30) return "Loans can be up to 30 days.";
    const total = bookingTotalCents(dailyRateCents, days);
    if (dailyRateCents === 0) {
      return `${days} ${days === 1 ? "day" : "days"} · free to borrow`;
    }
    return `${days} ${days === 1 ? "day" : "days"} · ${formatMoney(total)} total`;
  })();

  return (
    <div ref={rootRef} className="relative">
      <div className="relative grid grid-cols-2 rounded-2xl border border-rule bg-white p-1 shadow-soft">
        {(["start", "end"] as const).map((field) => {
          const date = field === "start" ? value.from : value.to;
          const activeField = open && active === field;
          return (
            <button
              key={field}
              type="button"
              onClick={() => openPicker(field)}
              aria-haspopup="dialog"
              aria-expanded={open && active === field}
              aria-label={`${field === "start" ? "Start" : "End"} date${date === null ? "" : `, ${FULL_DATE.format(date)}`}`}
              className="relative flex min-w-0 flex-col items-start rounded-xl px-3.5 py-2.5 text-left"
            >
              {activeField && (
                <motion.span
                  layoutId="date-range-focus"
                  aria-hidden="true"
                  className="absolute inset-0 rounded-xl bg-mist/65"
                  transition={
                    reduce === true
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 430, damping: 34, mass: 0.7 }
                  }
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] text-ink-muted uppercase">
                <Icon icon={CalendarDays} size={11} className="text-brand" />
                {field === "start" ? "From" : "To"}
              </span>
              <span
                className={`relative z-10 mt-0.5 truncate text-[13px] font-semibold ${
                  date === null ? "text-ink-muted/80" : "text-navy"
                }`}
              >
                {date === null ? "Add date" : FULL_DATE.format(date)}
              </span>
            </button>
          );
        })}
      </div>

      <p
        className={`mt-2 min-h-4 text-[11px] leading-relaxed ${
          error ? "text-[#a12c1c]" : "text-ink-muted"
        }`}
        aria-live="polite"
      >
        {hint}
      </p>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Close date picker"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={close}
              className="fixed inset-0 z-[60] bg-navy/35 backdrop-blur-[2px] sm:hidden"
            />

            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.99 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              role="dialog"
              aria-modal={wide ? undefined : true}
              aria-label="Choose your dates"
              className={`fixed inset-x-0 bottom-0 z-[70] max-h-[88dvh] overflow-y-auto rounded-t-[28px] border-t border-rule bg-white p-4 shadow-float sm:absolute sm:inset-auto sm:right-0 sm:max-h-none sm:w-[640px] sm:rounded-[26px] sm:border sm:p-5 ${
                side === "up" ? "sm:bottom-[calc(100%+10px)]" : "sm:top-[calc(100%+10px)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.16em] text-brand uppercase">
                    Your dates
                  </p>
                  <p className="font-display mt-1 text-[22px] leading-none text-navy">
                    {value.from !== null && value.to !== null
                      ? `${SHORT_DATE.format(value.from)} – ${SHORT_DATE.format(value.to)}`
                      : value.from !== null
                        ? `From ${SHORT_DATE.format(value.from)}`
                        : "Choose a range"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close date picker"
                  className="flex size-8 items-center justify-center rounded-full bg-page text-ink-muted transition-colors hover:text-navy"
                >
                  <Icon icon={X} size={15} />
                </button>
              </div>

              <div className="mt-4">
                <DayPicker
                  mode="range"
                  selected={selected}
                  onSelect={handleSelect}
                  month={month}
                  onMonthChange={(next) => setMonth(startOfMonth(next))}
                  numberOfMonths={wide ? 2 : 1}
                  startMonth={startOfMonth(today)}
                  endMonth={addMonths(today, 12)}
                  weekStartsOn={1}
                  showOutsideDays={false}
                  fixedWeeks
                  excludeDisabled
                  max={MAX_LOAN_DAYS}
                  disabled={disabled}
                  modifiers={{
                    booked: busyMatchers,
                    ...(beyondLimit === undefined ? {} : { beyondLimit }),
                    ...(previewMatcher === undefined ? {} : { preview: previewMatcher }),
                    ...(hovered === null || value.to !== null ? {} : { previewEnd: hovered }),
                  }}
                  modifiersClassNames={{
                    booked: "rdp-booked",
                    beyondLimit: "rdp-beyond-limit",
                    preview: "rdp-preview",
                    previewEnd: "rdp-preview-end",
                  }}
                  onDayMouseEnter={(day, modifiers) => {
                    if (active !== "end" || value.from === null || value.to !== null) return;
                    if (modifiers.disabled || !canPreview(value.from, day)) {
                      setHovered(null);
                      return;
                    }
                    setHovered(day);
                  }}
                  onDayMouseLeave={() => setHovered(null)}
                  className="rdp-lendloop"
                  components={{
                    DayButton: RangeDayButton,
                    Chevron: ({ orientation }) => (
                      <Icon icon={orientation === "left" ? ChevronLeft : ChevronRight} size={15} />
                    ),
                  }}
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-rule/80 pt-3 text-[10.5px] font-medium text-ink-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-brand" aria-hidden="true" />
                  Selected
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2.5 rounded-full bg-[#fff0e9] ring-1 ring-orange/40"
                    aria-hidden="true"
                  />
                  Booked or pending
                </span>
                <span className="text-ink-muted/70">Past dates are unavailable</span>
                {value.from !== null && (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="size-2.5 rounded-full bg-rule ring-1 ring-ink-muted/20"
                      aria-hidden="true"
                    />
                    Beyond 30 days
                  </span>
                )}
              </div>

              <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
                {value.from !== null && value.to === null
                  ? "Pick the return day. Tap the same day again for a one-day loan."
                  : value.from !== null && value.to !== null
                    ? "Pick a new start date to replace this range — or click To to adjust the return, then Done."
                    : "Booked dates include requests that are still waiting for an answer."}
              </p>

              <div className="mt-3 flex items-center justify-between gap-3 border-t border-rule/80 pt-3">
                <button
                  type="button"
                  onClick={clearDates}
                  disabled={value.from === null && value.to === null}
                  className="text-[11px] font-medium text-ink-muted underline decoration-transparent underline-offset-4 transition-colors hover:text-navy hover:decoration-rule disabled:opacity-40"
                >
                  Clear dates
                </button>
                <Button type="button" size="sm" onClick={close}>
                  Done
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
