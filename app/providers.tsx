"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import { Toaster } from "sonner";

import { SyncUser } from "@/components/sync-user";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Constructed once per module load. A missing URL must not throw during build:
// CI and clean clones have no keys, and an unconfigured build should render an
// explanation rather than fail to compile.
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function Providers({ children }: { children: ReactNode }) {
  if (convex === null || publishableKey === undefined) {
    return <MissingConfig />;
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <SyncUser />
        <Toaster
          position="bottom-center"
          offset={24}
          gap={10}
          visibleToasts={3}
          toastOptions={{
            classNames: {
              toast: "font-sans",
              title: "font-semibold text-navy",
              description: "text-ink-muted",
            },
          }}
        />
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
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
