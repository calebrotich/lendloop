import type { LucideIcon, LucideProps } from "lucide-react";

/** One optical weight for every icon in the product. */
export const ICON_STROKE = 1.75;

interface IconProps extends Omit<LucideProps, "ref"> {
  icon: LucideIcon;
  /** Describe the icon when it carries meaning; omit when it is decorative. */
  label?: string;
}

/**
 * The only icon wrapper in the app. Lucide icons are stroke-based; keeping the
 * stroke, size and cap style here stops the UI drifting into mixed icon sets.
 */
export function Icon({
  icon: Glyph,
  label,
  size = 18,
  strokeWidth = ICON_STROKE,
  ...props
}: IconProps) {
  return (
    <Glyph
      aria-hidden={label === undefined ? true : undefined}
      aria-label={label}
      role={label === undefined ? undefined : "img"}
      size={size}
      strokeWidth={strokeWidth}
      absoluteStrokeWidth
      {...props}
    />
  );
}
