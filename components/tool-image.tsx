"use client";

import { ImageOff } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { Icon } from "@/components/ui/icon";

export interface ToolImageProps {
  src: string | null;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  preload?: boolean;
  sizes?: string;
}

const DEFAULT_SIZES = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw";

/**
 * Listing media through `next/image`.
 *
 * R2 stays the origin, but Next now does the per-device work: a card requests a
 * ~400px AVIF instead of a 2048px JPEG, and the optimiser caches the result at
 * the edge for a week. Local blob previews (the upload tray) bypass the
 * optimiser because there is no URL to fetch.
 */
export function ToolImage({
  src,
  alt,
  width,
  height,
  className,
  preload = false,
  sizes = DEFAULT_SIZES,
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
        <Icon icon={ImageOff} size={26} className="opacity-70" />
      </div>
    );
  }

  const isLocalPreview = src.startsWith("blob:") || src.startsWith("data:");

  if (isLocalPreview) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- An object URL has no optimiser input.
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={preload ? "eager" : "lazy"}
        decoding="async"
        onError={() => setFailedSrc(src)}
        className={className}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width ?? 1200}
      height={height ?? 900}
      sizes={sizes}
      preload={preload}
      decoding="async"
      onError={() => setFailedSrc(src)}
      className={className}
    />
  );
}
