import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppNav } from "@/components/app-nav";
import { IncomingBanner } from "@/components/requests/incoming-banner";

/**
 * Authenticated shell. The redirect is a UX guard only — every Convex function
 * still proves identity and ownership itself, so bypassing it grants nothing.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth();
  if (userId === null) redirect("/");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6">
      <AppNav />
      <div className="pt-3 empty:hidden">
        <IncomingBanner />
      </div>
      <main className="flex-1 pb-16">{children}</main>
    </div>
  );
}
