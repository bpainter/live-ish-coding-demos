"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/** The address to go to instead, or null on any other host. */
function localhostUrl(): string | null {
  const { hostname, protocol, port, pathname, search } = window.location;
  return hostname === "127.0.0.1" ? `${protocol}//localhost${port ? `:${port}` : ""}${pathname}${search}` : null;
}

/**
 * The presenter belongs on `localhost`. The frames answer on the other address, and two windows sync
 * only on one origin, so a window on 127.0.0.1 says so instead of failing without a reason.
 */
export function AddressBanner() {
  const href = useSyncExternalStore(subscribe, localhostUrl, () => null);
  if (!href) return null;
  return (
    <p className="address-banner" role="alert">
      This window is on 127.0.0.1, so frames are blocked and windows will not sync.{" "}
      <a className="address-banner__link" href={href}>
        Open it on localhost
      </a>
    </p>
  );
}
