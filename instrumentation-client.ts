/**
 * Sentry for the browser.
 *
 * Replay is useful for understanding a broken interaction, but the app renders
 * names, emails and notes, so every text node, input and image is masked or
 * blocked. `onRouterTransitionStart` ties client-side navigations to traces.
 */
import * as Sentry from "@sentry/nextjs";

import { SENTRY_BASE_OPTIONS } from "./sentry.options";

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

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
