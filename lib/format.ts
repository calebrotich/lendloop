import { CURRENCY } from "@/convex/lib/pricing";

export { CURRENCY };

/**
 * Amounts are integer cents; a rate is always "per day". The currency itself
 * lives in `convex/lib/pricing.ts` so the backend, the forms and the email
 * template all read the same value.
 */

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
};

/** "20 Nov 2026" or "20 Nov 2026 – 22 Nov 2026" for a range. */
export function formatRange(startDate: number, endDate: number): string {
  const start = new Intl.DateTimeFormat("en-GB", DATE_FORMAT).format(startDate);
  if (startDate === endDate) return start;
  const end = new Intl.DateTimeFormat("en-GB", DATE_FORMAT).format(endDate);
  return `${start} – ${end}`;
}

/** `YYYY-MM-DD` for a date input's `min`, in UTC to match the backend. */
export function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Human relative time for the automation feed ("Reminder sent 2 days ago").
 * Deliberately coarse: exact seconds are noise on a feed of email hand-offs.
 */
export function timeAgo(ms: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - ms) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

  return new Intl.DateTimeFormat("en-GB", DATE_FORMAT).format(ms);
}

/** `$1,500` — whole amounts drop the decimals, cents keep two. */
export function formatMoney(cents: number, options: { alwaysCents?: boolean } = {}): string {
  const amount = cents / 100;
  const digits = options.alwaysCents === true ? 2 : Number.isInteger(amount) ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: CURRENCY,
    minimumFractionDigits: digits,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** `$4.80/day`, or `Free` when the owner has set a zero rate. */
export function formatRate(dailyRateCents: number): string {
  return dailyRateCents === 0 ? "Free" : `${formatMoney(dailyRateCents)}/day`;
}
