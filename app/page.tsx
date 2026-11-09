import type { Metadata } from "next";

import type { Category } from "@/convex/lib/constants";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LandingExperience } from "@/components/landing/landing-experience";
import { LendCta } from "@/components/landing/lend-cta";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { loadShowcase } from "@/lib/public-api";
import { CATEGORIES } from "@/lib/options";

// The header reads the Clerk session, and the shelf is live data.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "LendLoop — Borrow what you need. Lend what you don’t.",
  description:
    "A shared shelf for your street. Borrow drills, ladders, camping gear and more from neighbours — clear daily rates, dates that work.",
};

const CATEGORY_SET = new Set<string>(CATEGORIES);

function parseCategory(value: string | string[] | undefined): Category | "all" {
  return typeof value === "string" && CATEGORY_SET.has(value) ? (value as Category) : "all";
}

function parseQuery(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.slice(0, 100) : "";
}

interface HomeProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HomePage({ searchParams }: HomeProps) {
  const [params, listings] = await Promise.all([searchParams, loadShowcase()]);

  return (
    <div id="top" className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100]"
      >
        Skip to content
      </a>

      <SiteHeader />

      <main id="main" className="flex-1">
        <LandingExperience
          initialListings={listings}
          initialQuery={parseQuery(params.q)}
          initialCategory={parseCategory(params.category)}
        />

        <div className="mt-20 sm:mt-24">
          <HowItWorks />
        </div>
        <LendCta />
      </main>

      <SiteFooter />
    </div>
  );
}
