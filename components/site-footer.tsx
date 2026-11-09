import Link from "next/link";

import { Brand } from "@/components/ui/brand";
import { CONTAINER } from "@/components/ui/container";
import { FooterShelfLinks } from "@/components/footer-shelf-links";
import { Icon } from "@/components/ui/icon";
import { ArrowUpRight, GitBranch, Heart, ShieldCheck } from "lucide-react";

const COLUMNS = [
  {
    title: "Explore",
    links: [
      { label: "Browse the shelf", href: "/#shelf" },
      { label: "Categories", href: "/#categories" },
      { label: "How it works", href: "/#how" },
    ],
  },
  {
    title: "The fine print",
    links: [
      { label: "Service status", href: "/api/health" },
      { label: "Back to top", href: "/#top" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-20 bg-navy text-white">
      <div className={CONTAINER}>
        <div className="grid gap-12 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)] lg:gap-8 lg:py-20">
          <div className="max-w-sm">
            <Link href="/" aria-label="LendLoop home" className="inline-flex">
              <Brand size="lg" tone="inverse" />
            </Link>
            <p className="mt-5 text-[14px] leading-relaxed text-white/65">
              The shelf your street already owns. Borrow what you need, lend what you don&apos;t,
              and keep good things in use.
            </p>
            <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-medium text-white/70">
              <Icon icon={ShieldCheck} size={13} className="text-cyan" />
              Neighbours only · clear daily rates
            </p>
          </div>

          <nav aria-label="Your shelf">
            <h2 className="text-[10px] font-bold tracking-[0.18em] text-white/45 uppercase">
              Your shelf
            </h2>
            <FooterShelfLinks />
          </nav>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-[10px] font-bold tracking-[0.18em] text-white/45 uppercase">
                {column.title}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="group inline-flex items-center gap-1 text-[13.5px] text-white/75 transition-colors hover:text-white"
                    >
                      {link.label}
                      <Icon
                        icon={ArrowUpRight}
                        size={12}
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="flex flex-col gap-4 border-t border-white/10 py-7 text-[11.5px] text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} LendLoop · All rights reserved.</p>
          <a
            href="https://github.com/calebrotich/lendloop"
            target="_blank"
            rel="noreferrer"
            aria-label="LendLoop on GitHub (opens in a new tab)"
            className="inline-flex items-center gap-1.5 text-white/65 transition-colors hover:text-white"
          >
            <Icon icon={GitBranch} size={13} />
            GitHub repository
          </a>
          <p className="inline-flex items-center gap-1.5">
            Made for the street you live on
            <Icon icon={Heart} size={11} className="text-orange" />
          </p>
        </div>
      </div>
    </footer>
  );
}
