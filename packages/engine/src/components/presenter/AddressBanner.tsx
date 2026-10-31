"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** This window's address on `localhost`, when it was opened on `127.0.0.1`. */
function localhostUrl(): string | null {
  if (window.location.hostname !== "127.0.0.1") return null;
  const url = new URL(window.location.href);
  url.hostname = "localhost";
  return url.href;
}

/**
 * `127.0.0.1` is the frames' address. A presenter window opened there syncs with nothing on
 * `localhost`, because the two are different origins and share no channel or storage.
 */
export function AddressBanner() {
  const href = useSyncExternalStore(subscribe, localhostUrl, () => null);
  if (!href) return null;
  return (
    <p className="address-banner" role="alert">
      This window is on 127.0.0.1, so it will not sync with a window on localhost. <a href={href}>Open it on localhost</a>
    </p>
  );
}
