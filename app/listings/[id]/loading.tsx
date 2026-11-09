import { SiteHeader } from "@/components/site-header";
import { CONTAINER } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function ListingLoading() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className={CONTAINER}>
          <div className="flex items-center gap-2 pt-6">
            <Skeleton className="h-3 w-16 rounded-full" />
            <Skeleton className="h-3 w-14 rounded-full" />
            <Skeleton className="h-3 w-20 rounded-full" />
          </div>

          <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
            <div className="w-full max-w-xl space-y-3">
              <Skeleton className="h-3 w-40 rounded-full" />
              <Skeleton className="h-12 w-4/5 rounded-2xl" />
              <Skeleton className="h-4 w-1/2 rounded-full" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-20 rounded-full" />
              <Skeleton className="h-9 w-20 rounded-full" />
            </div>
          </div>

          <Skeleton className="mt-7 aspect-[16/7] w-full rounded-[26px]" />

          <div className="mt-11 grid gap-12 lg:grid-cols-[minmax(0,1fr)_382px] lg:gap-14">
            <div className="space-y-8">
              <Skeleton className="h-[78px] w-full rounded-[22px]" />
              <div className="space-y-3">
                <Skeleton className="h-8 w-1/2 rounded-xl" />
                <Skeleton className="h-3.5 w-full rounded-full" />
                <Skeleton className="h-3.5 w-11/12 rounded-full" />
                <Skeleton className="h-3.5 w-3/5 rounded-full" />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <Skeleton className="h-20 rounded-2xl" />
                <Skeleton className="h-20 rounded-2xl" />
                <Skeleton className="h-20 rounded-2xl" />
                <Skeleton className="h-20 rounded-2xl" />
              </div>
            </div>
            <Skeleton className="h-[420px] w-full rounded-[28px]" />
          </div>
        </div>
      </main>
    </div>
  );
}
