"use client";

import { Show, SignInButton } from "@clerk/nextjs";
import Link from "next/link";

const LINK =
  "group inline-flex items-center gap-1 text-[13.5px] text-white/75 transition-colors hover:text-white";

/**
 * The footer's account links are the same for everyone except for the signed-out
 * case, where they become a sign-in action instead of a redirect loop.
 */
export function FooterShelfLinks() {
  return (
    <ul className="mt-4 space-y-2.5">
      <Show when="signed-in">
        <li>
          <Link href="/my-listings" className={LINK}>
            List a tool
          </Link>
        </li>
        <li>
          <Link href="/my-listings" className={LINK}>
            My listings
          </Link>
        </li>
        <li>
          <Link href="/my-requests" className={LINK}>
            My requests
          </Link>
        </li>
        <li>
          <Link href="/incoming-requests" className={LINK}>
            Incoming requests
          </Link>
        </li>
      </Show>
      <Show when="signed-out">
        <li>
          <SignInButton mode="modal" fallbackRedirectUrl="/my-listings">
            <button type="button" className={LINK}>
              Sign in to lend
            </button>
          </SignInButton>
        </li>
        <li>
          <Link href="/#how" className={LINK}>
            How lending works
          </Link>
        </li>
        <li>
          <Link href="/#shelf" className={LINK}>
            Browse the shelf
          </Link>
        </li>
      </Show>
    </ul>
  );
}
