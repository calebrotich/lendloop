import type { Metadata } from "next";

import { MyListings } from "@/components/my-listings";

export const metadata: Metadata = {
  title: "My listings",
};

export default function MyListingsPage() {
  return (
    <div className="py-8">
      <h1 className="text-2xl font-semibold tracking-tight">My listings</h1>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
        Tools you&apos;re willing to lend. Edit them, pause them, or take them off the shelf.
      </p>
      <MyListings />
    </div>
  );
}
