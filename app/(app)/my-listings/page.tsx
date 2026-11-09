import type { Metadata } from "next";

import { MyListings } from "@/components/my-listings";

export const metadata: Metadata = {
  title: "My listings",
  description: "Tools you’re willing to lend. Edit, pause, or take them off the shelf.",
};

export default function MyListingsPage() {
  return (
    <div className="py-8">
      <header className="max-w-2xl">
        <p className="inline-flex items-center gap-2 text-[10.5px] font-bold tracking-[0.18em] text-brand uppercase">
          <span className="h-px w-6 bg-orange" aria-hidden="true" />
          Lending
        </p>
        <h1 className="font-display mt-3 text-[clamp(2rem,4.5vw,3rem)] leading-[1.02] text-balance text-navy">
          My listings
        </h1>
        <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-muted">
          Tools you’re willing to lend, what they cost per day, and when they’re free.
        </p>
      </header>
      <MyListings />
    </div>
  );
}
