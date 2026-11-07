import type { LoanPhase, LoanStatus } from "./constants";
import { appError } from "./errors";

/**
 * Dates are epoch milliseconds at UTC midnight. Day granularity is deliberate:
 * a loan is "for the 20th" regardless of the clock, and overlap checks compare
 * days rather than instants.
 *
 * Timezone note: the UI sends `YYYY-MM-DD` and this module maps it to UTC
 * midnight. Nairobi is ahead of UTC, so a local "today" is never earlier than
 * the UTC day and cannot be rejected as past.
 */

export const DAY_MS = 86_400_000;
export const MAX_LOAN_DAYS = 30;

/** Start of the UTC day containing `ms`. */
export function startOfDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

/**
 * Parse `YYYY-MM-DD` into UTC midnight, rejecting impossible dates such as
 * 2026-02-31 instead of silently rolling them forward.
 */
export function parseDateInput(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;

  const ms = Date.UTC(year, month - 1, day);
  const parsed = new Date(ms);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
}

/** `YYYY-MM-DD` for display and for the date inputs on the client. */
export function formatDateInput(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Inclusive day overlap: [aStart, aEnd] and [bStart, bEnd] share a day. */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function loanDayCount(startDate: number, endDate: number): number {
  return Math.floor((endDate - startDate) / DAY_MS) + 1;
}

/**
 * Validate a requested window. Throws VALIDATION with copy a person can act on;
 * the same rules are mirrored client-side only for immediate feedback.
 */
export function assertLoanWindow(startDate: number, endDate: number, now: number): void {
  if (endDate < startDate) {
    appError("VALIDATION", "The end date must be on or after the start date.");
  }
  if (startDate < startOfDay(now)) {
    appError("VALIDATION", "The start date can’t be in the past.");
  }
  if (loanDayCount(startDate, endDate) > MAX_LOAN_DAYS) {
    appError("VALIDATION", `Loans are capped at ${MAX_LOAN_DAYS} days.`);
  }
}

/**
 * Stored status + dates → what the user should see right now.
 *
 * Derived on read, so a loan that runs past its end date shows "overdue"
 * without any scheduled job, and a fix to the clock cannot corrupt the record.
 */
export function loanPhase(
  loan: { status: LoanStatus; startDate: number; endDate: number },
  now: number,
): LoanPhase {
  if (loan.status !== "approved") return loan.status;

  const today = startOfDay(now);
  if (loan.endDate < today) return "overdue";
  if (loan.startDate > today) return "upcoming";
  return "active";
}
