import type { Metadata } from "next";

import { BrowseTools } from "@/components/browse-tools";

export const metadata: Metadata = {
  title: "Browse tools",
};

export default function ToolsPage() {
  return (
    <div className="py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Browse tools</h1>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
        What neighbours are lending right now. Pick a tool, choose your dates, and ask.
      </p>
      <BrowseTools />
    </div>
  );
}
