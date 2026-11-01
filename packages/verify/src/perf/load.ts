import { hasFrame } from "@live-ish/engine/verify";
import { budgets } from "../lib/budgets";
import { numberOpt } from "../lib/args";
import type { DeckData } from "../lib/deck";
import { isBlocked } from "../lib/deck";
import type { Report } from "../lib/report";
import { kb, median, percentile, round, table } from "../lib/stats";
import { INIT, cdpProfile, kind, launch, netlog, summarize, writeResult, type PerfContext, type Req } from "./lib";

/** First load, cold then warm, per URL, and the engine's own bytes against their budgets. */

/** A URL of each kind the deck has: the root, the title, an intro, a framed page, the last slide, the audience. */
export function loadUrls(deck: DeckData, query = ""): string[] {
  const title = deck.slides.find((s) => s.layout === "title") ?? deck.slides[0];
  const framed = deck.slides.find((s) => s.page && hasFrame(s.page) && !isBlocked(s.page) && s.page.frame.kind === "web");
  const intro = deck.slides.find((s) => s.page?.beat === "intro");
  const urls = ["/", `/s/${title.id}`, intro && `/s/${intro.id}`, framed && `/s/${framed.id}`, `/s/${deck.slides.at(-1)!.id}`, framed && `/present?s=${framed.id}`];
  return [...new Set(urls.filter((u): u is string => Boolean(u)))].map((u) => (query ? `${u}${u.includes("?") ? "&" : "?"}${query}` : u));
}

/** Hydration and the first step's done, read by polling. */
const HOOKS = `
(() => {
  const t = (window.__t = {});
  let seq;
  Object.defineProperty(window, '__stepSeq', { configurable: true, get() { return seq; }, set(v) { if (seq === undefined) t.firstStep = performance.now(); seq = v; } });
  const poll = () => {
    const s = document.getElementById('stage');
    if (s && !t.hydrated && Object.keys(s).some((k) => k.startsWith('__reactFiber') || k.startsWith('__reactProps'))) t.hydrated = performance.now();
    const f = document.querySelector('.page-frame__iframe');
    if (f && !t.frameInserted) t.frameInserted = performance.now();
    if (!t.hydrated || (!t.firstStep && performance.now() < 15000)) requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
})();
`;

const READ = `(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const m = window.__m;
  const fcp = m.fcp;
  const tbt = m.long.filter((l) => l.t >= fcp).reduce((a, l) => a + Math.max(0, l.d - 50), 0);
  return { ttfb: nav.responseStart, dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, fcp, lcp: m.lcp, lcpEl: m.lcpEl, lcpUrl: m.lcpUrl, cls: m.cls, tbt, longTasks: m.long.length, hydrated: window.__t.hydrated ?? null, firstStep: window.__t.firstStep ?? null, htmlBytes: nav.encodedBodySize };
})()`;

interface Row {
  run: number;
  url: string;
  phase: "cold" | "warm";
  ttfb: number;
  fcp: number;
  lcp: number;
  lcpEl: string | null;
  cls: number;
  tbt: number;
  hydrated: number | null;
  firstStep: number | null;
  requests: number;
  kb: number;
  notModified: number;
  fromCache: number;
}

/**
 * The engine's own transfer on a page, from the cold load. Next's and React's chunks count, because
 * a deck cannot leave them out. Frames, fonts and theme files are the deck's and do not.
 */
export function engineBytes(list: Req[], P: string): { js: number; css: number; files: number } {
  const own = list.filter((r) => r.url.startsWith(`${P}/_next/static/`));
  const sum = (k: string) => own.filter((r) => kind(r) === k).reduce((n, r) => n + (r.bytes ?? 0), 0);
  return { js: sum("js"), css: sum("css"), files: own.length };
}

export async function run({ deck, args, P, D, profile }: PerfContext, report: Report): Promise<void> {
  const runs = numberOpt(args, "runs", 2);
  const chrome = args.opt("chrome");
  const urls = args.opt("only") ? [args.opt("only")!] : loadUrls(deck, chrome ? `chrome=${chrome}` : "");
  const browser = await launch(deck);
  const rows: Row[] = [];
  const raw: unknown[] = [];
  const titleUrl = urls.find((u) => u.startsWith(`/s/${deck.slides.find((s) => s.layout === "title")?.id ?? deck.slides[0].id}`));
  let engine: ReturnType<typeof engineBytes> | null = null;
  let themeCss: number | null = null;
  for (let i = 0; i < runs; i++) {
    for (const url of urls) {
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
      await context.addInitScript(INIT);
      await context.addInitScript(HOOKS);
      const page = await context.newPage();
      const net = await netlog(page);
      await cdpProfile(net.cdp, profile);
      for (const phase of ["cold", "warm"] as const) {
        net.reset();
        await page.goto(P + url, { waitUntil: "load", timeout: 60000 });
        await page.waitForTimeout(/present|\/s\/.*(before|after)/.test(url) ? 6000 : 3500);
        const m = (await page.evaluate(READ)) as Omit<Row, "run" | "url" | "phase" | "requests" | "kb" | "notModified" | "fromCache">;
        const list = net.list();
        const s = summarize(list, P, D);
        if (phase === "cold" && url === titleUrl) {
          engine = engineBytes(list, P);
          themeCss = list.filter((r) => /\/live-ish\/chrome\/[\w-]+\.css/.test(r.url)).reduce((n, r) => n + (r.bytes ?? 0), 0);
        }
        const row: Row = { run: i, url, phase, ...m, requests: s.requests, kb: kb(s.bytes), notModified: s.notModified, fromCache: s.fromCache };
        rows.push(row);
        raw.push({ ...row, net: s, requests: list.map((r) => ({ url: r.url, kind: kind(r), status: r.status, bytes: r.bytes, disk: r.disk, mem: r.memCache, cc: r.cacheControl, cdn: r.cdn, prio: r.priority })) });
        report.log(`${profile} run${i} ${phase.padEnd(4)} ${url.padEnd(26)} ttfb=${round(m.ttfb)} fcp=${round(m.fcp)} lcp=${round(m.lcp)} cls=${m.cls.toFixed(3)} tbt=${round(m.tbt)} hyd=${round(m.hydrated) ?? "-"} step0=${round(m.firstStep) ?? "-"} req=${s.requests} ${kb(s.bytes)}KB 304=${s.notModified}`);
      }
      await context.close();
    }
  }
  await browser.close();
  const out = writeResult(deck.root, `load-${profile}`, args.opt("label"), { task: "load", origin: P, demo: D, profile, runs, engine, themeCss, rows: raw });
  const med = (url: string, phase: string, f: (r: Row) => number | null) => round(median(rows.filter((r) => r.url === url && r.phase === phase).map(f)));
  report.log(
    "\n" +
      table(
        ["URL", "Cache", "TTFB", "FCP", "LCP", "LCP p90", "CLS", "TBT", "Hydrated", "Frame s0", "Requests", "KB", "304s"],
        urls.flatMap((url) =>
          (["cold", "warm"] as const).map((phase) => {
            const sel = rows.filter((r) => r.url === url && r.phase === phase);
            return [url, phase, med(url, phase, (r) => r.ttfb), med(url, phase, (r) => r.fcp), med(url, phase, (r) => r.lcp), round(percentile(sel.map((r) => r.lcp), 0.9)), Math.max(...sel.map((r) => r.cls)).toFixed(3), med(url, phase, (r) => r.tbt), med(url, phase, (r) => r.hydrated), med(url, phase, (r) => r.firstStep), med(url, phase, (r) => r.requests), med(url, phase, (r) => r.kb), med(url, phase, (r) => r.notModified)];
          }),
        ),
      ),
  );
  report.log(`\nwrote ${out}`);
  report.data.result = out;
  if (engine) {
    const { js, css } = engine as ReturnType<typeof engineBytes>;
    const b = budgets.load;
    report.data.engine = { js, css, themeCss, jsLimit: b.engineJsBytes.limit, cssLimit: b.engineCssBytes.limit };
    const line = (name: string, bytes: number, limit: number) => `${name} on a title slide: ${bytes} bytes (${(bytes / 1024).toFixed(1)} KB), budget ${limit} bytes (${limit / 1024} KB)`;
    const check = (name: string, bytes: number, budget: { limit: number; tier: string }) => (bytes > budget.limit && budget.tier === "guarantee" ? report.fail("load", line(name, bytes, budget.limit)) : report.pass(line(name, bytes, budget.limit)));
    check("engine JavaScript", js, b.engineJsBytes);
    check("engine CSS", css, b.engineCssBytes);
    if (themeCss !== null) check("audience theme CSS", themeCss, b.themeCssBytes);
  }
  const shift = Math.max(...rows.map((r) => r.cls));
  report.log(`largest CLS ${shift.toFixed(4)}, target under ${budgets.load.cls.limit}`);
}
