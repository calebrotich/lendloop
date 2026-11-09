import type { Metadata } from "next";

import { NotFoundPanel } from "@/components/not-found-panel";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <NotFoundPanel
          title="This page wandered off"
          body="The address might be wrong, or the page has moved. The shelf is still exactly where you left it."
        />
      </main>
      <SiteFooter />
    </div>
  );
}
