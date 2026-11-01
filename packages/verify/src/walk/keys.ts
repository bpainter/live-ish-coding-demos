import type { Page } from "@playwright/test";
import { pageWithSteps, stepKey, liveFrames, type Target } from "../lib/deck";
import { tabKey, type Session } from "../lib/session";
import { describeActive } from "../lib/watch";
import type { Report } from "../lib/report";

/**
 * The keyboard contract: Tab passes the frame in the reader, Space and Enter press the focused
 * control in the reader and speaker windows, letters act only from the stage, the help dialog holds
 * the keys, `s` reaches the other window, and the audience key matrix works from the stage and from
 * inside a frame.
 */

const READER_STEP = `(() => { const n = new URLSearchParams(location.search).get("step"); return n === null ? 0 : Number(n); })()`;
/** The step the stage shows, from the aria-hidden indicator ("Step 2 of 4"). */
const SHOWN_STEP = `(() => { const s = document.querySelector("#stage .page__steps span"); const m = s && /Step (\\d+) of/.exec(s.textContent); return m ? Number(m[1]) - 1 : 0; })()`;
const PREVIEW_STEP = `(() => { const s = document.querySelector(".speaker .page__steps span, .page__steps span"); const m = s && /Step (\\d+) of/.exec(s.textContent); return m ? Number(m[1]) - 1 : 0; })()`;

/** Opens a reader page and waits until its frame has replayed the step the address names. */
async function openReader(session: Session, page: Page, t: Target, step: number | "last" = 0) {
  await page.goto(session.reader(t.page.id, step));
  const s = t.page.steps[step === "last" ? t.page.steps.length - 1 : step];
  await page.waitForFunction(`Boolean((window.__stepResults || {})[${JSON.stringify(stepKey(t.page, s))}])`, null, { timeout: 20000 }).catch(() => null);
  await page.waitForTimeout(500);
}

/** Tab and Shift+Tab pass the frame: on a page, on a second page, and on a last step that holds focus. */
async function tabPast(session: Session, report: Report, first: Target, second: Target, lastFocus: Target | null) {
  report.log("\n  reader: Tab and Shift+Tab past the frame");
  const ctx = await session.context({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const starts: { t: Target; step: number | "last" }[] = [{ t: first, step: 0 }, { t: second, step: 0 }, ...(lastFocus ? [{ t: lastFocus, step: "last" as const }] : [])];
  for (const { t, step } of starts) {
    const where = `keys /s/${t.page.id}${step === "last" ? "?step=last" : ""}`;
    await openReader(session, page, t, step);
    if (step === "last") {
      const inFrame = (await page.evaluate(`document.activeElement?.matches?.("iframe.page-frame__iframe") ?? false`)) as boolean;
      if (!inFrame) report.fail(where, `the last step did not move focus into the frame (focus on ${await page.evaluate(describeActive)}); the forwarded Tab is untested here`);
      else {
        // The pill fades after 2.5 s idle, and a Tab the frame forwards wakes it.
        await page.waitForTimeout(3000);
        const idleBefore = (await page.evaluate(`document.querySelector(".stage")?.dataset.idle`)) as string;
        await page.keyboard.press(tabKey(session));
        await page.waitForTimeout(150);
        const idleAfter = (await page.evaluate(`document.querySelector(".stage")?.dataset.idle`)) as string;
        const after = (await page.evaluate(describeActive)) as string;
        if (idleAfter !== "false") report.fail(where, `after a forwarded Tab the pill is idle (data-idle ${idleAfter}, was ${idleBefore})`);
        else report.pass(`${where}: a Tab from inside the frame wakes the pill (data-idle ${idleBefore} to false)`);
        if (after.startsWith("iframe")) report.fail(where, "a Tab from inside the frame left focus in the frame");
        else report.pass(`${where}: a Tab from inside the frame moves past it, to ${after}`);
        await openReader(session, page, t, step);
      }
    }
    let reached = -1;
    let trapped = 0;
    // A person's pace: presses 100 ms apart.
    for (let i = 0; i < 30 && reached < 0; i++) {
      await page.waitForTimeout(100);
      await page.keyboard.press(tabKey(session));
      const a = (await page.evaluate(describeActive)) as string;
      if (a.startsWith("iframe")) trapped++;
      if (a.includes("reader-controls__button")) reached = i + 1;
    }
    if (reached < 0) report.fail(where, `30 Tabs never reached the reader pill (focus on ${await page.evaluate(describeActive)}, ${trapped} in the frame)`);
    else report.pass(`${where}: Tab reaches the pill in ${reached} press(es)`);
    if (step === "last") await openReader(session, page, t, step);
    let back = -1;
    let last = "";
    for (let i = 0; i < 30 && back < 0; i++) {
      await page.waitForTimeout(100);
      await page.keyboard.press(tabKey(session, true));
      last = (await page.evaluate(describeActive)) as string;
      const firstLink = (await page.evaluate(`(() => { const l = document.querySelector("#stage a[href]"); return l ? document.activeElement === l : false; })()`)) as boolean;
      // Firefox moves on from the first stop into its own window, so `activeElement` never changes.
      const atStart = (await page.evaluate(`document.activeElement === [...document.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, summary, [tabindex]')].find((e) => e.tabIndex >= 0 && e.checkVisibility())`)) as boolean;
      if (firstLink || atStart || last === "body" || last.startsWith("div#stage")) back = i + 1;
    }
    if (back < 0) report.fail(where, `30 Shift+Tabs never reached the slide's first link or the stage (focus on ${last})`);
    else report.pass(`${where}: Shift+Tab reaches ${last === "body" ? "the start of the page" : last} in ${back} press(es)`);
  }
  // The frame is one tab stop at most: never focusable by Tab unless hands-on is on.
  await page.goto(session.reader(first.page.id));
  await page.waitForSelector('.page-frame[data-status="ready"]', { timeout: 20000 }).catch(() => null);
  const tabIndex = (await page.evaluate(`document.querySelector('.page-frame__iframe[data-visible="true"]')?.tabIndex ?? null`)) as number | null;
  if (tabIndex !== -1) report.fail("keys reader", `the frame's tabIndex is ${tabIndex} with hands-on off, wanted -1`);
  else report.pass("keys reader: the frame is out of the tab order with hands-on off");
  await page.focus("#stage");
  await page.keyboard.press("h");
  await page.waitForTimeout(300);
  const on = (await page.evaluate(`({ handsOn: document.querySelector(".stage")?.dataset.handsOn, tabIndex: document.querySelector('.page-frame__iframe[data-visible="true"]')?.tabIndex })`)) as { handsOn: string; tabIndex: number };
  if (on.handsOn !== "true") report.fail("keys reader", "h on the stage did not turn hands-on on");
  else if (on.tabIndex !== 0) report.fail("keys reader", `hands-on is on but the frame's tabIndex is ${on.tabIndex}`);
  else report.pass("keys reader: h on the stage turns hands-on on, and the frame joins the tab order");
  await ctx.close();
}

/** Reader Space and Enter on controls, letters, the help dialog. */
async function readerControls(session: Session, report: Report, t: Target) {
  report.log("\n  reader: keys act where they are meant");
  const { deck } = session;
  const title = deck.slides.find((s) => s.layout === "title" && deck.deck.speaker.url) ?? null;
  const ctx = await session.context({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  // Every window.open the deck makes, named windows included: a reused window opens no new page.
  await page.addInitScript(`(() => { const open = window.open; window.__opened = []; window.open = function (...a) { window.__opened.push(String(a[0])); return open.apply(this, a); }; })()`);
  const opened = async () => (await page.evaluate(`window.__opened || []`)) as string[];
  await openReader(session, page, t, 1);
  await page.focus('.reader-controls__button[aria-label="Previous"]');
  await page.keyboard.press("Space");
  await page.waitForTimeout(500);
  const s1 = (await page.evaluate(READER_STEP)) as number;
  if (!page.url().includes(`/s/${t.page.id}`) || s1 !== 0) report.fail("keys reader", `Space on Previous went to ${new URL(page.url()).pathname}${new URL(page.url()).search}, wanted step 0 of ${t.page.id}`);
  else report.pass("keys reader: Space on Previous goes back one step");
  const before = page.url();
  await page.focus('.reader-controls__button[aria-label="Keyboard help"]');
  await page.keyboard.press("Space");
  await page.waitForTimeout(400);
  const helpOpen = (await page.evaluate(`document.querySelector("dialog.keyboard-help")?.open ?? false`)) as boolean;
  if (!helpOpen || page.url() !== before) report.fail("keys reader", `Space on Keyboard help: help ${helpOpen ? "open" : "closed"}, deck ${page.url() === before ? "still" : "moved"}`);
  else report.pass("keys reader: Space on Keyboard help opens the help, and the deck stays");
  if (helpOpen) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(500);
    const still = (await page.evaluate(`document.querySelector("dialog.keyboard-help")?.open ?? false`)) as boolean;
    if (page.url() !== before || !still) report.fail("keys reader", `ArrowRight with the help open: deck ${page.url() === before ? "still" : "moved"}, help ${still ? "open" : "closed"}`);
    else report.pass("keys reader: ArrowRight with the help open moves nothing");
    await page.focus("dialog.keyboard-help .keyboard-help__close");
    await page.keyboard.press("Space");
    await page.waitForTimeout(400);
    const closed = !((await page.evaluate(`document.querySelector("dialog.keyboard-help")?.open ?? false`)) as boolean);
    if (!closed || page.url() !== before) report.fail("keys reader", `Space on the help's Close: help ${closed ? "closed" : "open"}, deck ${page.url() === before ? "still" : "moved"}`);
    else report.pass("keys reader: Space on Close closes the help, and the deck stays");
  }
  // Letters with focus on a pill button or a slide link do nothing.
  const letterCheck = async (where: string, focusSel: string) => {
    await page.focus(focusSel);
    const url = page.url();
    for (const k of ["s", "o", "d", "h"]) await page.keyboard.press(k);
    await page.waitForTimeout(500);
    const st = (await page.evaluate(`({ handsOn: document.querySelector(".stage")?.dataset.handsOn, rehearsal: Boolean(document.querySelector(".stage__rehearsal")) })`)) as { handsOn: string; rehearsal: boolean };
    const o = await opened();
    const problems = [page.url() !== url && "the deck moved", o.length > 0 && `opened ${o.join(", ")}`, st.handsOn === "true" && "hands-on turned on", st.rehearsal && "the rehearsal overlay showed"].filter(Boolean);
    if (problems.length) report.fail("keys reader", `s, o, d, h on ${where}: ${problems.join(", ")}`);
    else report.pass(`keys reader: s, o, d and h on ${where} do nothing`);
  };
  await letterCheck("the Next button", '.reader-controls__button[aria-label="Next"]');
  const first = title?.id ?? deck.slides[0].id;
  const fresh = async () => {
    await page.goto(session.reader(first));
    await page.waitForSelector("#stage", { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(500);
  };
  await fresh();
  if (await page.$("#stage a[href]")) await letterCheck("a slide link", "#stage a[href]");
  // Presenter-only letters do nothing in the reader, even from the stage.
  await fresh();
  await page.focus("#stage");
  const url = page.url();
  for (const k of ["s", "t", "b", ".", "d", "g"]) await page.keyboard.press(k);
  await page.waitForTimeout(500);
  const st = (await page.evaluate(`({ rehearsal: Boolean(document.querySelector(".stage__rehearsal")), goto: Boolean(document.querySelector("dialog[open]")) })`)) as { rehearsal: boolean; goto: boolean };
  const o = await opened();
  const problems = [page.url() !== url && "the deck moved", o.length > 0 && `opened ${o.join(", ")}`, st.rehearsal && "the rehearsal overlay showed", st.goto && "a dialog opened"].filter(Boolean);
  if (problems.length) report.fail("keys reader", `s, t, b, ., d, g on the stage: ${problems.join(", ")}`);
  else report.pass("keys reader: the presenter-only keys s, t, b, ., d and g do nothing");
  // Navigation keys still work from a control: ArrowRight with focus on Next.
  await page.focus('.reader-controls__button[aria-label="Next"]');
  await page.keyboard.press("ArrowRight");
  await page.waitForURL((u) => !u.pathname.endsWith(`/s/${first}`), { timeout: 3000 }).catch(() => null);
  if (page.url().includes(`/s/${first}`)) report.fail("keys reader", "ArrowRight with focus on Next did not move the deck");
  else report.pass("keys reader: ArrowRight with focus on a pill button still moves the deck");
  await ctx.close();
}

/** Speaker window: Space presses the focused control, and PageDown works with focus on each one. */
async function speakerControls(session: Session, report: Report, t: Target) {
  report.log("\n  speaker: Space presses the focused control");
  const ctx = await session.context({ viewport: { width: 1440, height: 900 } });
  const speaker = await ctx.newPage();
  await speaker.goto(session.speaker(t.page.id));
  await speaker.waitForSelector(".speaker__controls", { timeout: 20000 }).catch(() => null);
  await speaker.waitForTimeout(800);
  await speaker.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
  await speaker.keyboard.press("PageDown");
  await speaker.waitForTimeout(400);
  const at1 = (await speaker.evaluate(PREVIEW_STEP)) as number;
  const prev = speaker.locator(".speaker__controls button").filter({ hasText: /^Previous$|Previous/ }).first();
  if (at1 !== 1 || !(await prev.count())) report.fail("keys speaker", `setup: step ${at1 + 1} after PageDown, Previous button ${(await prev.count()) ? "found" : "missing"}`);
  else {
    await prev.focus();
    await speaker.keyboard.press("Space");
    await speaker.waitForTimeout(500);
    const at = (await speaker.evaluate(PREVIEW_STEP)) as number;
    if (at !== 0) report.fail("keys speaker", `Space on Previous left the deck at step ${at + 1} (from step 2), wanted step 1`);
    else report.pass("keys speaker: Space on Previous goes back");
  }
  const buttons = speaker.locator(".speaker__controls button:not([disabled])");
  const count = await buttons.count();
  const bad: string[] = [];
  for (let i = 0; i < count; i++) {
    const b = buttons.nth(i);
    const name = ((await b.getAttribute("aria-label")) ?? (await b.textContent()) ?? "").trim();
    await b.focus();
    const s0 = (await speaker.evaluate(PREVIEW_STEP)) as number;
    await speaker.keyboard.press("PageDown");
    await speaker.waitForTimeout(350);
    const s1 = (await speaker.evaluate(PREVIEW_STEP)) as number;
    await speaker.keyboard.press("PageUp");
    await speaker.waitForTimeout(350);
    const s2 = (await speaker.evaluate(PREVIEW_STEP)) as number;
    if (s1 !== s0 + 1 || s2 !== s0) bad.push(`${name} (${s0 + 1} to ${s1 + 1} to ${s2 + 1})`);
    // A drawer or dialog a control opened would swallow the next key.
    await speaker.keyboard.press("Escape");
  }
  if (bad.length) report.fail("keys speaker", `PageDown and PageUp with focus on: ${bad.join(", ")}`);
  else report.pass(`keys speaker: PageDown and PageUp work with focus on each of ${count} controls`);
  await ctx.close();
}

/**
 * `s` reaches the other window from each one. A second press leaves an open window alone, because a
 * reload there would restart the demo in front of the room.
 */
async function otherWindow(session: Session, report: Report, t: Target) {
  report.log("\n  presenter: s opens the other window");
  const ctx = await session.context({ viewport: { width: 1440, height: 900 } });
  const press = async (from: Page) => {
    const opened = ctx.waitForEvent("page", { timeout: 5000 }).catch(() => null);
    await from.bringToFront();
    await from.keyboard.press("s");
    return opened;
  };
  const speaker = await ctx.newPage();
  await speaker.goto(session.speaker(t.page.id));
  await speaker.waitForSelector(".speaker__controls", { timeout: 20000 }).catch(() => null);
  await speaker.waitForTimeout(800);
  const audience = await press(speaker);
  await audience?.waitForURL(/\/present/, { timeout: 10000 }).catch(() => null);
  if (!audience || !audience.url().includes("/present")) {
    report.fail("keys s", `from the speaker window: ${audience ? `opened ${audience.url()}` : "opened nothing"}, wanted /present`);
    return ctx.close();
  }
  report.pass("keys s: from the speaker window, opens the audience window");
  await audience.waitForSelector("#stage", { timeout: 20000 }).catch(() => null);
  await audience.evaluate(`window.__noReload = 1`);
  const again = await press(speaker);
  const survived = (await audience.evaluate(`window.__noReload === 1`).catch(() => false)) as boolean;
  if (again || !survived) report.fail("keys s", `a second press ${again ? "opened another window" : "reloaded the audience window"}`);
  else report.pass("keys s: a second press leaves the audience window where it is");
  const back = await press(audience);
  if (back) report.fail("keys s", `from the audience window: opened ${back.url()}, wanted the open speaker window`);
  else report.pass("keys s: from the audience window, finds the open speaker window");
  await ctx.close();

  // The way a quick start goes: the audience window first, with no speaker window to find.
  const first = await session.context({ viewport: { width: 1440, height: 900 } });
  const alone = await first.newPage();
  await alone.goto(session.present(t.page.id));
  await alone.waitForSelector("#stage", { timeout: 20000 }).catch(() => null);
  await alone.waitForTimeout(800);
  const opened = first.waitForEvent("page", { timeout: 5000 }).catch(() => null);
  await alone.keyboard.press("s");
  const notes = await opened;
  await notes?.waitForURL(/\/speaker/, { timeout: 10000 }).catch(() => null);
  if (!notes || !notes.url().includes("/speaker")) report.fail("keys s", `from the audience window: ${notes ? `opened ${notes.url()}` : "opened nothing"}, wanted /speaker`);
  else report.pass("keys s: from the audience window, opens the speaker window");
  await first.close();
}

/** The audience key matrix, from the stage and from inside a frame. */
async function audienceMatrix(session: Session, report: Report, t: Target) {
  report.log("\n  audience: the key matrix");
  const ctx = await session.context({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  for (const from of ["stage", "frame"] as const) {
    const where = `keys audience (${from})`;
    await page.goto(session.present(t.page.id));
    await page.waitForSelector('.page-frame[data-status="ready"]', { timeout: 20000 }).catch(() => null);
    await page.waitForTimeout(1500);
    await page.evaluate(`window.__noReload = 1`);
    const place = async () => {
      if (from === "stage") await page.focus("#stage");
      else await page.evaluate(`document.querySelector('.page-frame__iframe[data-visible="true"]')?.focus()`);
      await page.waitForTimeout(100);
      // A frame keeps focus through steps, so this checks it is where the leg says.
      const a = (await page.evaluate(describeActive)) as string;
      return from === "stage" ? a.startsWith("div#stage") : a.startsWith("iframe") && a.includes("page-frame__iframe");
    };
    if (!(await place())) {
      report.fail(where, `could not put focus on the ${from} (focus on ${await page.evaluate(describeActive)})`);
      continue;
    }
    const problems: string[] = [];
    const step = async () => (await page.evaluate(SHOWN_STEP)) as number;
    const waitStep = async (n: number) => {
      for (let i = 0; i < 40; i++) {
        if ((await step()) === n) return true;
        await page.waitForTimeout(50);
      }
      return false;
    };
    // Each step finishes before the next press, so Next advances instead of finishing it.
    const settle = () => page.waitForTimeout(1600);
    const pairs: [string, number][] = [
      ["ArrowRight", 1],
      ["ArrowLeft", 0],
      ["PageDown", 1],
      ["PageUp", 0],
      ["Space", 1],
      ["ArrowLeft", 0],
    ];
    for (const [key, want] of pairs) {
      await page.keyboard.press(key);
      if (!(await waitStep(want))) problems.push(`${key} left step ${(await step()) + 1}, wanted ${want + 1}`);
      await settle();
      await place();
    }
    for (const key of ["b", "."]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(250);
      const on = (await page.evaluate(`document.querySelector(".stage")?.dataset.blank`)) as string;
      await page.keyboard.press(key);
      await page.waitForTimeout(250);
      const off = (await page.evaluate(`document.querySelector(".stage")?.dataset.blank`)) as string;
      if (on !== "true" || off !== "false") problems.push(`${key} blank ${on} then ${off}`);
      await place();
    }
    await page.keyboard.press("f");
    await page.waitForTimeout(400);
    const fs = (await page.evaluate(`Boolean(document.fullscreenElement)`)) as boolean;
    await page.keyboard.press("f");
    await page.waitForTimeout(400);
    const fsOff = (await page.evaluate(`Boolean(document.fullscreenElement)`)) as boolean;
    if (!fs || fsOff) problems.push(`f fullscreen ${fs} then ${fsOff}`);
    await place();
    const before = await step();
    for (const key of ["F5", "Escape"]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(400);
    }
    const survived = (await page.evaluate(`window.__noReload === 1`).catch(() => false)) as boolean;
    if (!survived) problems.push("F5 reloaded the window");
    if ((await step()) !== before) problems.push("F5 or Escape moved the deck");
    if (from === "frame") {
      // Tab and Escape forwarded from a frame are ignored here: focus stays in the frame.
      await page.keyboard.press(tabKey(session));
      await page.waitForTimeout(200);
      const a = (await page.evaluate(describeActive)) as string;
      if (!a.includes("page-frame__iframe")) problems.push(`Tab moved focus out of the frame to ${a}`);
    }
    if (problems.length) report.fail(where, problems.join("; "));
    else report.pass(`${where}: arrows, PageUp, PageDown, Space, b, ., f, F5 and Escape behave as before`);
  }
  await ctx.close();
}

/** Terminal pages: `l` hides the recording for a live terminal, and shows it again. */
async function liveKey(session: Session, report: Report) {
  const t = liveFrames(session.deck).find((x) => x.page.frame.kind === "terminal");
  if (!t) return;
  report.log("\n  terminal: l hides the recording");
  const ctx = await session.context({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto(session.present(t.page.id));
  await page.waitForFunction(`Boolean((window.__stepResults || {})[${JSON.stringify(stepKey(t.page, t.page.steps[0]))}])`, null, { timeout: 20000 }).catch(() => null);
  await page.waitForTimeout(600);
  const live = async () => {
    const f = await (await page.$('.page-frame__iframe[data-visible="true"]'))?.contentFrame();
    return (await f?.evaluate(`document.documentElement.hasAttribute("data-live")`).catch(() => null)) as boolean | null;
  };
  await page.keyboard.press("l");
  await page.waitForTimeout(300);
  const on = await live();
  await page.keyboard.press("l");
  await page.waitForTimeout(300);
  const off = await live();
  if (on !== true || off !== false) report.fail(`keys ${t.page.id}`, `l: live ${on} then ${off}`);
  else report.pass(`keys ${t.page.id}: l hides the recording and shows it again`);
  await ctx.close();
}

export async function walkKeys(session: Session, serversUp: Set<string>) {
  const { report, deck } = session;
  const first = pageWithSteps(deck, 2, serversUp);
  if (!first) return report.fail("keys", "no page with two steps to press through");
  const live = liveFrames(deck, serversUp).filter((t) => t.page.frame.kind !== "terminal");
  const second = live.find((t) => t.page.id !== first.page.id) ?? first;
  // A last step that leaves focus in the frame: the page whose last step ends on a `focus` action.
  const lastFocus = live.find((t) => t.page.steps.at(-1)?.actions.some((a) => a.type === "focus")) ?? null;
  if (deck.deck.reader.enabled) {
    await tabPast(session, report, first, second, lastFocus);
    await readerControls(session, report, first);
  }
  await speakerControls(session, report, first);
  await otherWindow(session, report, first);
  await audienceMatrix(session, report, first);
  await liveKey(session, report);
}
