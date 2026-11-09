"use client";

import { useUser } from "@clerk/nextjs";
import { useConvexAuth, useMutation } from "convex/react";
import posthog from "posthog-js";
import { useEffect, useRef } from "react";

import { api } from "@/convex/_generated/api";

const posthogConfigured = Boolean(
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN && process.env.NEXT_PUBLIC_POSTHOG_HOST,
);

/**
 * Provisions the local `users` row after sign-in.
 *
 * The mutation is idempotent, but this component also guards with a ref so a
 * re-render does not fire a request per render. A failure is logged instead of
 * swallowed, and the ref resets so a remount retries.
 */
export function SyncUser() {
  const { isAuthenticated } = useConvexAuth();
  const { isLoaded, user } = useUser();
  const ensureCurrent = useMutation(api.users.ensureCurrent);
  const requested = useRef(false);
  const identifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !posthogConfigured) return;

    if (user === null) {
      // On a full reload after Clerk's sign-out redirect, the ref is empty but
      // PostHog still remembers the prior user. Avoid resetting brand-new
      // anonymous sessions while clearing that persisted identity.
      if (identifiedUserId.current !== null || posthog.get_property("$user_id")) {
        posthog.reset();
      }
      identifiedUserId.current = null;
      return;
    }

    if (identifiedUserId.current !== null && identifiedUserId.current !== user.id) {
      posthog.reset();
    }

    if (identifiedUserId.current !== user.id) {
      posthog.identify(user.id, {
        email: user.primaryEmailAddress?.emailAddress,
        name: user.fullName ?? user.username ?? undefined,
      });
      identifiedUserId.current = user.id;
    }
  }, [isLoaded, user]);

  useEffect(() => {
    if (!isAuthenticated || !user || requested.current) return;

    requested.current = true;
    void ensureCurrent({
      name: user.fullName ?? user.username ?? undefined,
      email: user.primaryEmailAddress?.emailAddress ?? undefined,
    }).catch((error: unknown) => {
      requested.current = false;
      console.error("Could not provision the LendLoop profile", error);
    });
  }, [ensureCurrent, isAuthenticated, user]);

  return null;
}
