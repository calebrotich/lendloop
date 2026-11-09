import { ConvexHttpClient } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { cache } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type Showcase = FunctionReturnType<typeof api.tools.listShowcase>;
type PublicListing = NonNullable<FunctionReturnType<typeof api.tools.getPublicListing>>;

function client(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url === undefined || url === "" ? null : new ConvexHttpClient(url);
}

/**
 * Server reads for the public pages.
 *
 * The public landing and a listing page are useful before sign-in, so they are
 * fetched with `ConvexHttpClient` rather than through Clerk. Both functions are
 * bounded and anonymous on the backend. A failed read degrades to an empty
 * shelf or a 404 — never a stack trace in the page.
 */
export async function loadShowcase(): Promise<Showcase> {
  const convex = client();
  if (convex === null) return [];

  try {
    return await convex.query(api.tools.listShowcase, {});
  } catch (error) {
    console.error("Could not load the public shelf", error);
    return [];
  }
}

export const loadPublicListing = cache(async (toolId: string): Promise<PublicListing | null> => {
  const convex = client();
  if (convex === null) return null;

  try {
    return await convex.query(api.tools.getPublicListing, {
      toolId: toolId as Id<"tools">,
    });
  } catch (error) {
    // An id that is not a valid Convex id, or a listing that disappeared.
    console.warn("Could not load public listing", error);
    return null;
  }
});
