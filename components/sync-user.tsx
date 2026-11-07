"use client";

import { useUser } from "@clerk/nextjs";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef } from "react";

import { api } from "@/convex/_generated/api";

/**
 * Provisions the local `users` row after sign-in.
 *
 * The mutation is idempotent, but this component also guards with a ref so a
 * re-render does not fire a request per render. A failure is logged instead of
 * swallowed, and the ref resets so a remount retries.
 */
export function SyncUser() {
  const { isAuthenticated } = useConvexAuth();
  const { user } = useUser();
  const ensureCurrent = useMutation(api.users.ensureCurrent);
  const requested = useRef(false);

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
