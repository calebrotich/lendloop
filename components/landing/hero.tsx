"use client";

import { Bell, CalendarDays, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { HeroCursorLoop } from "@/components/landing/hero-cursor-loop";
import { HeroLoop, HeroLoopMobile, HeroMiniStack } from "@/components/landing/hero-loop";
import { CONTAINER } from "@/components/ui/container";
import { Icon } from "@/components/ui/icon";
import type { ShowcaseListing } from "@/lib/public-listings";

interface HeroProps {
  listings: ShowcaseListing[];
  search: ReactNode;
  onCategorySelect: (category: ShowcaseListing["category"]) => void;
}

const PROMISES = [
  { icon: ShieldCheck, label: "Clear per-day rates" },
  { icon: CalendarDays, label: "Ask for exact dates" },
  { icon: Bell, label: "Reminders handled" },
] as const;

export function Hero({ listings, search, onCategorySelect }: HeroProps) {
  // `isolate` keeps the decorative layers behind the hero content, but it also
  // traps the search popovers in this stacking context. Without a z-index the
  // shelf's category rail (right below the hero) paints later and covers the
  // bottom of a long category menu. z-30 lifts the hero above that rail (and
  // above the z-20 controls on the listing cards) while staying below the
  // header (z-40).
  return (
    <section className="relative isolate z-30 pt-8 pb-10 sm:pt-10 lg:pt-14 lg:pb-14">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute inset-x-0 top-0 h-[760px] bg-[radial-gradient(82%_100%_at_50%_0%,#ffffff_0%,rgba(255,255,255,0.65)_46%,rgba(244,246,252,0)_100%)]" />
        <div className="animate-drift absolute -top-24 -left-36 size-[520px] rounded-full bg-lilac/25 blur-[90px]" />
        <div className="absolute top-8 -right-24 size-[440px] rounded-full bg-orange/[0.08] blur-[95px]" />
        <div className="absolute top-72 left-1/2 size-[540px] -translate-x-1/2 rounded-full bg-cyan/10 blur-[110px]" />
        <div
          className="absolute inset-x-0 top-0 h-[560px] opacity-[0.3]"
          style={{
            backgroundImage: "radial-gradient(#1f299c 0.8px, transparent 0.8px)",
            backgroundSize: "26px 26px",
            maskImage: "linear-gradient(to bottom, black, transparent 72%)",
            WebkitMaskImage: "linear-gradient(to bottom, black, transparent 72%)",
          }}
        />
      </div>

      <HeroCursorLoop />

      <div className={CONTAINER}>
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_460px] xl:items-start xl:gap-x-12">
          <div className="max-w-[790px]">
            <h1 className="font-display text-[clamp(2.85rem,5vw,5rem)] leading-[0.94] tracking-[-0.032em] text-balance text-navy">
              Borrow what you need.
              <br className="hidden sm:block" />{" "}
              <span className="relative inline-block">
                Lend what you don&apos;t.
                <svg
                  aria-hidden="true"
                  viewBox="0 0 420 14"
                  preserveAspectRatio="none"
                  className="absolute -bottom-1.5 left-[1%] h-[9px] w-[98%] text-orange/55 sm:-bottom-2.5 sm:h-3"
                >
                  <path
                    d="M3 9.5C86 3.5 187 2.5 271 6.5c50 2.4 101 4 146 1.6"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="3.4"
                  />
                </svg>
              </span>
            </h1>

            <p className="mt-6 max-w-[555px] text-[15px] leading-relaxed text-ink-muted sm:text-[16.5px]">
              A shared shelf for your street — drills, ladders, camping gear, and the Bundt pan that
              gets used twice a year. Ask for the days you need. Someone nearby says yes.
            </p>

            <HeroMiniStack listings={listings} onCategorySelect={onCategorySelect} />

            <div className="mt-8 w-full max-w-[860px]">{search}</div>

            <div className="mt-6 flex flex-wrap items-center gap-x-7 gap-y-3">
              {PROMISES.map((promise) => (
                <span
                  key={promise.label}
                  className="inline-flex items-center gap-2 text-[12px] font-medium text-ink-muted"
                >
                  <span className="flex size-5 items-center justify-center rounded-full bg-white text-brand shadow-soft">
                    <Icon icon={promise.icon} size={11} />
                  </span>
                  {promise.label}
                </span>
              ))}
              <a
                href="#how"
                className="text-[12px] font-semibold text-brand underline decoration-brand/25 underline-offset-4 transition-colors hover:decoration-brand"
              >
                How it works
              </a>
            </div>
          </div>

          <div className="hidden xl:block">
            <HeroLoop listings={listings} onCategorySelect={onCategorySelect} />
          </div>
        </div>

        <HeroLoopMobile listings={listings} onCategorySelect={onCategorySelect} />
      </div>
    </section>
  );
}
