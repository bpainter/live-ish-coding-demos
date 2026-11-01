import type { Page, Route } from "@playwright/test";
import { hasFrame } from "@live-ish/engine/verify";
import { numberOpt } from "../lib/args";
import { budgets } from "../lib/budgets";
import { plainRun, type DeckData } from "../lib/deck";
import type { Report } from "../lib/report";
import { median, percentile, table } from "../lib/stats";
import { cdpProfile, kind, launch, writeResult, type PerfContext } from "./lib";

/**
 * Slide to slide: key to new canvas painted, background ready, intro still ready and the frame's
 * first step, in the reader or the audience window, cold then warm. `--variant=noprefetch` aborts
 * every router prefetch, `nowarm` aborts the warm document on intro slides, and `control` runs the
 * same interception without aborting.
 */

/** Stretches of the deck: a start slide and a number of presses. */
function stretches(deck: DeckData): [string, number][] {
  const firstDemo = deck.demos[0]?.pages[0].id;
  const copy = plainRun(deck, 3)?.id;
  const n = deck.slides.length;
  const out: [string, number][] = [];
  if (copy) out.push([copy, Math.min(2, n - 1 - deck.ids.indexOf(copy))]);
  if (firstDemo) out.push([firstDemo, Math.min(8, n - 1 - deck.ids.indexOf(firstDemo))]);
  if (!out.length) out.push([deck.ids[0], Math.min(4, n - 1)]);
  return out.filter(([, presses]) => presses > 0);
}

const HOOKS = `
(() => {
  const w = window;
  w.__swaps = [];
  w.__steps = [];
  let seq;
  Object.defineProperty(w, '__stepSeq', { configurable: true, get() { return seq; }, set(v) { seq = v; w.__steps.push(performance.now()); } });
  let last = null;
  const check = () => {
    const s = document.getElementById('stage');
    if (s && s !== last) {
      last = s;
      const rec = { t: performance.now(), bg: s.dataset.background };
      w.__swaps.push(rec);
      requestAnimationFrame(() => requestAnimationFrame(() => { rec.paint = performance.now(); }));
    }
  };
  new MutationObserver(check).observe(document, { subtree: true, childList: true });
})();
`;

const PROBE = `(({ n, k }) => {
  const swap = window.__swaps[n] ?? null;
  let bgEnd = null;
  if (swap && swap.bg) {
    const layer = document.querySelector('#stage .stage__bg');
    const urls = layer ? [...getComputedStyle(layer).backgroundImage.matchAll(/url\\("?([^")]+)"?\\)/g)].map((m) => m[1]) : [];
    for (const u of [...urls, swap.bg]) {
      const e = performance.getEntriesByName(new URL(u, location.href).href).pop();
      if (e) { bgEnd = e.responseEnd; break; }
    }
  }
  const img = document.querySelector('.stage__slide .intro__image, .stage__slide .intro img');
  if (img && img.complete && img.naturalWidth && !img.__done) img.__done = performance.now();
  return { swap, step: window.__steps[k] ?? null, frame: document.querySelector('.page-frame__iframe') !== null, url: location.pathname + location.search, bgEnd, needsBg: Boolean(swap && swap.bg), img: Boolean(img), imgDone: img ? img.__done ?? null : null };
})`;

interface Rec {
  mode: string;
  variant: string;
  profile: string;
  pass: "cold" | "warm";
  from: string;
  to: string;
  beat: string;
  swapMs: number | null;
  paintMs: number | null;
  frameStep0Ms: number | null;
  bgReadyMs: number | null;
  introImgReadyMs: number | null | undefined;
  rscOnPress: string[];
}

interface Probe {
  swap: { t: number; bg?: string; paint?: number } | null;
  step: number | null;
  frame: boolean;
  url: string;
  bgEnd: number | null;
  needsBg: boolean;
  img: boolean;
  imgDone: number | null;
}

export async function run({ deck, args, P, D, profile }: PerfContext, report: Report): Promise<void> {
  const mode = args.opt("mode") ?? "reader";
  const variant = args.opt("variant") ?? "prefetch";
  const dwell = numberOpt(args, "dwell", 3000);
  const order = deck.ids;
  const slideUrl = (id: string) => (mode === "reader" ? `${P}/s/${id}` : `${P}/present?s=${id}`);
  const state = { allow: null as string | null, onIntro: false };
  const beatOf = (url: string) => {
    const id = url.startsWith("/s/") ? url.slice(3).split("?")[0] : new URLSearchParams(url.split("?")[1]).get("s");
    return deck.slides.find((s) => s.id === id)?.page?.beat ?? "copy";
  };

  const browser = await launch(deck);
  const all: Rec[] = [];
  for (const [start, presses] of stretches(deck)) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await context.addInitScript(HOOKS);
    const page: Page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdpProfile(cdp, profile);
    const reqLog: { at: number; url: string; rsc: boolean; kind: string }[] = [];
    page.on("request", (r) => {
      const h = r.headers();
      reqLog.push({ at: Date.now(), url: r.url(), rsc: Boolean(h["rsc"]) || /_rsc=/.test(r.url()), kind: kind({ url: r.url(), type: r.resourceType() === "document" ? "Document" : "" }) });
    });
    if (variant === "noprefetch") {
      await page.route(/_rsc=/, (route: Route) => {
        const h = route.request().headers();
        const u = new URL(route.request().url());
        const id = u.pathname.startsWith("/s/") ? u.pathname.slice(3) : u.searchParams.get("s");
        if (h["next-router-prefetch"] || h["next-router-segment-prefetch"] || !state.allow || id !== state.allow) return route.abort();
        return route.continue();
      });
    }
    if (variant === "nowarm" || variant === "control") {
      // On an intro slide no page frame mounts, so a document requested there is the warm one.
      await page.route(`${D}/**`, (route: Route) => {
        if (variant === "nowarm" && state.onIntro && route.request().resourceType() === "document") return route.abort();
        return route.continue();
      });
    }
    for (const pass of ["cold", "warm"] as const) {
      await page.goto(slideUrl(start), { waitUntil: "load" });
      await page.waitForTimeout(dwell + 1500);
      for (let i = 0; i < presses; i++) {
        const before = (await page.evaluate("({ swaps: window.__swaps.length, steps: window.__steps.length, url: location.pathname + location.search })")) as { swaps: number; steps: number; url: string };
        const wall = Date.now();
        const curId = before.url.startsWith("/s/") ? before.url.slice(3).split("?")[0] : new URLSearchParams(before.url.split("?")[1]).get("s");
        state.allow = order[order.indexOf(curId ?? "") + 1] ?? null;
        state.onIntro = false;
        const t0 = (await page.evaluate("performance.now()")) as number;
        await page.keyboard.press("Shift+ArrowRight");
        let r: Probe | null = null;
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
          r = (await page.evaluate(`${PROBE}(${JSON.stringify({ n: before.swaps, k: before.steps })})`)) as Probe;
          if (r.swap?.paint && (!r.frame || r.step) && (!r.needsBg || r.bgEnd !== null) && (!r.img || r.imgDone)) break;
          if (r.swap?.paint && Date.now() - wall > 5000) break;
          await page.waitForTimeout(25);
        }
        state.allow = null;
        const to = r?.url ?? "";
        state.onIntro = beatOf(to) === "intro";
        const swapMs = r?.swap ? r.swap.t - t0 : null;
        const during = reqLog.filter((q) => q.at >= wall && q.at <= wall + (swapMs ?? 3000) + 5);
        const rec: Rec = {
          mode,
          variant,
          profile,
          pass,
          from: before.url,
          to,
          beat: beatOf(to),
          swapMs: swapMs == null ? null : Math.round(swapMs),
          paintMs: r?.swap?.paint ? Math.round(r.swap.paint - t0) : null,
          frameStep0Ms: r?.step ? Math.round(r.step - t0) : null,
          bgReadyMs: r?.bgEnd == null ? null : Math.max(0, Math.round(r.bgEnd - t0)),
          introImgReadyMs: r?.img ? (r.imgDone == null ? null : Math.max(0, Math.round(r.imgDone - t0))) : undefined,
          rscOnPress: during.filter((q) => q.rsc).map((q) => q.url.replace(P, "")),
        };
        all.push(rec);
        report.log(`${mode} ${variant} ${profile} ${pass} ${rec.from.padEnd(30)} -> ${rec.to.padEnd(30)} paint=${rec.paintMs} step0=${rec.frameStep0Ms ?? "-"} bg=${rec.bgReadyMs ?? "-"} img=${rec.introImgReadyMs ?? "-"} rscOnPress=${rec.rscOnPress.length}`);
        await page.waitForTimeout(dwell);
      }
    }
    await context.close();
  }
  await browser.close();
  const out = writeResult(deck.root, `nav-${mode}-${variant}-${profile}`, args.opt("label"), { task: "nav", origin: P, demo: D, mode, variant, profile, dwell, rows: all });
  const rows: (string | number | null)[][] = [];
  for (const pass of ["cold", "warm"] as const)
    for (const beat of ["intro", "before", "after", "single", "copy"]) {
      const sel = all.filter((r) => r.pass === pass && r.beat === beat && r.swapMs != null);
      if (!sel.length) continue;
      rows.push([pass, beat, sel.length, `${median(sel.map((r) => r.paintMs))} / ${percentile(sel.map((r) => r.paintMs), 0.9)}`, `${median(sel.map((r) => r.bgReadyMs)) ?? "-"}`, `${median(sel.map((r) => r.introImgReadyMs)) ?? "-"}`, `${median(sel.map((r) => r.frameStep0Ms)) ?? "-"} / ${percentile(sel.map((r) => r.frameStep0Ms), 0.9) ?? "-"}`, sel.reduce((n, r) => n + r.rscOnPress.length, 0)]);
    }
  report.log("\n" + table(["Pass", "To", "n", "Paint med / p90", "Background med", "Intro still med", "Frame s0 med / p90", "RSC on press"], rows));
  const lost = all.filter((r) => r.swapMs == null).length;
  if (lost) report.fail("nav", `${lost} press(es) did not change the slide`);
  const warm = percentile(all.filter((r) => r.pass === "warm").map((r) => r.paintMs), 0.9);
  report.data.keyToPaintP90 = warm;
  report.pass(`key to new slide painted, warm p90 ${warm} ms, target ${budgets.nav.keyToPaintP90Ms.limit} ms; wrote ${out}`);
}
