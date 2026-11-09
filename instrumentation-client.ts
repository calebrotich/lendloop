/**
 * Sentry for the browser.
 *
 * Replay is useful for understanding a broken interaction, but the app renders
 * names, emails and notes, so every text node, input and image is masked or
 * blocked. `onRouterTransitionStart` ties client-side navigations to traces.
 */
import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

import { POSTHOG_PROXY_PATH, resolvePostHogUpstreams } from "./lib/posthog";
import { SENTRY_BASE_OPTIONS } from "./sentry.options";

const posthogToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
const posthogUpstreams = resolvePostHogUpstreams(posthogHost);
const posthogEnabled = Boolean(posthogToken && posthogUpstreams);

if (!posthogToken) {
  if (process.env.NODE_ENV !== "production") {
    throw new Error(
      "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured",
    );
  }
} else if (posthogUpstreams === null) {
  if (process.env.NODE_ENV !== "production") {
    throw new Error(
      "NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured",
    );
  }
} else {
  posthog.init(posthogToken, {
    // Capture and config requests go to this app, not posthog.com, so ad
    // blockers matching the PostHog domains do not drop them. The rewrites in
    // next.config.ts forward the path to the configured upstream, and ui_host
    // keeps the toolbar pointed at the real PostHog app.
    api_host: `/${POSTHOG_PROXY_PATH}`,
    ui_host: posthogUpstreams.ui,
    defaults: "2025-05-24",
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
  });
}

Sentry.init({
  ...SENTRY_BASE_OPTIONS,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],
  /** Sample a tenth of sessions, but every session that hits an error. */
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
});

export function onRouterTransitionStart(
  ...args: Parameters<typeof Sentry.captureRouterTransitionStart>
) {
  Sentry.captureRouterTransitionStart(...args);

  if (posthogEnabled) {
    posthog.capture("$pageview");
  }
}
