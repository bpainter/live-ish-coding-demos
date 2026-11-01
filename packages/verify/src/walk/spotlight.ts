import type { BrowserContext, Frame, Page } from "@playwright/test";
import { fixturePage, liveFrames, stepKey } from "../lib/deck";
import type { Checks } from "../lib/report";
import type { Session } from "../lib/session";
import { checkProtocol, installWatches, lastSeq, visibleFrame, waitForResult } from "../lib/watch";

/**
 * The spotlight contract. Two parts: a sampler for every walk (a box above 0.05 opacity sits on its
 * target's current rect), and the fixture in `demos/00-fixtures/` (radii, the fade around a width
 * transition and a scale-in, reduced motion, callouts, keycaps and the top layer).
 */

interface Box {
  state: string;
  o: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
type BoxSample = { t: number; boxes: Box[] };
export type R = { x: number; y: number; w: number; h: number };
type FrameSample = { t: number; rects: R[][]; vw: number; vh: number };

const BOX_SAMPLER_START = `(() => {
  window.__boxSamples = [];
  const gen = (window.__boxSampling = (window.__boxSamplingGen = (window.__boxSamplingGen || 0) + 1));
  const loop = () => {
    if (window.__boxSampling !== gen) return;
    const t = Date.now();
    const boxes = [...document.querySelectorAll("#stage .page-frame__scaled .overlay__spotlight")].map((e) => ({
      state: e.dataset.state, o: Number(getComputedStyle(e).opacity),
      x: parseFloat(e.style.left), y: parseFloat(e.style.top), w: parseFloat(e.style.width), h: parseFloat(e.style.height),
    }));
    window.__boxSamples.push({ t, boxes });
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})()`;
const BOX_SAMPLER_STOP = `(() => { window.__boxSampling = 0; const s = window.__boxSamples || []; window.__boxSamples = []; return s; })()`;

function frameSamplerStart(selectors: string[]): string {
  return `(() => {
    const sels = ${JSON.stringify(selectors)};
    window.__rectSamples = [];
    const gen = (window.__rectSampling = (window.__rectSamplingGen = (window.__rectSamplingGen || 0) + 1));
    const loop = () => {
      if (window.__rectSampling !== gen) return;
      const t = Date.now();
      const rects = sels.map((s) => { try { return [...document.querySelectorAll(s)].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0).map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height })); } catch (e) { return []; } });
      window.__rectSamples.push({ t, rects, vw: innerWidth, vh: innerHeight });
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  })()`;
}
const FRAME_SAMPLER_STOP = `(() => { window.__rectSampling = 0; const s = window.__rectSamples || []; window.__rectSamples = []; return { samples: s, vw: innerWidth, vh: innerHeight }; })()`;

/** The overlay's merge rule (within 12 frame px) and its viewport clip, so boxes and targets compare. */
export function merged(list: R[], vw: number, vhIn: number, clipBottom?: number): R[] {
  const out: R[] = [];
  for (const r of list) {
    const i = out.findIndex((o) => r.x <= o.x + o.w + 12 && o.x <= r.x + r.w + 12 && r.y <= o.y + o.h + 12 && o.y <= r.y + r.h + 12);
    if (i === -1) out.push({ ...r });
    else {
      const o = out[i];
      const x = Math.min(o.x, r.x);
      const y = Math.min(o.y, r.y);
      out[i] = { x, y, w: Math.max(o.x + o.w, r.x + r.w) - x, h: Math.max(o.y + o.h, r.y + r.h) - y };
    }
  }
  return out.map((r) => {
    if (clipBottom && r.y >= clipBottom) return r;
    const vh = clipBottom ? Math.min(vhIn, clipBottom) : vhIn;
    const near = r.x < 9 || r.y < 9 || r.x + r.w > vw - 9 || r.y + r.h > vh - 9;
    if (!near) return r;
    const x = Math.max(r.x, 0);
    const y = Math.max(r.y, 0);
    return { x, y, w: Math.max(Math.min(r.x + r.w, vw) - x, 0), h: Math.max(Math.min(r.y + r.h, vh) - y, 0) };
  });
}
const near1 = (a: R, b: R) => Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 && Math.abs(a.w - b.w) <= 1 && Math.abs(a.h - b.h) <= 1;

let sampledGroups: number[][] = [];

/**
 * Starts sampling boxes in the presenter and spotlight targets in the frame. `groups` are the
 * spotlight lists a box may belong to (the previous step's and this step's), merged apart as the
 * overlay merges them.
 */
export async function startSampler(page: Page, frame: Frame | null, groups: string[][]): Promise<boolean> {
  const selectors = groups.flat();
  let k = 0;
  sampledGroups = groups.map((g) => g.map(() => k++));
  if (!frame || !selectors.length) return false;
  try {
    await frame.evaluate(frameSamplerStart(selectors));
    await page.evaluate(BOX_SAMPLER_START);
    return true;
  } catch {
    return false;
  }
}

/**
 * Every sampled box above 0.05 opacity matches a merged target rect within 1 frame px. A box is drawn
 * from the rects message the frame posted, so it may lag the target by the message's own frame: a
 * match against the frame's samples from the last two animation frames counts.
 */
export async function finishSampler(page: Page, frame: Frame | null, clipBottom?: number): Promise<{ samples: number; visible: number; violations: string[] } | null> {
  const boxes = (await page.evaluate(BOX_SAMPLER_STOP).catch(() => [])) as BoxSample[];
  if (!frame) return null;
  const res = (await frame.evaluate(FRAME_SAMPLER_STOP).catch(() => null)) as { samples: FrameSample[]; vw: number; vh: number } | null;
  if (!res || !res.samples.length) return null;
  const violations: string[] = [];
  let visible = 0;
  for (const s of boxes) {
    // A box fading out keeps its last geometry by design, while its target may already have jumped.
    // The contract applies to boxes the gate shows.
    const shown = s.boxes.filter((b) => b.o > 0.05 && b.state === "shown");
    if (!shown.length) continue;
    const near = res.samples.filter((f) => f.t <= s.t + 1 && f.t >= s.t - 40);
    if (!near.length) continue;
    visible++;
    for (const b of shown) {
      const ok = near.some((f) => sampledGroups.some((g) => merged(g.flatMap((i) => f.rects[i] ?? []), f.vw, f.vh, clipBottom).some((r) => near1(r, b))));
      if (!ok) {
        const lastGroup = sampledGroups[sampledGroups.length - 1] ?? [];
        const end = near[near.length - 1];
        const cur = merged(lastGroup.flatMap((i) => end.rects[i] ?? []), end.vw, end.vh, clipBottom)[0];
        violations.push(`+${(s.t - (boxes[0]?.t ?? s.t)).toFixed(0)} ms ${b.state} box ${b.x.toFixed(1)},${b.y.toFixed(1)} ${b.w.toFixed(1)}x${b.h.toFixed(1)} at opacity ${b.o.toFixed(2)}; target ${cur ? `${cur.x.toFixed(1)},${cur.y.toFixed(1)} ${cur.w.toFixed(1)}x${cur.h.toFixed(1)}` : "gone"}`);
        break;
      }
    }
  }
  return { samples: boxes.length, visible, violations };
}

// ------------------------------------------------------------------------- the fixture

/** The target's four radii as CSS resolves them, computed here independently of the runtime. */
const TARGET_RADII = (sel: string) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const corner = (v) => { const p = v.split(" "); const res = (s, base) => s.endsWith("%") ? parseFloat(s) * base / 100 : parseFloat(s) || 0; const a = res(p[0], r.width); const b = res(p[1] || p[0], r.height); return Math.min(a, b); };
  const c = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(corner);
  const f = Math.min(1, r.width / Math.max(c[0] + c[1], 1e-9), r.width / Math.max(c[3] + c[2], 1e-9), r.height / Math.max(c[0] + c[3], 1e-9), r.height / Math.max(c[1] + c[2], 1e-9));
  return c.map((v) => v * f);
})()`;

const BOX_RADII = `[...document.querySelectorAll("#stage .overlay__spotlight")].map((e) => { const cs = getComputedStyle(e); return [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map((v) => parseFloat(v)); })`;

async function waitShown(page: Page, count: number, timeout = 8000): Promise<boolean> {
  return page
    .waitForFunction((n) => [...document.querySelectorAll("#stage .overlay__spotlight")].filter((e) => (e as HTMLElement).dataset.state === "shown").length >= n, count, { timeout })
    .then(() => true)
    .catch(() => false);
}

/**
 * One movement of a target while its box is shown: the timeline in ms from the target's first change
 * (box hidden, opacity 0, shown again), and whether the box stayed hidden throughout.
 */
async function timeline(page: Page, frame: Frame, index: number, sel: string, hook: string) {
  await frame.evaluate(frameSamplerStart([sel]));
  await page.evaluate(BOX_SAMPLER_START);
  await page.waitForTimeout(120);
  await frame.evaluate(`window.demoHooks.${hook}()`);
  await page.waitForTimeout(1100);
  const boxes = (await page.evaluate(BOX_SAMPLER_STOP)) as BoxSample[];
  const { samples } = (await frame.evaluate(FRAME_SAMPLER_STOP)) as { samples: FrameSample[] };
  const rectAt = (f: FrameSample) => f.rects[0]?.[0];
  const first = rectAt(samples[0]);
  let t0: number | null = null;
  let t1: number | null = null;
  for (let i = 1; i < samples.length; i++) {
    const a = rectAt(samples[i - 1]);
    const b = rectAt(samples[i]);
    if (!a || !b) continue;
    const changed = Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5 || Math.abs(a.w - b.w) > 0.5 || Math.abs(a.h - b.h) > 0.5;
    if (changed) {
      if (t0 === null) t0 = samples[i].t;
      t1 = samples[i].t;
    }
  }
  const last = rectAt(samples[samples.length - 1]);
  if (t0 === null || t1 === null || !first || !last) return null;
  const start = t0;
  const end = t1;
  const box = (s: BoxSample) => s.boxes[index];
  const hiddenAt = boxes.find((s) => s.t >= start - 200 && box(s)?.state === "hidden")?.t ?? null;
  const zeroAt = boxes.find((s) => s.t >= start - 200 && box(s) && box(s).o === 0)?.t ?? null;
  const shownAfter = boxes.find((s) => s.t > end && box(s)?.state === "shown");
  const leaked = boxes.filter((s) => s.t > (hiddenAt ?? start) && s.t <= end && box(s)?.state !== "hidden").length;
  const between = boxes.filter((s) => box(s) && box(s).o > 0 && box(s).o < 1).length;
  const final = shownAfter ? box(shownAfter) : null;
  return {
    hidden: hiddenAt === null ? null : hiddenAt - start,
    zero: zeroAt === null ? null : zeroAt - start,
    shown: shownAfter ? shownAfter.t - end : null,
    leaked,
    between,
    finalOk: Boolean(final && near1(final, last)),
    moveMs: end - start,
  };
}

/**
 * Callouts and keycaps on the deck's own steps: the first step of each, reached by Next from the
 * step before it, so the overlay shows what a press makes it show.
 */
async function checkCues(session: Session) {
  const { report, deck } = session;
  const where = "overlay";
  const stepsIn = liveFrames(deck).flatMap((t) => t.page.steps.map((step, i) => ({ t, step, i })).filter((x) => x.i > 0));
  const wanted = [stepsIn.find((x) => x.step.callouts?.length), stepsIn.find((x) => x.step.actions.some((a) => a.type === "key"))];
  for (const hit of wanted) {
    if (!hit) continue;
    const { t, step, i } = hit;
    const ctx = await session.context({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    await page.goto(session.present(t.page.id, i - 1));
    await waitForResult(page, stepKey(t.page, t.page.steps[i - 1]), 0, 15000);
    await page.waitForTimeout(400);
    const seq = await lastSeq(page);
    await page.keyboard.press("ArrowRight");
    if (!(await waitForResult(page, stepKey(t.page, step), seq, 10000))) report.fail(where, `${t.page.id} ${step.id}: no step result`);
    await page.waitForTimeout(500);
    const seen = (await page.evaluate(`({ callouts: document.querySelectorAll("#stage .overlay__callout").length, keycap: document.querySelector("#stage .overlay__keycap")?.textContent ?? null })`)) as { callouts: number; keycap: string | null };
    const wantCallouts = step.callouts?.length ?? 0;
    if (seen.callouts !== wantCallouts) report.fail(where, `${t.page.id} ${step.id}: ${seen.callouts} callout(s) on screen, wanted ${wantCallouts}`);
    else if (wantCallouts) report.pass(`${t.page.id} ${step.id}: ${wantCallouts} callout(s) on screen`);
    if (step.actions.some((a) => a.type === "key")) {
      if (!seen.keycap) report.fail(where, `${t.page.id} ${step.id}: no keycap on screen`);
      else report.pass(`${t.page.id} ${step.id}: keycap "${seen.keycap}" on screen`);
    }
    await ctx.close();
  }
}

/** The fixture checks, in a fresh context, once without and once with reduced motion. */
export async function walkFixture(session: Session) {
  const { report } = session;
  const target = fixturePage(session.deck);
  if (!target) return report.note("this deck has no demos/00-fixtures: fixture checks skipped");
  const where = target.page.id;
  const targets = target.page.steps[0].spotlight ?? [];
  const moves = (target.page.frame.hooks ?? []).filter((h) => h !== "reset");
  const moving = moves.map((hook) => ({ hook, sel: target.page.steps.find((s) => s.actions.some((a) => a.type === "hook" && a.name === hook))?.spotlight?.[0] ?? "" })).filter((m) => m.sel);
  report.section(`${where} (fixture)`);
  for (const reduced of [false, true]) {
    const ctx: BrowserContext = await session.context({ viewport: { width: 1920, height: 1080 }, reducedMotion: reduced ? "reduce" : "no-preference" });
    const page = await ctx.newPage();
    try {
      await installWatches(ctx);
      await page.goto(session.present(target.page.id));
      if (!(await waitForResult(page, stepKey(target.page, target.page.steps[0]), 0, 15000))) {
        report.fail(where, `${reduced ? "reduced motion: " : ""}the first step never finished`);
        continue;
      }
      if (!(await waitShown(page, targets.length, 15000))) {
        report.fail(where, `${reduced ? "reduced motion: " : ""}boxes never showed`);
        continue;
      }
      const frame = await visibleFrame(page);
      if (!frame) {
        report.fail(where, "fixture frame not found");
        continue;
      }
      if (!reduced) {
        const boxRadii = (await page.evaluate(BOX_RADII)) as number[][];
        const bad: string[] = [];
        for (const [i, sel] of targets.entries()) {
          const want = (await frame.evaluate(TARGET_RADII(sel))) as number[];
          const got = boxRadii[i] ?? [];
          if (want.some((v, k) => Math.abs(v - (got[k] ?? NaN)) > 0.5)) bad.push(`${sel} box ${got.join(" ")} target ${want.map((v) => v.toFixed(1)).join(" ")}`);
        }
        if (bad.length) report.fail(where, `radii: ${bad.join("; ")}`);
        else report.pass(`radii: all ${targets.length} boxes match their targets within 0.5 px`);
      }
      const label = reduced ? "reduced motion, " : "";
      for (const { sel, hook } of moving) {
        if (!(await waitShown(page, targets.length))) {
          report.fail(where, `${label}${sel}: boxes not shown before the move`);
          continue;
        }
        const tl = await timeline(page, frame, targets.indexOf(sel), sel, hook);
        if (!tl) {
          report.fail(where, `${label}${sel}: the target never moved`);
          continue;
        }
        const problems: string[] = [];
        // "Within 1 frame of the first change": one animation frame plus the sampling frame. WebKit
        // and Firefox run frames on their own clock, so their limits are one frame wider.
        const slack = session.browserName === "chromium" ? 0 : 17;
        if (tl.hidden === null || tl.hidden > 34 + slack) problems.push(`hidden ${tl.hidden?.toFixed(0)} ms after the first change`);
        if (!reduced && (tl.zero === null || tl.zero > 134 + slack)) problems.push(`opacity 0 at ${tl.zero?.toFixed(0)} ms`);
        if (tl.leaked) problems.push(`${tl.leaked} sample(s) not hidden while moving`);
        if (tl.shown === null || tl.shown < 118 || tl.shown > 187 + slack) problems.push(`shown ${tl.shown?.toFixed(0)} ms after the last change`);
        if (!tl.finalOk) problems.push("not at the final geometry");
        if (reduced && tl.between) problems.push(`${tl.between} sampled opacity value(s) strictly between 0 and 1`);
        if (problems.length) report.fail(where, `${label}${sel} (${hook}, moved for ${tl.moveMs.toFixed(0)} ms): ${problems.join("; ")}`);
        else report.pass(`${label}${sel} ${hook}: hidden at +${tl.hidden!.toFixed(0)} ms${reduced ? "" : `, opacity 0 at +${tl.zero!.toFixed(0)} ms`}, shown ${tl.shown!.toFixed(0)} ms after the last change at the final geometry${reduced ? ", no partial opacity" : ""}`);
      }
      await checkProtocol(page, where, report);
    } finally {
      await ctx.close();
    }
  }
  await checkCues(session);
}
