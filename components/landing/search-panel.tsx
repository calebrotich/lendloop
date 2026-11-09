"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, MapPin, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import type { Category } from "@/convex/lib/constants";
import { CATEGORY_ART } from "@/components/listing/category-art";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/options";

type SectionKey = "query" | "category" | "location";
type PanelKey = "category" | "location" | null;

interface SearchPanelProps {
  query: string;
  category: Category | "all";
  onQueryChange: (value: string) => void;
  onCategoryChange: (value: Category | "all") => void;
  onSubmit: () => void;
}

const SPRING = { type: "spring", stiffness: 420, damping: 36, mass: 0.7 } as const;

export function SearchPanel({
  query,
  category,
  onQueryChange,
  onCategoryChange,
  onSubmit,
}: SearchPanelProps) {
  const [active, setActive] = useState<SectionKey | null>(null);
  const [panel, setPanel] = useState<PanelKey>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();
  const panelId = useId();

  function closePanels() {
    setPanel(null);
    setActive(null);
  }

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        closePanels();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        closePanels();
        inputRef.current?.blur();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // The sticky header and footer can both send the user back to search.
  useEffect(() => {
    const focusSearch = () => {
      setActive("query");
      rootRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center",
      });
      window.setTimeout(() => inputRef.current?.focus(), 320);
    };
    window.addEventListener("lendloop:focus-search", focusSearch);
    return () => window.removeEventListener("lendloop:focus-search", focusSearch);
  }, []);

  useEffect(() => {
    if (window.location.hash !== "#search") return;
    const timer = window.setTimeout(() => {
      setActive("query");
      inputRef.current?.focus();
    }, 360);
    return () => window.clearTimeout(timer);
  }, []);

  function submit() {
    onSubmit();
    setActive(null);
    setPanel(null);
    inputRef.current?.blur();
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  }

  const sectionClass = (key: SectionKey) =>
    `group/section relative flex min-w-0 flex-1 cursor-pointer flex-col justify-center rounded-[26px] px-4 py-3 text-left outline-none transition-[background-color,flex-grow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] md:px-5 md:py-2.5 ${
      active === key ? "" : "hover:bg-mist/35"
    }`;

  return (
    <div ref={rootRef} className="relative z-30 w-full">
      <div className="rounded-[32px] border border-white/80 bg-white/95 p-2 shadow-search backdrop-blur-md md:rounded-full">
        <div className="flex flex-col md:flex-row md:items-stretch">
          {/* 1 — the search term ------------------------------------------------ */}
          <div
            className={sectionClass("query")}
            style={{ flexGrow: active === "query" ? 1.55 : 1 }}
            onClick={() => {
              setActive("query");
              setPanel(null);
              inputRef.current?.focus();
            }}
          >
            {active === "query" && <ActivePill reduce={reduce === true} />}
            <span className="relative z-10 text-[11px] font-semibold tracking-[0.02em] text-navy">
              What
            </span>
            <input
              ref={inputRef}
              id="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onFocus={() => {
                setActive("query");
                setPanel(null);
              }}
              onKeyDown={onInputKeyDown}
              placeholder="Drill, ladder, tent…"
              aria-label="Search tools"
              autoComplete="off"
              className="relative z-10 mt-0.5 w-full bg-transparent text-[14px] font-medium text-navy outline-none placeholder:text-ink-muted/85"
            />
          </div>

          <Divider
            active={active === "query"}
            className="mx-4 my-0 h-px md:mx-0 md:my-3 md:h-auto md:w-px"
          />

          {/* 2 — category ------------------------------------------------------- */}
          <div
            className={`${sectionClass("category")} md:min-w-[176px]`}
            style={{ flexGrow: active === "category" ? 1.35 : 1 }}
          >
            {active === "category" && <ActivePill reduce={reduce === true} />}
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={panel === "category"}
              aria-controls={panel === "category" ? panelId : undefined}
              onFocus={() => setActive("category")}
              onClick={() => {
                setActive("category");
                setPanel(panel === "category" ? null : "category");
              }}
              className="relative z-10 flex w-full flex-col items-start text-left"
            >
              <span className="text-[11px] font-semibold tracking-[0.02em] text-navy">
                Category
              </span>
              <span className="mt-0.5 flex w-full items-center justify-between gap-2 text-[14px] font-medium text-navy">
                <span className="truncate">
                  {category === "all" ? "All categories" : CATEGORY_LABELS[category]}
                </span>
                <Icon
                  icon={ChevronDown}
                  size={15}
                  className={`shrink-0 text-ink-muted transition-transform duration-300 ${
                    panel === "category" ? "rotate-180" : ""
                  }`}
                />
              </span>
            </button>

            <AnimatePresence>
              {panel === "category" && (
                <CategoryPanel
                  id={panelId}
                  value={category}
                  onSelect={(next) => {
                    onCategoryChange(next);
                    setPanel(null);
                    setActive(null);
                  }}
                />
              )}
            </AnimatePresence>
          </div>

          <Divider
            active={active === "category"}
            className="mx-4 my-0 h-px md:mx-0 md:my-3 md:h-auto md:w-px"
          />

          {/* 3 — where --------------------------------------------------------- */}
          <div
            className={`${sectionClass("location")} md:min-w-[152px]`}
            style={{ flexGrow: active === "location" ? 1.35 : 1 }}
          >
            {active === "location" && <ActivePill reduce={reduce === true} />}
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={panel === "location"}
              aria-controls={panel === "location" ? `${panelId}-location` : undefined}
              onFocus={() => setActive("location")}
              onClick={() => {
                setActive("location");
                setPanel(panel === "location" ? null : "location");
              }}
              className="relative z-10 flex w-full flex-col items-start text-left"
            >
              <span className="text-[11px] font-semibold tracking-[0.02em] text-navy">Where</span>
              <span className="mt-0.5 flex w-full items-center justify-between gap-2 text-[14px] font-medium text-navy">
                <span className="flex items-center gap-1.5 truncate">
                  <Icon icon={MapPin} size={14} className="shrink-0 text-brand" />
                  Near me
                </span>
                <Icon
                  icon={ChevronDown}
                  size={15}
                  className={`shrink-0 text-ink-muted transition-transform duration-300 ${
                    panel === "location" ? "rotate-180" : ""
                  }`}
                />
              </span>
            </button>

            <AnimatePresence>
              {panel === "location" && (
                <LocationPanel id={`${panelId}-location`} onClose={closePanels} />
              )}
            </AnimatePresence>
          </div>

          {/* Search action ----------------------------------------------------- */}
          <div className="mt-1.5 flex items-stretch gap-2 md:mt-0 md:ml-1 md:items-center">
            <Button
              size="lg"
              aria-label="Search the shelf"
              onClick={submit}
              className="h-[46px] w-full rounded-[24px] px-6 md:size-[50px] md:rounded-full md:px-0"
            >
              <Icon icon={Search} size={19} />
              <span className="md:hidden">Search the shelf</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivePill({ reduce }: { reduce: boolean }) {
  return (
    <motion.span
      layoutId="search-focus"
      aria-hidden="true"
      className="absolute inset-0 rounded-[26px] border border-rule/70 bg-mist/55"
      transition={reduce ? { duration: 0 } : SPRING}
    />
  );
}

function Divider({ active, className = "" }: { active: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`bg-rule transition-opacity duration-300 ${active ? "opacity-0" : "opacity-100"} ${className}`}
    />
  );
}

function CategoryPanel({
  id,
  value,
  onSelect,
}: {
  id: string;
  value: Category | "all";
  onSelect: (value: Category | "all") => void;
}) {
  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.985 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="absolute top-[calc(100%+12px)] left-0 z-50 w-[min(540px,calc(100vw-40px))] rounded-3xl border border-rule bg-white p-2.5 shadow-float"
      role="listbox"
      aria-label="Filter by category"
    >
      <p className="px-2.5 pt-1.5 pb-2 text-[10px] font-bold tracking-[0.16em] text-ink-muted uppercase">
        Browse by category
      </p>
      <div className="grid grid-cols-2 gap-0.5 sm:grid-cols-3">
        <button
          type="button"
          role="option"
          aria-selected={value === "all"}
          onClick={() => onSelect("all")}
          className={`col-span-2 flex items-center justify-between rounded-xl px-2.5 py-2.5 text-left text-sm font-medium transition-colors sm:col-span-3 ${
            value === "all" ? "bg-mist/70 text-brand" : "text-navy hover:bg-page"
          }`}
        >
          <span className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-full bg-mist text-brand">
              <Icon icon={Search} size={14} />
            </span>
            All categories
          </span>
          {value === "all" && <Icon icon={Check} size={16} className="text-brand" />}
        </button>

        {CATEGORIES.map((option) => {
          const art = CATEGORY_ART[option];
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelect(option)}
              className={`flex items-center justify-between gap-2 rounded-xl px-2 py-2 text-left text-[12.5px] font-medium transition-colors ${
                selected ? "bg-mist/70 text-brand" : "text-navy hover:bg-page"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: art.tint, color: art.ink }}
                >
                  <Icon icon={art.icon} size={14} />
                </span>
                <span className="truncate">{CATEGORY_LABELS[option]}</span>
              </span>
              {selected && <Icon icon={Check} size={15} className="shrink-0 text-brand" />}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

function LocationPanel({ id, onClose }: { id: string; onClose: () => void }) {
  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.985 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="absolute top-[calc(100%+14px)] right-0 z-50 w-[min(340px,calc(100vw-40px))] rounded-3xl border border-rule bg-white p-2.5 shadow-float"
      role="listbox"
      aria-label="Choose a location"
    >
      <div className="flex items-center justify-between px-2.5 pt-1.5 pb-2">
        <p className="text-[10px] font-bold tracking-[0.16em] text-ink-muted uppercase">Where</p>
        <button
          type="button"
          onClick={onClose}
          className="flex size-6 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-page hover:text-navy"
          aria-label="Close location options"
        >
          <Icon icon={X} size={14} />
        </button>
      </div>
      <button
        type="button"
        role="option"
        aria-selected
        onClick={onClose}
        className="flex w-full items-center justify-between gap-3 rounded-xl bg-mist/70 px-3 py-3 text-left"
      >
        <span className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-full bg-brand text-white">
            <Icon icon={MapPin} size={15} />
          </span>
          <span>
            <span className="block text-sm font-semibold text-navy">Near me</span>
            <span className="mt-0.5 block text-[11px] text-ink-muted">
              Tools on shelves around you
            </span>
          </span>
        </span>
        <Icon icon={Check} size={16} className="text-brand" />
      </button>
      <p className="px-3 py-3 text-[11px] leading-relaxed text-ink-muted">
        LendLoop is a neighbourhood shelf, so every listing is nearby.
      </p>
    </motion.div>
  );
}
