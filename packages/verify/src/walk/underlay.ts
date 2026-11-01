import type { Page } from "@playwright/test";
import { firstPoster, posterMatchesTheme, posterUrl, type FramePage } from "@live-ish/engine/verify";
import { budgets, DEV_SERVER_LINE } from "../lib/budgets";
import { around, liveFrames, pick, stepKey } from "../lib/deck";
import { loadSharp, meanDifference, type Sharp } from "../lib/pixels";
import { applyProfile, type ProfileName, type Session } from "../lib/session";
import { median, pct } from "../lib/stats";
import { FRAME_VISIBLE } from "../lib/watch";
import { onSlide } from "./focus";

/**
 * Key to frame content visible (poster or live document), forward and Back arrivals, in the audience
 * and reader windows: no "Loading demo" on a page that has a poster, and the swap difference between
 * the poster and the live document. A small deck repeats its arrivals until a window has 50, so a p90
 * means the same thing on five slides as on fifty.
 */

export type Win = "audience" | "reader";

export interface Arrival {
  page: string;
  step: string;
  window: Win;
  dir: "forward" | "back";
  ms: number;
  stage: number;
  kind: string | null;
  loading: number[];
  poster: boolean;
  diff: number | null;
}

export interface Leg {
  page: FramePage;
  dir: "forward" | "back";
  from: string;
  key: string;
  step: number;
}

/** The arrivals a set of pages gives, repeated in order until the list reaches `min`. */
export function arrivalPlan(legs: Leg[], min: number): Leg[] {
  if (!legs.length) return [];
  const out: Leg[] = [];
  while (out.length < min) out.push(...legs);
  return out;
}

/** The p90 of each window, the way the budgets compute it: nearest rank over every arrival. */
export function windowStats(xs: Arrival[]) {
  const ms = xs.map((a) => (a.ms < 0 ? 1500 : a.ms));
  const st = xs.map((a) => (a.stage < 0 ? 1500 : a.stage));
  return { arrivals: xs.length, median: pct(ms, 50), p90: pct(ms, 90), stageMedian: pct(st, 50), stageP90: pct(st, 90) };
}

/**
 * Installed right before the press, because a frame that holds focus swallows the keydown, so the
 * clock starts here, a few ms early. Every animation frame for 1.5 s, it notes when the new stage's
 * frame slot first shows content (its poster, or a live document that reported ready) and every frame
 * where "Loading demo" is displayed. The outgoing stage is marked first.
 */
const UNDERLAY_PROBE = (target: string, reader: boolean) => `(() => {
  const old = document.querySelector("#stage");
  if (old) old.dataset.ulOld = "1";
  const st = { t0: performance.now(), stage: -1, visible: -1, kind: null, loading: [], done: false };
  window.__ul = st;
  const onTarget = () => ${reader ? `location.pathname === ${JSON.stringify(`/s/${target}`)}` : `new URLSearchParams(location.search).get("s") === ${JSON.stringify(target)}`};
  const loop = () => {
    const now = performance.now() - st.t0;
    const stage = document.querySelector("#stage:not([data-ul-old])");
    const pf = onTarget() && stage ? stage.querySelector(".page-frame") : null;
    if (pf && st.stage < 0) st.stage = now;
    if (pf) {
      const status = pf.querySelector(".page-frame__status");
      if (status && getComputedStyle(status).display !== "none" && /Loading demo/.test(status.textContent)) st.loading.push(Math.round(now));
      if (st.visible < 0) {
        const poster = pf.querySelector("img.page-frame__poster");
        const live = pf.dataset.status === "ready" && pf.querySelector('.page-frame__iframe[data-visible="true"]');
        if (live) { st.visible = now; st.kind = "live"; }
        else if (poster && !poster.hidden && poster.complete && poster.naturalWidth > 0 && getComputedStyle(poster).display !== "none") { st.visible = now; st.kind = "poster"; }
      }
    }
    if (now < 1500) requestAnimationFrame(loop);
    else st.done = true;
  };
  requestAnimationFrame(loop);
})()`;

/** The poster the page shows under the frame at a step, as DemoPageSlide and PageBody decide it. */
function posterFor(session: Session, page: FramePage, stepIndex: number): string | null {
  const step = page.steps[stepIndex];
  if (step.posterUnderlay === false) return null;
  const shown = session.options.chrome ?? page.chrome;
  if (!posterMatchesTheme(page.frame.kind, page.chrome, shown)) return null;
  return firstPoster(step.poster, posterUrl(page, step.id, page.chrome), page.frame.poster);
}

/** Mean absolute difference, 0 to 1, between the slot showing the live document and the poster. */
async function swapDiff(page: Page, poster: string, sharp: Sharp): Promise<number | null> {
  const style = await page.addStyleTag({ content: ".overlay, nextjs-portal { visibility: hidden !important; }" });
  try {
    const clip = (await page.evaluate(`(() => { const r = document.querySelector("#stage .page-frame").getBoundingClientRect(); return { x: Math.round(r.x) + 2, y: Math.round(r.y) + 2, width: Math.round(r.width) - 4, height: Math.round(r.height) - 4 }; })()`)) as { x: number; y: number; width: number; height: number };
    const live = await page.screenshot({ clip, animations: "disabled" });
    const ok = (await page.evaluate(`(async () => {
      const pf = document.querySelector("#stage .page-frame");
      const iframe = pf.querySelector('.page-frame__iframe[data-visible="true"]');
      if (!iframe) return false;
      iframe.style.visibility = "hidden";
      const img = document.createElement("img");
      img.className = "page-frame__poster";
      img.dataset.walk = "1";
      img.alt = "";
      img.src = ${JSON.stringify(poster)};
      pf.querySelector(".page-frame__scaled").prepend(img);
      await img.decode().catch(() => {});
      return true;
    })()`)) as boolean;
    if (!ok) return null;
    await page.waitForTimeout(50);
    const still = await page.screenshot({ clip, animations: "disabled" });
    await page.evaluate(`(() => { document.querySelector('img.page-frame__poster[data-walk]')?.remove(); const f = document.querySelector('#stage .page-frame__iframe[data-visible="true"]'); if (f) f.style.visibility = ""; })()`);
    const a = await sharp(live).raw().toBuffer({ resolveWithObject: true });
    const b = await sharp(still).raw().toBuffer({ resolveWithObject: true });
    return meanDifference(a, b);
  } finally {
    await style.evaluate((el) => (el as HTMLElement).remove()).catch(() => {});
  }
}

/** One run: every window, every arrival. */
async function oneRun(session: Session, plan: Leg[], windows: Win[], profile: ProfileName, sharp: Sharp): Promise<Arrival[]> {
  const { report } = session;
  const arrivals: Arrival[] = [];
  for (const win of windows) {
    const ctx = await session.context({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await applyProfile(page, profile);
    const url = (id: string) => (win === "audience" ? session.present(id) : session.reader(id));
    const here = (id: string) => (win === "audience" ? onSlide(id) : `location.pathname === ${JSON.stringify(`/s/${id}`)} && Boolean(document.querySelector("#stage"))`);
    for (const leg of plan) {
      const p = leg.page;
      await page.goto(url(leg.from));
      await page.waitForFunction(here(leg.from), null, { timeout: 15000 }).catch(() => null);
      // Arrival settles and the prefetches finish, as on stage.
      await page.waitForTimeout(2500);
      // Reader: keys act from the page, not from a control.
      if (win === "reader") await page.evaluate(`document.activeElement && document.activeElement !== document.body && !document.activeElement.matches("iframe") && document.activeElement.blur()`);
      await page.evaluate(UNDERLAY_PROBE(p.id, win === "reader"));
      await page.keyboard.press(leg.key);
      await page.waitForFunction(`window.__ul && window.__ul.done`, null, { timeout: 8000 }).catch(() => null);
      const ul = (await page.evaluate(`window.__ul`)) as { stage: number; visible: number; kind: string | null; loading: number[] };
      const step = p.steps[leg.step];
      const poster = posterFor(session, p, leg.step);
      const a: Arrival = { page: p.id, step: step.id, window: win, dir: leg.dir, ms: ul.visible, stage: ul.stage, kind: ul.kind, loading: ul.loading, poster: Boolean(poster), diff: null };
      // The swap difference, audience only, where the stage is at scale 1: the poster as the slot
      // shows it against the live document once the step is done, the overlay hidden in both.
      if (win === "audience" && poster) {
        const done = await page
          .waitForFunction(`Boolean((window.__stepResults || {})[${JSON.stringify(stepKey(p, step))}])`, null, { timeout: 15000 })
          .then(() => true)
          .catch(() => false);
        if (done) {
          await page.waitForTimeout(400);
          if (await page.$(FRAME_VISIBLE)) a.diff = await swapDiff(page, poster, sharp);
        }
      }
      arrivals.push(a);
      const bits = [`${a.ms < 0 ? "never" : `${Math.round(a.ms)} ms`} (${a.kind ?? "nothing"}; slide in the DOM at ${Math.round(a.stage)} ms)`, a.loading.length ? `"Loading demo" for ${a.loading.length} frame(s) from ${a.loading[0]} ms` : null, a.diff !== null ? `swap ${(a.diff * 100).toFixed(2)}%` : null].filter(Boolean);
      report.log(`    note ${win} ${leg.dir.padEnd(7)} ${p.id} ${step.id}: ${bits.join(", ")}`);
    }
    await ctx.close();
  }
  return arrivals;
}

export interface UnderlayOptions {
  only?: string;
  profile: ProfileName;
  noReader: boolean;
  runs: number;
  min: number;
  serversUp: Set<string>;
}

export async function walkUnderlay(session: Session, o: UnderlayOptions) {
  const { report, deck } = session;
  const sharp = loadSharp(deck.root);
  const windows: Win[] = o.noReader || !deck.deck.reader.enabled ? ["audience"] : ["audience", "reader"];
  const targets = pick(liveFrames(deck, o.serversUp), o.only, deck);
  const legs: Leg[] = targets.flatMap(({ page }) => {
    const { prev, next } = around(deck, page.id);
    const out: Leg[] = [];
    if (prev) out.push({ page, dir: "forward", from: prev.id, key: "Shift+ArrowRight", step: 0 });
    if (next) out.push({ page, dir: "back", from: next.id, key: "ArrowLeft", step: page.steps.length - 1 });
    return out;
  });
  if (!legs.length) return report.fail("underlay", "no framed page has a neighbour to arrive from");
  const plan = arrivalPlan(legs, o.min);
  report.log(`  ${legs.length} distinct arrival(s) from ${targets.length} page(s), ${plan.length} per window, ${o.runs} run(s), profile ${o.profile}, ${session.health.server ?? "unknown"} server`);

  const perRun: Arrival[][] = [];
  for (let i = 0; i < o.runs; i++) {
    if (o.runs > 1) report.log(`\n  run ${i + 1} of ${o.runs}`);
    perRun.push(await oneRun(session, plan, windows, o.profile, sharp));
  }

  const limits = { audience: budgets.underlay.audienceP90Ms.limit, reader: budgets.underlay.readerP90Ms.limit };
  // A dev server prints its numbers and applies no budget. The slide swap there costs the time, not
  // the poster, so its p90 says nothing about the stage.
  const dev = session.onDevServer;
  const summary: Record<string, unknown> = { profile: o.profile, runs: o.runs, server: session.health.server ?? null };
  for (const win of windows) {
    const stats = perRun.map((run) => windowStats(run.filter((a) => a.window === win)));
    const p90 = median(stats.map((s) => s.p90))!;
    const limit = limits[win];
    const line = `${win}: key to frame content visible, ${stats[0].arrivals} arrivals, median ${Math.round(median(stats.map((s) => s.median))!)} ms, p90 ${Math.round(p90)} ms${o.runs > 1 ? ` (median of ${o.runs} runs: ${stats.map((s) => Math.round(s.p90)).join(", ")})` : ""}, budget ${limit} ms p90; the new slide reached the DOM at median ${Math.round(median(stats.map((s) => s.stageMedian))!)}, p90 ${Math.round(median(stats.map((s) => s.stageP90))!)} ms`;
    summary[win] = { arrivals: stats[0].arrivals, p90, runs: stats.map((s) => s.p90), limit };
    if (dev) report.log(`    note ${line}`);
    else if (p90 > limit) report.fail("underlay", line);
    else report.pass(line);
    const all = perRun.flat().filter((a) => a.window === win);
    const loading = all.filter((a) => a.poster && a.loading.length);
    summary[`${win}Loading`] = loading.length;
    if (dev) continue;
    if (loading.length > budgets.underlay.loadingWithPoster.limit) report.fail("underlay", `${win}: "Loading demo" showed on ${loading.length} arrival(s) with a poster: ${[...new Set(loading.map((a) => `${a.page} ${a.dir}`))].join(", ")}`);
    else report.pass(`${win}: 0 "Loading demo" on ${all.filter((a) => a.poster).length} arrival(s) with a poster`);
  }
  const diffs = perRun.flat().filter((a) => a.diff !== null);
  const worst = diffs.length ? Math.max(...diffs.map((a) => a.diff!)) : null;
  summary.maxSwap = worst;
  summary.swapChecked = diffs.length;
  const over = diffs.filter((a) => a.diff! > budgets.underlay.posterSwap.limit);
  if (dev) report.log(`    note swap max ${worst === null ? "none" : `${(worst * 100).toFixed(2)}%`}`);
  else if (over.length) report.fail("underlay", `swap above ${budgets.underlay.posterSwap.limit * 100}%: ${[...new Set(over.map((a) => `${a.page} ${a.step} ${(a.diff! * 100).toFixed(2)}%`))].join(", ")}`);
  else if (diffs.length) report.pass(`swap at most ${budgets.underlay.posterSwap.limit * 100}% on all ${diffs.length} posters (max ${(worst! * 100).toFixed(2)}%)`);
  else report.note("no poster to compare: run capture first");
  report.data.underlay = summary;
  if (dev) report.log(`\n${DEV_SERVER_LINE}`);
}
