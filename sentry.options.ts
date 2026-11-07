/**
 * Shared Sentry options for the three Next.js runtimes (server, edge, browser).
 *
 * The DSN is a public client key, not a secret: it is designed to ship in the
 * browser bundle. A fork can point at its own project with
 * `NEXT_PUBLIC_SENTRY_DSN`; the repo's project is the fallback so a clean clone
 * reports errors without extra setup.
 *
 * Privacy is the reason this file exists. The app holds names, email addresses
 * and free-text notes, and the Sentry defaults collect a lot more than an error
 * stack: user fields, cookies, headers, query strings and request bodies. All of
 * it is disabled below, matching the project's no-PII-in-logs rule.
 */

export const nonEmpty = (value: string | undefined): string | undefined =>
  value !== undefined && value.trim().length > 0 ? value : undefined;

/** Public ingest key for the LendLoop Sentry project. */
const DEFAULT_DSN =
  "https://3cf26eb9eedc87a76622403b9aeebc6e@o4512391266697217.ingest.de.sentry.io/4512391296319568";

/**
 * Only `NEXT_PUBLIC_*` and `NODE_ENV` are safe to read in a module that the
 * browser bundle imports; the server-only `SENTRY_DSN` override is applied in
 * `sentry.server.config.ts` / `sentry.edge.config.ts`.
 */
export const SENTRY_DSN = nonEmpty(process.env.NEXT_PUBLIC_SENTRY_DSN) ?? DEFAULT_DSN;

export const SENTRY_ENVIRONMENT =
  nonEmpty(process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT) ?? process.env.NODE_ENV ?? "development";

/**
 * 100% of traces while developing, 10% in production. Error events are always
 * captured; this only governs performance spans.
 */
export const SENTRY_TRACES_SAMPLE_RATE = process.env.NODE_ENV === "production" ? 0.1 : 1;

export const SENTRY_PRIVACY_OPTIONS = {
  /** Do not attach the authenticated user or the client IP address. */
  sendDefaultPii: false,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    /** An empty list disables request/response body capture entirely. */
    httpBodies: [] as (
      "incomingRequest" | "outgoingRequest" | "incomingResponse" | "outgoingResponse"
    )[],
    urlQueryParams: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
  },
};

export const SENTRY_BASE_OPTIONS = {
  dsn: SENTRY_DSN,
  environment: SENTRY_ENVIRONMENT,
  tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
  ...SENTRY_PRIVACY_OPTIONS,
};
