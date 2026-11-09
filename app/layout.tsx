import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import type { ReactNode } from "react";

import { Providers } from "./providers";
import "react-day-picker/style.css";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

/**
 * A stand-in for GT Alpina — licensed, so it cannot ship in the repo. The font
 * stack puts a locally installed GT Alpina first; see app/globals.css.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

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
  themeColor: "#f4f6fc",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${fraunces.variable}`}>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
