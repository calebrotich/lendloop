import type { Metadata } from "next";

import { AdminPanel } from "@/components/admin-panel";

export const metadata: Metadata = {
  title: "Admin",
};

export default function AdminPage() {
  return (
    <div className="py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
        Moderate listings, see every loan, and vouch for neighbours you&apos;d lend to again.
      </p>
      <AdminPanel />
    </div>
  );
}
