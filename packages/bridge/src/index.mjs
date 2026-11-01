/*
  The server half of the bridge. A plain ES module with no dependencies, so any Node server can
  import it as it is. Another stack needs no package at all: serve `client.js` as a file, and send
  the two CSP directives and the session rules this file spells out.
*/
import { readFileSync } from "node:fs";

/** The version of the frame protocol this bridge was written against. The engine's must match. */
export const PROTOCOL_VERSION = 2;

/** The query parameter that carries a frame's session on a request it makes itself. */
export const SESSION_PARAM = "s";
/** The cookie that carries it on a request the browser makes, such as a form post or a `navigate`. */
export const SESSION_COOKIE = "live-ish-session";
/** The header a proxy in front of the app can turn either of those into. */
export const SESSION_HEADER = "x-live-ish-session";
/** The query parameter that marks a frame's first request, which belongs to no session. */
export const MOUNT_PARAM = "mount";
/** The query parameter that names the deck embedding this frame. */
export const PRESENTER_PARAM = "presenter";

/** Any local deck, on any port: what a server started by hand allows. */
const LOCAL_PRESENTERS = ["http://localhost:*", "http://127.0.0.1:*"];
const SESSION = /^[\w-]{1,64}$/;

/** A value bound for a CSP header, so a bad setting can't add a directive of its own. */
function source(value) {
  if (!/^https?:\/\/[\w.-]+(:(\d+|\*))?$/.test(value)) throw new Error(`@live-ish/bridge: "${value}" is not an origin such as https://talk.example.com.`);
  return value;
}

/**
 * The origins allowed to embed this app. `live-ish dev` and `present` set LIVE_ISH_PRESENTER_ORIGIN
 * for the servers they start. Set it yourself on a deployed app, because the local default is no
 * use to a stranger's browser.
 */
export function presenterOrigins(env = globalThis.process?.env ?? {}) {
  const named = env.LIVE_ISH_PRESENTER_ORIGIN;
  return named ? named.split(/[\s,]+/).filter(Boolean) : LOCAL_PRESENTERS;
}

/**
 * The two directives a framed app needs, and no more: who may embed it, and that the runtime may
 * load from the deck. `unsafe-inline` is here because an app's own inline scripts should keep
 * running. `dev: true` adds `unsafe-eval` for a dev server that needs it. `script` adds sources.
 */
export function frameCsp({ presenter = presenterOrigins(), script = [], dev = false } = {}) {
  const ancestors = [].concat(presenter).map(source);
  return [`frame-ancestors ${ancestors.join(" ")}`, `script-src ${["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), ...ancestors, ...[].concat(script).map(source)].join(" ")}`].join("; ");
}

/** The response headers of a framed document: the CSP, plus the two every Live-ish frame sends. */
export function frameHeaders(options) {
  return { "Content-Security-Policy": frameCsp(options), "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
}

/** The tag for the head of every framed page. It must come before the page's own scripts. */
export function runtimeTag(src = "/live-ish-bridge.js") {
  return `<script src="${src.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}"></script>`;
}

/** The browser half, to serve at the address `runtimeTag` names. */
export function bridgeScript() {
  return readFileSync(new URL("./client.js", import.meta.url), "utf8");
}

function header(headers, name) {
  if (!headers) return undefined;
  if (typeof headers.get === "function") return headers.get(name) ?? undefined;
  const value = headers[name];
  return Array.isArray(value) ? value.join("; ") : value;
}

function cookie(raw, name) {
  for (const part of (raw ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq !== -1 && part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return "";
      }
    }
  }
  return "";
}

/**
 * The session a request belongs to, or "" when it belongs to none. A deck can mount a hidden second
 * frame and replay it beside the one on screen, so anything an app shows per visitor, such as a
 * request log, has to be scoped per frame.
 *
 * Takes a Node request or a fetch `Request`. `?mount=1` wins, because a frame's first request has no
 * session yet, then `?s=`, the cookie and the header, in that order. A value that is not an id
 * counts as none, because it ends up in a log and a map key.
 */
export function frameSession(request) {
  const url = new URL(request.url, "http://frame.invalid");
  if (url.searchParams.get(MOUNT_PARAM) === "1") return "";
  const value = url.searchParams.get(SESSION_PARAM) || cookie(header(request.headers, "cookie"), SESSION_COOKIE) || header(request.headers, SESSION_HEADER) || "";
  return SESSION.test(value) ? value : "";
}
