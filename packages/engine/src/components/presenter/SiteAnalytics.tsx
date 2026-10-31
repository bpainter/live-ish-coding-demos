"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { load } from "@live-ish/analytics";

/**
 * Automated windows send nothing: walks and captures drive Playwright (navigator.webdriver) and
 * captures add ?capture=1, so their network and console stay the same run to run.
 */
function tracked(): boolean {
  return !navigator.webdriver && new URLSearchParams(window.location.search).get("capture") !== "1";
}

/** Readers only. The stage windows never load a script, so it costs the talk nothing. */
function readerPage(pathname: string | null): boolean {
  return pathname === "/" || Boolean(pathname?.startsWith("/s/"));
}

let customLoaded = false;

interface Props {
  /** Provider script addresses. The server names them, so a deck that chose none ships no address. */
  scripts: string[];
  /** Run the deck's own module. */
  custom: boolean;
}

/**
 * The analytics adapter's one client piece. The root layout renders it only on a deployed build that
 * turned analytics on. Frame documents come from route handlers, which no layout wraps, so they
 * load nothing and their CSP stays as written.
 */
export function SiteAnalytics({ scripts, custom }: Props) {
  const pathname = usePathname();
  const reader = readerPage(pathname);
  useEffect(() => {
    if (!reader || !tracked()) return;
    for (const src of scripts) {
      if (document.querySelector(`script[src="${src}"]`)) continue;
      const script = document.createElement("script");
      script.defer = true;
      script.src = src;
      document.head.append(script);
    }
    if (custom && load && !customLoaded) {
      customLoaded = true;
      void load().then((mod) => mod.default?.());
    }
  }, [reader, scripts, custom]);
  return null;
}
