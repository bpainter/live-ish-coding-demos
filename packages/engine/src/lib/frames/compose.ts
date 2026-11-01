import "server-only";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { generated } from "../paths";
import { frameThemeHref } from "../posters";
import { presenterOriginFor, type Hosting } from "./origins";
import type { BuildDef } from "./types";
import { shellDef, type ShellContext } from "./shells";

/** Production builds only: shell links carry `?v=` and build files are cached. Development keeps `no-store`. */
const PRODUCTION = process.env.NODE_ENV === "production";

let versions: Record<string, string> | null | undefined;

/**
 * `?v=<first 8 hex of the SHA-256>` for a file under public/live-ish, from
 * `.live-ish/asset-versions.json`. `withDeck()` makes those URLs immutable for a year. Development,
 * an unknown file or a missing list leave the href as it is; the unversioned URL then gets the
 * hour-long rule. Shown markup never goes through here.
 */
export function versioned(href: string): string {
  if (!PRODUCTION) return href;
  if (versions === undefined) {
    try {
      versions = JSON.parse(readFileSync(/*turbopackIgnore: true*/ generated("asset-versions.json"), "utf8")) as Record<string, string>;
    } catch {
      versions = null;
    }
  }
  const v = versions?.[href];
  return v ? `${href}?v=${v}` : href;
}

/** The neutral frame base, copied from the engine by `prepareDeck`. The same under every theme. */
export const BASE_HREF = "/live-ish/frame-base.css";
/** Per-demo frame images, written from the deck by `prepareDeck`. */
export const BACKGROUNDS_HREF = "/live-ish/backgrounds.css";
/** The frame runtime. */
export const RUNTIME_HREF = "/live-ish/demo-runtime.js";

/** Base CSP for frame documents; `ORIGIN` and `PRESENTER` are substituted. */
export const BASE_CSP =
  "default-src 'none'; script-src ORIGIN; style-src ORIGIN 'unsafe-inline'; img-src ORIGIN data:; font-src ORIGIN; connect-src ORIGIN; form-action ORIGIN; base-uri 'none'; object-src 'none'; frame-ancestors PRESENTER";

/** A frame CSP that may embed same-origin documents, for a build with `inner` pages. */
export const FRAMING_CSP = `${BASE_CSP}; frame-src ORIGIN`;

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export interface ComposeOptions {
  /** Flags in effect for this document (from `?flags=`). */
  flags: Record<string, boolean>;
  /** Origin the document is served from, for the CSP. */
  origin: string;
  /** Body HTML; defaults to the build's index.html. */
  body?: string;
  title?: string;
  /** What the frame shell shows on terminal pages. */
  window?: ShellContext["window"];
  /** Terminal pages: the theme whose `--term-*` file to link, from `?chrome=` or the page. */
  chrome?: string;
}

/**
 * Wraps a build's index.html (inserted byte for byte) in the frame shell: charset, viewport, the
 * presenter origin, the runtime, flag metadata. Enhancement stylesheets are tagged so the runtime
 * can disable them in place; enhancement scripts are left out when `enhance-js` is off (8.4, 9).
 */
export function composeFrame(def: BuildDef, opts: ComposeOptions): string {
  const { manifest } = def;
  let body = opts.body ?? readFileSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ def.dir, "index.html"), "utf8");
  const cssMode = manifest.enhancement.css;
  const cssFiles = typeof cssMode === "object" ? cssMode.files : null;
  // Tag enhancement stylesheets (mode "all" tags every author stylesheet; "files" the named ones).
  if (cssMode !== "supports-blocks") {
    body = body.replace(/<link([^>]*rel="stylesheet"[^>]*)>/g, (m, attrs: string) => {
      const href = /href="([^"]+)"/.exec(attrs)?.[1] ?? "";
      const base = href.split("/").pop() ?? href;
      const enhancement = cssFiles ? cssFiles.includes(base) : true;
      if (!enhancement || attrs.includes("data-flag")) return m;
      const disabled = opts.flags["enhance-css"] === false ? " disabled" : "";
      return `<link${attrs} data-flag="enhance-css"${disabled}>`;
    });
  }
  // Enhancement scripts are removed when enhance-js is off; instrumentation stays.
  if (opts.flags["enhance-js"] === false && manifest.enhancement.js.length) {
    body = body.replace(/<script\b[^>]*src="([^"]+)"[^>]*>\s*<\/script>\s*/g, (m, src: string) => {
      const base = src.split("/").pop() ?? src;
      return manifest.enhancement.js.includes(base) ? "" : m;
    });
  }
  // Multi-page builds: the shown markup's leading stylesheet links
  // go in the head, where a real page has them. A body stylesheet does not block the first paint,
  // so a page could render before the CSS that opts it in to a cross-document view transition
  // arrives, and the transition would be skipped.
  const headLinks: string[] = [];
  if (def.pages?.length) {
    body = body.replace(/^(\s*<link\b[^>]*rel="stylesheet"[^>]*>)+/, (m) => {
      headLinks.push(...(m.match(/<link\b[^>]*>/g) ?? []));
      return "";
    });
  }
  // The wrapper goes around the shown markup; it is never shown code.
  let wrapStyles: string[] = [];
  let wrapScripts: string[] = [];
  if (manifest.shell) {
    const w = wrapIn(body, manifest, opts.window);
    body = w.body;
    wrapStyles = w.styles;
    wrapScripts = w.scripts;
  }
  // Instrumentation and hooks the manifest lists are injected after the shown markup; they are
  // never part of the code on screen.
  const instrumentation = [...wrapScripts, ...manifest.instrumentation].map((f) => `<script type="module" src="${escapeAttr(versioned(f))}"></script>`).join("\n");
  const flagsAttr = Object.entries(opts.flags)
    .map(([k, v]) => `${k}:${v ? 1 : 0}`)
    .join(",");
  const mode = typeof cssMode === "string" ? cssMode : "files";
  return [
    "<!doctype html>",
    `<html lang="en" data-demo="${escapeAttr(manifest.demo)}" data-build="${manifest.build}" data-kind="${manifest.kind}" data-flags="${escapeAttr(flagsAttr)}" data-enhance-css-mode="${mode}"${manifest.background ? ` data-section-bg="${escapeAttr(manifest.demo)}"` : ""}${def.pages?.length ? " data-pages" : ""}${wrapAttrs(manifest)}>`,
    "<head>",
    // The base comes first, so every build's own CSS (shown CSS is unlayered) wins over it. The
    // enhance-css flag never touches it: it is not tagged. `frame: { base: false }` leaves it out.
    ...(manifest.base === false ? [] : [`<link rel="stylesheet" href="${versioned(BASE_HREF)}">`]),
    ...(manifest.kind === "terminal" && opts.chrome ? [`<link rel="stylesheet" href="${escapeAttr(versioned(frameThemeHref(opts.chrome)))}">`] : []),
    ...(manifest.background ? [`<link rel="stylesheet" href="${versioned(BACKGROUNDS_HREF)}">`] : []),
    ...(manifest.styles ?? []).map((href) => `<link rel="stylesheet" href="${escapeAttr(versioned(href))}">`),
    ...wrapStyles.map((href) => `<link rel="stylesheet" href="${escapeAttr(versioned(href))}">`),
    ...headLinks,
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light">',
    `<meta name="presenter-origin" content="${escapeAttr(presenterMeta(opts.origin))}">`,
    `<title>${escapeAttr(opts.title ?? def.title)}</title>`,
    `<script src="${versioned(RUNTIME_HREF)}"></script>`,
    "</head>",
    "<body>",
    body.replace(/\n$/, ""),
    instrumentation,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

/** The presenter's origin for the runtime. "self" names no host: the document knows its own. */
function presenterMeta(origin: string): string {
  const presenter = presenterOriginFor(origin);
  return presenter === origin ? "self" : presenter;
}

/** `<html>` attributes the walk and the theme read: the shell id, `scrolls`, the lifted ids. */
function wrapAttrs(manifest: BuildDef["manifest"]): string {
  const w = manifest.shell;
  if (!w) return "";
  return ` data-wrapper="${escapeAttr(w.id)}"${w.scrolls ? " data-scrolls" : ""}${w.outside?.length ? ` data-shown-outside="${escapeAttr(w.outside.join(" "))}"` : ""}`;
}

/**
 * Puts the shown markup inside the wrapper's `[data-shown]` slot, as written and never reparsed
 *. Ids in `outside` (overlay roots) are lifted out and follow the wrapper.
 */
export function wrapIn(body: string, manifest: BuildDef["manifest"], window?: ShellContext["window"]): { body: string; styles: string[]; scripts: string[] } {
  const w = manifest.shell!;
  let inner = body;
  const lifted: string[] = [];
  for (const id of w.outside ?? []) {
    const re = new RegExp(`<([a-z][\\w-]*)\\b[^>]*\\bid="${id}"[^>]*>[\\s\\S]*?</\\1>\\s*`, "i");
    const m = re.exec(inner);
    if (!m) throw new Error(`wrapper: no element with id "${id}" to place outside the shown slot`);
    lifted.push(m[0].trim());
    inner = inner.slice(0, m.index) + inner.slice(m.index + m[0].length);
  }
  // Scripts and the shown stylesheet links stay where the build wrote them; only markup moves.
  const r = shellDef(w.id).render({ build: manifest.build, demo: manifest.demo, window });
  const shownClass = ["wrap-shown", r.shownClass].filter(Boolean).join(" ");
  return {
    body: `${r.before}\n<div class="${shownClass}" data-shown>\n${inner.trim()}\n</div>\n${r.after}\n${lifted.join("\n")}`,
    styles: r.styles,
    scripts: r.scripts,
  };
}

export function cspFor(def: BuildDef, origin: string, flags: Record<string, boolean>, hosting?: Hosting): { header: string; value: string } {
  const template = def.manifest.csp ?? (def.inner?.length ? FRAMING_CSP : BASE_CSP);
  // On one host the frame and its presenter share an origin, so `'self'` names neither, and a proxy
  // that rewrites `host` cannot blank a frame. Across origins the policy has to name both.
  const presenter = presenterOriginFor(origin, hosting);
  const same = presenter === origin;
  const value = template.replace(/ORIGIN/g, same ? "'self'" : origin).replace(/PRESENTER/g, same ? "'self'" : presenter);
  // A `csp-enforce` flag turns the page's policy to report-only while it is off.
  const reportOnly = def.manifest.flags["csp-enforce"] && flags["csp-enforce"] === false;
  return { header: reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", value };
}

/** Frame documents and build files never belong in a search index. */
export const ROBOTS_HEADERS = { "X-Robots-Tag": "noindex, nofollow" } as const;

export function frameResponse(html: string, def: BuildDef, origin: string, flags: Record<string, boolean>): Response {
  const csp = cspFor(def, origin, flags);
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      [csp.header]: csp.value,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
      ...ROBOTS_HEADERS,
    },
  });
}

const TYPES: Record<string, string> = {
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  html: "text/html; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  http: "text/plain; charset=utf-8",
  yaml: "text/plain; charset=utf-8",
  yml: "text/plain; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  avif: "image/avif",
  gif: "image/gif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  woff2: "font/woff2",
};

/**
 * Cache headers for a file that is fixed for the life of a deployment: a build's own CSS and JS,
 * vendored scripts, instrumentation, photos served beside a document. The browser keeps it 5
 * minutes and may use it stale for a day while it rechecks. A provider preset may add what its CDN
 * reads. Development keeps `no-store`.
 */
export const BUILD_FILE_CACHE: Record<string, string> = PRODUCTION ? { "Cache-Control": "public, max-age=300, stale-while-revalidate=86400", ...(JSON.parse(process.env.LIVE_ISH_BUILD_FILE_HEADERS ?? "{}") as Record<string, string>) } : { "Cache-Control": "no-store" };

/**
 * Re-labels a successful GET response as a build file (above), for addresses that serve files a demo
 * folder registers. Anything but a 200 keeps its own headers.
 */
export function asBuildFile(res: Response): Response {
  if (res.status !== 200) return res;
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(BUILD_FILE_CACHE)) headers.set(k, v);
  for (const [k, v] of Object.entries(ROBOTS_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/** A file of a build, served from its directory; null when it is not there or escapes the directory. */
export function buildFile(def: BuildDef, file: string): Response | null {
  let abs: string | null = def.extraFiles?.[file] ?? null;
  if (!abs) {
    const candidate = path.resolve(/*turbopackIgnore: true*/ def.dir, file);
    if (!candidate.startsWith(path.resolve(/*turbopackIgnore: true*/ def.dir) + path.sep) || !existsSync(/*turbopackIgnore: true*/ candidate)) return null;
    if (def.files && !def.files.includes(file)) return null;
    abs = candidate;
  }
  const ext = abs.split(".").pop() ?? "";
  return new Response(readFileSync(/*turbopackIgnore: true*/ abs), {
    status: 200,
    headers: { "Content-Type": TYPES[ext] ?? "application/octet-stream", "X-Content-Type-Options": "nosniff", ...BUILD_FILE_CACHE, ...ROBOTS_HEADERS },
  });
}
