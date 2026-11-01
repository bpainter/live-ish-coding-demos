"use client";

import { useEffect, useState } from "react";
import { frameChrome } from "../../lib/chrome-preview";
import { frameDocument, frameQuery, frameUrl } from "../../lib/frames/origins";

/**
 * Warms the next page's frame while an intro slide shows: one hidden, sandboxed document at the
 * frame's step-0 URL, so the route is compiled and its files are cached when the walk page mounts
 * its own. Server frames are skipped: their apps may log every request, and a frame like that must
 * be requested once per audience entry.
 *
 * `warm=1` tells the runtime this document is a warm-up: it posts nothing, probes nothing and
 * focuses nothing, so the clicker's keys never land in it. In Chromium a focus() in a frame moves
 * the window's focus there whatever `inert` and `tabIndex` say; the audience stage also takes focus
 * back from any non-demo frame (Stage.tsx).
 */
export function FrameWarm({ route, flags, sandbox, chrome }: { route: string; flags?: Record<string, boolean>; sandbox: string; chrome?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (route.startsWith("/@")) return;
    const t = window.setTimeout(() => {
      const query = frameQuery(route, flags, chrome ? frameChrome(chrome) : undefined);
      setSrc(`${frameUrl(frameDocument(route)).url}${query}${query ? "&" : "?"}warm=1`);
    }, 300);
    return () => window.clearTimeout(t);
  }, [route, flags, chrome]);
  if (!src) return null;
  return <iframe className="frame-warm" src={src} title="" aria-hidden="true" tabIndex={-1} sandbox={sandbox} inert />;
}
