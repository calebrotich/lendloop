import type { ReactNode } from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-xl ${className}`} />;
}

export function SkeletonText({
  lines = 2,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className={`skeleton h-3 rounded-full ${index === lines - 1 ? "w-2/3" : "w-full"}`}
        />
      ))}
    </div>
  );
}

/** Used while a shelf or search result is live-loading. */
export function ListingCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <div aria-hidden="true" style={{ animationDelay: `${index * 60}ms` }}>
      <Skeleton className="aspect-[4/3] w-full rounded-[20px]" />
      <div className="mt-3.5 flex items-start justify-between gap-3 px-0.5">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3 rounded-full" />
          <Skeleton className="h-3 w-1/2 rounded-full" />
        </div>
        <Skeleton className="h-6 w-14 rounded-full" />
      </div>
      <Skeleton className="mt-2 ml-0.5 h-3 w-1/3 rounded-full" />
    </div>
  );
}

export function ShelfSkeleton({
  count = 4,
  label = "Loading the shelf",
}: {
  count?: number;
  label?: string;
}) {
  return (
    <div role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div className="grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, index) => (
          <ListingCardSkeleton key={index} index={index} />
        ))}
      </div>
    </div>
  );
}

export function PageSkeleton({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1280px] px-5 pt-28 sm:px-8">{children}</div>;
}
