import { describe, expect, it } from "vitest";

import {
  isPostHogProxyPath,
  resolvePostHogUpstreams,
  sanitizePostHogHeaders,
} from "../lib/posthog";

describe("resolvePostHogUpstreams", () => {
  it("splits PostHog Cloud US into API, asset and app hosts", () => {
    expect(resolvePostHogUpstreams("https://us.i.posthog.com")).toEqual({
      api: "https://us.i.posthog.com",
      assets: "https://us-assets.i.posthog.com",
      ui: "https://us.posthog.com",
    });
  });

  it("splits PostHog Cloud EU into API, asset and app hosts", () => {
    expect(resolvePostHogUpstreams("https://eu.i.posthog.com/")).toEqual({
      api: "https://eu.i.posthog.com",
      assets: "https://eu-assets.i.posthog.com",
      ui: "https://eu.posthog.com",
    });
  });

  it("serves everything from a self-hosted origin", () => {
    expect(resolvePostHogUpstreams("https://posthog.example.com/ingest")).toEqual({
      api: "https://posthog.example.com",
      assets: "https://posthog.example.com",
      ui: "https://posthog.example.com",
    });
  });

  it("accepts a host without a scheme", () => {
    expect(resolvePostHogUpstreams("eu.i.posthog.com")?.api).toBe("https://eu.i.posthog.com");
  });

  it("turns the proxy off when the host is missing or malformed", () => {
    expect(resolvePostHogUpstreams(undefined)).toBeNull();
    expect(resolvePostHogUpstreams("  ")).toBeNull();
    expect(resolvePostHogUpstreams("not a url")).toBeNull();
  });
});

describe("isPostHogProxyPath", () => {
  it("matches the proxy root and everything under it", () => {
    expect(isPostHogProxyPath("/user-profile-fk")).toBe(true);
    expect(isPostHogProxyPath("/user-profile-fk/e/")).toBe(true);
    expect(isPostHogProxyPath("/user-profile-fk/static/array.js")).toBe(true);
  });

  it("does not match unrelated routes", () => {
    expect(isPostHogProxyPath("/user-profile-fk-other")).toBe(false);
    expect(isPostHogProxyPath("/listings/user-profile-fk")).toBe(false);
    expect(isPostHogProxyPath("/")).toBe(false);
  });
});

describe("sanitizePostHogHeaders", () => {
  it("drops the Clerk session cookie and unrelated bearer tokens", () => {
    const sanitized = sanitizePostHogHeaders(
      new Headers({
        cookie: "__session=secret; __client_uat=1",
        authorization: "Bearer clerk-secret",
        "content-type": "application/json",
      }),
    );

    expect(sanitized.get("cookie")).toBeNull();
    expect(sanitized.get("authorization")).toBeNull();
    expect(sanitized.get("content-type")).toBe("application/json");
  });

  it("keeps a PostHog SDK key in the authorization header", () => {
    for (const token of ["phc_abc", "phs_abc", "phx_abc"]) {
      const sanitized = sanitizePostHogHeaders(
        new Headers({ authorization: `Bearer ${token}`, cookie: "session=1" }),
      );
      expect(sanitized.get("authorization")).toBe(`Bearer ${token}`);
      expect(sanitized.get("cookie")).toBeNull();
    }
  });

  it("does not mutate the original headers", () => {
    const original = new Headers({ cookie: "session=1" });
    sanitizePostHogHeaders(original);
    expect(original.get("cookie")).toBe("session=1");
  });
});
