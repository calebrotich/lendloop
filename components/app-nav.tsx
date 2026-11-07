"use client";

import { UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import Link from "next/link";

import { api } from "@/convex/_generated/api";

export function AppNav() {
  const me = useQuery(api.users.me, {});

  const links = [
    { href: "/tools", label: "Browse" },
    { href: "/my-listings", label: "My listings" },
    { href: "/my-requests", label: "My requests" },
    { href: "/incoming-requests", label: "Incoming" },
    ...(me?.role === "admin" ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <header className="flex items-center justify-between border-b border-line py-4">
      <nav aria-label="Main" className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <LoopMark className="size-4 text-accent" />
          LendLoop
        </Link>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-sm text-ink-muted transition-colors hover:text-ink"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <UserButton />
    </header>
  );
}

function LoopMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
    >
      <path d="M7.5 15.5a4 4 0 1 1 0-8h9a4 4 0 1 1 0 8h-9" />
      <path d="M9.5 10.5 8 8.5" />
    </svg>
  );
}
