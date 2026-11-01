import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "@playwright/test";
import { SPLITS, hasFrame, type Demo, type DemoPage, type FramePage, type IntroPage, type Step } from "@live-ish/engine/verify";
import { stepKey, type Target } from "../lib/deck";
import type { Report } from "../lib/report";
import type { Session } from "../lib/session";
import { FRAME_VISIBLE, checkProtocol, installWatches, lastSeq, takeErrors, visibleFrame, waitForResult, type StepResult } from "../lib/watch";
import { checkFrameBackground } from "./deck";
import { finishSampler, startSampler } from "./spotlight";
import { checkShell, hasShell } from "./wrapper";

/**
 * Every step of every page, in the audience window, with the forward and back keys: each step
 * reached, no runtime error, every `assert` passing, and the same digest forward (animated) and
 * back (reset and replay). The speaker window follows along in Chromium, where a background tab can
 * be kept unthrottled.
 */

export interface StepWalk {
  session: Session;
  context: BrowserContext;
  page: Page;
  speaker: Page | null;
  /** Saves a still of each step from this browser, under public/posters/<page>/<browser>/. */
  capture: boolean;
  speakerLayoutChecked: boolean;
}

export async function openStepWalk(session: Session, capture: boolean, withSpeaker: boolean): Promise<StepWalk> {
  const context = await session.context();
  await installWatches(context);
  const page = await context.newPage();
  let speaker: Page | null = null;
  if (withSpeaker && session.browserName === "chromium") {
    speaker = await context.newPage();
    await speaker.setViewportSize({ width: 1440, height: 900 });
    await speaker.goto(session.speaker());
    // The audience page keeps the foreground, so its frames keep animation frames.
    await page.bringToFront();
  }
  page.on("pageerror", (err) => session.report.fail("page", `uncaught error: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !/favicon/.test(msg.text())) session.report.note(`console: ${msg.text().slice(0, 160)}`);
  });
  return { session, context, page, speaker, capture, speakerLayoutChecked: false };
}

/** Failed asserts for this step. An assert whose `when` the browser does not meet was skipped, and passes. */
const failedAsserts = (r: StepResult, stepId?: string) => r.asserts.filter((a) => (!stepId || a.stepId === stepId) && !a.pass);
const describe = (fails: StepResult["asserts"]) => fails.map((a) => `${a.target} ${a.expect} (got ${a.actual})`).join("; ");

/** Runtime errors name the step that raised them: a selector that matched nothing lands here. */
async function checkErrors(w: StepWalk, where: string, label: string) {
  for (const e of await takeErrors(w.page)) w.session.report.fail(where, `${label}: ${e.code}: ${e.message}${e.action !== undefined ? ` (action ${e.action})` : ""}`);
}

/** A routed step ends on its document. */
async function checkRoute(w: StepWalk, where: string, label: string, route: string) {
  const { report } = w.session;
  // A replay swaps iframes and drops the old one on the next frame, so this retries briefly. The
  // document's own address is read, because a frame object's url can lag a load in WebKit.
  let href: string | null = null;
  for (let i = 0; i < 10 && !href; i++) {
    const f = await visibleFrame(w.page);
    href = f ? ((await f.evaluate(`location.href`).catch(() => null)) as string | null) : null;
    if (!href) await w.page.waitForTimeout(100);
  }
  if (!href) return report.fail(where, `${label}: no frame for the route check`);
  const url = new URL(href);
  const want = new URL(route, url);
  const ok = url.pathname === want.pathname && [...want.searchParams].every(([k, v]) => url.searchParams.get(k) === v);
  if (ok) report.pass(`${label}: the frame is on ${route}`);
  else report.fail(where, `${label}: the frame is on ${url.pathname}${url.search}; the step's route is ${route}`);
}

/**
 * A forward run that loads another document in a multi-page build plays its view transition where
 * the engine supports them.
 */
async function checkTransition(w: StepWalk, where: string, label: string, page: FramePage, i: number) {
  const { report } = w.session;
  const step = page.steps[i];
  let prev: string | undefined;
  for (let k = i - 1; k >= 0 && !prev; k--) prev = page.steps[k].route;
  if (!step.route || !prev || prev === step.route) return;
  const f = await visibleFrame(w.page);
  const s = f ? ((await f.evaluate(`({ pages: document.documentElement.hasAttribute("data-pages"), asks: [...document.styleSheets].some((sheet) => { try { return [...sheet.cssRules].some((r) => r.cssText.startsWith("@view-transition")); } catch (e) { return false; } }), reveal: window.__walkReveal || null })`).catch(() => null)) as { pages: boolean; asks: boolean; reveal: { supported: boolean; vt: string } | null } | null) : null;
  if (!s?.pages || !s.asks) return;
  if (!s.reveal) return report.fail(where, `${label}: the document's reveal was not observed`);
  if (!s.reveal.supported) return report.pass(`${label}: a plain load (no cross-document view transitions here)`);
  if (s.reveal.vt === "running" || s.reveal.vt === "finished") report.pass(`${label}: the view transition played (${s.reveal.vt})`);
  else report.fail(where, `${label}: no view transition on a forward run (${s.reveal.vt})`);
}

/**
 * The clicker's instant replay (Back one step, then Next again): Back to `i` was just pressed and
 * replayed. Next plays step `i + 1` animated from the replayed document, then Back replays `i`
 * again. Asserts, route and transition must hold as on the first forward run.
 */
async function replayThenNext(w: StepWalk, where: string, page: FramePage, i: number) {
  const { report } = w.session;
  const next = page.steps[i + 1];
  const here = page.steps[i];
  let seq = await lastSeq(w.page);
  await w.page.keyboard.press("ArrowRight");
  let r = await waitForResult(w.page, stepKey(page, next), seq, 10000);
  if (!r) return report.fail(where, `replay ${here.id} then next ${next.id}: no step result`);
  const failed = failedAsserts(r, next.id);
  if (failed.length) report.fail(where, `replay ${here.id} then next ${next.id}: ${describe(failed)}`);
  else report.pass(`replay ${here.id} then next ${next.id}: ${r.asserts.filter((a) => a.stepId === next.id).length} assert(s) ok, ${r.ms}ms`);
  if (next.route) await checkRoute(w, where, `replay ${here.id} then next ${next.id}`, next.route);
  await checkTransition(w, where, `replay ${here.id} then next ${next.id}`, page, i + 1);
  seq = await lastSeq(w.page);
  await w.page.keyboard.press("ArrowLeft");
  r = await waitForResult(w.page, stepKey(page, here), seq, 10000);
  if (!r) return report.fail(where, `back ${here.id} again: no step result`);
  const again = failedAsserts(r);
  if (again.length) report.fail(where, `back ${here.id} again: ${describe(again)}`);
  if (here.route) await checkRoute(w, where, `back ${here.id} again`, here.route);
}

/** Every frame carries the base: `--frame-surface` is set on its root. */
async function checkTheme(w: StepWalk, where: string, page: FramePage, stepId: string) {
  const { report } = w.session;
  if (page.frame.base === false) return;
  const frames = w.page.frames().filter((f) => f !== w.page.mainFrame() && /^https?:/.test(f.url()));
  // A nested frame that is not rendered yet has no computed style in Firefox, so it is checked once
  // it shows. A direct child of the presenter may be cross-origin, so its frameElement is never read:
  // WebKit reports that read as an uncaught "Blocked a frame" error.
  const values = await Promise.all(frames.map((f) => f.evaluate(`(() => { try { if (window.parent !== window.top && window.frameElement && !window.frameElement.getClientRects().length) return "not rendered"; } catch (e) {} return getComputedStyle(document.documentElement).getPropertyValue("--frame-surface").trim(); })()`).catch(() => "") as Promise<string>));
  if (!frames.length) return report.fail(where, `theme ${stepId}: no frame found`);
  if (values.some((v) => !v)) report.fail(where, `theme ${stepId}: --frame-surface is not set in a frame (${frames.map((f) => f.url()).join(", ")})`);
  else report.pass(`theme ${stepId}: --frame-surface ${values[0]} in the frame`);
}

/** The audience's fixed page title, on one line, clear of the meter. */
async function checkPageTitle(w: StepWalk, page: FramePage) {
  const { report, deck } = w.session;
  const where = page.id;
  const v = (await w.page.evaluate(`(() => {
    const el = document.querySelector("#stage .page__title");
    if (!el) return null;
    const canvas = document.querySelector(".stage__canvas").getBoundingClientRect();
    const s = canvas.width / 1920;
    const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: (r.left - canvas.left) / s, y: (r.top - canvas.top) / s, w: r.width / s, h: r.height / s }; };
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()];
    const lines = new Set(rects.map((r) => Math.round(r.top))).size;
    // The glyphs, not the heading's block box, which spans the row.
    const l = Math.min(...rects.map((r) => r.left)), t = Math.min(...rects.map((r) => r.top));
    const r = Math.max(...rects.map((r) => r.right)), b = Math.max(...rects.map((r) => r.bottom));
    return { text: el.textContent.trim(), lines, title: { x: (l - canvas.left) / s, y: (t - canvas.top) / s, w: (r - l) / s, h: (b - t) / s }, meter: box("#stage .page__meter") };
  })()`)) as { text: string; lines: number; title: { x: number; y: number; w: number; h: number }; meter: { x: number; y: number; w: number; h: number } | null } | null;
  if (!v) return report.fail(where, "no .page__title");
  const want = page.beat === "single" ? page.title : deck.deck.beats[page.beat];
  const problems: string[] = [];
  if (v.text !== want) problems.push(`reads "${v.text}", not "${want}"`);
  if (v.lines !== 1) problems.push(`wraps to ${v.lines} lines`);
  if (v.meter) {
    const overlap = !(v.title.x + v.title.w <= v.meter.x || v.meter.x + v.meter.w <= v.title.x || v.title.y + v.title.h <= v.meter.y || v.meter.y + v.meter.h <= v.title.y);
    if (overlap) problems.push("overlaps the meter");
  }
  if (problems.length) report.fail(where, `title ${problems.join(", ")}`);
  else report.pass(`title "${v.text}" on one line${v.meter ? ", clear of the meter" : ""}`);
}

/**
 * Speaker window at 1440 by 900: the title and steps block sits fully in the viewport, the current
 * bullets start inside the notes body, "Next step" shows when the page has another step, no selector
 * shows outside References, and cautions show on the after page's last step.
 */
async function checkSpeaker(w: StepWalk, where: string, page: FramePage, demo: Demo, i: number) {
  const { report } = w.session;
  const { speaker } = w;
  if (!speaker) return;
  const step = page.steps[i];
  const want = `Step ${i + 1} of ${page.steps.length}: ${step.label}`;
  const synced = await speaker
    .waitForFunction((t) => document.querySelector(".notes__step")?.textContent?.startsWith(t), want, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!synced) return report.fail(where, `speaker ${step.id}: the notes did not follow (wanted "${want}")`);
  const ready = await speaker
    .waitForFunction(() => document.querySelector(".notes__play")?.textContent === "Ready", null, { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (!ready) report.fail(where, `speaker ${step.id}: the indicator never returned to Ready`);
  const v = (await speaker.evaluate(`(() => {
    const body = document.querySelector(".speaker__notes-body");
    const br = body.getBoundingClientRect();
    const inView = (el) => { if (!el) return true; const r = el.getBoundingClientRect(); return r.top >= br.top - 1 && r.top + 48 <= Math.min(br.bottom, innerHeight) + 1; };
    const header = document.querySelector(".notes__header");
    const hr = header.getBoundingClientRect();
    const then = document.querySelector(".notes__then");
    const clone = body.cloneNode(true);
    clone.querySelectorAll("details").forEach((d) => d.remove());
    const text = clone.textContent + " " + header.textContent;
    const sel = /#[a-z][\\w-]*|\\[[a-z-]+(=|\\])/i.exec(text);
    return { header: hr.top >= 0 && hr.left >= 0 && hr.bottom <= innerHeight && hr.right <= innerWidth, bullets: inView(document.querySelector(".notes__bullets")), then: then ? then.getBoundingClientRect().height > 0 : false, selector: sel ? sel[0] : null, cautions: Boolean(document.querySelector(".notes__cautions")) };
  })()`)) as { header: boolean; bullets: boolean; then: boolean; selector: string | null; cautions: boolean };
  const problems = [!v.header && "title and steps block", !v.bullets && "bullets"].filter(Boolean);
  if (problems.length) report.fail(where, `speaker ${step.id}: ${problems.join(", ")} not visible at 1440 by 900`);
  else report.pass(`speaker ${step.id}: title and steps block, bullets start in view`);
  const wantThen = i < page.steps.length - 1;
  if (wantThen !== v.then) report.fail(where, `speaker ${step.id}: "Next step" ${v.then ? "shown on the last step" : "missing"}`);
  if (v.selector) report.fail(where, `speaker ${step.id}: selector text "${v.selector}" outside References`);
  const lastOfDemo = demo.pages.filter(hasFrame).at(-1)?.id === page.id;
  const wantCautions = lastOfDemo && i === page.steps.length - 1 && demo.cautions.length > 0;
  if (wantCautions !== v.cautions) report.fail(where, `speaker ${step.id}: cautions ${v.cautions ? "shown" : "missing"}`);
  else if (wantCautions) report.pass(`speaker ${step.id}: cautions shown`);
  if (w.speakerLayoutChecked) return;
  w.speakerLayoutChecked = true;
  const l = (await speaker.evaluate(`(() => {
    const c = document.querySelector(".speaker__current").getBoundingClientRect();
    const np = document.querySelector(".speaker__next-preview");
    return { w: c.width, h: c.height, transport: Boolean(document.querySelector(".speaker__transport")), mains: document.querySelectorAll("main, [role=main]").length, inert: np ? np.hasAttribute("inert") : true };
  })()`)) as { w: number; h: number; transport: boolean; mains: number; inert: boolean };
  if (Math.abs(l.w - 633) > 1 || Math.abs(l.h - 356) > 1) report.fail("speaker", `current preview is ${l.w.toFixed(1)} by ${l.h.toFixed(1)}, wanted 633 by 356`);
  else report.pass("speaker: current preview 633 by 356");
  if (l.mains !== 1) report.fail("speaker", `${l.mains} main landmarks, wanted 1`);
  if (!l.inert) report.fail("speaker", "the next preview is not inert");
  if (l.mains === 1 && l.inert) report.pass("speaker: one main, next preview inert");
}

/** Hands-on mode shows the step's ifKeyboard in the speaker window; turning it off replays the step. */
async function checkHandsOn(w: StepWalk, where: string, page: FramePage, i: number) {
  const { report } = w.session;
  const step = page.steps[i];
  if (!w.speaker || !step.ifKeyboard) return;
  await w.page.keyboard.press("h");
  const shown = await w.speaker
    .waitForFunction((t) => document.querySelector(".notes__hands-on")?.textContent === t, step.ifKeyboard, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  await w.page.waitForTimeout(800);
  const seq = await lastSeq(w.page);
  // In hands-on mode the frame owns the audience keyboard, so hands-on ends from the speaker window,
  // as on stage.
  await w.speaker.keyboard.press("h");
  const r = await waitForResult(w.page, stepKey(page, step), seq, 10000);
  if (!shown) report.fail(where, `hands-on ${step.id}: ifKeyboard not shown in the speaker window`);
  else report.pass(`hands-on ${step.id}: ifKeyboard shown`);
  if (!r) report.fail(where, `hands-on ${step.id}: no replay after hands-on off`);
}

/** The slot widths a page's split implies, and a 44-column, 40-line fixture fits the code panel. */
async function checkGeometry(w: StepWalk, page: FramePage, where: string) {
  const { report } = w.session;
  const split = page.files.length > 0;
  if (split) await w.page.waitForSelector("#stage .page__code .code__pre", { timeout: 10000 }).catch(() => null);
  const g = (await w.page.evaluate(`(() => {
    const canvas = document.querySelector(".stage__canvas").getBoundingClientRect();
    const scale = canvas.width / 1920;
    const width = (sel) => Math.round((document.querySelector(sel)?.getBoundingClientRect().width ?? 0) / scale);
    const real = document.querySelector("#stage .page__code .code__pre");
    let fixture = null;
    if (real) {
      // Measured on a clone beside the real panel: React owns the real nodes.
      const pre = real.cloneNode(false);
      const code = real.querySelector("code").cloneNode(false);
      code.textContent = Array.from({ length: 40 }, () => "W".repeat(44)).join("\\n");
      pre.append(code);
      pre.style.position = "absolute";
      pre.style.visibility = "hidden";
      pre.style.width = real.getBoundingClientRect().width / scale + "px";
      real.parentElement.append(pre);
      fixture = { scrollWidth: pre.scrollWidth, clientWidth: pre.clientWidth };
      pre.remove();
    }
    return { frame: width("#stage .page__frame"), code: width("#stage .page__code"), fixture };
  })()`)) as { frame: number; code: number; fixture: { scrollWidth: number; clientWidth: number } | null };
  const want = split ? SPLITS[page.split] : { frame: 1792, code: 0 };
  if (g.frame !== want.frame || g.code !== want.code) report.fail(where, `slots are ${g.frame} and ${g.code} canvas px; wanted ${want.frame} and ${want.code}`);
  else report.pass(`frame slot ${g.frame} px and code panel ${g.code} px${split ? ` (${page.split})` : ""}`);
  if (g.fixture && g.fixture.scrollWidth > g.fixture.clientWidth) report.fail(where, `a 44 by 40 fixture scrolls sideways (${g.fixture.scrollWidth} > ${g.fixture.clientWidth})`);
  else if (g.fixture) report.pass("44 by 40 fixture fits without horizontal scroll");
}

/** A still of the frame as this browser shows it, for a deck that shows what another browser does. */
async function captureStep(w: StepWalk, page: FramePage, step: Step) {
  const dir = path.join(w.session.deck.root, "public", "posters", page.id, w.session.browserName);
  mkdirSync(dir, { recursive: true });
  await w.page.locator(FRAME_VISIBLE).screenshot({ path: path.join(dir, `${step.id}.jpg`), type: "jpeg", quality: 72 });
}

/** Intro slides: the tiles render, and their text matches the support data the build wrote. */
async function walkIntro(w: StepWalk, demo: Demo, page: IntroPage) {
  const { report, deck } = w.session;
  const where = page.id;
  await w.page.waitForSelector("#stage .intro", { timeout: 8000 }).catch(() => null);
  const title = await w.page.textContent("#stage .intro__title").catch(() => null);
  if (title?.trim() !== demo.title) report.fail(where, `the title reads "${title}", not "${demo.title}"`);
  else report.pass(`intro: the title reads "${demo.title}"`);
  const chip = await w.page.locator("#stage .intro__group").textContent({ timeout: 500 }).catch(() => null);
  if ((chip?.trim() ?? undefined) !== demo.chip) report.fail(where, `the chip reads "${chip}", wanted "${demo.chip}"`);
  else if (demo.chip) report.pass(`intro: chip "${demo.chip}"`);
  if (!demo.support) return;
  let entry: { tiles: { name: string; version?: string | null }[]; since?: string } | undefined;
  try {
    entry = (JSON.parse(readFileSync(path.join(deck.root, ".live-ish", "support.json"), "utf8")) as { demos: Record<string, typeof entry> }).demos[demo.id];
  } catch {
    entry = undefined;
  }
  if (!entry) return report.fail(where, "no support entry in .live-ish/support.json");
  await w.page.waitForSelector("#stage .support-row__tile", { timeout: 8000 }).catch(() => null);
  const tiles = (await w.page.evaluate(`[...document.querySelectorAll("#stage .support-row__tile")].map((el) => ({ version: el.querySelector(".support-row__version")?.textContent ?? "", name: el.querySelector(".support-row__name")?.firstChild?.textContent ?? "" }))`)) as { version: string; name: string }[];
  const expected = entry.tiles.map((t) => ({ version: t.version ?? "Not yet", name: t.name }));
  if (JSON.stringify(tiles) !== JSON.stringify(expected)) report.fail(where, `tiles ${JSON.stringify(tiles)}; support data says ${JSON.stringify(expected)}`);
  else report.pass(`intro: ${tiles.length} tiles match the support data`);
}

/** The runs back and forth over one page. */
async function walkFrames(w: StepWalk, { demo, page }: Target) {
  const { report } = w.session;
  const where = page.id;
  await checkGeometry(w, page, where);
  await w.page.waitForSelector(FRAME_VISIBLE, { timeout: 15000 }).catch(() => null);
  await w.page.waitForTimeout(800);
  if (demo.background) await checkFrameBackground(await visibleFrame(w.page), where, demo.background, report);
  const forward: (string | null)[] = [];
  const steps = page.steps;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const seq = i === 0 ? 0 : await lastSeq(w.page);
    // Sample the boxes and their targets through the step. The previous step's boxes sit on the
    // previous step's targets until they fade out.
    const sampleFrame = i > 0 && step.spotlight?.length ? await visibleFrame(w.page) : null;
    const sampling = i > 0 ? await startSampler(w.page, sampleFrame, [steps[i - 1].spotlight ?? [], step.spotlight ?? []]) : false;
    if (i > 0) await w.page.keyboard.press("ArrowRight");
    const r = await waitForResult(w.page, stepKey(page, step), seq, i === 0 ? 15000 : 8000);
    if (sampling) {
      // The boxes fade in after the settle that follows step-done, so sampling runs through it.
      await w.page.waitForTimeout(500);
      const inv = await finishSampler(w.page, sampleFrame, page.frame.spotlightClip?.bottom);
      if (inv?.violations.length) report.fail(where, `${step.id}: spotlight off its target in ${inv.violations.length} sample(s), e.g. ${inv.violations[0]}`);
      else if (inv) report.pass(`${step.id}: spotlight boxes on target in all ${inv.visible} visible sample(s) of ${inv.samples}`);
    }
    await checkErrors(w, where, `${step.id} ${step.label}`);
    if (!r) {
      report.fail(where, `${step.id} ${step.label}: no step result (the frame is not ready, or the step did not finish)`);
      forward.push(null);
      continue;
    }
    const failed = failedAsserts(r, step.id);
    if (failed.length) report.fail(where, `${step.id} ${step.label}: ${describe(failed)}`);
    else report.pass(`${step.id} ${step.label}: ${r.asserts.filter((a) => a.stepId === step.id).length} assert(s) ok, ${r.ms}ms`);
    forward.push(r.digest);
    if (i === 0 || i === steps.length - 1) {
      await checkTheme(w, where, page, step.id);
      const f = await visibleFrame(w.page);
      if (await hasShell(f)) await checkShell(f, `${where} ${step.id}`, page.files, report);
    }
    if (i === steps.length - 1) await checkPageTitle(w, page);
    if (step.route) await checkRoute(w, where, step.id, step.route);
    await checkTransition(w, where, step.id, page, i);
    await checkSpeaker(w, where, page, demo, i);
    await checkHandsOn(w, where, page, i);
    if (w.capture) await captureStep(w, page, step);
  }
  // Back: reset and replay must land on the same digest. At two steps the clicker's instant replay
  // is repeated: Next again from the replayed document, then Back once more.
  const n = steps.length;
  const replayAt = new Set(n >= 2 ? [n - 2, Math.floor((n - 2) / 2)] : []);
  for (let i = n - 2; i >= 0; i--) {
    const step = steps[i];
    const seq = await lastSeq(w.page);
    await w.page.keyboard.press("ArrowLeft");
    const r = await waitForResult(w.page, stepKey(page, step), seq, 10000);
    await checkErrors(w, where, `back ${step.id}`);
    if (!r) {
      report.fail(where, `back ${step.id}: no step result`);
      continue;
    }
    const failed = failedAsserts(r);
    if (failed.length) report.fail(where, `back ${step.id}: ${describe(failed)}`);
    else if (forward[i] && r.digest !== forward[i]) report.fail(where, `back ${step.id}: digest ${r.digest} differs from forward ${forward[i]}`);
    else report.pass(`back ${step.id}: asserts pass, digest ${r.digest} matches forward`);
    if (step.route) await checkRoute(w, where, `back ${step.id}`, step.route);
    if (replayAt.has(i)) await replayThenNext(w, where, page, i);
  }
  await checkProtocol(w.page, where, report);
  // The stuck-playback watchdog never fires in a clean walk.
  const stuck = (await w.page.evaluate(`window.__stuckPlayback || []`).catch(() => [])) as string[];
  if (stuck.length) report.fail(where, `stuck playback: ${stuck.join(", ")}`);
  // No box was forced in after 2000 ms on this page.
  const forced = (await w.page.evaluate(`(window.__spotlightForced || []).map((f) => f.stepId)`).catch(() => [])) as string[];
  if (forced.length) report.fail(where, `spotlight forced after 2000 ms on ${forced.join(", ")}`);
  else report.pass("no spotlight forced");
}

/** One page: an intro's checks, or the frames both ways. */
export async function walkPage(w: StepWalk, demo: Demo, page: DemoPage) {
  const { report, session } = { report: w.session.report as Report, session: w.session };
  report.section(`${page.id} (${demo.title}, ${page.beat}, ${page.steps.length} steps)`);
  await w.page.goto(session.present(page.id));
  if (hasFrame(page)) await walkFrames(w, { demo, page });
  else await walkIntro(w, demo, page);
}
