"use client";

import { Check, Heart, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Icon } from "@/components/ui/icon";
import { useSavedListing } from "@/lib/use-saved-listing";

export function ListingActions({ id, name }: { id: string; name: string }) {
  const { saved, toggle } = useSavedListing(id);

  async function share() {
    const url = window.location.href;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: `${name} on LendLoop`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", { description: "Send it to the neighbour who needs it." });
    } catch (error) {
      // A cancelled share sheet is not an error; anything else gets a fallback.
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Couldn’t share the link", { description: "Copy the address from the bar." });
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={share}
        className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[13px] font-medium text-ink-muted transition-colors hover:bg-white hover:text-navy"
      >
        <Icon icon={Share2} size={16} />
        Share
      </button>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={saved}
        className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[13px] font-medium text-ink-muted transition-colors hover:bg-white hover:text-navy"
      >
        <Icon icon={saved ? Check : Heart} size={16} className={saved ? "text-orange" : ""} />
        {saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
