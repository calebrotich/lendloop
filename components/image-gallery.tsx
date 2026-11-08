"use client";

import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";

import { ToolImage } from "@/components/tool-image";

export interface GalleryCover {
  url: string;
  width: number;
  height: number;
}

export interface ImageGalleryProps {
  toolId: Id<"tools">;
  name: string;
  cover: GalleryCover | null;
  imageCount: number;
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function ArrowIcon({ direction }: { direction: "previous" | "next" }) {
  return (
    <svg
      aria-hidden="true"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
    >
      {direction === "previous" ? <path d="m15 6-6 6 6 6" /> : <path d="m9 6 6 6-6 6" />}
    </svg>
  );
}

/**
 * Cover image that opens a native <dialog> gallery.
 *
 * The full list is fetched lazily, only once the viewer opens, so a browse page
 * with sixty listings does not read every photo row up front. A native dialog
 * gives focus trapping, Escape-to-close and an inert background for free.
 */
export function ImageGallery({ toolId, name, cover, imageCount }: ImageGalleryProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const images = useQuery(api.toolImages.listForTool, open ? { toolId } : "skip");
  const currentIndex =
    images === undefined || images.length === 0 ? 0 : Math.min(index, images.length - 1);
  const current = images?.[currentIndex] ?? null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const move = (delta: number) => {
    if (images === undefined || images.length < 2) return;
    setIndex((current) => (current + delta + images.length) % images.length);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIndex(0);
          setOpen(true);
        }}
        className="group relative block w-full overflow-hidden bg-surface text-left"
        aria-label={`View ${imageCount} ${imageCount === 1 ? "photo" : "photos"} of ${name}`}
      >
        <ToolImage
          src={cover?.url ?? null}
          alt={name}
          width={cover?.width}
          height={cover?.height}
          className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
        {imageCount > 1 && (
          <span className="absolute right-2.5 bottom-2.5 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
            {imageCount} photos
          </span>
        )}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            move(-1);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            move(1);
          }
        }}
        aria-label={`Photos of ${name}`}
        className="m-auto w-[min(94vw,62rem)] max-w-none rounded-2xl border border-line bg-surface-raised p-0 text-ink shadow-xl backdrop:bg-black/70"
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
          <p className="min-w-0 truncate text-sm font-medium">{name}</p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full border border-line p-1.5 text-ink-muted transition-colors hover:text-ink"
            aria-label="Close photo viewer"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="relative flex min-h-[18rem] items-center justify-center bg-black/5">
          {images === undefined ? (
            <p className="py-24 text-sm text-ink-muted">Loading photos…</p>
          ) : images.length === 0 ? (
            <p className="py-24 text-sm text-ink-muted">No photos on this listing.</p>
          ) : (
            <ToolImage
              src={current?.url ?? null}
              alt={`${name}, photo ${currentIndex + 1} of ${images.length}`}
              width={current?.width}
              height={current?.height}
              className="max-h-[70vh] w-full object-contain"
            />
          )}

          {images !== undefined && images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => move(-1)}
                aria-label="Previous photo"
                className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white transition-colors hover:bg-black/75"
              >
                <ArrowIcon direction="previous" />
              </button>
              <button
                type="button"
                onClick={() => move(1)}
                aria-label="Next photo"
                className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white transition-colors hover:bg-black/75"
              >
                <ArrowIcon direction="next" />
              </button>
              <span
                aria-live="polite"
                className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2.5 py-0.5 text-xs text-white"
              >
                {currentIndex + 1} of {images.length}
              </span>
            </>
          )}
        </div>

        {images !== undefined && images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto border-t border-line p-3">
            {images.map((image, imageIndex) => (
              <button
                key={image._id}
                type="button"
                onClick={() => setIndex(imageIndex)}
                aria-label={`Show photo ${imageIndex + 1}`}
                aria-current={imageIndex === currentIndex}
                className={`shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                  imageIndex === currentIndex ? "border-accent" : "border-transparent"
                }`}
              >
                <ToolImage
                  src={image.url}
                  alt=""
                  width={image.width}
                  height={image.height}
                  className="h-14 w-20 object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </dialog>
    </>
  );
}
