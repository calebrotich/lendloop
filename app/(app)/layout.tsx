import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Authenticated shell. The redirect is a UX guard only — every Convex function
 * still proves identity and ownership itself, so a bypassed redirect grants
 * nothing.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth();
  if (userId === null) redirect("/");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6">
      <header className="flex items-center justify-between border-b border-line py-4">
        <nav aria-label="Main" className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <LoopMark className="size-4 text-accent" />
            LendLoop
          </Link>
          <Link
            href="/my-listings"
            className="text-sm text-ink-muted transition-colors hover:text-ink"
          >
            My listings
          </Link>
        </nav>
        <UserButton />
      </header>

      <main className="flex-1 pb-16">{children}</main>
    </div>
  );
}

function LoopMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
    >
      <path d="M7.5 15.5a4 4 0 1 1 0-8h9a4 4 0 1 1 0 8h-9" />
      <path d="M9.5 10.5 8 8.5" />
    </svg>
  );
}
