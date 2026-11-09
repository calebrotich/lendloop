import { ArrowLeft, ArrowRight } from "lucide-react";

import { LoopMark } from "@/components/ui/brand";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export function NotFoundPanel({
  title = "This tool isn’t on the shelf",
  body = "The listing may have been removed, paused, or the link might be a little off. There is plenty more to borrow.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <div className="relative mx-auto flex min-h-[62vh] w-full max-w-3xl flex-col items-center justify-center px-5 py-20 text-center">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        style={{
          background:
            "radial-gradient(55% 60% at 50% 10%, #ffffff 0%, rgba(255,255,255,0) 70%), radial-gradient(40% 40% at 80% 80%, #e0eaf8 0%, rgba(224,234,248,0) 70%)",
        }}
      />
      <div className="relative">
        <LoopMark mono className="mx-auto size-14 text-brand/25" />
        <p className="mt-6 font-display text-[64px] leading-none text-brand/20">404</p>
      </div>
      <h1 className="font-display mt-2 text-[clamp(2.1rem,5vw,3.4rem)] leading-tight text-balance text-navy">
        {title}
      </h1>
      <p className="mt-4 max-w-md text-[14px] leading-relaxed text-ink-muted">{body}</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
        <ButtonLink href="/#shelf" iconRight={<Icon icon={ArrowRight} size={16} />}>
          Browse the shelf
        </ButtonLink>
        <ButtonLink href="/" variant="outline" iconLeft={<Icon icon={ArrowLeft} size={15} />}>
          Back home
        </ButtonLink>
      </div>
    </div>
  );
}
