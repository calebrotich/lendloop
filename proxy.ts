import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

import { isPostHogProxyPath, sanitizePostHogHeaders } from "./lib/posthog";

/**
 * Next.js 16 renamed the `middleware` convention to `proxy`; Clerk's handler is
 * unchanged. The session is established for every request so server components
 * can read it. No route is protected yet — the authenticated shell arrives with
 * the (app) layout, and authorisation itself always happens in Convex.
 *
 * Without keys (CI, a clean clone before setup) the handler is a pass-through so
 * the app still renders its "not configured" screen instead of 500ing.
 *
 * `/monitoring` and `/user-profile-fk` are excluded from Clerk. They are the
 * Sentry tunnel and the PostHog proxy (see next.config.ts), and neither should
 * receive a session. PostHog requests keep their route to the rewrite but lose
 * the cookies and credentials the browser attaches to every same-origin call.
 */
const isConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);

const clerk = isConfigured ? clerkMiddleware() : null;

function forwardToPostHog(request: NextRequest) {
  // Keep only the PostHog SDK's own key; the browser's cookies and any other
  // bearer token belong to this app, not to the analytics upstream.
  return NextResponse.next({ request: { headers: sanitizePostHogHeaders(request.headers) } });
}

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (isPostHogProxyPath(request.nextUrl.pathname)) {
    return forwardToPostHog(request);
  }

  return clerk === null ? NextResponse.next() : clerk(request, event);
}

export const config = {
  matcher: [
    // Skip Next internals and static files unless they appear in a search param.
    "/((?!monitoring|_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    // The PostHog proxy also serves static SDK files, which the first matcher
    // skips by extension. Match them explicitly so their cookies are stripped
    // too; the handler keeps them out of Clerk.
    "/user-profile-fk/:path*",
  ],
};
