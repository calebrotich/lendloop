"use client";

import { SignInButton, UserButton, Show } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Heart, Menu, Search, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { IncomingBanner } from "@/components/requests/incoming-banner";
import { IncomingBell } from "@/components/requests/incoming-bell";
import { api } from "@/convex/_generated/api";
import { Brand, LoopMark } from "@/components/ui/brand";
import { Button, ButtonLink } from "@/components/ui/button";
import { CONTAINER } from "@/components/ui/container";
import { Icon } from "@/components/ui/icon";

const NAV = [
  { href: "/#shelf", label: "Browse" },
  { href: "/#categories", label: "Categories" },
  { href: "/#how", label: "How it works" },
] as const;

/**
 * The page header and, once the hero is behind you, a compact floating header
 * that slides in. The top bar is part of the page; the floating one is the
 * persistent navigation. Both live in this component so the mobile sheet is a
 * single instance no matter which bar opened it.
 */
export function SiteHeader() {
  const [floating, setFloating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setFloating(window.scrollY > 170);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function openSearch() {
    if (pathname === "/") {
      window.dispatchEvent(new Event("lendloop:focus-search"));
    } else {
      router.push("/#search");
    }
  }

  return (
    <>
      <header className="relative z-40" inert={floating}>
        <div className={CONTAINER}>
          <div className="flex h-[78px] items-center justify-between gap-4 md:h-[86px]">
            <Link href="/" aria-label="LendLoop home" className="rounded-lg">
              <Brand size="md" />
            </Link>

            <nav aria-label="Main" className="hidden items-center gap-7 lg:flex">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group relative py-2 text-[13.5px] font-medium text-ink-muted transition-colors hover:text-navy"
                >
                  {item.label}
                  <span className="absolute -bottom-0.5 left-0 h-[1.5px] w-0 rounded-full bg-brand transition-all duration-300 group-hover:w-full" />
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-1.5 sm:gap-2.5">
              <Show when="signed-out">
                <span className="hidden sm:block">
                  <SignInButton mode="modal">
                    <Button variant="ghost" size="sm" className="px-3">
                      Sign in
                    </Button>
                  </SignInButton>
                </span>
                <SignInButton mode="modal" fallbackRedirectUrl="/my-listings">
                  <Button size="sm" iconRight={<Icon icon={ArrowUpRight} size={15} />}>
                    List a tool
                  </Button>
                </SignInButton>
              </Show>
              <Show when="signed-in">
                <Link
                  href="/my-listings"
                  className="hidden rounded-full px-2 py-2 text-[13px] font-medium text-ink-muted transition-colors hover:text-navy sm:block"
                >
                  My listings
                </Link>
                <ButtonLink
                  href="/my-listings"
                  size="sm"
                  iconRight={<Icon icon={ArrowUpRight} size={15} />}
                >
                  List a tool
                </ButtonLink>
                <IncomingBell />
                <span className="ml-0.5">
                  <UserButton
                    appearance={{
                      elements: {
                        avatarBox: "size-8 ring-2 ring-white shadow-sm",
                        userButtonTrigger: "focus:shadow-none",
                      },
                    }}
                  />
                </span>
              </Show>
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="Open menu"
                className="ml-0.5 flex size-10 items-center justify-center rounded-full border border-rule bg-white/70 text-navy transition-colors hover:bg-white lg:hidden"
              >
                <Icon icon={Menu} size={19} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className={`${CONTAINER} pt-2 empty:hidden`}>
        <IncomingBanner />
      </div>

      <AnimatePresence>
        {floating && (
          <motion.header
            initial={{ y: -72, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -72, opacity: 0 }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5"
          >
            <div className="mx-auto flex h-[60px] w-full max-w-[1240px] items-center gap-2 rounded-full border border-rule/80 bg-white/95 px-3 shadow-float backdrop-blur-xl">
              <Link href="/" aria-label="LendLoop home" className="ml-1 shrink-0 rounded-lg">
                <Brand size="sm" />
              </Link>

              <nav aria-label="Main" className="ml-2 hidden items-center gap-5 lg:flex">
                {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="text-[13px] font-medium text-ink-muted transition-colors hover:text-navy"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              <button
                type="button"
                onClick={openSearch}
                className="group ml-auto flex h-10 min-w-0 items-center gap-2 rounded-full border border-rule bg-page/80 px-3.5 text-left text-[12.5px] font-medium text-navy transition-colors hover:bg-page sm:min-w-[210px]"
              >
                <Icon icon={Search} size={15} className="shrink-0 text-brand" />
                <span className="hidden sm:inline">Search the shelf</span>
                <span className="hidden text-ink-muted sm:inline">· Near me</span>
                <span className="sm:hidden">Search</span>
              </button>

              <Show when="signed-out">
                <SignInButton mode="modal" fallbackRedirectUrl="/my-listings">
                  <Button size="sm" className="hidden sm:inline-flex">
                    List a tool
                  </Button>
                </SignInButton>
              </Show>
              <Show when="signed-in">
                <ButtonLink href="/my-listings" size="sm" className="hidden sm:inline-flex">
                  List a tool
                </ButtonLink>
                <IncomingBell size="sm" />
                <Link
                  href="/my-listings"
                  aria-label="Your account"
                  className="hidden size-9 items-center justify-center rounded-full bg-mist text-brand transition-colors hover:bg-lilac/40 sm:flex"
                >
                  <Icon icon={UserRound} size={17} />
                </Link>
              </Show>

              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="Open menu"
                className="flex size-9 items-center justify-center rounded-full bg-mist text-navy transition-colors hover:bg-lilac/40 lg:hidden"
              >
                <Icon icon={Menu} size={17} />
              </button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {menuOpen && <MobileMenu onClose={() => setMenuOpen(false)} />}
      </AnimatePresence>
    </>
  );
}

function trapFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((node) => node.offsetParent !== null);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (first === undefined || last === undefined) return;

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function MobileMenu({ onClose }: { onClose: () => void }) {
  const { isAuthenticated } = useConvexAuth();
  const summary = useQuery(api.requests.incomingSummary, isAuthenticated ? {} : "skip");
  const pending = summary?.pending ?? 0;

  useEffect(() => {
    const previous = document.activeElement;
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[70] overflow-y-auto bg-page"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      onKeyDown={trapFocus}
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col px-5 pt-5 pb-8 sm:px-8">
        <div className="flex items-center justify-between">
          <Link href="/" onClick={onClose} aria-label="LendLoop home">
            <Brand size="md" />
          </Link>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            aria-label="Close menu"
            className="flex size-10 items-center justify-center rounded-full border border-rule bg-white text-navy"
          >
            <Icon icon={X} size={19} />
          </button>
        </div>

        <nav aria-label="Mobile" className="mt-12 flex flex-col">
          {NAV.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className="group flex items-center justify-between border-b border-rule/80 py-5"
            >
              <span className="flex items-baseline gap-4">
                <span className="w-6 text-[11px] font-semibold text-ink-muted/60">
                  0{index + 1}
                </span>
                <span className="font-display text-[34px] leading-none text-navy">
                  {item.label}
                </span>
              </span>
              <Icon
                icon={ArrowUpRight}
                size={20}
                className="text-ink-muted transition-transform duration-300 group-hover:translate-x-1 group-hover:text-brand"
              />
            </Link>
          ))}
        </nav>

        <div className="mt-10 grid grid-cols-2 gap-3">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button variant="outline" size="md" onClick={onClose} className="flex-1">
                Sign in
              </Button>
            </SignInButton>
            <SignInButton mode="modal" fallbackRedirectUrl="/my-listings">
              <Button size="md" className="flex-1">
                List a tool
              </Button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <ButtonLink href="/my-listings" size="md" className="flex-1" onClick={onClose}>
              My listings
            </ButtonLink>
            <ButtonLink
              href="/my-requests"
              variant="outline"
              size="md"
              className="flex-1"
              onClick={onClose}
            >
              My requests
            </ButtonLink>
            <ButtonLink
              href="/incoming-requests"
              variant="outline"
              size="md"
              className="col-span-2"
              onClick={onClose}
            >
              Incoming{pending > 0 ? ` · ${pending}` : ""}
            </ButtonLink>
          </Show>
        </div>

        <div className="mt-auto flex items-center justify-between pt-16 text-[12px] text-ink-muted">
          <span className="inline-flex items-center gap-2">
            <LoopMark className="size-4 text-brand" />
            Neighbourhood tool library
          </span>
          <Link href="/#shelf" onClick={onClose} className="inline-flex items-center gap-1.5">
            <Icon icon={Heart} size={13} /> Browse the shelf
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
