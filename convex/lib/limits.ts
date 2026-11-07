/**
 * Limits shared by the Convex validators and the client form.
 *
 * Deliberately free of Convex runtime imports so the browser bundle can read the
 * same numbers the server enforces — one source of truth, no drifting copy.
 */
export const LIMITS = {
  nameMin: 2,
  nameMax: 60,
  descriptionMin: 10,
  descriptionMax: 400,
  /** Per-owner cap; also the page size cap for "My listings". */
  maxListings: 100,
} as const;
