"use client";

import { useState } from "react";

function PhotoIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
    >
      <rect width="16" height="16" x="4" y="4" rx="2" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="m4 17 4.5-4.5a2 2 0 0 1 2.8 0L20 20" />
    </svg>
  );
}

export interface ToolImageProps {
  src: string | null;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  /** Above-the-fold images should not be lazy. */
  priority?: boolean;
}

/**
 * A plain <img> on purpose: R2 already sits behind a CDN with a bounded cache,
 * and the stored width/height prevent layout shift. Routing these through the
 * Next image optimiser would add a second cache and a per-image bill for no
 * gain. The lint rule is disabled with that trade-off documented.
 */
export function ToolImage({
  src,
  alt,
  width,
  height,
  className,
  priority = false,
}: ToolImageProps) {
  // Track which source failed so navigating to a different photo in the gallery
  // does not inherit the previous broken-image state.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = src !== null && failedSrc === src;

  if (src === null || failed) {
    return (
      <div
        aria-label={alt}
        role="img"
        className={`flex items-center justify-center bg-surface text-ink-muted/60 ${className ?? ""}`}
      >
        <PhotoIcon className="size-7" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- R2 is the CDN; see comment above.
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailedSrc(src)}
      className={className}
    />
  );
}
