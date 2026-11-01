import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type CDPSession, type Page } from "@playwright/test";
import { EnvironmentError, type Parsed } from "../lib/args";
import type { DeckData } from "../lib/deck";
import { PROFILES, chromiumArgs, framesOriginFor, type ProfileName } from "../lib/session";

/** Measurements only: nothing here changes the app. */

export interface PerfContext {
  deck: DeckData;
  args: Parsed;
  P: string;
  D: string;
  profile: ProfileName;
}

/** The two origins under test. `--origin` is the presenter, `--demo` the frames. */
export function origins(args: Parsed, deck: DeckData): { P: string; D: string } {
  const P = (args.opt("origin") ?? "http://localhost:3000").replace(/\/$/, "");
  return { P, D: (args.opt("demo") ?? framesOriginFor(P, deck.deck.hosts.frames)).replace(/\/$/, "") };
}

/** Site isolation off, so the page's CDP session sees cross-origin frames and the profile reaches them. */
export async function launch(deck: DeckData): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true, args: chromiumArgs(deck.input.config.verify?.chromiumArgs ?? [], [], true) });
  } catch (e) {
    throw new EnvironmentError(`Could not start chromium: ${(e as Error).message.split("\n")[0]}. Run playwright install chromium.`);
  }
}

export async function cdpProfile(cdp: CDPSession, name: ProfileName): Promise<void> {
  const p = PROFILES[name];
  if (p) await cdp.send("Network.emulateNetworkConditions", p);
}

/** Web vitals observers, installed before any page script. */
export const INIT = `
(() => {
  const m = (window.__m = { lcp: 0, lcpEl: null, lcpUrl: null, cls: 0, shifts: [], long: [], fcp: 0 });
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { m.lcp = e.startTime; m.lcpEl = e.element ? (e.element.className || e.element.tagName) + '' : null; m.lcpUrl = e.url || null; m.lcpSize = e.size; } }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (!e.hadRecentInput) { m.cls += e.value; m.shifts.push({ v: e.value, t: e.startTime, src: (e.sources||[]).map(s => s.node ? (s.node.className || s.node.nodeName) + '' : '?') }); } } }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) m.long.push({ t: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') m.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
  } catch (e) {}
})();
`;

export interface Req {
  id: string;
  url: string;
  method: string;
  type?: string;
  start: number;
  end?: number;
  rsc: boolean;
  prefetch: string | null;
  priority?: string;
  status?: number;
  mime?: string;
  disk?: boolean;
  memCache?: boolean;
  cacheControl?: string;
  cdn?: string;
  bytes?: number;
  failed?: string;
}

type Headers = Record<string, string>;

/** A CDP network log on a page: every request, its status, cache flags, headers and bytes. */
export async function netlog(page: Page): Promise<{ cdp: CDPSession; list: () => Req[]; reset: () => void }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const reqs = new Map<string, Req>();
  cdp.on("Network.requestWillBeSent", (e: { requestId: string; type?: string; timestamp: number; request: { url: string; method: string; headers: Headers; initialPriority?: string } }) => {
    const h = e.request.headers;
    reqs.set(e.requestId, { id: e.requestId, url: e.request.url, method: e.request.method, type: e.type, start: e.timestamp, prefetch: h["Next-Router-Prefetch"] ?? h["next-router-prefetch"] ?? null, rsc: Boolean(h["RSC"] ?? h["rsc"]), priority: e.request.initialPriority });
  });
  cdp.on("Network.requestServedFromCache", (e: { requestId: string }) => {
    const r = reqs.get(e.requestId);
    if (r) r.memCache = true;
  });
  cdp.on("Network.responseReceived", (e: { requestId: string; response: { status: number; mimeType: string; fromDiskCache?: boolean; headers: Headers } }) => {
    const r = reqs.get(e.requestId);
    if (!r) return;
    const h = e.response.headers;
    r.status = e.response.status;
    r.mime = e.response.mimeType;
    r.disk = e.response.fromDiskCache;
    r.cacheControl = h["cache-control"] ?? h["Cache-Control"];
    r.cdn = h["x-vercel-cache"];
  });
  cdp.on("Network.loadingFinished", (e: { requestId: string; encodedDataLength: number; timestamp: number }) => {
    const r = reqs.get(e.requestId);
    if (!r) return;
    r.bytes = e.encodedDataLength;
    r.end = e.timestamp;
  });
  cdp.on("Network.loadingFailed", (e: { requestId: string; errorText: string }) => {
    const r = reqs.get(e.requestId);
    if (r) r.failed = e.errorText;
  });
  return { cdp, list: () => [...reqs.values()], reset: () => reqs.clear() };
}

export function kind(r: { url: string; type?: string; rsc?: boolean }): string {
  const u = r.url;
  if (r.rsc || /[?&]_rsc=/.test(u)) return "rsc";
  if (/\.(js|mjs)(\?|$)/.test(u) || r.type === "Script") return "js";
  if (/\.css(\?|$)/.test(u) || r.type === "Stylesheet") return "css";
  if (/\.(otf|ttf|woff2?)(\?|$)/.test(u) || r.type === "Font") return "font";
  if (/\.(png|jpe?g|webp|avif|svg|gif)(\?|$)/.test(u) || r.type === "Image") return "img";
  if (r.type === "Document") return "doc";
  return r.type?.toLowerCase() || "other";
}

export interface Summary {
  requests: number;
  bytes: number;
  by: Record<string, { n: number; bytes: number }>;
  notModified: number;
  fromCache: number;
  presenter: number;
  demo: number;
}

export function summarize(list: Req[], P: string, D: string): Summary {
  const out: Summary = { requests: 0, bytes: 0, by: {}, notModified: 0, fromCache: 0, presenter: 0, demo: 0 };
  for (const r of list) {
    if (r.url.startsWith("data:")) continue;
    out.requests++;
    const b = r.bytes ?? 0;
    out.bytes += b;
    const k = kind(r);
    out.by[k] ??= { n: 0, bytes: 0 };
    out.by[k].n++;
    out.by[k].bytes += b;
    if (r.status === 304) out.notModified++;
    if (r.disk || r.memCache) out.fromCache++;
    if (D !== P && r.url.startsWith(D)) out.demo++;
    else if (r.url.startsWith(P)) out.presenter++;
  }
  return out;
}

function shortCommit(root: string): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "nogit";
  }
}

/** Writes `.live-ish/perf/<date>-<commit>-<task>[-<label>].json` and returns its path. */
export function writeResult(root: string, task: string, label: string | undefined, data: unknown): string {
  const dir = path.join(root, ".live-ish", "perf");
  mkdirSync(dir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(dir, `${date}-${shortCommit(root)}-${task}${label ? `-${label}` : ""}.json`);
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return path.relative(root, file);
}
