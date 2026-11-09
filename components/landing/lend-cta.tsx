"use client";

import { Show, SignInButton } from "@clerk/nextjs";
import { ArrowUpRight } from "lucide-react";

import { LoopMark } from "@/components/ui/brand";
import { Button, ButtonLink } from "@/components/ui/button";
import { CONTAINER } from "@/components/ui/container";
import { Icon } from "@/components/ui/icon";
import { Reveal } from "@/components/ui/reveal";

export function LendCta() {
  return (
    <section className={CONTAINER}>
      <Reveal>
        <div className="relative mt-16 overflow-hidden rounded-[36px] bg-navy px-6 py-12 text-white sm:mt-20 sm:px-10 sm:py-14 lg:px-14">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(90% 140% at 100% 0%, rgba(48,209,255,0.16) 0%, rgba(22,33,91,0) 55%), radial-gradient(80% 120% at 0% 100%, rgba(163,169,245,0.18) 0%, rgba(22,33,91,0) 60%)",
            }}
          />
          <LoopMark
            mono
            className="pointer-events-none absolute -right-10 -bottom-20 size-[360px] rotate-12 text-white/[0.06]"
          />

          <div className="relative grid items-center gap-9 lg:grid-cols-[1fr_auto] lg:gap-14">
            <div className="max-w-2xl">
              <p className="inline-flex items-center gap-2 text-[10.5px] font-bold tracking-[0.18em] text-lilac uppercase">
                <span className="h-px w-6 bg-lilac" aria-hidden="true" />
                Pass it on
              </p>
              <h2 className="font-display mt-4 text-[clamp(2.1rem,4.6vw,3.6rem)] leading-[1.02] text-balance text-white">
                The best tool is the one already on your street.
              </h2>
              <p className="mt-4 max-w-lg text-[14px] leading-relaxed text-white/65">
                That drill you use twice a year? It could be the reason a neighbour finally hangs
                the shelf, mends the gate or takes the tent out again.
              </p>
            </div>

            <div className="flex flex-col gap-2.5 sm:flex-row lg:flex-col">
              <Show when="signed-out">
                <SignInButton mode="modal" fallbackRedirectUrl="/my-listings">
                  <Button
                    variant="accent"
                    size="lg"
                    iconRight={<Icon icon={ArrowUpRight} size={17} />}
                  >
                    List a tool
                  </Button>
                </SignInButton>
              </Show>
              <Show when="signed-in">
                <ButtonLink
                  href="/my-listings"
                  variant="accent"
                  size="lg"
                  iconRight={<Icon icon={ArrowUpRight} size={17} />}
                >
                  List a tool
                </ButtonLink>
              </Show>
              <ButtonLink
                href="/#shelf"
                variant="outline"
                size="lg"
                className="border-white/20 bg-white/[0.06] text-white hover:border-white/35 hover:bg-white/10 hover:text-white [--btn-travel-color:rgb(255_255_255/0.08)]"
              >
                Browse first
              </ButtonLink>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
