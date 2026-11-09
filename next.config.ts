import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

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
