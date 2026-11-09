"use client";

import { Drill, Hammer, Sprout, CookingPot, TentTree, SprayCan, Car, Boxes } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Category } from "@/convex/lib/constants";
import { CATEGORY_LABELS } from "@/lib/options";

interface CategoryArt {
  icon: LucideIcon;
  tint: string;
  ink: string;
  label: string;
}

/**
 * Each category gets one calm tint and one line icon. These are the fallback
 * "photo" for listings without one, and the visual language of the category
 * rail — so a listing with no photo still looks designed, not broken.
 */
export const CATEGORY_ART: Record<Category, CategoryArt> = {
  power_tools: {
    icon: Drill,
    tint: "#e7ebff",
    ink: "#1f299c",
    label: CATEGORY_LABELS.power_tools,
  },
  hand_tools: {
    icon: Hammer,
    tint: "#e9f3ff",
    ink: "#0373ff",
    label: CATEGORY_LABELS.hand_tools,
  },
  garden: {
    icon: Sprout,
    tint: "#e6f6ff",
    ink: "#0373ff",
    label: CATEGORY_LABELS.garden,
  },
  kitchen: {
    icon: CookingPot,
    tint: "#fff0e9",
    ink: "#c8451b",
    label: CATEGORY_LABELS.kitchen,
  },
  camping: {
    icon: TentTree,
    tint: "#eef0ff",
    ink: "#3b3f9e",
    label: CATEGORY_LABELS.camping,
  },
  cleaning: {
    icon: SprayCan,
    tint: "#eaf6ff",
    ink: "#0b5fd9",
    label: CATEGORY_LABELS.cleaning,
  },
  automotive: {
    icon: Car,
    tint: "#eff1fa",
    ink: "#565b85",
    label: CATEGORY_LABELS.automotive,
  },
  other: {
    icon: Boxes,
    tint: "#f0eefc",
    ink: "#5b4bb7",
    label: CATEGORY_LABELS.other,
  },
};

export function CategoryArtwork({
  category,
  className = "",
  compact = false,
  showLabel = true,
}: {
  category: Category;
  className?: string;
  compact?: boolean;
  showLabel?: boolean;
}) {
  const art = CATEGORY_ART[category];

  return (
    <div
      aria-hidden="true"
      className={`relative flex h-full w-full items-center justify-center overflow-hidden ${className}`}
      style={{ backgroundColor: art.tint }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(115% 90% at 20% 8%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0) 58%), radial-gradient(80% 80% at 92% 100%, ${art.ink}22 0%, transparent 70%)`,
        }}
      />
      <art.icon
        aria-hidden="true"
        className="absolute -right-5 -bottom-7 opacity-[0.13]"
        size={compact ? 148 : 210}
        strokeWidth={1.1}
        color={art.ink}
      />
      {showLabel && (
        <span
          className="absolute top-4 left-4 text-[10px] font-bold tracking-[0.18em] uppercase"
          style={{ color: art.ink }}
        >
          {art.label}
        </span>
      )}
      <art.icon
        aria-hidden="true"
        className="relative opacity-70"
        size={compact ? 30 : 40}
        strokeWidth={1.4}
        color={art.ink}
      />
    </div>
  );
}
