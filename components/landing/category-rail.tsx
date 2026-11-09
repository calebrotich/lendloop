"use client";

import { ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { Category } from "@/convex/lib/constants";
import { CATEGORY_ART } from "@/components/listing/category-art";
import { Icon } from "@/components/ui/icon";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/options";
import type { ShowcaseListing } from "@/lib/public-listings";

interface CategoryRailProps {
  listings: ShowcaseListing[];
  value: Category | "all";
  onChange: (value: Category | "all") => void;
}

/**
 * Airbnb's category tabs, adapted to a tool shelf: one rail that is both a
 * browse surface and the category filter. Counts are real, not decoration.
 */
export function CategoryRail({ listings, value, onChange }: CategoryRailProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const counts = new Map<Category, number>();
  for (const listing of listings) {
    counts.set(listing.category, (counts.get(listing.category) ?? 0) + 1);
  }

  function updateEdges() {
    const node = scroller.current;
    if (node === null) return;
    setEdges({
      left: node.scrollLeft > 8,
      right: node.scrollLeft + node.clientWidth < node.scrollWidth - 8,
    });
  }

  useEffect(() => {
    updateEdges();
    const node = scroller.current;
    if (node === null) return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(node);
    node.addEventListener("scroll", updateEdges, { passive: true });
    return () => {
      observer.disconnect();
      node.removeEventListener("scroll", updateEdges);
    };
  }, []);

  function scroll(direction: -1 | 1) {
    scroller.current?.scrollBy({ left: direction * 360, behavior: "smooth" });
  }

  // On narrow screens the chosen tab may be off-screen; centre it so the
  // category label the user picked is still visible beside the results.
  useEffect(() => {
    const node = scroller.current;
    if (node === null) return;
    const target = node.querySelector<HTMLElement>(`[data-category="${value}"]`);
    if (target === null) return;
    const left = target.offsetLeft - node.clientWidth / 2 + target.clientWidth / 2;
    node.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [value]);

  return (
    <section id="categories" aria-labelledby="categories-heading" className="">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2
            id="categories-heading"
            className="font-display text-[26px] leading-none text-navy sm:text-[30px]"
          >
            Browse by category
          </h2>
          <p className="mt-2 text-[13px] text-ink-muted">Eight shelves, one neighbourhood.</p>
        </div>

        {(edges.left || edges.right) && (
          <div className="hidden items-center gap-2 md:flex">
            <button
              type="button"
              onClick={() => scroll(-1)}
              disabled={!edges.left}
              aria-label="Scroll categories left"
              className="flex size-9 items-center justify-center rounded-full border border-rule bg-white text-navy transition-colors hover:border-brand/25 disabled:opacity-35"
            >
              <Icon icon={ChevronLeft} size={16} />
            </button>
            <button
              type="button"
              onClick={() => scroll(1)}
              disabled={!edges.right}
              aria-label="Scroll categories right"
              className="flex size-9 items-center justify-center rounded-full border border-rule bg-white text-navy transition-colors hover:border-brand/25 disabled:opacity-35"
            >
              <Icon icon={ChevronRight} size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="relative">
        <div
          ref={scroller}
          className="flex gap-2 overflow-x-auto pb-1 pr-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <CategoryTab
            data-category="all"
            label="All"
            count={listings.length}
            active={value === "all"}
            onClick={() => onChange("all")}
            icon={<Icon icon={LayoutGrid} size={18} />}
            tint="#e0eaf8"
            ink="#1f299c"
          />
          {CATEGORIES.map((category) => {
            const art = CATEGORY_ART[category];
            return (
              <CategoryTab
                key={category}
                data-category={category}
                label={CATEGORY_LABELS[category]}
                count={counts.get(category) ?? 0}
                active={value === category}
                onClick={() => onChange(category)}
                icon={<Icon icon={art.icon} size={18} />}
                tint={art.tint}
                ink={art.ink}
              />
            );
          })}
        </div>
        {edges.right && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 right-0 hidden h-full w-20 bg-gradient-to-l from-white via-white/80 to-transparent md:block"
          />
        )}
      </div>
    </section>
  );
}

function CategoryTab({
  label,
  count,
  active,
  onClick,
  icon,
  tint,
  ink,
  ...props
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  tint: string;
  ink: string;
} & { "data-category": string }) {
  return (
    <button
      type="button"
      {...props}
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label}, ${count} tool${count === 1 ? "" : "s"}`}
      className={`group flex shrink-0 items-center gap-2 rounded-full border py-1 pr-3.5 pl-1 transition-all duration-300 ${
        active
          ? "border-brand bg-brand text-white shadow-[0_8px_24px_-14px_rgb(31_41_156/0.8)]"
          : "border-rule bg-white/70 text-navy hover:-translate-y-0.5 hover:border-brand/20 hover:bg-white"
      }`}
    >
      <span
        className="flex size-7 items-center justify-center rounded-full transition-transform duration-300 group-hover:scale-105"
        style={{
          backgroundColor: active ? "rgba(255,255,255,0.16)" : tint,
          color: active ? "#fff" : ink,
        }}
      >
        {icon}
      </span>
      <span className="text-[12.5px] font-semibold whitespace-nowrap">{label}</span>
    </button>
  );
}
