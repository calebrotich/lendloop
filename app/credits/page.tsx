import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { CONTAINER } from "@/components/ui/container";
import { IMAGE_CREDITS } from "@/lib/image-credits";

export const metadata: Metadata = {
  title: "Photo credits",
  description: "Attribution for the photography used on LendLoop listings.",
};

/**
 * Attribution for every seeded listing photo.
 *
 * The photos are representative images of the item type, not the exact unit on
 * loan — the seed listings are illustrative. Most are public domain or CC0, but
 * some are CC BY / CC BY-SA, which require the credit shown here.
 */
export default function CreditsPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main id="main" className="flex-1">
        <section className={`${CONTAINER} pt-14 pb-10 sm:pt-20`}>
          <p className="text-[10.5px] font-bold tracking-[0.16em] text-brand uppercase">
            Attribution
          </p>
          <h1 className="font-display mt-3 max-w-2xl text-[40px] leading-[1.02] text-balance text-navy sm:text-[52px]">
            Photo credits
          </h1>
          <p className="mt-5 max-w-2xl text-[14.5px] leading-relaxed text-ink-muted">
            Listing photography comes from Wikimedia Commons and is used under the licence shown
            beneath each image. Photos are representative of the item type rather than the exact
            item being lent, and were resized and converted to WebP; those converted copies keep the
            source licence. If you own a photo and would like it removed, contact the LendLoop
            operator and it will be taken down.
          </p>
          <p className="mt-3 text-[13px] text-ink-muted">
            {IMAGE_CREDITS.length} photographs ·{" "}
            <Link href="/" className="font-semibold text-brand underline-offset-4 hover:underline">
              Back to the shelf
            </Link>
          </p>
        </section>

        <section className={`${CONTAINER} pb-20`}>
          <ul className="divide-y divide-line/60 border-y border-line/60">
            {IMAGE_CREDITS.map((credit) => (
              <li key={credit.source + credit.title} className="py-3.5">
                <p className="text-[13.5px] font-medium break-words text-navy">
                  {credit.source !== "" ? (
                    <a
                      href={credit.source}
                      target="_blank"
                      rel="noreferrer"
                      className="underline-offset-4 hover:underline"
                    >
                      {credit.title}
                    </a>
                  ) : (
                    credit.title
                  )}
                </p>
                <p className="mt-1 text-[12px] text-ink-muted">
                  {credit.artist !== "" ? `${credit.artist} · ` : ""}
                  {credit.licenseUrl !== "" ? (
                    <a
                      href={credit.licenseUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline-offset-4 hover:underline"
                    >
                      {credit.license}
                    </a>
                  ) : (
                    credit.license
                  )}{" "}
                  · Wikimedia Commons
                </p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
