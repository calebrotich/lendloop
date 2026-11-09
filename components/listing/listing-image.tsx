"use client";

import Image from "next/image";
import { useState } from "react";

import type { Category } from "@/convex/lib/constants";
import { CategoryArtwork } from "@/components/listing/category-art";

interface ListingImageProps {
  src: string | null;
  alt: string;
  category: Category;
  width?: number;
  height?: number;
  className?: string;
  /** Above-the-fold covers load eagerly. */
  priority?: boolean;
  compactArt?: boolean;
  showArtLabel?: boolean;
  /** Responsive hint for the browser's srcset choice. */
  sizes?: string;
}

const DEFAULT_SIZES = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw";

/**
 * A listing photo with a designed fallback and a quiet loading state.
 *
 * `next/image` handles the per-viewport resize and AVIF/WebP conversion; R2
 * remains the origin. The skeleton sits underneath so there is no layout hole,
 * and the category artwork covers a missing or broken photo.
 */
export function ListingImage({
  src,
  alt,
  category,
  width,
  height,
  className = "",
  priority = false,
  compactArt = false,
  showArtLabel = true,
  sizes = DEFAULT_SIZES,
}: ListingImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const usable = src !== null && failedSrc !== src;

  return (
    <div className={`relative overflow-hidden bg-mist/60 ${className}`}>
      {usable ? (
        <>
          <div aria-hidden="true" className="skeleton absolute inset-0" />
          <Image
            src={src}
            alt={alt}
            width={width ?? 1200}
            height={height ?? 900}
            sizes={sizes}
            priority={priority}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            onError={() => setFailedSrc(src)}
            className="image-in h-full w-full object-cover"
          />
        </>
      ) : (
        <CategoryArtwork category={category} compact={compactArt} showLabel={showArtLabel} />
      )}
    </div>
  );
}
