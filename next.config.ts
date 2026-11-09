import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

import { POSTHOG_PROXY_PATH, resolvePostHogUpstreams } from "./lib/posthog";

/**
 * Photos live on the R2 public host, not under /public. Next's optimiser will
 * resize and re-encode them to AVIF/WebP, but it refuses a remote host that is
 * not allow-listed here. Read the host at build time so the allow-list is the
 * same one the media functions use, rather than a wildcard.
 */
function r2Hostname(): string | null {
  const raw = process.env.R2_PUBLIC_HOST?.trim();
  if (raw === undefined || raw.length === 0) return null;
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
  } catch {
    return null;
  }
}

const imageHost = r2Hostname();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Never advertise the framework in responses.
  poweredByHeader: false,
  // PostHog's API paths end in a slash. Without this Next answers each one
  // with a 308 before the rewrite runs, doubling every capture request.
  skipTrailingSlashRedirect: true,
  images: {
    // A clean clone without R2 still renders: unoptimised images load from the
    // stored URL instead of failing the optimiser's allow-list check.
    unoptimized: imageHost === null,
    remotePatterns: imageHost === null ? [] : [{ protocol: "https" as const, hostname: imageHost }],
    formats: ["image/avif" as const, "image/webp" as const],
    minimumCacheTTL: 60 * 60 * 24,
  },
  async redirects() {
    return [
      // The old signed-in browse page is now the public shelf.
      { source: "/tools", destination: "/#shelf", permanent: false },
    ];
  },
  async rewrites() {
    // Analytics traffic goes to this app first, so blockers that know the
    // PostHog hostnames never see it. The specific static/config paths must
    // come before the capture catch-all because rewrites are evaluated in
    // order. Without a configured host the rewrites stay off and the app runs
    // without analytics.
    const upstreams = resolvePostHogUpstreams(process.env.NEXT_PUBLIC_POSTHOG_HOST);
    if (upstreams === null) return [];

    return [
      {
        source: `/${POSTHOG_PROXY_PATH}/static/:path*`,
        destination: `${upstreams.assets}/static/:path*`,
      },
      {
        source: `/${POSTHOG_PROXY_PATH}/array/:path*`,
        destination: `${upstreams.assets}/array/:path*`,
      },
      {
        source: `/${POSTHOG_PROXY_PATH}/:path*`,
        destination: `${upstreams.api}/:path*`,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/sourcemaps/uploading/bundler-plugin-options/

  org: process.env.SENTRY_ORG ?? "lendloop-z3",

  project: process.env.SENTRY_PROJECT ?? "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
