import { ConvexHttpClient } from "convex/browser";

import { api } from "@/convex/_generated/api";
import type { Category } from "@/convex/lib/constants";
import { ToolCard } from "@/components/tool-card";

interface ShelfTool {
  name: string;
  category: Category;
  images: {
    imageCount: number;
    cover: { url: string; width: number; height: number } | null;
  };
}

type Shelf =
  | { status: "ok"; tools: ShelfTool[] }
  | { status: "empty" }
  | { status: "unconfigured" }
  | { status: "error" };

/**
 * Server-side read of the public projection.
 *
 * `ConvexHttpClient` rather than the React hook: this list has no interactions,
 * so it belongs in the server render, not in a client bundle. The page is
 * dynamic (Clerk reads the session), so each request gets a fresh shelf.
 */
async function loadShelf(): Promise<Shelf> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (url === undefined || url === "") return { status: "unconfigured" };

  try {
    const client = new ConvexHttpClient(url);
    const tools = await client.query(api.tools.listPublic, {});
    return tools.length === 0 ? { status: "empty" } : { status: "ok", tools };
  } catch (error) {
    // Visible in the server log; the page shows a neutral message, never internals.
    console.error("Could not load the public tool shelf", error);
    return { status: "error" };
  }
}

export async function ToolShelf() {
  const shelf = await loadShelf();

  switch (shelf.status) {
    case "unconfigured":
      return (
        <ShelfNotice title="The shelf is not connected yet." body="Set up Convex and reload." />
      );
    case "error":
      return (
        <ShelfNotice
          title="The shelf didn’t load."
          body="It’s probably temporary — refresh to try again."
        />
      );
    case "empty":
      return (
        <ShelfNotice
          title="No tools listed yet."
          body="The shelf is ready; the first neighbour hasn’t filled it."
        />
      );
    case "ok":
      return (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shelf.tools.map((tool, index) => (
            <ToolCard key={`${tool.category}-${tool.name}-${index}`} {...tool} />
          ))}
        </ul>
      );
  }
}

function ShelfNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-5 rounded-xl border border-dashed border-line px-5 py-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-ink-muted">{body}</p>
    </div>
  );
}
