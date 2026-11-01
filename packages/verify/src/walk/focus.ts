import type { BrowserContext, Page, Request } from "@playwright/test";
import { hasFrame } from "@live-ish/engine/verify";
import { warmedIntros, type WarmedIntro } from "../lib/deck";
import { budgets } from "../lib/budgets";
import type { Session } from "../lib/session";
import { sleep } from "../lib/stats";
import { describeActive } from "../lib/watch";

/**
 * No press is lost on arrival. On every intro slide that warms the next frame, a press at 0.3, 0.6,
 * 0.9, 1.25, 2.5 and 4 s after arrival advances, with the warm document held back by 0, 1.5 and 3 s,
 * and `document.activeElement` is never the warming frame.
 */

/** Records every 50 ms sample where the warming frame holds the window's focus. */
const WARM_WATCH = `(() => {
  window.__warmFocus = [];
  setInterval(() => {
    const a = document.activeElement;
    if (a && a.matches && a.matches("iframe.frame-warm")) window.__warmFocus.push({ t: Math.round(performance.now()), s: new URLSearchParams(location.search).get("s") });
  }, 50);
})()`;

export const onSlide = (id: string) => `new URLSearchParams(location.search).get("s") === ${JSON.stringify(id)} && Boolean(document.querySelector("#stage"))`;

async function isWarmRequest(page: Page, req: Request): Promise<boolean> {
  if (!req.isNavigationRequest() || req.frame() === page.mainFrame()) return false;
  if (/[?&]warm=1(&|$)/.test(req.url())) return true;
  try {
    const el = await req.frame().frameElement();
    return ((await el.getAttribute("class")) ?? "").includes("frame-warm");
  } catch {
    return false;
  }
}

/** A goto that rides out an aborted navigation: a dev server recompiling, a client move in flight. */
export async function gotoRetry(page: Page, url: string) {
  for (let i = 0; ; i++) {
    try {
      return await page.goto(url);
    } catch (err) {
      if (i >= 2) throw err;
      await sleep(1000);
    }
  }
}

type Press = { intro: string; hold: number; delay: number; advanced: boolean; focusAtPress: string };

async function focusRun(session: Session, ctx: BrowserContext, intros: WarmedIntro[], hold: number, delays: number[]) {
  const { deck, report } = session;
  const page = await ctx.newPage();
  await page.addInitScript(WARM_WATCH);
  if (hold > 0) {
    await page.route(
      () => true,
      async (route, req) => {
        if (await isWarmRequest(page, req)) await sleep(hold);
        await route.continue().catch(() => {});
      },
    );
  }
  const presses: Press[] = [];
  const warmSamples: { intro: string; n: number }[] = [];
  const dwell: { intro: string; advanced: boolean }[] = [];
  const waitOn = (id: string, timeout: number) =>
    page
      .waitForFunction(onSlide(id), null, { timeout, polling: 50 })
      .then(() => true)
      .catch(() => false);
  const warmCount = async () => (await page.evaluate(`(window.__warmFocus || []).length`).catch(() => 0)) as number;
  const backToPrev = async (prev: string, intro: string, next: string) => {
    // Shift+ArrowLeft twice (next page, intro, previous slide), and a reload when a press is lost.
    let ok = false;
    if (await page.evaluate(onSlide(next))) {
      await page.keyboard.press("Shift+ArrowLeft");
      if (await waitOn(intro, 3000)) {
        await page.keyboard.press("Shift+ArrowLeft");
        ok = await waitOn(prev, 3000);
      }
    }
    if (!ok) {
      const before = await warmCount();
      if (before) warmSamples.push({ intro, n: before });
      await gotoRetry(page, session.present(prev));
      await waitOn(prev, 15000);
      await sleep(2000);
    }
    await sleep(700);
  };

  for (const { prev, intro, next } of intros) {
    await gotoRetry(page, session.present(prev));
    await waitOn(prev, 15000);
    await sleep(2500);
    const trial = async (delay: number, counted: boolean) => {
      await page.keyboard.press("Shift+ArrowRight");
      if (!(await waitOn(intro, 4000))) {
        // The arrival press is not under test, and a cold first load can miss it. Once more.
        const at = (await page.evaluate(`location.search`)) as string;
        report.log(`    note ${intro} hold ${hold}: no arrival from ${prev} (at ${at}, focus ${await page.evaluate(describeActive)}); pressing again`);
        if (!at.includes(`s=${prev}`)) await gotoRetry(page, session.present(prev));
        await waitOn(prev, 15000);
        await sleep(2500);
        await page.keyboard.press("Shift+ArrowRight");
        if (!(await waitOn(intro, 8000))) return null;
      }
      const arrived = Date.now();
      await sleep(delay - (Date.now() - arrived));
      const focusAtPress = (await page.evaluate(describeActive)) as string;
      await page.keyboard.press("ArrowRight");
      const advanced = await waitOn(next, 3000);
      if (counted) presses.push({ intro, hold, delay, advanced, focusAtPress });
      await backToPrev(prev, intro, next);
      return advanced;
    };
    for (const delay of delays) await trial(delay, true);
    // A 5 s dwell: the warming frame never takes focus in the first 5 s, and a press then advances.
    const adv = await trial(5000, false);
    dwell.push({ intro, advanced: Boolean(adv) });
    const n = await warmCount();
    if (n) warmSamples.push({ intro, n });
    await page.evaluate(`window.__warmFocus = []`).catch(() => {});
    const lost = presses.filter((p) => p.intro === intro && !p.advanced);
    report.log(`    note hold ${hold} ms, ${intro}: ${delays.length - lost.length}/${delays.length} advanced${lost.length ? ` (lost at ${lost.map((p) => `${p.delay} ms on ${p.focusAtPress}`).join(", ")})` : ""}`);
  }
  await page.close();
  return { presses, warmSamples, dwell };
}

export async function walkFocus(session: Session, only: string | undefined, holds: number[], delays: number[], serial: boolean, serversUp: Set<string>) {
  const { report, deck } = session;
  const intros = warmedIntros(deck, serversUp).filter((i) => !only || i.intro === only || i.next === only || deck.demos.find((d) => d.id === only)?.pages.some((p) => p.id === i.intro));
  if (!intros.length) {
    // A deck with no intro has nothing that warms a frame, so nothing can take a press.
    if (!deck.demos.some((d) => d.pages.some(hasFrame))) return report.note("no framed pages: nothing to walk");
    return report.fail("focus", `no intro slide warms a frame${only ? ` for ${only}` : ""}`);
  }
  report.log(`  ${intros.length} intro slide(s), presses at ${delays.join(", ")} ms, warm document held ${holds.join(", ")} ms`);
  const run = async (hold: number) => {
    const ctx = await session.context({ viewport: { width: 1920, height: 1080 } });
    try {
      return await focusRun(session, ctx, intros, hold, delays);
    } finally {
      await ctx.close();
    }
  };
  const results: Awaited<ReturnType<typeof run>>[] = [];
  if (serial) for (const h of holds) results.push(await run(h));
  else results.push(...(await Promise.all(holds.map(run))));
  const presses = results.flatMap((r) => r.presses);
  const lost = presses.filter((p) => !p.advanced);
  report.data.focus = { presses: presses.length, lost: lost.length };
  report.log(`\n  presses: ${presses.length}, lost: ${lost.length} (budget ${budgets.focus.lostPresses.limit})`);
  for (const h of holds) {
    const ph = presses.filter((p) => p.hold === h);
    report.log(`    hold ${h} ms: ${ph.filter((p) => !p.advanced).length} lost of ${ph.length}; by delay: ${delays.map((d) => `${d} ms ${ph.filter((p) => p.delay === d && !p.advanced).length}`).join(", ")}`);
  }
  if (lost.length > budgets.focus.lostPresses.limit) report.fail("focus", `${lost.length} of ${presses.length} presses lost: ${lost.map((p) => `${p.intro} +${p.delay} ms (hold ${p.hold}, focus ${p.focusAtPress})`).join("; ")}`);
  else report.pass(`focus: all ${presses.length} presses advanced`);
  const warm = new Map<string, number>();
  for (const w of results.flatMap((r) => r.warmSamples)) warm.set(w.intro, (warm.get(w.intro) ?? 0) + w.n);
  if (warm.size) report.fail("focus", `the warming frame held focus on ${warm.size} intro(s): ${[...warm].map(([intro, n]) => `${intro} ${(n * 0.05).toFixed(1)} s`).join(", ")} (50 ms samples, all holds)`);
  else report.pass("focus: document.activeElement was never iframe.frame-warm (50 ms samples, including a 5 s dwell per intro and hold)");
  const dwell = results.flatMap((r) => r.dwell);
  const dwellLost = dwell.filter((d) => !d.advanced);
  if (dwellLost.length) report.fail("focus", `a press after the 5 s dwell was lost ${dwellLost.length} of ${dwell.length} times: ${[...new Set(dwellLost.map((d) => d.intro))].join(", ")}`);
  else report.pass("focus: a press after a 5 s dwell advanced on every intro");
}
