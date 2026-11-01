import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { hasFrame } from "@live-ish/engine/verify";
import { isBlocked, type DeckData } from "../lib/deck";
import type { Report } from "../lib/report";
import { table } from "../lib/stats";
import { writeResult, type PerfContext } from "./lib";

/**
 * `cache-control` for one URL per header rule, on the origin that loads it. Each URL is fetched
 * twice, and the second fetch shows whether a CDN kept it. A row whose `cache-control` differs from
 * the rule fails the run. `--dev` expects a dev server, which has no caching rules, and only reports.
 */

const YEAR = "public, max-age=31536000, immutable";
const HOUR = "public, max-age=3600, stale-while-revalidate=86400";
const PAGE = "public, max-age=0, must-revalidate";
/** What `next start` sends where a CDN sends PAGE: a prerendered page, a public file Next does not cache. */
const START_PAGE = "s-maxage=31536000";
const START_PUBLIC = "public, max-age=0";
const BUILD_FILE = "public, max-age=300, stale-while-revalidate=86400";
const NO_STORE = "no-store";

interface Probe {
  cls: string;
  origin: "presenter" | "demo";
  path: string;
  expect: string | string[];
  headers?: Record<string, string>;
  why: string;
}

/** The first file under public/<dir>, as a URL path, or null. */
function firstPublic(root: string, dir: string, ext = /\.(png|jpe?g|webp|avif|svg|css|js|otf|ttf|woff2)$/): string | null {
  const abs = path.join(root, "public", dir);
  if (!existsSync(abs)) return null;
  const stack = [abs];
  while (stack.length) {
    const d = stack.shift()!;
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (ext.test(e.name)) return `/${path.relative(path.join(root, "public"), p).split(path.sep).join("/")}`;
    }
  }
  return null;
}

function versions(root: string): Record<string, string> {
  const f = path.join(root, ".live-ish", "asset-versions.json");
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as Record<string, string>) : {};
}

/** One probe per rule the deck can reach, from files and pages it really has. */
export function probes(deck: DeckData): Probe[] {
  const { root } = deck;
  const v = versions(root);
  const withV = (p: string) => (v[p] ? `${p}?v=${v[p]}` : null);
  const out: Probe[] = [];
  const add = (cls: string, origin: Probe["origin"], p: string | null, expect: Probe["expect"], why: string, headers?: Record<string, string>) => {
    if (p) out.push({ cls, origin, path: p, expect, why, headers });
  };
  add("Content-hashed image", "presenter", firstPublic(root, "opt"), YEAR, "content hash in the name");
  for (const dir of ["intro", "posters", "images", "backgrounds"]) add(`Unversioned /${dir}`, "presenter", firstPublic(root, dir), HOUR, "the name never changes: an hour, then stale while it rechecks");
  for (const p of ["/live-ish/frame-base.css", "/live-ish/demo-runtime.js", "/live-ish/shells/base.css"]) {
    add("Unversioned /live-ish", "demo", p, HOUR, "the same file without ?v, in development and shown links");
    add("Versioned /live-ish (?v=)", "demo", withV(p), YEAR, "?v=<content hash> written by the frame shell");
  }
  const first = deck.ids[0];
  add("Prerendered HTML", "presenter", "/", [PAGE, START_PAGE], "a deploy shows on the next load");
  add("Prerendered HTML", "presenter", `/s/${first}`, [PAGE, START_PAGE], "a deploy shows on the next load");
  add("RSC payload", "presenter", `/s/${first}?_rsc`, [PAGE, START_PAGE], "same as its page", { RSC: "1" });
  if (!deck.deck.presenter.onHost) {
    add("Audience window", "presenter", `/present?s=${first}`, [PAGE, START_PAGE], "prerendered per slide behind a rewrite");
    add("Speaker window", "presenter", `/speaker?s=${first}`, [PAGE, START_PAGE], "prerendered per slide behind a rewrite");
  }
  add("Health", "presenter", "/_health", [PAGE, START_PAGE], "names the build");
  for (const d of deck.demos) {
    const page = d.pages.find((p) => hasFrame(p) && p.frame.kind === "web" && !isBlocked(p));
    if (page && hasFrame(page)) {
      const route = page.frame.route;
      add("Frame document", "demo", route.startsWith("/demos/") ? `${route}/index.html` : route, NO_STORE, "depends on flags, host and CSP");
      const css = page.files.find((f) => f.lang === "css");
      if (css && route.startsWith("/demos/")) add("Frame build file", "demo", `${route}/${css.file}`, BUILD_FILE, "fixed per deployment");
      break;
    }
  }
  return out;
}

async function get(url: string, headers: Record<string, string> = {}): Promise<{ status: number; h: Headers; ms: number }> {
  const t0 = performance.now();
  const res = await fetch(url, { headers: { "accept-encoding": "br, gzip", ...headers }, redirect: "manual" });
  await res.arrayBuffer();
  return { status: res.status, h: res.headers, ms: Math.round(performance.now() - t0) };
}

export async function run({ deck, args, P, D }: PerfContext, report: Report): Promise<void> {
  const dev = args.flag("dev");
  const rows: (string | number | null)[][] = [];
  const raw: unknown[] = [];
  let bad = 0;
  for (const p of probes(deck)) {
    const base = p.origin === "presenter" ? P : D;
    try {
      await get(base + p.path, p.headers);
      const r = await get(base + p.path, p.headers);
      const cc = r.h.get("cache-control") ?? "";
      const expected = Array.isArray(p.expect) ? p.expect : [p.expect];
      const ok = dev || (r.status < 400 && expected.includes(cc));
      if (!ok) {
        bad++;
        report.fail(p.cls, `${p.origin} ${p.path}: ${r.status}, cache-control "${cc}", wanted ${expected.join(" or ")}`);
      }
      raw.push({ ...p, url: base + p.path, status: r.status, cacheControl: cc, cdn: r.h.get("x-vercel-cache"), age: r.h.get("age"), ms: r.ms, ok });
      rows.push([ok ? "ok" : "FAIL", p.cls, p.origin, p.path + (p.headers?.RSC ? " (RSC)" : ""), r.status, cc, r.h.get("x-vercel-cache"), p.why]);
    } catch (e) {
      bad++;
      report.fail(p.cls, `${p.path}: ${String(e)}`);
    }
  }
  const file = writeResult(deck.root, "headers", args.opt("label"), { task: "headers", origin: P, demo: D, rows: raw });
  report.log(table(["", "Class", "Origin", "Path", "Status", "cache-control", "CDN", "Why"], rows));
  report.data.rows = rows.length;
  report.data.failed = bad;
  if (!bad) report.pass(`${rows.length} of ${rows.length} rows match the caching rules; wrote ${file}`);
}
