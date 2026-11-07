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
 */
const isConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);

export default isConfigured ? clerkMiddleware() : () => NextResponse.next();

export const config = {
  matcher: [
    // Skip Next internals and static files unless they appear in a search param.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
