import type { Metadata } from "next";

import { NotFoundPanel } from "@/components/not-found-panel";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Listing not found",
};

export default function ListingNotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <NotFoundPanel />
      </main>
      <SiteFooter />
    </div>
  );
}
