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

  /** Photos per listing. Also the bound on every image read. */
  maxImagesPerTool: 6,
  /**
   * Largest accepted object, measured after the browser re-encodes it. Kept
   * below 4.5 MB so the upload proxy fits inside a serverless body limit.
   */
  maxImageBytes: 4 * 1024 * 1024,
  /** Large camera files are re-encoded before they leave the device. */
  maxSourceImageBytes: 25 * 1024 * 1024,
  /** Longest edge after the browser resize. */
  maxImageDimension: 2048,
  /** Live, unexpired upload tickets a person may hold at once. */
  maxActiveUploads: 10,
  /** How long an upload ticket (and its presigned URL) stays valid. */
  uploadTicketSeconds: 10 * 60,
} as const;
