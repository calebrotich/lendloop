import type { Metadata } from "next";

import { IncomingRequests } from "@/components/incoming-requests";

export const metadata: Metadata = {
  title: "Incoming requests",
};

export default function IncomingRequestsPage() {
  return (
    <div className="py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Incoming requests</h1>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
        Neighbours asking for your tools. Approve or decline — the dates stay yours to decide.
      </p>
      <IncomingRequests />
    </div>
  );
}
