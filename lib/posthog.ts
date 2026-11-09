/**
 * PostHog is reached through a same-origin path rather than the PostHog
 * domains, so ad blockers that filter those domains cannot drop events. The
 * Next rewrite and the browser SDK must agree on the path, and the deployment
 * host decides which upstream (US, EU or self-hosted) serves it.
 */
export const POSTHOG_PROXY_PATH = "user-profile-fk";

export type PostHogUpstreams = {
  /** Capture, flags and session-recording endpoints. */
  api: string;
  /** SDK bundles and the remote config endpoint. */
  assets: string;
  /** The PostHog app itself, used by the toolbar. */
  ui: string;
};

/**
 * Resolve the upstream origins for a PostHog host. Cloud hosts get their
 * separate asset and app hosts; anything else (self-hosted) serves everything
 * from the configured origin. Returns null when the value is missing or is not
 * a URL, which leaves the proxy rewrites switched off.
 */
export function resolvePostHogUpstreams(raw: string | undefined): PostHogUpstreams | null {
  const value = raw?.trim();
  if (value === undefined || value.length === 0) return null;

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  const region =
    hostname === "us.i.posthog.com" ? "us" : hostname === "eu.i.posthog.com" ? "eu" : null;
  if (region !== null) {
    return {
      api: `https://${region}.i.posthog.com`,
      assets: `https://${region}-assets.i.posthog.com`,
      ui: `https://${region}.posthog.com`,
    };
  }

  return { api: url.origin, assets: url.origin, ui: url.origin };
}

/** Whether a request belongs to the PostHog proxy and must skip Clerk. */
export function isPostHogProxyPath(pathname: string): boolean {
  return pathname === `/${POSTHOG_PROXY_PATH}` || pathname.startsWith(`/${POSTHOG_PROXY_PATH}/`);
}

/**
 * Strip everything from a proxied request that is not PostHog's business. A
 * same-origin proxy would otherwise forward the Clerk session cookie and any
 * other credential the browser attaches. The SDK's own key is the only
 * authorization worth keeping (`phc_` project, `phs_` / `phx_` other types).
 */
export function sanitizePostHogHeaders(headers: Headers): Headers {
  const sanitized = new Headers(headers);
  sanitized.delete("cookie");
  if (!/^Bearer ph[csx]_/.test(sanitized.get("authorization") ?? "")) {
    sanitized.delete("authorization");
  }
  return sanitized;
}
