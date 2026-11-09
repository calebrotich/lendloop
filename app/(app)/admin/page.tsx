import type { Metadata } from "next";

import { AdminPanel } from "@/components/admin-panel";

export const metadata: Metadata = {
  title: "Admin",
  description: "Moderate listings, see every loan, and vouch for neighbours.",
};

export default function AdminPage() {
  return (
    <div className="py-8">
      <header className="max-w-2xl">
        <p className="inline-flex items-center gap-2 text-[10.5px] font-bold tracking-[0.18em] text-brand uppercase">
          <span className="h-px w-6 bg-orange" aria-hidden="true" />
          Operations
        </p>
        <h1 className="font-display mt-3 text-[clamp(2rem,4.5vw,3rem)] leading-[1.02] text-balance text-navy">
          Admin
        </h1>
        <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-muted">
          Moderate listings, see every loan and its booking total, and vouch for neighbours you’d
          lend to again.
        </p>
      </header>
      <AdminPanel />
    </div>
  );
}
