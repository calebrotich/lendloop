"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

const STORAGE_KEY = "lendloop:saved-listings";
const SYNC_EVENT = "lendloop:saved-listings-changed";

function readSaved(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeSaved(ids: string[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, 100)));
  window.dispatchEvent(new Event(SYNC_EVENT));
}

/**
 * Saving is local and quiet: no account needed to keep a shortlist while
 * browsing. It is deliberately not a backend feature yet — a saved listing is
 * a browsing aid, not an entitlement.
 */
export function useSavedListing(id: string) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const sync = () => setSaved(readSaved().includes(id));
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(SYNC_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(SYNC_EVENT, sync);
    };
  }, [id]);

  function toggle() {
    const ids = readSaved();
    const isSaved = ids.includes(id);
    writeSaved(isSaved ? ids.filter((value) => value !== id) : [...ids, id]);
    setSaved(!isSaved);
    toast(isSaved ? "Removed from your list" : "Saved to your list", {
      description: isSaved ? undefined : "Find it again on this device.",
      duration: 2400,
    });
  }

  return { saved, toggle };
}
