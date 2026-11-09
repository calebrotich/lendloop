import type { ReactNode } from "react";

/**
 * LendLoop's loop mark: a link-shaped ring with an orange return segment. The
 * geometry matches the lockup used by the transactional email templates
 * (`public/logo.png` / `logo-v2.png`) so the product and the inbox read as the
 * same brand.
 *
 * The ring is one path with an even-odd hole; the orange segment is a separate
 * left slice. Both are drawn on a 24px grid so the mark sits optically level
 * with Lucide icons.
 */
const RING_PATH =
  "M7 8H17A4 4 0 0 1 21 12A4 4 0 0 1 17 16H7A4 4 0 0 1 3 12A4 4 0 0 1 7 8Z" +
  "M7.5 10.4H16.5A1.6 1.6 0 0 1 18.1 12A1.6 1.6 0 0 1 16.5 13.6H7.5" +
  "A1.6 1.6 0 0 1 5.9 12A1.6 1.6 0 0 1 7.5 10.4Z";

const ORANGE_SLICE =
  "M8.4 8H7A4 4 0 0 0 3 12A4 4 0 0 0 7 16H8.4V13.6H7.5" +
  "A1.6 1.6 0 0 1 5.9 12A1.6 1.6 0 0 1 7.5 10.4H8.4Z";

interface LoopMarkProps {
  className?: string;
  /** Drop the orange segment for watermarks and monochrome contexts. */
  mono?: boolean;
}

export function LoopMark({ className = "", mono = false }: LoopMarkProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d={RING_PATH} fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
      {!mono && <path d={ORANGE_SLICE} fill="#F25929" />}
    </svg>
  );
}

/** The app-icon tile: the loop on the brand-indigo rounded square. */
export function BrandTile({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#1F299C" />
      <g transform="translate(4 4)">
        <path d={RING_PATH} fill="#FFFFFF" fillRule="evenodd" clipRule="evenodd" />
        <path d={ORANGE_SLICE} fill="#F25929" />
      </g>
    </svg>
  );
}

interface BrandProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Renders the wordmark beside the tile. */
  showWordmark?: boolean;
  /** `inverse` paints the wordmark white for the navy footer. */
  tone?: "default" | "inverse";
}

const TILE_SIZE = { sm: "size-6", md: "size-8", lg: "size-10" } as const;
const WORD_SIZE = {
  sm: "text-[15px]",
  md: "text-[19px]",
  lg: "text-[25px]",
} as const;
const WORD_TONE = {
  default: "text-navy",
  inverse: "text-white",
} as const;

export function Brand({
  size = "md",
  className = "",
  showWordmark = true,
  tone = "default",
}: BrandProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandTile className={`${TILE_SIZE[size]} shrink-0`} />
      {showWordmark && (
        <span
          className={`font-sans font-extrabold tracking-[-0.035em] ${WORD_SIZE[size]} ${WORD_TONE[tone]}`}
        >
          LendLoop
        </span>
      )}
    </span>
  );
}

/** The tile on its own, used in avatars, empty states and the loading shell. */
export function BrandBadge({ className = "" }: { className?: string }) {
  return <BrandTile className={`size-12 ${className}`} />;
}

export function Wordmark({
  className = "",
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span className={`font-display leading-[0.95] ${className}`}>{children ?? "LendLoop"}</span>
  );
}
