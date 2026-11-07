/**
 * Sentry for the edge runtime (Next 16's `proxy.ts` session middleware).
 *
 * Loaded by `instrumentation.ts#register` only when `NEXT_RUNTIME === "edge"`.
 */
import * as Sentry from "@sentry/nextjs";

import { nonEmpty, SENTRY_BASE_OPTIONS } from "./sentry.options";

Sentry.init({
  ...SENTRY_BASE_OPTIONS,
  /** Server-only override; never referenced from the browser bundle. */
  dsn: nonEmpty(process.env.SENTRY_DSN) ?? SENTRY_BASE_OPTIONS.dsn,
});
