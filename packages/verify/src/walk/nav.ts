import type { Page } from "@playwright/test";
import { firstWarmed, pageWithSteps, plainRun, stepKey, type Target } from "../lib/deck";
import type { Session } from "../lib/session";
import { VT_WATCH, lastSeq, waitForResult } from "../lib/watch";
import { arrives } from "./advance";

/** The drawer's keyboard contract, link focus, and the slide crossfade. */

const FOCUSED = `(() => { const a = document.activeElement; return a ? (a.matches("[data-nav-trigger]") ? "trigger" : a.matches("a.nav-drawer__link") ? "link:" + a.dataset.slideId : a.id ? "#" + a.id : a.tagName) : null; })()`;

/**
 * In the reader, Tab reaches the menu button, Enter opens the drawer with focus on the first link,
 * Tab stays inside, clicker keys move nothing and PageDown closes it, and Escape closes it with focus
 * back on the button. Group headings are listed. Then, with the audience and speaker windows open
 * together, a link moves both windows and the audience stage takes the keyboard.
 */
export async function walkDrawer(session: Session) {
  const { report, deck } = session;
  report.section("drawer");
  // Safari's Tab skips buttons unless the person turns that on, and Option+Tab reaches everything.
  const tab = session.browserName === "webkit" ? "Alt+Tab" : "Tab";
  const start = deck.slides[0].id;
  // A link far from the start, so a jump is a real move.
  const groupsWanted = [...new Set(deck.demos.flatMap((d) => (d.navGroup ? [d.navGroup] : [])))];
  const lastDemo = deck.demos.at(-1);
  const ctx = await session.context({ viewport: { width: 1600, height: 900 } });
  try {
    const page = await ctx.newPage();
    await page.goto(session.reader(start));
    await page.waitForSelector(".reader-controls .nav-drawer-trigger", { timeout: 10000 });
    await page.waitForTimeout(500);
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press(tab);
      reached = (await page.evaluate(FOCUSED)) === "trigger";
    }
    if (!reached) return report.fail("drawer", "Tab never reached the menu button in the reader");
    report.pass("drawer: Tab reaches the menu button");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    const open = (await page.evaluate(`document.querySelector("#deck-nav")?.open ?? false`)) as boolean;
    const first = (await page.evaluate(`document.querySelector("#deck-nav a.nav-drawer__link")?.dataset.slideId ?? null`)) as string | null;
    const at = (await page.evaluate(FOCUSED)) as string;
    if (!open) return report.fail("drawer", "Enter on the menu button did not open the drawer");
    if (at !== `link:${first}`) report.fail("drawer", `the drawer opened with focus on ${at}, not its first link`);
    else report.pass("drawer: Enter opens it, focus on the first link");
    // Group headings are text: `navGroup` in the deck is what the drawer lists.
    const headings = (await page.evaluate(`[...document.querySelectorAll("#deck-nav .nav-drawer__heading")].map((h) => h.textContent.trim())`)) as string[];
    const missing = groupsWanted.filter((g) => !headings.includes(g));
    if (missing.length) report.fail("drawer", `no heading for navGroup ${missing.join(", ")}`);
    else if (groupsWanted.length) report.pass(`drawer: headed groups ${groupsWanted.join(", ")}`);
    const linkCount = (await page.evaluate(`document.querySelectorAll("#deck-nav a[href], #deck-nav button").length`)) as number;
    let outside = 0;
    for (let i = 0; i < linkCount + 3; i++) {
      await page.keyboard.press(tab);
      if (!((await page.evaluate(`document.querySelector("#deck-nav").contains(document.activeElement)`)) as boolean)) outside++;
    }
    if (outside) report.fail("drawer", `Tab left the drawer ${outside} time(s)`);
    else report.pass(`drawer: Tab stays inside over ${linkCount + 3} presses`);
    const url = page.url();
    // On a link: Space on the Close button presses it, which is what Space on a button should do.
    await page.focus("#deck-nav a.nav-drawer__link");
    for (const key of ["ArrowRight", "ArrowLeft", "Space", "b", "."]) await page.keyboard.press(key);
    await page.waitForTimeout(400);
    if (page.url() !== url) report.fail("drawer", `clicker keys moved the deck with the drawer open (${page.url()})`);
    else report.pass("drawer: clicker keys do not move the deck while it is open");
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(400);
    const afterPd = (await page.evaluate(`document.querySelector("#deck-nav")?.open ?? false`)) as boolean;
    if (afterPd) report.fail("drawer", "PageDown did not close the drawer");
    else if (page.url() !== url) report.fail("drawer", `PageDown closed the drawer but moved the deck, to ${page.url()}`);
    else report.pass("drawer: PageDown closes it without moving the deck");
    await page.focus(".reader-controls .nav-drawer-trigger");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    const afterEsc = (await page.evaluate(FOCUSED)) as string;
    const stillOpen = (await page.evaluate(`document.querySelector("#deck-nav")?.open ?? false`)) as boolean;
    if (stillOpen) report.fail("drawer", "Escape did not close the drawer");
    else if (afterEsc !== "trigger") report.fail("drawer", `Escape closed the drawer, focus on ${afterEsc}, not the menu button`);
    else report.pass("drawer: Escape closes it and focus returns to the menu button");
    await page.close();

    // Audience and speaker together: a link in the speaker's drawer moves both windows.
    const target = lastDemo?.pages[0].id ?? deck.slides.at(-1)!.id;
    const speaker = await ctx.newPage();
    await speaker.setViewportSize({ width: 1440, height: 900 });
    await speaker.goto(session.speaker());
    const audience = await ctx.newPage();
    await audience.goto(session.present(start));
    await speaker.waitForURL(new RegExp(`s=${start}(&|$)`), { timeout: 10000 }).catch(() => null);
    await audience.waitForTimeout(800);
    const trigger = speaker.locator(".speaker__controls .nav-drawer-trigger, .speaker [data-nav-trigger]").first();
    if (!(await trigger.count())) return report.fail("drawer", "no menu button in the speaker window");
    await trigger.click();
    await speaker.waitForTimeout(400);
    const link = speaker.locator(`#deck-nav a.nav-drawer__link[data-slide-id="${target}"]`);
    if (!(await link.count())) return report.fail("drawer", `the speaker's drawer has no link to ${target}`);
    await link.click();
    const moved = await Promise.all([speaker, audience].map((p) => p.waitForURL(new RegExp(`s=${target}(&|$)`), { timeout: 5000 }).then(() => true).catch(() => false)));
    if (!moved.every(Boolean)) report.fail("drawer", `a drawer link moved ${moved.filter(Boolean).length} of 2 windows to ${target}`);
    else report.pass(`drawer: a link in the speaker window moves both windows to ${target}`);
    await audience.waitForTimeout(1500);
    const aFocus = (await audience.evaluate(`document.activeElement?.id || document.activeElement?.tagName`)) as string;
    if (aFocus !== "stage" && aFocus !== "IFRAME") report.fail("drawer", `after a jump the audience focus is on ${aFocus}, not the stage`);
    else report.pass("drawer: after a jump the audience stage has the keyboard");
  } finally {
    await ctx.close();
  }
}

/**
 * With the audience on a slide with a link, click it, come back, press ArrowRight: the stage handles
 * the key. The stage takes the keyboard back in the next task, so a clicker keeps working.
 */
export async function walkLinks(session: Session) {
  const { report, deck } = session;
  report.section("links");
  const slide = deck.slides.find((s) => s.copy?.kind === "closing" && s.copy.url) ?? deck.slides.find((s) => s.copy?.kind === "title" && deck.deck.speaker.url) ?? null;
  if (!slide) return report.note("no slide with a link: skipped");
  const next = deck.slides[slide.index];
  const ctx = await session.context({ viewport: { width: 1600, height: 900 } });
  try {
    const page = await ctx.newPage();
    await page.goto(session.present(slide.id));
    await page.waitForSelector("#stage a[data-deck-link]", { timeout: 10000 });
    await page.waitForTimeout(600);
    // The new tab is real, and the link answers here, so a walk needs no network. It closes as soon
    // as it opens, and the window comes back.
    const href = await page.locator("#stage a[data-deck-link]").first().getAttribute("href");
    if (href) {
      session.pressed.add(href);
      await ctx.route(href, (route) => route.fulfill({ status: 204 }));
    }
    ctx.on("page", (p) => void p.close().catch(() => {}));
    await page.click("#stage a[data-deck-link]");
    await page.waitForTimeout(800);
    await page.bringToFront();
    await page.evaluate(`window.__handled = null; addEventListener("keydown", (e) => { window.__handled = e.defaultPrevented; }, { once: true })`);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(200);
    const v = (await page.evaluate(`({ active: document.activeElement?.id || document.activeElement?.tagName, handled: window.__handled })`)) as { active: string; handled: boolean | null };
    // On the last slide ArrowRight has nowhere to go, and the key is still the stage's.
    if (v.active !== "stage") report.fail(slide.id, `after the link, focus is on ${v.active}, not the stage`);
    else if (v.handled !== true) report.fail(slide.id, "after the link, the stage did not handle ArrowRight");
    else report.pass(`${slide.id}: after the link the stage has focus and handles ArrowRight${next ? `, moving to ${next.id}` : ""}`);
  } finally {
    await ctx.close();
  }
}

const fadeWatch = (session: Session) => async (reduced: boolean, fade: "0" | "1") => {
  const ctx = await session.context({ viewport: { width: 1600, height: 900 }, reducedMotion: reduced ? "reduce" : "no-preference" });
  await ctx.addInitScript(VT_WATCH);
  const page = await ctx.newPage();
  return { ctx, page, url: (id: string) => session.present(id, undefined, { fade }) };
};
const vtCount = (page: Page) => page.evaluate(`window.__vtCount ?? 0`) as Promise<number>;

/**
 * With `?fade=1`: a view transition runs on next and previous slide, none on a step change, two
 * presses 50 ms apart land two slides on, the frame's first step arrives within 300 ms of the no-fade
 * baseline, and under reduced motion no opacity animation runs on the new snapshot.
 */
export async function walkTransitions(session: Session) {
  const { report, deck } = session;
  report.section("transitions");
  const run = fadeWatch(session);
  const copy = plainRun(deck, 3);
  const stepped: Target | null = pageWithSteps(deck, 2);
  const warmed = firstWarmed(deck);
  if (!copy) return report.note("three copy slides in a row are needed: skipped");
  const order = deck.ids;
  const at = order.indexOf(copy.id);
  {
    const { ctx, page, url } = await run(false, "1");
    await page.goto(url(copy.id));
    await page.waitForTimeout(1500);
    let c = await vtCount(page);
    await page.keyboard.press("Shift+ArrowRight");
    await arrives(page, deck, order[at + 1], 4000);
    await page.waitForTimeout(500);
    const afterNext = (await vtCount(page)) - c;
    c = await vtCount(page);
    await page.keyboard.press("Shift+ArrowLeft");
    await arrives(page, deck, order[at], 4000);
    await page.waitForTimeout(500);
    const afterPrev = (await vtCount(page)) - c;
    if (afterNext < 1 || afterPrev < 1) report.fail("transitions", `view transitions: next ${afterNext}, previous ${afterPrev}; each slide change should run one`);
    else report.pass(`transitions: one on next (${afterNext}) and previous (${afterPrev})`);
    if (stepped) {
      await page.goto(url(stepped.page.id));
      await waitForResult(page, stepKey(stepped.page, stepped.page.steps[0]), 0, 15000);
      await page.waitForTimeout(500);
      c = await vtCount(page);
      const s = await lastSeq(page);
      await page.keyboard.press("ArrowRight");
      await waitForResult(page, stepKey(stepped.page, stepped.page.steps[1]), s, 10000);
      const onStep = (await vtCount(page)) - c;
      if (onStep) report.fail("transitions", `${onStep} view transition(s) on a step change`);
      else report.pass("transitions: none on a step change");
    }
    await page.goto(url(copy.id));
    await page.waitForTimeout(1500);
    await page.keyboard.press("Shift+ArrowRight");
    await page.waitForTimeout(50);
    await page.keyboard.press("Shift+ArrowRight");
    const two = await arrives(page, deck, order[at + 2], 5000);
    if (two < 0) report.fail("transitions", `two presses 50 ms apart: on ${new URL(page.url()).searchParams.get("s")}, not ${order[at + 2]}`);
    else report.pass(`transitions: two presses 50 ms apart land on ${order[at + 2]}`);
    await ctx.close();
  }
  // The first step's done against the no-fade baseline, arriving on a framed page from its intro.
  if (warmed) {
    const target = deck.demos.flatMap((d) => d.pages).find((p) => p.id === warmed.next)!;
    const timing = async (fade: "0" | "1") => {
      const { ctx, page, url } = await run(false, fade);
      const samples: number[] = [];
      for (let i = 0; i < 3; i++) {
        await page.goto(url(warmed.intro));
        await page.waitForTimeout(2500);
        const s = await lastSeq(page);
        const t = Date.now();
        await page.keyboard.press("ArrowRight");
        if (await waitForResult(page, stepKey(target, target.steps[0]), s, 15000)) samples.push(Date.now() - t);
      }
      await ctx.close();
      samples.sort((a, b) => a - b);
      return samples[Math.floor(samples.length / 2)] ?? Infinity;
    };
    const base0 = await timing("0");
    const fade1 = await timing("1");
    if (fade1 - base0 > 300) report.fail("transitions", `the frame's first step takes ${fade1} ms with the fade, ${base0} ms without (over 300 ms later)`);
    else report.pass(`transitions: first step done in ${fade1} ms with the fade, ${base0} ms without`);
  }
  {
    const { ctx, page, url } = await run(true, "1");
    await page.goto(url(copy.id));
    await page.waitForTimeout(1500);
    await page.evaluate(`window.__vtFades = 0; const tick = () => { for (const a of document.getAnimations()) { const pe = a.effect && a.effect.pseudoElement; if (pe && pe.startsWith("::view-transition-new")) { const k = a.effect.getKeyframes(); if (k.some((f) => f.opacity !== undefined && Number(f.opacity) > 0 && Number(f.opacity) < 1)) window.__vtFades++; else if (k.some((f) => f.opacity !== undefined) && k.map((f) => Number(f.opacity)).some((o, i, arr) => i > 0 && o !== arr[0])) window.__vtFades++; } } if (performance.now() < window.__vtUntil) requestAnimationFrame(tick); }; window.__vtUntil = performance.now() + 1500; requestAnimationFrame(tick);`);
    await page.keyboard.press("Shift+ArrowRight");
    await page.waitForTimeout(1600);
    const fades = (await page.evaluate(`window.__vtFades`)) as number;
    if (fades) report.fail("transitions", `reduced motion: ${fades} frame(s) with an opacity animation on ::view-transition-new`);
    else report.pass("transitions: reduced motion, no opacity animation on the new snapshot");
    await ctx.close();
  }
}
