import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Suspense } from "react";

import { ToolShelf } from "@/components/tool-shelf";
import { ToolShelfSkeleton } from "@/components/tool-shelf-skeleton";

// Clerk reads the session per request, and the shelf is live data.
export const dynamic = "force-dynamic";

const HOW_IT_WORKS = [
  {
    title: "List a tool",
    body: "Name, category, condition and a short description. Yours to edit or retire.",
  },
  {
    title: "Request a date range",
    body: "Ask for the days you need. The owner approves or declines, in the app.",
  },
  {
    title: "Lend without nagging",
    body: "Automated pick-up and overdue reminders, so nobody has to chase anybody.",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <LoopMark className="size-5 text-accent" />
          LendLoop
        </span>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-line px-3 py-1 text-xs text-ink-muted">
            Local build · Stage 1
          </span>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </header>

      <main className="flex-1 pb-16">
        <section className="max-w-2xl py-12 sm:py-16">
          <p className="mb-4 text-xs font-medium tracking-[0.18em] text-accent uppercase">
            Neighbourhood tool library
          </p>
          <h1 className="text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
            Borrow what you need. Lend what you don&apos;t.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-ink-muted">
            LendLoop is a shared shelf for your street: drills, ladders, camping gear and the Bundt
            pan that gets used twice a year. Ask for the days you need, get an answer, return it
            when you&apos;re done.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
                >
                  Sign in to lend or borrow
                </button>
              </SignInButton>
              <span className="text-xs text-ink-muted">
                Clerk handles sign-in — no password ever reaches LendLoop.
              </span>
            </Show>
            <Show when="signed-in">
              <Link
                href="/tools"
                className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
              >
                Browse the shelf
              </Link>
              <span className="text-xs text-ink-muted">
                Ask a neighbour for dates, or list a tool you&apos;re happy to lend.
              </span>
            </Show>
          </div>
        </section>

        <section id="shelf" aria-labelledby="shelf-heading" className="border-t border-line pt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 id="shelf-heading" className="text-lg font-semibold tracking-tight">
              On the shelf
            </h2>
            <p className="text-xs text-ink-muted">
              Name, category and a photo when one is added — who owns what stays private.
            </p>
          </div>

          <Suspense fallback={<ToolShelfSkeleton />}>
            <ToolShelf />
          </Suspense>
        </section>

        <section aria-labelledby="how-heading" className="mt-16">
          <h2
            id="how-heading"
            className="text-xs font-medium tracking-[0.18em] text-ink-muted uppercase"
          >
            How it works
          </h2>
          <dl className="mt-5 grid gap-6 sm:grid-cols-3">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.title} className="border-t border-line pt-4">
                <dt className="text-sm font-medium">{item.title}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-ink-muted">{item.body}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="flex items-center justify-between border-t border-line py-6 text-xs text-ink-muted">
        <span>LendLoop · fictional demo product</span>
        <a
          className="underline decoration-line underline-offset-4 hover:text-ink"
          href="/api/health"
        >
          Service status
        </a>
      </footer>
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
