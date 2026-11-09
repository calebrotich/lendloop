"use client";

import { UserButton } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { api } from "@/convex/_generated/api";
import { IncomingBell } from "@/components/requests/incoming-bell";
import { Brand } from "@/components/ui/brand";

export function AppNav() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, {});
  const summary = useQuery(api.requests.incomingSummary, isAuthenticated ? {} : "skip");
  const pathname = usePathname();

  const pending = summary?.pending ?? 0;
  const links: Array<{ href: string; label: string; badge?: number }> = [
    { href: "/#shelf", label: "Browse" },
    { href: "/my-listings", label: "My listings" },
    { href: "/my-requests", label: "My requests" },
    { href: "/incoming-requests", label: "Incoming", badge: pending },
    ...(me?.role === "admin" ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <header className="sticky top-0 z-30 -mx-6 border-b border-rule/70 bg-page/85 px-6 backdrop-blur-xl">
      <div className="flex items-center gap-3 py-3">
        <Link href="/" aria-label="LendLoop home" className="shrink-0 rounded-lg">
          <Brand size="sm" />
        </Link>

        <nav
          aria-label="Main"
          className="ml-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {links.map((link) => {
            const active = pathname === link.href;
            const badge = link.badge ?? 0;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-white text-navy shadow-soft"
                    : badge > 0
                      ? "text-navy hover:bg-white/70"
                      : "text-ink-muted hover:text-navy"
                }`}
              >
                {link.label}
                {badge > 0 && (
                  <span
                    className="inline-flex min-w-[17px] items-center justify-center rounded-full bg-orange-strong px-1 text-[10px] leading-[17px] font-bold text-white tabular-nums"
                    aria-label={`${badge} waiting`}
                  >
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <IncomingBell size="sm" />
          <UserButton
            appearance={{ elements: { avatarBox: "size-8 ring-2 ring-white shadow-sm" } }}
          />
        </div>
      </div>
    </header>
  );
}
