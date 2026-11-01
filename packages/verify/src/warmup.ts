import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { flagsAt, frameQuery, hasFrame } from "@live-ish/engine/verify";
import { UsageError, numberOpt, parseArgs } from "./lib/args";
import { isBlocked, loadDeck, type DeckData } from "./lib/deck";
import { Report } from "./lib/report";
import { framesOriginFor } from "./lib/session";
import { median, percentile, table } from "./lib/stats";

/**
 * The stage-day warm-up. Run it from the presenting laptop on the venue's network. It warms the CDN
 * the room uses and the functions, proves the deployed build, and doubles as a network check. It
 * cannot warm the browser: a walk through the deck does that.
 *
 * 1. GET /_health, and fail if its build differs from --expect.
 * 2. GET /, every /s/<id>, /present and /speaker on the first slide.
 * 3. Every framed page's document at its first step, and every file that document references.
 * 4. Every image, font and stylesheet the pages and stylesheets reference.
 *
 * Prints count, failures, median and p95 TTFB, bytes and Mbit/s per class. Server frames are skipped,
 * because such an app may log every request.
 */

type Cls = "health" | "page" | "frame document" | "frame file" | "image" | "font" | "css" | "script" | "other";

interface Hit {
  cls: Cls;
  url: string;
  status: number | "error";
  ttfb: number;
  total: number;
  bytes: number;
  cdn: string | null;
  body?: string;
}

/** Root-relative public files a document or stylesheet names, in markup, CSS or RSC data. */
const ASSET = /(?:\/(?:live-ish|intro|posters|images|opt|fonts|backgrounds)\/[\w./%-]+?\.(?:png|jpe?g|webp|avif|svg|gif|otf|ttf|woff2?|css|js)(?:\?v=[0-9a-f]+)?)(?=["')\s\\,&]|$)/g;
/** `src` and `href` values of a frame document. Relative files resolve against it. */
const REF = /<(?:script|link|img|source)\b[^>]*?\b(?:src|href)="([^"]+)"/g;

function classify(url: string): Cls {
  const p = new URL(url).pathname;
  if (/\.(png|jpe?g|webp|avif|svg|gif)$/.test(p)) return "image";
  if (/\.(otf|ttf|woff2?)$/.test(p)) return "font";
  if (/\.css$/.test(p)) return "css";
  if (/\.m?js$/.test(p)) return "script";
  return "other";
}

async function get(cls: Cls, url: string, keepBody: boolean): Promise<Hit> {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { headers: { "accept-encoding": "br, gzip" }, redirect: "follow" });
    const ttfb = performance.now() - t0;
    const buf = Buffer.from(await res.arrayBuffer());
    const total = performance.now() - t0;
    return { cls, url, status: res.status, ttfb, total, bytes: Number(res.headers.get("content-length") ?? buf.length), cdn: res.headers.get("x-vercel-cache"), body: keepBody ? buf.toString("utf8") : undefined };
  } catch {
    return { cls, url, status: "error", ttfb: performance.now() - t0, total: performance.now() - t0, bytes: 0, cdn: null };
  }
}

/** Runs the jobs with at most `concurrency` in flight. */
async function pool<T>(jobs: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const out: T[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
      while (next < jobs.length) {
        const i = next++;
        out[i] = await jobs[i]();
      }
    }),
  );
  return out;
}

/** Files a stylesheet loads with url(), resolved against it. */
export function cssUrls(css: string, base: string): string[] {
  return [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]).filter((u) => !u.startsWith("data:")).map((u) => new URL(u, base).href);
}

export async function warmup(argv: string[], context: { root: string; deck?: DeckData; report?: Report }): Promise<number> {
  const args = parseArgs(argv, { values: ["origin", "demo", "expect", "concurrency"], flags: ["json"] });
  if (args.words.length) throw new UsageError(`warmup takes no id, found ${args.words.join(", ")}.`);
  const report = context.report ?? new Report("warmup", args.flag("json"));
  const deck = context.deck ?? (await loadDeck(context.root));
  const P = (args.opt("origin") ?? deck.deck.hosts.site ?? "http://localhost:3000").replace(/\/$/, "");
  const D = (args.opt("demo") ?? framesOriginFor(P, deck.deck.hosts.frames)).replace(/\/$/, "");
  const concurrency = numberOpt(args, "concurrency", 6);
  const expect =
    args.opt("expect") ??
    (() => {
      try {
        return execSync("git rev-parse --short=7 HEAD", { cwd: context.root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      } catch {
        return null;
      }
    })();
  const hits: Hit[] = [];
  const seen = new Set<string>();
  const started = performance.now();
  const fetchAll = async (entries: { cls: Cls; url: string; body?: boolean }[]) => {
    const fresh = entries.filter((e) => !seen.has(e.url) && seen.add(e.url));
    const got = await pool(fresh.map((e) => () => get(e.cls, e.url, Boolean(e.body))), concurrency);
    hits.push(...got);
    return got;
  };
  /** Public files named in a body. Page data also names files a page links only when they exist, so a name with no file here is skipped. */
  let skipped = 0;
  const assetsIn = (text: string, origin: string): string[] => {
    const names = [...new Set([...text.matchAll(ASSET)].map((m) => m[0].replace(/\\u0026/g, "&")))];
    const present = names.filter((n) => existsSync(path.join(context.root, "public", decodeURIComponent(n.split("?")[0]))));
    skipped += names.length - present.length;
    return present.map((n) => origin + n);
  };

  // 1. Health and build.
  const [health] = await fetchAll([{ cls: "health", url: `${P}/_health`, body: true }]);
  let build: string | null = null;
  try {
    build = (JSON.parse(health.body ?? "{}") as { build?: string }).build ?? null;
  } catch {
    build = null;
  }
  const buildOk = !expect || build === expect;

  // 2. Pages.
  const first = deck.slides[0].id;
  const pages = await fetchAll([`${P}/`, ...deck.ids.map((id) => `${P}/s/${id}`), `${P}/present?s=${first}`, `${P}/speaker?s=${first}`].map((url) => ({ cls: "page" as const, url, body: true })));

  // 3. Frame documents at the first step, as PageFrame builds them, and their files.
  const frameDocs: { cls: Cls; url: string; body: boolean }[] = [];
  for (const demo of deck.demos)
    for (const page of demo.pages) {
      if (!hasFrame(page) || page.frame.kind === "server" || isBlocked(page)) continue;
      const route = page.frame.route;
      const doc = route.startsWith("/demos/") ? `${route}/index.html` : route;
      frameDocs.push({ cls: "frame document", url: `${D}${doc}${frameQuery(route, flagsAt(page, 0), page.frame.kind === "terminal" ? page.chrome : undefined)}`, body: true });
    }
  const docs = await fetchAll(frameDocs);
  const docFiles: { cls: Cls; url: string; body?: boolean }[] = [];
  for (const d of docs) {
    if (!d.body) continue;
    for (const m of d.body.matchAll(REF)) {
      const url = new URL(m[1], d.url).href;
      if (!url.startsWith(D)) continue;
      const pathname = new URL(url).pathname;
      docFiles.push({ cls: pathname.startsWith("/live-ish/") ? classify(url) : "frame file", url, body: pathname.endsWith(".css") });
    }
  }
  const files = await fetchAll(docFiles);

  // 4. Assets the pages and every stylesheet reference, on the origin that loads them.
  const pageAssets = pages.flatMap((p) => (p.body ? assetsIn(p.body, P) : []));
  // The app's own chunks and stylesheets, content-hashed and immutable: a cold CDN fetches them once.
  const nextStatic = [...new Set(pages.flatMap((p) => [...(p.body ?? "").matchAll(/(?:href|src)="(\/_next\/static\/[^"]+\.(?:css|js))"/g)].map((m) => P + m[1])))];
  const assets = await fetchAll([...pageAssets, ...nextStatic].map((url) => ({ cls: classify(url), url, body: url.endsWith(".css") })));
  const css = [...files, ...assets].filter((h) => h.cls === "css" && h.body);
  // A stylesheet also names faces of themes this deck does not use, which a browser never asks for.
  const inPublic = (url: string) => {
    const { pathname } = new URL(url);
    if (pathname.startsWith("/_next/") || existsSync(path.join(context.root, "public", decodeURIComponent(pathname)))) return true;
    skipped++;
    return false;
  };
  await fetchAll(css.flatMap((h) => cssUrls(h.body!, h.url)).filter(inPublic).map((url) => ({ cls: classify(url), url })));

  // Report.
  const wall = (performance.now() - started) / 1000;
  const failed = hits.filter((h) => h.status === "error" || h.status >= 400);
  const classes: Cls[] = ["health", "page", "frame document", "frame file", "css", "script", "font", "image", "other"];
  const rows = classes.flatMap((cls) => {
    const sel = hits.filter((h) => h.cls === cls);
    if (!sel.length) return [];
    const bytes = sel.reduce((n, h) => n + h.bytes, 0);
    const transfer = sel.reduce((n, h) => n + Math.max(1, h.total - h.ttfb), 0) / 1000;
    const cdn = sel.filter((h) => h.cdn === "HIT" || h.cdn === "PRERENDER" || h.cdn === "STALE").length;
    return [[cls, sel.length, sel.filter((h) => h.status === "error" || h.status >= 400).length, Math.round(median(sel.map((h) => h.ttfb)) ?? 0), Math.round(percentile(sel.map((h) => h.ttfb), 0.95) ?? 0), Math.round(bytes / 1024), ((bytes * 8) / 1e6 / transfer).toFixed(1), cdn]];
  });
  report.log(table(["Class", "Count", "Failures", "TTFB median (ms)", "TTFB p95 (ms)", "KB", "Mbit/s", "CDN hits"], rows));
  const totalBytes = hits.reduce((n, h) => n + h.bytes, 0);
  report.log(`\n${hits.length} requests, ${(totalBytes / 1024 / 1024).toFixed(1)} MB in ${wall.toFixed(1)} s, presenter ${P}, frames ${D}`);
  if (skipped) report.log(`${skipped} file name(s) in page data with no file in public/ skipped`);
  report.log(`Build: ${build ?? "unknown"}${expect ? ` (expected ${expect})` : ""}${buildOk ? "" : "  MISMATCH"}`);
  report.data.requests = hits.length;
  report.data.bytes = totalBytes;
  report.data.build = build;
  for (const f of failed) report.fail(`${f.status}`, f.url);
  if (!buildOk) report.fail("build", `the server runs ${build ?? "an unknown build"}, expected ${expect}`);
  if (!failed.length && buildOk) report.pass(`${hits.length} requests, 0 failures, build ${build ?? "unknown"}`);
  return report.finish("warmup");
}
