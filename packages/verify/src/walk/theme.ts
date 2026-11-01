import type { Page } from "@playwright/test";
import { listThemes, SPEAKER_PALETTE } from "@live-ish/engine/verify";
import { UsageError } from "../lib/args";
import { budgets } from "../lib/budgets";
import { around, liveFrames, stepKey, type DeckData, type Target } from "../lib/deck";
import { loadSharp, meanDifference, type Sharp } from "../lib/pixels";
import type { Session } from "../lib/session";
import { FRAME_VISIBLE, waitForResult } from "../lib/watch";

/**
 * The bar every audience theme has to meet in a browser. `--chrome=<id>` runs one theme, so CI can
 * run a job per theme, and with no `--chrome` it runs all of them. A theme reaches the chrome around
 * a frame and never the frame itself, and it never reaches the presenter's own surfaces, so each
 * theme is read against a reference theme in the same run:
 *
 * - The code panel, the step indicator and the spotlight change, and the frame stays within 2%.
 * - The speaker's `--speaker-ink` and footer pill stay, and its preview of the stage changes.
 * - With reduced motion, no chrome animation runs over 160 ms and no effect runs at all.
 * - With reduced transparency and with `?glass=off`, blur is off and surfaces are solid.
 * - With forced colors, surfaces take system colors, and every step state stays apart.
 */

/** What each page is read on. A spotlight step and a mid-page step show states a first step does not. */
interface Stops {
  spot: Target;
  spotStep: number;
  mid: Target;
  /** Pages to press through with reduced motion: every effect a theme can run has one. */
  motion: Target[];
  intro: string | null;
}

const framed = (deck: DeckData, up: Set<string>) => liveFrames(deck, up).filter((t) => t.page.frame.kind !== "terminal" && t.page.files.length > 0 && !t.page.steps.some((s) => s.route));

export function themeStops(deck: DeckData, up: Set<string>): Stops | null {
  const live = framed(deck, up);
  const spots = live.flatMap((t) => t.page.steps.flatMap((s, i) => (s.spotlight?.length && t.page.steps.length >= 2 ? [{ t, i }] : [])));
  const spot = spots[0];
  const mid = live.find((t) => t.page.steps.length >= 3) ?? spot?.t;
  if (!spot || !mid) return null;
  const keycap = live.find((t) => t.page.steps.some((s) => s.actions.some((a) => a.type === "key")));
  const intro = deck.demos.flatMap((d) => d.pages).find((p) => p.beat === "intro")?.id ?? null;
  return { spot: spot.t, spotStep: spot.i, mid, motion: [...new Set([mid, spot.t, ...(keycap ? [keycap] : [])])], intro };
}

const themed = (url: string, theme: string, extra: Record<string, string> = {}) => {
  const u = new URL(url);
  u.searchParams.set("chrome", theme);
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  return u.href;
};

/** The frame alone: no overlay, and the theme's corners off, because those belong to the chrome. */
const FRAME_ONLY = ".overlay, nextjs-portal { visibility: hidden !important; } .page-frame, .page-frame__scaled, .page-frame__slot, .page-frame__iframe { border-radius: 0 !important; }";

async function arrive(page: Page, t: Target, step: number, url: string): Promise<boolean> {
  await page.goto(url);
  const done = await waitForResult(page, stepKey(t.page, t.page.steps[step]), 0, 20000);
  await page.waitForTimeout(500);
  return Boolean(done);
}

/** Computed values that say what a theme painted, per part. Null when the part is not on the page. */
const LOOK = `(() => {
  const read = (selector, props, pseudo) => { const el = document.querySelector(selector); if (!el) return null; const s = getComputedStyle(el, pseudo); return props.map((p) => s.getPropertyValue(p)).join(" | "); };
  return {
    chrome: document.querySelector("#stage")?.dataset.chrome ?? null,
    code: read("#stage .code", ["background-color", "background-image", "border-top-left-radius", "box-shadow", "font-family"]),
    steps: read('#stage .page__steps-seg[data-state="current"]', ["background-color", "border-top-left-radius", "box-shadow", "height"]),
    spotlight: read("#stage .overlay__spotlight", ["border-top-color", "border-top-style", "border-top-width", "box-shadow"], "::before"),
  };
})()`;
type Look = { chrome: string | null; code: string | null; steps: string | null; spotlight: string | null };

interface Reading {
  look: Look;
  frame: Buffer;
}

async function readStage(session: Session, stops: Stops, theme: string): Promise<Reading | null> {
  const ctx = await session.context({ viewport: { width: 1600, height: 900 } });
  try {
    const page = await ctx.newPage();
    if (!(await arrive(page, stops.spot, stops.spotStep, themed(session.reader(stops.spot.page.id, stops.spotStep), theme)))) return null;
    await page.waitForSelector("#stage .overlay__spotlight", { timeout: 5000 }).catch(() => null);
    const look = (await page.evaluate(LOOK)) as Look;
    await page.addStyleTag({ content: FRAME_ONLY });
    // A theme's border moves the frame by part of a pixel, and a screenshot of the element then
    // rounds to another size. A fixed whole-pixel clip keeps the two images the same shape.
    const box = (await page.locator(FRAME_VISIBLE).boundingBox())!;
    const clip = { x: Math.ceil(box.x) + 2, y: Math.ceil(box.y) + 2, width: Math.floor(box.width) - 6, height: Math.floor(box.height) - 6 };
    const frame = await page.screenshot({ clip, animations: "disabled" });
    return { look, frame };
  } finally {
    await ctx.close();
  }
}

async function compareStage(session: Session, sharp: Sharp, theme: string, reference: string, a: Reading | null, b: Reading | null) {
  const { report } = session;
  const where = `theme ${theme}`;
  if (!a || !b) return report.fail(where, `the page never reached its step under ${a ? reference : theme}`);
  if (a.look.chrome !== theme) return report.fail(where, `the stage reads theme ${a.look.chrome ?? "none"}: ?chrome=${theme} did not apply`);
  for (const [part, name] of [["code", "code panel"], ["steps", "step indicator"], ["spotlight", "spotlight"]] as const) {
    if (a.look[part] === null) report.fail(where, `no ${name} on the page to compare`);
    else if (a.look[part] === b.look[part]) report.fail(where, `the ${name} is the same under ${theme} and ${reference}: ${a.look[part]}`);
    else report.pass(`${where}: the ${name} differs from ${reference}`);
  }
  const [x, y] = await Promise.all([a, b].map((r) => sharp(r.frame).raw().toBuffer({ resolveWithObject: true })));
  const diff = meanDifference(x, y);
  const limit = budgets.theme.frameDifference.limit;
  if (diff > limit) report.fail(where, `the frame differs from ${reference} by ${(diff * 100).toFixed(2)}%, over ${limit * 100}%: a theme reached inside the frame`);
  else report.pass(`${where}: the frame matches ${reference} within ${limit * 100}% (${(diff * 100).toFixed(2)}%)`);
}

/** Colors resolved by the browser, because the stylesheet is minified and `#ffffff` reads `#fff`. */
const SPEAKER = `(() => {
  const pill = document.querySelector(".speaker__controls");
  const resolve = (value) => { const el = document.createElement("i"); el.style.color = value; document.body.append(el); const c = getComputedStyle(el).color; el.remove(); return c; };
  return {
    ink: resolve("var(--speaker-ink)"),
    fixed: resolve(${JSON.stringify(SPEAKER_PALETTE["--speaker-ink"])}),
    pill: pill ? getComputedStyle(pill).backgroundColor : null,
    chrome: document.querySelector(".speaker__current [data-chrome]")?.dataset.chrome ?? null,
  };
})()`;
type SpeakerRead = { ink: string; fixed: string; pill: string | null; chrome: string | null; shot: Buffer };

async function readSpeaker(session: Session, stops: Stops, theme: string): Promise<SpeakerRead> {
  const ctx = await session.context({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await ctx.newPage();
    const { page: p } = stops.spot;
    await page.goto(themed(session.speaker(p.id), theme));
    await page.waitForSelector(".speaker__current .page-frame", { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(1200);
    const read = (await page.evaluate(SPEAKER)) as Omit<SpeakerRead, "shot">;
    const shot = await page.locator(".speaker__current").screenshot({ animations: "disabled" });
    return { ...read, shot };
  } finally {
    await ctx.close();
  }
}

async function compareSpeaker(session: Session, sharp: Sharp, theme: string, reference: string, a: SpeakerRead, b: SpeakerRead) {
  const { report } = session;
  const where = `speaker ${theme}`;
  if (a.ink !== a.fixed) report.fail(where, `--speaker-ink is ${a.ink}, and the fixed palette says ${a.fixed}`);
  else report.pass(`${where}: --speaker-ink stays ${a.fixed}`);
  if (!a.pill || a.pill !== b.pill) report.fail(where, `the footer pill is ${a.pill ?? "missing"}, and ${b.pill ?? "missing"} under ${reference}`);
  else report.pass(`${where}: the footer pill stays ${a.pill}`);
  const [x, y] = await Promise.all([a, b].map((r) => sharp(r.shot).raw().toBuffer({ resolveWithObject: true })));
  // Any real theme moves more than the anti-aliasing noise between two shots of one page.
  if (a.chrome !== theme) report.fail(where, `the preview reads theme ${a.chrome ?? "none"}`);
  else if (meanDifference(x, y) < 0.001) report.fail(where, `the preview looks the same as ${reference}`);
  else report.pass(`${where}: the preview differs from ${reference}`);
}

/** Every animation the window runs, by name and target, with the longest active time seen. */
const MOTION_WATCH = `(() => {
  if (window !== window.top) return;
  const seen = (window.__motion = {});
  const name = (a) => a.animationName ?? (a.transitionProperty ? "transition " + a.transitionProperty : a.id || "animation");
  const on = (t) => (t ? (t.className && typeof t.className === "string" ? t.className.trim().split(/\\s+/)[0] : t.tagName ?? "?") : "?");
  const read = () => {
    for (const a of document.getAnimations()) {
      const timing = a.effect?.getComputedTiming?.();
      if (!timing) continue;
      const key = name(a) + " on " + on(a.effect.target) + (a.effect.pseudoElement ?? "");
      seen[key] = Math.max(seen[key] ?? 0, timing.activeDuration);
    }
    requestAnimationFrame(read);
  };
  requestAnimationFrame(read);
})()`;

type Seen = Record<string, number>;

const merge = (all: Seen, more: Seen) => {
  for (const [k, v] of Object.entries(more)) all[k] = Math.max(all[k] ?? 0, v);
};

/** Arrives on each page from its neighbour, presses through every step, and leaves. */
async function press(session: Session, page: Page, window: "audience" | "reader", theme: string, targets: Target[], intro: string | null): Promise<Seen> {
  const { deck } = session;
  const seen: Seen = {};
  const take = async () => merge(seen, ((await page.evaluate(`window.__motion ?? {}`).catch(() => ({}))) as Seen));
  const open = (id: string) => themed(window === "audience" ? session.present(id) : session.reader(id), theme);
  const stops = [...(intro ? [{ id: intro, steps: 0 }] : []), ...targets.map((t) => ({ id: t.page.id, steps: t.page.steps.length }))];
  for (const stop of stops) {
    const from = around(deck, stop.id).prev?.id ?? stop.id;
    await page.goto(open(from));
    await page.waitForTimeout(900);
    if (window === "reader") await page.evaluate(`document.activeElement && document.activeElement !== document.body && document.activeElement.blur()`);
    await page.keyboard.press("Shift+ArrowRight");
    await page.waitForTimeout(1100);
    for (let i = 1; i < stop.steps; i++) {
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(600);
    }
    await page.keyboard.press("Shift+ArrowRight");
    await page.waitForTimeout(700);
    await take();
  }
  return seen;
}

const EFFECT = /^chrome-/;

async function reducedMotion(session: Session, theme: string, effect: string, stops: Stops) {
  const { report } = session;
  const where = `motion ${theme}`;
  const limit = budgets.theme.reducedMotionMs.limit;
  const ctx = await session.context({ viewport: { width: 1600, height: 900 }, reducedMotion: "reduce" });
  await ctx.addInitScript(MOTION_WATCH);
  const page = await ctx.newPage();
  const seen: Seen = {};
  merge(seen, await press(session, page, "audience", theme, stops.motion, stops.intro));
  merge(seen, await press(session, page, "reader", theme, stops.motion.slice(0, 1), null));
  await ctx.close();
  const long = Object.entries(seen).filter(([, ms]) => ms > limit);
  const effects = Object.keys(seen).filter((k) => EFFECT.test(k));
  if (effects.length) report.fail(where, `an effect ran with reduced motion: ${effects.join(", ")}`);
  if (long.length) report.fail(where, `over ${limit} ms with reduced motion: ${long.map(([k, ms]) => `${k} ${ms === Infinity ? "forever" : `${Math.round(ms)} ms`}`).join(", ")}`);
  if (!effects.length && !long.length) report.pass(`${where}: ${Object.keys(seen).length} animation(s) seen, none over ${limit} ms and no effect`);
  // The watch has to see an effect when motion is allowed, or the lines above measured nothing.
  const named = effect.split(/\s+/).filter((e) => e === "blink" || e === "marquee");
  if (!named.length) return;
  const on = await session.context({ viewport: { width: 1600, height: 900 } });
  await on.addInitScript(MOTION_WATCH);
  const free = await on.newPage();
  const allowed = await press(session, free, "audience", theme, stops.motion.slice(0, 1), null);
  await on.close();
  const ran = Object.keys(allowed).filter((k) => EFFECT.test(k));
  if (!ran.length) report.fail(where, `no effect ran with motion allowed, though the theme names ${named.join(" and ")}: this check measured nothing`);
  else report.pass(`${where}: with motion allowed the same walk sees ${ran.join(", ")}`);
}

const SURFACES = `(() => {
  const alpha = (c) => { const m = /\\/\\s*([\\d.]+%?)\\s*\\)|rgba\\([^,]+,[^,]+,[^,]+,\\s*([\\d.]+)\\)/.exec(c); if (!m) return c === "transparent" ? 0 : 1; const v = m[1] ?? m[2]; return v.endsWith("%") ? parseFloat(v) / 100 : parseFloat(v); };
  const nameOf = (e) => (typeof e.className === "string" && e.className ? e.className.trim().split(/\\s+/)[0] : e.tagName);
  const blurred = [...document.querySelectorAll("#stage, #stage *")].filter((e) => { const b = getComputedStyle(e).backdropFilter; return b && b !== "none"; }).map(nameOf);
  const surfaces = ["#stage .code", "#stage .page__badge", "#stage .intro__text", "#stage .intro__visual", "#stage .overlay__callout", "#stage .overlay__keycap"];
  const clear = surfaces.flatMap((s) => [...document.querySelectorAll(s)]).filter((e) => { const st = getComputedStyle(e); return alpha(st.backgroundColor) < 1 && st.backgroundImage === "none"; }).map((e) => nameOf(e) + " " + getComputedStyle(e).backgroundColor);
  return { reduced: matchMedia("(prefers-reduced-transparency: reduce)").matches, blurred: [...new Set(blurred)], clear: [...new Set(clear)] };
})()`;
type Surfaces = { reduced: boolean; blurred: string[]; clear: string[] };

/** A framed page, and an intro, which holds the only surfaces a theme blurs. */
async function surfacesAt(session: Session, page: Page, theme: string, stops: Stops, extra: Record<string, string> = {}): Promise<Surfaces> {
  const { spot, spotStep, intro } = stops;
  await arrive(page, spot, spotStep, themed(session.reader(spot.page.id, spotStep), theme, extra));
  const framedPage = (await page.evaluate(SURFACES)) as Surfaces;
  if (!intro) return framedPage;
  await page.goto(themed(session.reader(intro), theme, extra));
  await page.waitForSelector("#stage .intro", { timeout: 10000 }).catch(() => null);
  await page.waitForTimeout(400);
  const introPage = (await page.evaluate(SURFACES)) as Surfaces;
  return { reduced: framedPage.reduced && introPage.reduced, blurred: [...framedPage.blurred, ...introPage.blurred], clear: [...framedPage.clear, ...introPage.clear] };
}

/** Media emulation goes through CDP, which only Chromium has. */
async function transparency(session: Session, theme: string, blur: string, stops: Stops) {
  const { report } = session;
  const where = `transparency ${theme}`;
  const judge = (label: string, s: Surfaces) => {
    if (s.blurred.length) report.fail(where, `${label}: still blurred: ${s.blurred.join(", ")}`);
    if (s.clear.length) report.fail(where, `${label}: not solid: ${s.clear.join(", ")}`);
    if (!s.blurred.length && !s.clear.length) report.pass(`${where}: ${label}: blur off, solid surfaces`);
  };
  const ctx = await session.context({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  // With blur in the theme, the plain page must show it, or the lines below measured nothing.
  if (blur !== "none" && stops.intro) {
    const plain = await surfacesAt(session, page, theme, stops);
    if (!plain.blurred.length) report.fail(where, `the theme names a blur and nothing on the page has one: this check measured nothing`);
    else report.pass(`${where}: the plain page has blur on ${plain.blurred.join(", ")}`);
  }
  judge("?glass=off", await surfacesAt(session, page, theme, stops, { glass: "off" }));
  if (session.browserName === "chromium") {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
    const s = await surfacesAt(session, page, theme, stops);
    if (!s.reduced) report.fail(where, "the browser did not take reduced transparency, so nothing was measured");
    else judge("reduced transparency", s);
  } else report.note(`${where}: reduced transparency emulation needs Chromium, not run in ${session.browserName}`);
  await ctx.close();
}

const FORCED = `(() => {
  const probe = document.createElement("div");
  probe.style.cssText = "background-color: Canvas; color: CanvasText; border: 1px solid Highlight;";
  document.body.append(probe);
  const sys = getComputedStyle(probe);
  const canvas = sys.backgroundColor, text = sys.color, highlight = sys.borderTopColor;
  probe.remove();
  const nameOf = (e) => (typeof e.className === "string" && e.className ? e.className.trim().split(/\\s+/)[0] : e.tagName);
  const off = [...document.querySelectorAll("#stage .code, #stage .page-frame, #stage .page__badge")].flatMap((e) => {
    const s = getComputedStyle(e), bad = [];
    if (s.backgroundColor !== canvas) bad.push("background " + s.backgroundColor);
    if (s.color !== text) bad.push("color " + s.color);
    if (s.borderTopStyle === "none" || parseFloat(s.borderTopWidth) === 0) bad.push("no edge");
    if (s.boxShadow !== "none") bad.push("a shadow");
    if (s.backdropFilter && s.backdropFilter !== "none") bad.push("a blur");
    return bad.map((b) => nameOf(e) + ": " + b);
  });
  const segs = {};
  for (const e of document.querySelectorAll("#stage .page__steps-seg")) { const s = getComputedStyle(e); segs[e.dataset.state] = s.backgroundColor + " " + s.borderTopStyle; }
  return { active: matchMedia("(forced-colors: active)").matches, canvas, highlight, off, segs, stepsText: document.querySelector("#stage .page__steps")?.textContent?.trim() ?? "", selected: document.querySelector('#stage .code__tab[aria-selected="true"]') ? getComputedStyle(document.querySelector('#stage .code__tab[aria-selected="true"]')).textDecorationLine : null };
})()`;
type Forced = { active: boolean; canvas: string; highlight: string; off: string[]; segs: Record<string, string>; stepsText: string; selected: string | null };

async function forcedColors(session: Session, theme: string, stops: Stops) {
  const { report } = session;
  const where = `forced colors ${theme}`;
  if (session.browserName !== "chromium") return report.note(`${where}: emulation needs Chromium, not run in ${session.browserName}`);
  const ctx = await session.context({ viewport: { width: 1600, height: 900 }, forcedColors: "active" });
  const page = await ctx.newPage();
  await arrive(page, stops.mid, 1, themed(session.reader(stops.mid.page.id, 1), theme));
  const f = (await page.evaluate(FORCED)) as Forced;
  await ctx.close();
  if (!f.active) return report.fail(where, "the browser did not take forced colors, so nothing was measured");
  if (f.off.length) report.fail(where, `not system colors: ${f.off.join("; ")}`);
  else report.pass(`${where}: surfaces use system colors, with an edge in place of each fill`);
  const states = ["done", "current", "future"].filter((s) => f.segs[s]);
  if (states.length < 3) report.fail(where, `the page shows ${states.length} step state(s), so the three were not compared`);
  else if (new Set(states.map((s) => f.segs[s])).size < 3) report.fail(where, `step states look alike: ${JSON.stringify(f.segs)}`);
  else report.pass(`${where}: done, current and future steps stay apart`);
  if (!/\d/.test(f.stepsText)) report.fail(where, `the step indicator has no text: ${JSON.stringify(f.stepsText)}`);
  else report.pass(`${where}: the step indicator says "${f.stepsText}"`);
  if (f.selected !== null && f.selected === "none") report.fail(where, "the selected code tab has only a fill to mark it");
  else if (f.selected !== null) report.pass(`${where}: the selected code tab is ${f.selected}d`);
}

/** Named on the command line, or every theme the deck can use. */
function themesFor(session: Session): { id: string; effect: string; blur: string }[] {
  const { deck } = session;
  const all = listThemes(deck.input.config.chrome?.custom ?? [], deck.root).map((t) => ({ id: t.id, effect: t.motion.effect, blur: t.tokens["--chrome-blur"] }));
  const asked = session.options.chrome;
  if (!asked) return all;
  const one = all.filter((t) => t.id === asked);
  if (!one.length) throw new UsageError(`Unknown theme "${asked}". Themes: ${all.map((t) => t.id).join(", ")}.`);
  return one;
}

export async function walkTheme(session: Session, serversUp: Set<string>) {
  const { report, deck } = session;
  const themes = themesFor(session);
  const stops = themeStops(deck, serversUp);
  if (!stops) return report.fail("theme", "the deck needs a framed page with a spotlight step and a code panel to read a theme on");
  const sharp = loadSharp(deck.root);
  const references = new Map<string, { stage: Reading | null; speaker: SpeakerRead }>();
  const referenceOf = async (id: string) => {
    let r = references.get(id);
    if (!r) references.set(id, (r = { stage: await readStage(session, stops, id), speaker: await readSpeaker(session, stops, id) }));
    return r;
  };
  report.data.themes = themes.map((t) => t.id);
  for (const { id, effect, blur } of themes) {
    report.section(`theme ${id}`);
    const name = id === "glass" ? "flat" : "glass";
    const reference = await referenceOf(name);
    const own = await referenceOf(id);
    await compareStage(session, sharp, id, name, own.stage, reference.stage);
    await compareSpeaker(session, sharp, id, name, own.speaker, reference.speaker);
    await reducedMotion(session, id, effect, stops);
    await transparency(session, id, blur, stops);
    await forcedColors(session, id, stops);
  }
}
