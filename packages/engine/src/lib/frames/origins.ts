/**
 * Where frames come from. There are three modes, and neither of the first two names a port or a
 * host at build time:
 *
 * - Local: the presenter and the frames are one process, answering on `localhost:<port>` and
 *   `127.0.0.1:<port>`. They are different origins, so neither can read the other. The pair comes
 *   from the address in use.
 * - One host: frames are on the presenter's own origin. Their URLs are relative, and
 *   `frame-ancestors` says 'self'.
 * - Two hosts: frames come from an origin named at build, and only the site may embed them.
 *
 * `withDeck()` picks the mode (src/next/hosting.cjs) and inlines it.
 */
export type HostingMode = "local" | "one-host" | "two-hosts";

export interface Hosting {
  mode: HostingMode;
  /** The site that embeds frames, on two hosts. Empty otherwise. */
  site: string;
  /** The frames origin, on two hosts. Empty otherwise. */
  frames: string;
}

export const HOSTING: Hosting = {
  mode: (process.env.NEXT_PUBLIC_LIVE_ISH_MODE ?? "local") as HostingMode,
  site: process.env.NEXT_PUBLIC_LIVE_ISH_PRESENTER_ORIGIN ?? "",
  frames: process.env.NEXT_PUBLIC_LIVE_ISH_FRAMES_ORIGIN ?? "",
};
const EXTERNAL: Record<string, string> = JSON.parse(process.env.NEXT_PUBLIC_LIVE_ISH_EXTERNAL ?? "{}") as Record<string, string>;
const FRAMES_OFF = Boolean(process.env.NEXT_PUBLIC_LIVE_ISH_FRAMES_OFF);
/** A `live-ish export`: frames are files, one per flag combination, on a host with no server. */
const EXPORTED = process.env.NEXT_PUBLIC_LIVE_ISH_EXPORT === "1";
const POSTER_ROUTES: string[] = JSON.parse(process.env.NEXT_PUBLIC_LIVE_ISH_POSTER_ROUTES ?? "[]") as string[];
/** Flags the presenter window adds for itself. No build is composed differently for them. */
const WINDOW_FLAGS = new Set(["glass", "capture"]);
/** A server frame's route names its app: `/@shop/products/1`. */
const SERVER_ROUTE = /^\/@([\w-]+)(\/.*)?$/;

const LOCAL_PAIR: Record<string, string> = { localhost: "127.0.0.1", "127.0.0.1": "localhost" };

type Place = Pick<Location, "protocol" | "hostname" | "port" | "origin">;

/** `place`'s origin under the other local name. A host that is not local has no pair. */
function pairOf(place: Place): string | null {
  const pair = LOCAL_PAIR[place.hostname];
  return pair ? `${place.protocol}//${pair}${place.port ? `:${place.port}` : ""}` : null;
}

/** The frames origin for a window at `location`. */
export function framesOriginFor(location: Place, hosting: Hosting = HOSTING): string {
  if (hosting.mode === "two-hosts") return hosting.frames;
  if (hosting.mode === "local") return pairOf(location) ?? location.origin;
  return location.origin;
}

/**
 * The origin allowed to embed a frame served from `origin`, for the CSP and the runtime's message
 * check: the other local address, the site on two hosts, or the origin itself on one host.
 */
export function presenterOriginFor(origin: string, hosting: Hosting = HOSTING): string {
  if (hosting.mode === "two-hosts") return origin === hosting.frames ? hosting.site : origin;
  if (hosting.mode === "local") return pairOf(new URL(origin)) ?? origin;
  return origin;
}

/** `route` as a window at `location` loads it: relative on its own origin, so no host is named. */
export function frameUrlFor(route: string, location: Place, hosting: Hosting = HOSTING): { origin: string; url: string } {
  const origin = framesOriginFor(location, hosting);
  return { origin, url: origin === location.origin ? route : `${origin}${route}` };
}

/** The path a `Frame.route` opens: a build's entry page, or a declared address as written. */
export function framePath(route: string): string {
  return route.startsWith("/demos/") && !route.includes(".") ? `${route.replace(/\/$/, "")}/index.html` : route;
}

/** The URL of a `Frame.route` on the origin that serves it. Browser only. */
export function frameUrl(route: string): { origin: string; url: string } {
  const server = SERVER_ROUTE.exec(route);
  if (server) {
    const origin = EXTERNAL[server[1]] ?? "";
    // `index.html` is how the deck addresses its own builds. A server app answers its real path.
    return { origin, url: `${origin}${(server[2] ?? "/").replace(/\/index\.html$/, "") || "/"}` };
  }
  return frameUrlFor(route, window.location);
}

/** The app a route belongs to, or null for a frame the deck serves itself. */
export function serverApp(route: string): string | null {
  return SERVER_ROUTE.exec(route)?.[1] ?? null;
}

/** The origin of an app in `hosts.external`, or "" when this build has none. */
export function externalOrigin(app: string): string {
  return EXTERNAL[app] ?? "";
}

/** Where the deck's own server says whether an app is up, so no browser asks a dead origin. */
export const serverUpUrl = (app: string) => `/demos/live-ish-server/${app}`;

/**
 * False when the route's app has no origin configured, and on a preview of a two-host deck, whose
 * address the frames host does not name in `frame-ancestors`. Safe during server rendering.
 */
export function frameLive(route: string): boolean {
  if (FRAMES_OFF || POSTER_ROUTES.includes(route)) return false;
  const app = serverApp(route);
  return !app || Boolean(EXTERNAL[app]);
}

/** What a poster says in place of a frame that is off, or of an app that does not answer. */
export function offlineNote(stopped = false): string {
  if (stopped) return "Captured still. This live demo's server is not running.";
  if (EXPORTED) return "Captured still. This live demo needs a server, which this copy of the deck does not have.";
  return FRAMES_OFF ? "Captured still. Live demos run on the production address." : "Captured still. This live demo runs as its own app, which this site does not include.";
}

/**
 * The query of a frame document: `?flags=`, and `chrome=<id>` for a terminal frame, the one element
 * inside a frame that takes a theme. A server frame also says which deck embeds it, because a server
 * can't know the port this deck runs on, and marks its first request. `@live-ish/bridge` reads them.
 */
export function frameQuery(route: string, flags: Record<string, boolean> | undefined, terminalChrome?: string): string {
  const q = flagsQuery(flags);
  const server = serverApp(route) && typeof window !== "undefined" ? [`presenter=${encodeURIComponent(window.location.origin)}`, "mount=1"] : [];
  const parts = [q ? `flags=${q}` : "", terminalChrome ? `chrome=${encodeURIComponent(terminalChrome)}` : "", ...server].filter(Boolean);
  return parts.length ? `${route.includes("?") ? "&" : "?"}${parts.join("&")}` : "";
}

/** The file that holds a document with these flags in an export. Only what is off changes a document. */
export function flagFile(flags: Record<string, boolean>): string {
  const off = Object.keys(flags).filter((k) => !flags[k] && !WINDOW_FLAGS.has(k)).sort();
  return ["index", ...off.map((k) => `off-${k}`), "html"].join(".");
}

/** The whole address of a frame document, which every window mounts through. */
export function frameDocument(route: string, flags: Record<string, boolean> | undefined, terminalChrome?: string): string {
  const { url } = frameUrl(framePath(route));
  // A static host ignores a query, so a flag can't arrive on one.
  if (EXPORTED) return url.replace(/index\.html$/, flagFile(flags ?? {}));
  return `${url}${frameQuery(route, flags, terminalChrome)}`;
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
