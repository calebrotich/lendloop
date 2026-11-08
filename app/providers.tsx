"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

import { SyncUser } from "@/components/sync-user";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

// Constructed once per module load. A missing URL must not throw during build:
// CI and clean clones have no keys, and an unconfigured build should render an
// explanation rather than fail to compile.
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

/**
 * ClerkProvider lives in the server layout so it can see the request's proxy
 * configuration. This component only renders the client providers that need to
 * sit inside it; `clerkConfigured` comes from the same server check, so an
 * unconfigured build still explains itself instead of throwing.
 */
export function Providers({
  children,
  clerkConfigured,
}: {
  children: ReactNode;
  clerkConfigured: boolean;
}) {
  if (convex === null || !clerkConfigured) {
    return <MissingConfig />;
  }

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <SyncUser />
      {children}
    </ConvexProviderWithClerk>
  );
}

function MissingConfig() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold tracking-tight">LendLoop is not configured</h1>
      <p className="text-sm leading-relaxed text-ink-muted">
        This build has no Clerk or Convex keys. Copy <code>.env.example</code> to{" "}
        <code>.env.local</code>, fill in the Clerk keys, and run <code>pnpm exec convex dev</code>{" "}
        to create a deployment.
      </p>
      <p className="text-xs text-ink-muted">See README.md → Quickstart.</p>
    </main>
  );
}
