import { ArrowRight, Bell, CalendarCheck2, RotateCcw, Search, ShieldCheck } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { CONTAINER } from "@/components/ui/container";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";

const STEPS = [
  {
    number: "01",
    icon: Search,
    title: "Find it nearby",
    body: "Search the shelf or wander by category. Every listing shows its condition and what it costs per day.",
  },
  {
    number: "02",
    icon: CalendarCheck2,
    title: "Ask for your dates",
    body: "Pick a start and an end. The owner approves or declines in the app — no group chat, no maybes.",
  },
  {
    number: "03",
    icon: RotateCcw,
    title: "Return it, repeat",
    body: "A friendly reminder arrives before it is due. The ladder goes back on the shelf for the next neighbour.",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-heading" className="">
      <div className={CONTAINER}>
        <Reveal>
          <div className="relative overflow-hidden rounded-[36px] border border-white bg-white px-6 py-10 shadow-soft sm:px-10 sm:py-12 lg:px-14">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-40 -right-24 size-115 rounded-full bg-mist/50 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-48 -left-24 size-105 rounded-full bg-[#ffefe9]/70 blur-3xl"
            />

            <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between lg:gap-14">
              <div className="max-w-2xl">
                <p className="inline-flex items-center gap-2 text-[10.5px] font-bold tracking-[0.18em] text-brand uppercase">
                  <span className="h-px w-6 bg-orange" aria-hidden="true" />
                  The loop
                </p>
                <h2
                  id="how-heading"
                  className="font-display mt-4 text-[clamp(2.2rem,4.4vw,3.5rem)] leading-[1.02] text-balance text-navy"
                >
                  Borrowing, without the awkwardness.
                </h2>
              </div>

              <div className="max-w-sm lg:pb-1">
                <p className="text-[13.5px] leading-relaxed text-ink-muted">
                  Lending a drill used to mean a text, a favour and a vague promise. LendLoop gives
                  the exchange a shape: a listing, a date range, an answer, a reminder.
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-4">
                  <ButtonLink
                    href="/#shelf"
                    variant="outline"
                    size="sm"
                    iconRight={<Icon icon={ArrowRight} size={15} />}
                  >
                    Browse the shelf
                  </ButtonLink>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
                    <Icon icon={ShieldCheck} size={13} className="text-brand" />
                    Owner-set daily rates
                  </span>
                </div>
              </div>
            </div>

            <ol className="relative mt-10 grid gap-3 md:grid-cols-3">
              {STEPS.map((step) => (
                <li
                  key={step.number}
                  className="group relative flex flex-col rounded-3xl border border-rule/70 bg-page/70 p-5 transition-[transform,border-color,background-color] duration-300 hover:-translate-y-0.5 hover:border-brand/20 hover:bg-page"
                >
                  <div className="flex items-start justify-between">
                    <span className="flex size-11 items-center justify-center rounded-2xl border border-rule/70 bg-white text-brand shadow-soft transition-transform duration-300 group-hover:-translate-y-0.5">
                      <Icon icon={step.icon} size={19} />
                    </span>
                    <span className="font-sans text-[10px] font-bold tracking-[0.14em] text-orange-strong tabular-nums">
                      {step.number}
                    </span>
                  </div>
                  <h3 className="font-display mt-6 text-[23px] leading-tight text-navy">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">{step.body}</p>
                </li>
              ))}
            </ol>

            <p className="relative mt-6 inline-flex items-center gap-2 text-[11.5px] font-medium text-ink-muted">
              <Icon icon={Bell} size={13} className="text-brand" />
              Reminders go out before a loan is due — no one has to chase.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
