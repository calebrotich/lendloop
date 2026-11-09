/**
 * Pricing helpers shared by the Convex backend and the listing form.
 *
 * Money is stored in integer cents so a booking total is exact — the same
 * reason the app stores days as UTC midnight instead of timestamps. The
 * recommendation is deliberately advisory: an owner may price above or below
 * it, and `0` is a valid price for a neighbour lending something for free.
 *
 * The replacement value is not just a rate input: it is the amount a borrower agrees
 * to reimburse if the item is lost or not returned.
 */
/** The marketplace currency. One constant for every label and email. */
export const CURRENCY = "USD";

export const PRICING = {
  /** The midpoint of the recommended band, used for the one-tap suggestion. */
  recommendedPercent: 4,
  /** "A good amount is between 3% and 5% of the value." */
  minPercent: 3,
  maxPercent: 5,
} as const;

function percentOf(valueCents: number, percent: number): number {
  if (!Number.isFinite(valueCents) || valueCents <= 0) return 0;
  return Math.max(0, Math.round((valueCents * percent) / 100));
}

/** The suggested per-day rate: 4% of the replacement value. */
export function suggestedDailyRateCents(valueCents: number): number {
  return percentOf(valueCents, PRICING.recommendedPercent);
}

/** The recommended 3–5% band, for the hint under the rate field. */
export function suggestedRateRangeCents(valueCents: number): { min: number; max: number } {
  return {
    min: percentOf(valueCents, PRICING.minPercent),
    max: percentOf(valueCents, PRICING.maxPercent),
  };
}

/** Inclusive day count for a booking; mirrors `loanDayCount` without imports. */
export function bookingTotalCents(dailyRateCents: number, days: number): number {
  const rate = Number.isFinite(dailyRateCents) ? Math.max(0, Math.round(dailyRateCents)) : 0;
  const count = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;
  return rate * count;
}

/** How far a rate sits from the replacement value, for the "3.4% of value" badge. */
export function ratePercentOfValue(dailyRateCents: number, valueCents: number): number | null {
  if (!Number.isFinite(valueCents) || valueCents <= 0) return null;
  if (!Number.isFinite(dailyRateCents) || dailyRateCents < 0) return null;
  return (dailyRateCents / valueCents) * 100;
}
