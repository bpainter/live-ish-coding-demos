"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AudienceControls } from "../chrome/ReaderControls";

/**
 * Wake lock on mount and on return to visibility; cursor hidden after 2s idle. The menu
 * button shows with the cursor, a mouse fallback for the drawer; it never renders
 * under automation or capture, so walks and stills never see it.
 */
export function AudienceView({ children }: { children: ReactNode }) {
  const [cursorHidden, setCursorHidden] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const capture = new URLSearchParams(window.location.search).get("capture") === "1" || document.documentElement.dataset.capture === "1";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMenu(!navigator.webdriver && !capture);
  }, []);

  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        if (document.visibilityState === "visible" && "wakeLock" in navigator) sentinel = await navigator.wakeLock.request("screen");
      } catch {
        /* unsupported or denied; the runbook covers display sleep */
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
    };
  }, []);

  useEffect(() => {
    let timer = window.setTimeout(() => setCursorHidden(true), 2000);
    const wake = () => {
      setCursorHidden(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setCursorHidden(true), 2000);
    };
    window.addEventListener("pointermove", wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
    };
  }, []);

  return (
    <div className="audience" data-cursor={cursorHidden ? "hidden" : "visible"}>
      {children}
      {menu ? <AudienceControls /> : null}
    </div>
  );
}
