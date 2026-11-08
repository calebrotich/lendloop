import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

import { Providers } from "./providers";
import "./globals.css";

const DESCRIPTION =
  "A neighbourhood tool-lending board. Borrow what you need. Lend what you don't.";

/**
 * A Clerk production instance hosted on `*.vercel.app` has to reach the
 * Frontend API through this app's `/__clerk` proxy. Clerk's provider derives
 * that proxy URL from the Vercel environment on the server, so it must sit in a
 * server component and pass the value down; a client-only provider would render
 * the script tags once on the server and then point them at the unreachable
 * Frontend API host during hydration.
 */
const clerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);

export const metadata: Metadata = {
  title: {
    default: "LendLoop — Borrow what you need. Lend what you don't.",
    template: "%s · LendLoop",
  },
  description: DESCRIPTION,
  applicationName: "LendLoop",
  openGraph: {
    title: "LendLoop",
    description: DESCRIPTION,
    siteName: "LendLoop",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#faf9f7",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        {clerkConfigured ? (
          <ClerkProvider>
            <Providers clerkConfigured>{children}</Providers>
          </ClerkProvider>
        ) : (
          <Providers clerkConfigured={false}>{children}</Providers>
        )}
      </body>
    </html>
  );
}
