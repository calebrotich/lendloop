import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Next.js 16 renamed the `middleware` convention to `proxy`; Clerk's handler is
 * unchanged. The session is established for every request so server components
 * can read it. No route is protected yet — the authenticated shell arrives with
 * the (app) layout, and authorisation itself always happens in Convex.
 *
 * Without keys (CI, a clean clone before setup) the handler is a pass-through so
 * the app still renders its "not configured" screen instead of 500ing.
 *
 * `/monitoring` is excluded: that is Sentry's tunnel route (see next.config.ts),
 * and it must reach the rewrite without Clerk touching the envelope POST.
 *
 * `/__clerk` is explicit: on a production `*.vercel.app` host Clerk auto-proxies
 * its Frontend API through this app (no DNS record), and the general matcher
 * below skips `.js` requests — including Clerk's own browser bundle — so the
 * proxy path must be matched before that filter.
 */
const isConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);

export default isConfigured
  ? clerkMiddleware({
      // Explicit rather than relying only on Clerk's automatic detection: the
      // production instance lives on a `*.vercel.app` host, where the Frontend
      // API cannot have its own DNS record. Local development uses a dev
      // instance and talks to it directly.
      frontendApiProxy: {
        enabled: (url) => url.hostname.endsWith(".vercel.app"),
      },
    })
  : () => NextResponse.next();

export const config = {
  matcher: [
    // Skip Next internals and static files unless they appear in a search param.
    "/((?!monitoring|_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    // Clerk Frontend API proxy, including its `clerk.browser.js` bundle.
    "/__clerk/(.*)",
  ],
};
