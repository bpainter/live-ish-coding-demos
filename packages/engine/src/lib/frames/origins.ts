/**
 * Where frames come from. There are three modes, and neither of the first two depends on a port or
 * host at build time:
 *
 * - Local: the presenter and the frames are one process, answering on `localhost:<port>` and
 *   `127.0.0.1:<port>`. They are different origins, so neither can read the other. The pair comes
 *   from the address in use.
 * - One host: frames are on the presenter's own origin, and `frame-ancestors` says 'self'.
 * - Two hosts: `hosts.frames` is set, and frames come from there.
 *
 * `withDeck()` inlines `hosts` from the deck config, which the environment can override.
 */
const SITE_ORIGIN = process.env.NEXT_PUBLIC_LIVE_ISH_SITE_ORIGIN ?? "";
const FRAMES_ORIGIN = process.env.NEXT_PUBLIC_LIVE_ISH_FRAMES_ORIGIN ?? "";
const EXTERNAL: Record<string, string> = JSON.parse(process.env.NEXT_PUBLIC_LIVE_ISH_EXTERNAL ?? "{}") as Record<string, string>;

const LOCAL_PAIR: Record<string, string> = { localhost: "127.0.0.1", "127.0.0.1": "localhost" };

/** The site's own origin for canonical URLs. Local builds fall back to the default dev address. */
export const SITE = SITE_ORIGIN || "http://localhost:3000";

/** The frames origin for a window at `location`. */
function framesOrigin(location: Pick<Location, "protocol" | "hostname" | "port" | "origin">): string {
  if (FRAMES_ORIGIN) return FRAMES_ORIGIN;
  const pair = LOCAL_PAIR[location.hostname];
  return pair ? `${location.protocol}//${pair}${location.port ? `:${location.port}` : ""}` : location.origin;
}

/**
 * The origin allowed to embed a frame served from `origin`, for the CSP and the runtime's message
 * check: the other local address, the site on two hosts, or the origin itself on one host.
 */
export function presenterOriginFor(origin: string): string {
  const url = new URL(origin);
  const pair = LOCAL_PAIR[url.hostname];
  if (pair) return `${url.protocol}//${pair}${url.port ? `:${url.port}` : ""}`;
  if (FRAMES_ORIGIN && SITE_ORIGIN && origin === FRAMES_ORIGIN) return SITE_ORIGIN;
  return origin;
}

/** Absolute URL of a `Frame.route` on the origin that serves it. Browser only. */
export function frameUrl(route: string): { origin: string; url: string } {
  const server = /^\/@([\w-]+)(\/.*)?$/.exec(route);
  if (server) {
    const origin = EXTERNAL[server[1]] ?? "";
    return { origin, url: `${origin}${server[2] ?? "/"}` };
  }
  const origin = framesOrigin(window.location);
  return { origin, url: `${origin}${route}` };
}

/** False when the route's app has no origin configured. Safe during server rendering. */
export function frameLive(route: string): boolean {
  const server = /^\/@([\w-]+)/.exec(route);
  return !server || Boolean(EXTERNAL[server[1]]);
}

/**
 * The query of a frame document: `?flags=`, and `chrome=<id>` for a terminal frame, the one element
 * inside a frame that takes a theme. Server frames get their flags through the bridge.
 */
export function frameQuery(route: string, flags: Record<string, boolean> | undefined, terminalChrome?: string): string {
  const q = flagsQuery(flags);
  const parts = [q ? `flags=${q}` : "", terminalChrome ? `chrome=${encodeURIComponent(terminalChrome)}` : ""].filter(Boolean);
  return parts.length ? `?${parts.join("&")}` : "";
}

/** Flags as the `?flags=` query the frame routes read (`enhance-css:0,enhance-js:1`). */
export function flagsQuery(flags: Record<string, boolean> | undefined): string {
  const entries = Object.entries(flags ?? {});
  return entries.length ? entries.map(([k, v]) => `${k}:${v ? 1 : 0}`).join(",") : "";
}

export function parseFlags(query: string | null): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const pair of (query ?? "").split(",")) {
    const [k, v] = pair.split(":");
    if (k) out[k] = v !== "0";
  }
  return out;
}

/** Adds `glass: false` when the presenter window runs with ?glass=off (components/presenter/GlassMode.tsx). */
export function glassFlags(flags: Record<string, boolean>): Record<string, boolean> {
  if (typeof document === "undefined") return flags;
  const out = { ...flags };
  if (document.documentElement.dataset.glass === "off") out.glass = false;
  if (document.documentElement.dataset.capture === "1") out.capture = true;
  return out;
}
