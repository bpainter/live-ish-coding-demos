import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle, THEME_BOOT } from "../../lib/ThemeToggle";
import { SITE } from "../../lib/source";
import "../../styles/site.css";
import "../../.gen/theme-swatches.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Live-ish docs", template: "%s | Live-ish docs" },
  description: "Live-ish runs slides and scripted demos of code and UI from one web app.",
};

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    // The boot script sets data-theme before hydration, on this element only.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line react/no-danger -- a constant in this repo, needed before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="site">
        <a className="site__skip" href="#main">
          Skip to content
        </a>
        <header className="site__header">
          <Link className="site__brand" href="/">
            Live-ish
          </Link>
          <nav className="site__nav" aria-label="Main">
            <Link className="site__link" href="/start">
              Quickstart
            </Link>
            <Link className="site__link" href="/live">
              Live deck
            </Link>
            <Link className="site__link" href="/errors">
              Rules
            </Link>
            <a className="site__link" href="https://github.com/bpainter/live-ish-coding-demos">
              Source
            </a>
            <ThemeToggle />
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
