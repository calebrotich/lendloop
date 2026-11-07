import type { Metadata } from "next";

import { MyRequests } from "@/components/my-requests";

export const metadata: Metadata = {
  title: "My requests",
};

export default function MyRequestsPage() {
  return (
    <div className="py-8">
      <h1 className="text-2xl font-semibold tracking-tight">My requests</h1>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
        Everything you&apos;ve asked to borrow, and where it stands.
      </p>
      <MyRequests />
    </div>
  );
}
