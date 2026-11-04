import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

const DESCRIPTION =
  "A neighbourhood tool-lending board. Borrow what you need. Lend what you don't.";

export const metadata: Metadata = {
  title: {
    default: "LendLoop — Borrow what you need. Lend what you don't.",
    template: "%s · LendLoop",
  },
  description: DESCRIPTION,
  applicationName: "LendLoop",
  openGraph: {
    title: "LendLoop",
    description: DESCRIPTION,
    siteName: "LendLoop",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#faf9f7",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
