"use client";

import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import type { Category } from "@/convex/lib/constants";
import { CategoryArtwork } from "@/components/listing/category-art";
import { Icon } from "@/components/ui/icon";

type GalleryImage = { url: string | null; width: number; height: number };

interface ListingGalleryProps {
  images: GalleryImage[];
  name: string;
  category: Category;
}

const IMAGE_BUTTON =
  "group relative h-full w-full overflow-hidden bg-mist/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/**
 * Airbnb-style photo mosaic. One cover, up to two supporting frames, and a
 * full-screen viewer for the rest. With no photos, the category artwork is the
 * frame — a listing never gets a grey hole where a picture should be.
 */
export function ListingGallery({ images, name, category }: ListingGalleryProps) {
  const photos = images.filter(
    (image): image is { url: string; width: number; height: number } => image.url !== null,
  );
  const [open, setOpen] = useState<number | null>(null);

  if (photos.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-[26px] border border-rule/70">
        <div className="aspect-[16/9] max-h-[520px] w-full">
          <CategoryArtwork category={category} className="h-full" />
        </div>
        <p className="absolute bottom-4 left-4 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-medium text-ink-muted shadow-sm backdrop-blur-sm">
          No photos yet — the owner can add them anytime
        </p>
      </div>
    );
  }

  const cover = photos[0];
  const side = photos.slice(1, 3);

  return (
    <>
      {/* Desktop mosaic */}
      <div className="hidden overflow-hidden rounded-[26px] border border-rule/60 md:block">
        <div className="grid h-[420px] grid-cols-3 grid-rows-2 gap-1.5 lg:h-[480px]">
          <button
            type="button"
            onClick={() => setOpen(0)}
            className={`${IMAGE_BUTTON} ${
              side.length === 0 ? "col-span-3 row-span-2" : "col-span-2 row-span-2"
            }`}
            aria-label={`Open photo 1 of ${photos.length}`}
          >
            <Image
              src={cover?.url ?? ""}
              alt={`${name} — photo 1`}
              width={cover?.width ?? 1200}
              height={cover?.height ?? 900}
              sizes="(max-width: 768px) 100vw, 66vw"
              priority
              className="h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.02]"
            />
          </button>
          {side.map((photo, index) => (
            <button
              key={photo.url}
              type="button"
              onClick={() => setOpen(index + 1)}
              className={`${IMAGE_BUTTON} ${side.length === 1 ? "row-span-2" : "row-span-1"}`}
              aria-label={`Open photo ${index + 2} of ${photos.length}`}
            >
              <Image
                src={photo.url}
                alt={`${name} — photo ${index + 2}`}
                width={photo.width}
                height={photo.height}
                sizes="33vw"
                className="h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.02]"
              />
            </button>
          ))}
        </div>
      </div>

      {/* Mobile peek carousel */}
      <div className="relative md:hidden">
        <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {photos.map((photo, index) => (
            <button
              key={photo.url}
              type="button"
              onClick={() => setOpen(index)}
              className="relative aspect-[4/3] w-[92%] shrink-0 snap-center overflow-hidden rounded-[22px] border border-rule/60 bg-mist/30"
              aria-label={`Open photo ${index + 1} of ${photos.length}`}
            >
              <Image
                src={photo.url}
                alt={`${name} — photo ${index + 1}`}
                width={photo.width}
                height={photo.height}
                sizes="92vw"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
        <span className="absolute top-3 right-3 rounded-full bg-navy/70 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
          {photos.length} photo{photos.length === 1 ? "" : "s"}
        </span>
      </div>

      {photos.length > 1 && (
        <div className="mt-4 hidden justify-end md:flex">
          <button
            type="button"
            onClick={() => setOpen(0)}
            className="inline-flex items-center gap-2 rounded-full border border-rule bg-white px-3.5 py-2 text-[12px] font-semibold text-navy shadow-soft transition-colors hover:border-brand/25 hover:text-brand"
          >
            <Icon icon={Expand} size={14} />
            Show all {photos.length} photos
          </button>
        </div>
      )}

      <AnimatePresence>
        {open !== null && (
          <Lightbox
            photos={photos}
            name={name}
            index={open}
            onIndex={setOpen}
            onClose={() => setOpen(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function trapFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((node) => node.offsetParent !== null);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (first === undefined || last === undefined) return;

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function Lightbox({
  photos,
  name,
  index,
  onIndex,
  onClose,
}: {
  photos: Array<{ url: string; width: number; height: number }>;
  name: string;
  index: number;
  onIndex: (next: number) => void;
  onClose: () => void;
}) {
  const photo = photos[index];

  useEffect(() => {
    const opener = document.activeElement;
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") onIndex((index + 1) % photos.length);
      if (event.key === "ArrowLeft") onIndex((index - 1 + photos.length) % photos.length);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [index, onClose, onIndex, photos.length]);

  if (photo === undefined) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex flex-col bg-navy p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${name} photos`}
      onKeyDown={trapFocus}
    >
      <div className="flex items-center justify-between text-white">
        <p className="text-[12px] font-medium text-white/70 tabular-nums">
          {index + 1} / {photos.length}
        </p>
        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          aria-label="Close photos"
        >
          <Icon icon={X} size={20} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center py-4">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={photo.url}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.99 }}
            transition={{ duration: 0.25 }}
            className="relative h-full w-full"
          >
            <Image
              src={photo.url}
              alt={`${name} — photo ${index + 1}`}
              fill
              sizes="100vw"
              className="rounded-2xl object-contain drop-shadow-2xl"
            />
          </motion.div>
        </AnimatePresence>

        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => onIndex((index - 1 + photos.length) % photos.length)}
              aria-label="Previous photo"
              className="absolute top-1/2 left-0 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            >
              <Icon icon={ChevronLeft} size={20} />
            </button>
            <button
              type="button"
              onClick={() => onIndex((index + 1) % photos.length)}
              aria-label="Next photo"
              className="absolute top-1/2 right-0 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            >
              <Icon icon={ChevronRight} size={20} />
            </button>
          </>
        )}
      </div>

      <div className="flex justify-center gap-2 overflow-x-auto pb-2">
        {photos.map((item, itemIndex) => (
          <button
            key={item.url}
            type="button"
            onClick={() => onIndex(itemIndex)}
            aria-label={`Go to photo ${itemIndex + 1}`}
            aria-current={itemIndex === index}
            className={`h-12 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-opacity ${
              itemIndex === index
                ? "border-white opacity-100"
                : "border-transparent opacity-55 hover:opacity-90"
            }`}
          >
            <Image
              src={item.url}
              alt=""
              width={64}
              height={48}
              sizes="64px"
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>
    </motion.div>
  );
}
