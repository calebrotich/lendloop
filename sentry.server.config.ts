/**
 * Sentry for server components, route handlers and server actions.
 *
 * Loaded by `instrumentation.ts#register` only when `NEXT_RUNTIME === "nodejs"`.
 * Options and the privacy exclusions live in `sentry.options.ts`.
 */
import * as Sentry from "@sentry/nextjs";

import { nonEmpty, SENTRY_BASE_OPTIONS } from "./sentry.options";

Sentry.init({
  ...SENTRY_BASE_OPTIONS,
  /** Server-only override; never referenced from the browser bundle. */
  dsn: nonEmpty(process.env.SENTRY_DSN) ?? SENTRY_BASE_OPTIONS.dsn,
});
