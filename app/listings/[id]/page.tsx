import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ListingDetail } from "@/components/listing/listing-detail";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { loadPublicListing, loadShowcase } from "@/lib/public-api";

export const dynamic = "force-dynamic";

interface ListingPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ListingPageProps): Promise<Metadata> {
  const { id } = await params;
  const listing = await loadPublicListing(id);

  // Fail in metadata, before the response starts streaming, so a missing
  // listing is a real 404 rather than a 200 with a not-found body.
  if (listing === null) notFound();

  const description = listing.description.slice(0, 150);
  const image = listing.images.find(
    (photo): photo is { url: string; width: number; height: number } => photo.url !== null,
  )?.url;

  return {
    title: listing.name,
    description,
    openGraph: {
      title: `${listing.name} on LendLoop`,
      description,
      type: "website",
      ...(image === undefined ? {} : { images: [{ url: image, alt: listing.name }] }),
    },
  };
}

export default async function ListingPage({ params }: ListingPageProps) {
  const { id } = await params;
  const listing = await loadPublicListing(id);
  if (listing === null) notFound();

  const shelf = await loadShowcase();
  const candidates = shelf.filter((item) => item._id !== listing._id);
  const related = [
    ...candidates.filter((item) => item.category === listing.category),
    ...candidates.filter((item) => item.category !== listing.category),
  ].slice(0, 3);

  return (
    <div id="top" className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100]"
      >
        Skip to content
      </a>

      <SiteHeader />

      <main id="main" className="flex-1 pb-6">
        <ListingDetail listing={listing} related={related} />
      </main>

      <SiteFooter />
    </div>
  );
}
