"use client";

import { useQuery } from "convex/react";
import { useReducedMotion } from "motion/react";
import { useDeferredValue, useMemo, useState } from "react";
import posthog from "posthog-js";

import { api } from "@/convex/_generated/api";
import type { Category } from "@/convex/lib/constants";
import { CategoryRail } from "@/components/landing/category-rail";
import { Hero } from "@/components/landing/hero";
import { ListingShelf } from "@/components/landing/listing-shelf";
import { SearchPanel } from "@/components/landing/search-panel";
import { CONTAINER } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";
import { CATEGORY_LABELS } from "@/lib/options";
import { pickFeaturedListings, type ShowcaseListing } from "@/lib/public-listings";

interface LandingExperienceProps {
  initialListings: ShowcaseListing[];
  initialQuery: string;
  initialCategory: Category | "all";
}

export function LandingExperience({
  initialListings,
  initialQuery,
  initialCategory,
}: LandingExperienceProps) {
  const live = useQuery(api.tools.listShowcase);
  const listings = live ?? initialListings;
  const loading = live === undefined && initialListings.length === 0;

  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<Category | "all">(initialCategory);
  const deferredQuery = useDeferredValue(query);
  const reduce = useReducedMotion();
  const featured = useMemo(() => pickFeaturedListings(listings), [listings]);

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return listings.filter((listing) => {
      if (category !== "all" && listing.category !== category) return false;
      if (needle === "") return true;
      const haystack = [listing.name, listing.description, CATEGORY_LABELS[listing.category]]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [listings, category, deferredQuery]);

  function syncUrl(nextCategory: Category | "all", nextQuery: string) {
    const params = new URLSearchParams();
    if (nextQuery.trim() !== "") params.set("q", nextQuery.trim());
    if (nextCategory !== "all") params.set("category", nextCategory);
    const search = params.toString();
    window.history.replaceState(null, "", search === "" ? "/" : `/?${search}`);
  }

  function scrollToShelf() {
    document.getElementById("shelf")?.scrollIntoView({
      behavior: reduce === true ? "auto" : "smooth",
      block: "start",
    });
  }

  // Keep the category tabs in view when the results are shown. Scrolling to the
  // shelf heading alone leaves the filter behind, which makes the result feel
  // disconnected from the choice that produced it.
  function scrollToCategories() {
    document.getElementById("categories")?.scrollIntoView({
      behavior: reduce === true ? "auto" : "smooth",
      block: "start",
    });
  }

  function submitSearch() {
    posthog.capture("listing_search_submitted", {
      category,
      has_query: query.trim() !== "",
      result_count: filtered.length,
    });
    syncUrl(category, query);
    scrollToShelf();
  }

  function changeCategory(next: Category | "all") {
    setCategory(next);
    syncUrl(next, query);
    // Let the filtered grid settle before scrolling; a layout change during the
    // smooth scroll can otherwise leave the rail halfway down the viewport.
    window.setTimeout(scrollToCategories, 380);
  }

  function selectCategoryFromHero(next: Category) {
    changeCategory(next);
    // Hand keyboard focus to the active tab once the smooth scroll has arrived,
    // instead of leaving it on a hero card that is now off screen.
    window.setTimeout(() => {
      const tab = document.querySelector<HTMLElement>(`[data-category="${CSS.escape(next)}"]`);
      tab?.focus({ preventScroll: true });
    }, 440);
  }

  function clearFilters() {
    setQuery("");
    setCategory("all");
    window.history.replaceState(null, "", "/");
    scrollToShelf();
  }

  return (
    <>
      <Hero
        listings={featured}
        onCategorySelect={selectCategoryFromHero}
        search={
          <SearchPanel
            query={query}
            category={category}
            onQueryChange={setQuery}
            onCategoryChange={changeCategory}
            onSubmit={submitSearch}
          />
        }
      />

      <div className={CONTAINER}>
        <Reveal>
          <div className="rounded-[30px] border border-white bg-white/65 p-3.5 shadow-soft backdrop-blur-sm sm:p-5">
            <CategoryRail listings={listings} value={category} onChange={changeCategory} />
          </div>
        </Reveal>

        <div className="mt-14 sm:mt-16">
          <ListingShelf
            listings={filtered}
            total={listings.length}
            loading={loading}
            category={category}
            query={query}
            onClear={clearFilters}
          />
        </div>
      </div>
    </>
  );
}
