import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Page } from "@playwright/test";
import { keyHelpFor, type Slide } from "@live-ish/engine/verify";
import { liveFrames, pageWithSteps, plainRun, type Target } from "../lib/deck";
import { loadSharp, luminance } from "../lib/pixels";
import type { Session } from "../lib/session";
import { describeActive } from "../lib/watch";

/**
 * The reader's accessibility contract: code tabs, focus across slide changes, one live region, the
 * pill's focus ring from rendered pixels, the "Try the demo" toggle, one h1, the footer number, the
 * help rows, window titles, the text view at phone sizes, and what every copy slide says in it.
 */

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function openReader(session: Session, page: Page, id: string, step?: number) {
  await page.goto(session.reader(id, step));
  await page.waitForSelector('.page-frame[data-status="ready"], .slide, .intro', { timeout: 20000 }).catch(() => null);
  await page.waitForTimeout(600);
}

async function codeTabs(session: Session, pages: Target[]) {
  const { report, deck } = session;
  report.log("\n  code tabs, and the highlight as text");
  const ctx = await session.context({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  for (const { page: p } of pages) {
    const where = `a11y /s/${p.id}`;
    await openReader(session, page, p.id);
    const tabs = (await page.evaluate(`[...document.querySelectorAll("#stage .code__tab")].map((t) => t.textContent)`)) as string[];
    // Tab from the top of the page: the selected tab is the list's one tab stop.
    await page.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
    let reached = -1;
    for (let i = 0; i < 20 && reached < 0; i++) {
      await page.keyboard.press("Tab");
      if (((await page.evaluate(describeActive)) as string).includes("code__tab")) reached = i + 1;
    }
    if (reached < 0) {
      report.fail(where, "Tab never reached a code tab");
      continue;
    }
    report.pass(`${where}: Tab reaches the code tabs in ${reached} press(es)`);
    const url = page.url();
    const seen = new Set<string>([(await page.evaluate(`document.activeElement.textContent`)) as string]);
    for (let i = 0; i < tabs.length; i++) {
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(120);
      seen.add((await page.evaluate(`document.activeElement.textContent`)) as string);
    }
    const state = (await page.evaluate(`(() => {
      const a = document.activeElement, pre = document.querySelector("#stage .code__pre");
      return { selected: a.getAttribute("aria-selected"), tabIndex: a.tabIndex, controls: a.getAttribute("aria-controls"), panel: pre.id, role: pre.getAttribute("role"), labelledby: pre.getAttribute("aria-labelledby"), activeId: a.id, others: [...document.querySelectorAll("#stage .code__tab")].filter((t) => t !== a).map((t) => t.tabIndex) };
    })()`)) as { selected: string; tabIndex: number; controls: string; panel: string; role: string; labelledby: string; activeId: string; others: number[] };
    if (page.url() !== url) report.fail(where, `ArrowRight on a tab moved the deck to ${page.url()}`);
    else if (seen.size < tabs.length) report.fail(where, `ArrowRight reached ${seen.size} of ${tabs.length} files`);
    else report.pass(`${where}: ArrowRight walks all ${tabs.length} files and the deck stays`);
    const wired = state.selected === "true" && state.tabIndex === 0 && state.others.every((t) => t === -1) && state.controls === state.panel && state.role === "tabpanel" && state.labelledby === state.activeId;
    if (!wired) report.fail(where, `tabs are not wired: ${JSON.stringify(state)}`);
    else report.pass(`${where}: one tab stop, aria-controls to the tabpanel, the panel labelled by the selected tab`);
    await page.keyboard.press("End");
    const end = (await page.evaluate(`document.activeElement.textContent`)) as string;
    await page.keyboard.press("Home");
    const home = (await page.evaluate(`document.activeElement.textContent`)) as string;
    await page.waitForTimeout(200);
    if (end !== tabs.at(-1) || home !== tabs[0] || page.url() !== url) report.fail(where, `End gave ${end}, Home gave ${home}, deck ${page.url() === url ? "stayed" : "moved"}`);
    else report.pass(`${where}: End and Home reach the last and first file, and the deck stays`);
  }
  // The sentence the code points to, on the first step that highlights lines.
  const lit = pages.flatMap(({ page: p }) => p.steps.map((s, i) => ({ id: p.id, i, s }))).find((x) => x.s.code?.lines.length && !x.s.code.off);
  if (lit) {
    await openReader(session, page, lit.id, lit.i);
    const where = `a11y /s/${lit.id}?step=${lit.i}`;
    const desc = (await page.evaluate(`(() => { const p = document.querySelector("#stage .code__pre"); const id = p.getAttribute("aria-describedby"); return id ? document.getElementById(id)?.textContent ?? null : null; })()`)) as string | null;
    if (!desc || !/^Lines? .+ of .+ (is|are) highlighted\.$/.test(desc)) report.fail(where, `the code's description is ${JSON.stringify(desc)}`);
    else report.pass(`${where}: the code is described as "${desc}"`);
  }
  // An off step: the first page whose step has code.off.
  const off = deck.demos.flatMap((d) => d.pages).flatMap((p) => p.steps.map((st, i) => ({ id: p.id, i, st }))).find((x) => x.st.code?.off);
  if (off) {
    await openReader(session, page, off.id, off.i);
    const tabText = (await page.evaluate(`(() => { const chip = document.querySelector("#stage .code__off-chip"); return chip ? chip.closest(".code__tab").textContent : null; })()`)) as string | null;
    if (!tabText?.includes("(turned off in this step)")) report.fail(`a11y /s/${off.id}?step=${off.i}`, `the off tab reads ${JSON.stringify(tabText)}`);
    else report.pass(`a11y /s/${off.id}?step=${off.i}: the off file's tab reads "${tabText.trim()}"`);
  }
  await ctx.close();
}

async function focusAndAnnouncements(session: Session, stepped: Target) {
  const { report, deck } = session;
  report.log("\n  focus across slide changes, and announcements");
  const ctx = await session.context({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const hops = Math.min(5, deck.slides.length - 2);
  const start = deck.slides[0];
  await openReader(session, page, start.id);
  await page.focus('[data-control="next"]');
  let kept = 0;
  let lost = "";
  for (let i = 0; i < hops; i++) {
    const before = page.url();
    await page.keyboard.press("Enter");
    await page.waitForURL((u) => u.href !== before, { timeout: 5000 }).catch(() => null);
    await page.waitForTimeout(400);
    const a = (await page.evaluate(describeActive)) as string;
    if (a.startsWith("button[next]")) kept++;
    else lost ||= `${new URL(page.url()).pathname}: ${a}`;
  }
  if (kept !== hops) report.fail("a11y focus", `focus left Next after a slide change (${lost})`);
  else report.pass(`a11y focus: Enter on Next keeps focus on Next across ${hops} moves (now ${new URL(page.url()).pathname})`);
  await page.focus('[data-control="prev"]');
  const before = page.url();
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => u.href !== before, { timeout: 5000 }).catch(() => null);
  await page.waitForTimeout(400);
  const a = (await page.evaluate(describeActive)) as string;
  if (!a.startsWith("button[prev]")) report.fail("a11y focus", `Enter on Previous left focus on ${a}`);
  else report.pass("a11y focus: Enter on Previous keeps focus on Previous");

  // Next on a demo slide plays a step in place. A step that focuses something takes focus into the
  // frame, and the next Enter would then press the demo instead of Next.
  const frames = liveFrames(deck).filter((t) => t.page.frame.kind !== "terminal" && !t.page.steps.some((s) => s.route));
  const steps = frames.flatMap((t) => t.page.steps.slice(1).map((step, at) => ({ target: t, step, from: at })));
  const has = (types: string[]) => steps.find(({ step }) => step.actions.some((a) => types.includes(a.type)));
  const takesFocus = has(["focus", "type", "paste"]) ?? has(["click"]);
  if (!takesFocus) report.log("    note no step here moves focus, so a pill press through a step went unchecked");
  else {
    const { target, step, from } = takesFocus;
    await openReader(session, page, target.page.id, from);
    await page.focus('[data-control="next"]');
    await page.keyboard.press("Enter");
    await page.waitForFunction(`Boolean((window.__stepResults || {})[${JSON.stringify(step.id)}])`, null, { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(400);
    const onStep = (await page.evaluate(describeActive)) as string;
    if (!onStep.startsWith("button[next]")) report.fail("a11y focus", `playing ${target.page.id} ${step.id} left focus on ${onStep}`);
    else report.pass(`a11y focus: Enter on Next keeps focus on Next through ${target.page.id} ${step.id}`);
  }

  // One live region, step sentences only.
  await openReader(session, page, stepped.page.id);
  await page.evaluate(`(() => {
    window.__liveWrites = [];
    const obs = new MutationObserver((ms) => { for (const m of ms) { const t = m.target.nodeType === 3 ? m.target.parentElement : m.target; const live = t && t.closest ? t.closest("[aria-live]") : null; if (live && live.id !== "__next-route-announcer__" && live.textContent) window.__liveWrites.push({ id: live.id || live.className, text: live.textContent }); } });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true });
  })()`);
  await page.focus("#stage");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(900);
  const writes = (await page.evaluate(`window.__liveWrites`)) as { id: string; text: string }[];
  const announced = writes.filter((w) => w.id === "deck-announcer");
  const regions = (await page.evaluate(`document.querySelectorAll("#deck-announcer").length`)) as number;
  if (announced.length !== 1 || !/^Step 2 of \d+: .+\.( Lines? .+ highlighted\.)?/.test(announced[0].text)) report.fail("a11y announce", `a step change wrote ${JSON.stringify(announced)} to the deck's live region`);
  else report.pass(`a11y announce: a step change is announced once: "${announced[0].text}"`);
  if (regions !== 1) report.fail("a11y announce", `${regions} deck live regions`);
  // A slide change: the same node, nothing written. Next's route announcer reads the title.
  await page.evaluate(`(() => { window.__liveWrites = []; window.__announcer = document.getElementById("deck-announcer"); })()`);
  await page.keyboard.press("Shift+ArrowRight");
  await page.waitForURL((u) => !u.pathname.endsWith(`/${stepped.page.id}`), { timeout: 5000 }).catch(() => null);
  await page.waitForTimeout(900);
  const after = (await page.evaluate(`({ writes: window.__liveWrites.filter((w) => w.id === "deck-announcer"), same: window.__announcer === document.getElementById("deck-announcer"), stageAnnouncer: document.querySelectorAll(".stage__announcer").length })`)) as { writes: unknown[]; same: boolean; stageAnnouncer: number };
  if (after.writes.length || !after.same || after.stageAnnouncer) report.fail("a11y announce", `a slide change: ${JSON.stringify(after)}`);
  else report.pass("a11y announce: a slide change writes nothing to the deck's live region, which is the same node as before");
  await ctx.close();
}

async function pillRing(session: Session, slides: Slide[]) {
  const { report, deck } = session;
  report.log("\n  the pill's focus ring");
  const sharp = loadSharp(deck.root);
  const ctx = await session.context({ viewport: { width: 1600, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  for (const { id } of slides) {
    await openReader(session, page, id);
    // A keyboard move onto Keyboard help, enabled on every slide, so :focus-visible matches.
    await page.focus('[data-control="text"]');
    await page.keyboard.press(session.browserName === "webkit" ? "Alt+Tab" : "Tab");
    await page.waitForTimeout(400);
    const box = await page.locator('[data-control="help"]').boundingBox();
    const focused = (await page.evaluate(`document.activeElement.dataset.control`)) as string;
    if (!box || focused !== "help") {
      report.fail(`a11y ring ${id}`, `Tab from Text view did not reach Keyboard help (focus on ${focused})`);
      continue;
    }
    const png = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => {
      const i = (Math.round(y) * info.width + Math.round(x)) * info.channels;
      return luminance(data[i], data[i + 1], data[i + 2]);
    };
    const mid = info.height / 2;
    const ring = Math.max(px(0, mid), px(1, mid));
    const inside = px(5, mid);
    const ratio = (Math.max(ring, inside) + 0.05) / (Math.min(ring, inside) + 0.05);
    if (ratio < 3) report.fail(`a11y ring /s/${id}`, `the ring measures ${ratio.toFixed(2)}:1 against the pill`);
    else report.pass(`a11y ring /s/${id}: the ring measures ${ratio.toFixed(2)}:1 against the pill`);
  }
  await ctx.close();
}

async function demoToggle(session: Session, framed: Target, plain: Slide | null) {
  const { report } = session;
  report.log('\n  "Try the demo"');
  const ctx = await session.context({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  await openReader(session, page, framed.page.id);
  const btn = '[data-control="demo"]';
  if (!(await page.locator(btn).count())) {
    report.fail("a11y demo", `no Try the demo button on /s/${framed.page.id}`);
    await ctx.close();
    return;
  }
  await page.focus(btn);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  const on = (await page.evaluate(`({ pressed: document.querySelector('${btn}').getAttribute("aria-pressed"), handsOn: document.querySelector(".stage").dataset.handsOn, active: document.activeElement.className, tab: document.querySelector('.page-frame__iframe[data-visible="true"]')?.tabIndex })`)) as { pressed: string; handsOn: string; active: string; tab: number };
  if (on.pressed !== "true" || on.handsOn !== "true" || on.tab !== 0 || !on.active.includes("page-frame__iframe")) report.fail("a11y demo", `after Try the demo: ${JSON.stringify(on)}`);
  else report.pass("a11y demo: Try the demo turns hands-on on and gives the frame the keyboard");
  await page.focus(btn);
  await page.keyboard.press("Space");
  await page.waitForTimeout(800);
  const off = (await page.evaluate(`({ pressed: document.querySelector('${btn}').getAttribute("aria-pressed"), handsOn: document.querySelector(".stage").dataset.handsOn, active: document.activeElement.dataset.control ?? document.activeElement.tagName })`)) as { pressed: string; handsOn: string; active: string };
  if (off.pressed !== "false" || off.handsOn !== "false" || off.active !== "demo") report.fail("a11y demo", `after a second press: ${JSON.stringify(off)}`);
  else report.pass("a11y demo: a second press turns hands-on off, and focus stays on the toggle");
  if (plain) {
    await openReader(session, page, plain.id);
    if (await page.locator(btn).count()) report.fail("a11y demo", "Try the demo shows on a slide with no frame");
    else report.pass("a11y demo: no Try the demo on a slide without a frame");
  }
  await ctx.close();
}

async function lows(session: Session, plain: Slide | null, walkPage: Target | null) {
  const { report, deck } = session;
  report.log("\n  one h1, footer number, reader help, audience title");
  const ctx = await session.context({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const closing = deck.slides.find((s) => s.layout === "closing") ?? deck.slides.at(-1)!;
  await openReader(session, page, closing.id);
  const h1 = (await page.evaluate(`[...document.querySelectorAll("#stage h1")].map((h) => h.textContent)`)) as string[];
  if (h1.length !== 1) report.fail("a11y h1", `/s/${closing.id} has ${h1.length} h1 in the stage`);
  else report.pass(`a11y h1: /s/${closing.id} has one h1 ("${h1[0]}")`);
  if (plain) {
    await openReader(session, page, plain.id);
    const footer = (await page.evaluate(`(() => { const n = document.querySelector("#stage .slide__counter"); return n ? n.textContent.replace(/\\s+/g, " ").trim() : null; })()`)) as string | null;
    if (footer && !/^Slide \d+$/.test(footer)) report.fail("a11y footer", `the footer number reads ${JSON.stringify(footer)}`);
    else if (footer) report.pass(`a11y footer: the number reads "${footer}"`);
  }
  await page.focus('[data-control="help"]');
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  const rows = (await page.evaluate(`[...document.querySelectorAll("dialog.keyboard-help .keyboard-help__action")].map((d) => d.textContent)`)) as string[];
  const want = keyHelpFor("reader").map((r) => r.action);
  if (rows.join("|") !== want.join("|")) report.fail("a11y help", `the reader help lists ${JSON.stringify(rows)}`);
  else report.pass(`a11y help: the reader help lists the ${rows.length} reader rows, and no presenter-only keys`);
  await page.keyboard.press("Escape");
  // The audience window's title names a walk page's demo, because many pages share a beat's title.
  if (walkPage && walkPage.page.beat !== "single") {
    const audience = await session.context({ viewport: { width: 1280, height: 720 } });
    const ap = await audience.newPage();
    await ap.goto(session.present(walkPage.page.id));
    const title = await ap.title();
    const wanted = `Audience · ${walkPage.demo.title}: ${walkPage.page.title} · ${deck.deck.title}`;
    if (title !== wanted) report.fail("a11y titles", `the audience title is "${title}", wanted "${wanted}"`);
    else report.pass(`a11y titles: "${title}"`);
    await audience.close();
  }
  await ctx.close();
}

export interface SlideText {
  title: string;
  /** Every other string the slide holds for a reader. */
  texts: string[];
  /** Every image's alt. */
  alts: string[];
}

/** What a copy slide owes a reader as text, read from the deck, so a new layout is covered by its data. */
export function slideText(slide: Slide): SlideText {
  const own = slide.image ? [slide.image.alt] : [];
  const some = (texts: (string | undefined)[]) => texts.filter((t): t is string => Boolean(t));
  const g = slide.copy;
  switch (g?.kind) {
    case "title":
      return { title: g.lines.join(" "), texts: some([g.eyebrow]), alts: own };
    case "statement":
      return { title: g.lines.join(" "), texts: [], alts: own };
    case "grid":
      return {
        title: g.title ?? g.display ?? slide.title,
        texts: some([g.eyebrow, g.title ? g.display : undefined, g.lede, g.cardsEyebrow, ...g.cards.flatMap((c) => [c.num, c.title, c.body, c.question])]),
        alts: [...own, ...g.cards.flatMap((c) => (c.image ? [c.image.alt] : []))],
      };
    case "quotes":
      return { title: g.title, texts: g.quotes.flatMap((q) => [q.text, q.cite]), alts: own };
    case "people":
      return { title: g.title, texts: g.people.flatMap((p) => [p.name, p.role]), alts: own };
    case "closing":
      return { title: g.name, texts: some([g.eyebrow, g.role, g.link]), alts: own };
    default:
      return {
        title: slide.title,
        texts: some([
          slide.eyebrow,
          ...(slide.body ?? []),
          ...(slide.legend ?? slide.items ?? []).flatMap((i) => [i.label, i.detail]),
          ...(slide.stats ?? []).flatMap((s) => [s.value, s.label]),
          ...(slide.tableColumns ?? []),
          ...(slide.tableRows ?? []).flatMap((r) => r.cells),
          ...(slide.chart?.points ?? []).flatMap((p) => [p.label, String(p.y)]),
        ]),
        alts: own,
      };
  }
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

/** Each copy slide's title, body, items and image alts, in the text view. */
async function textContent(session: Session) {
  const { report, deck } = session;
  const slides = deck.slides.filter((s) => !s.page);
  if (!slides.length) return report.note("no copy slide for the text view to carry");
  report.log("\n  text view content");
  const ctx = await session.context({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  for (const slide of slides) {
    const want = slideText(slide);
    await page.goto(session.reader(slide.id));
    await page.waitForSelector(".reading-view", { state: "attached", timeout: 10000 }).catch(() => null);
    const got = (await page.evaluate(`(() => { const rv = document.querySelector(".reading-view"); return { title: document.querySelector("#reading-view-title")?.textContent ?? "", text: rv?.textContent ?? "", alts: [...(rv?.querySelectorAll("img") ?? [])].map((i) => i.alt) }; })()`)) as { title: string; text: string; alts: string[] };
    const text = squash(got.text);
    const problems = [squash(got.title) !== squash(want.title) && `the title reads ${JSON.stringify(got.title)}, wanted ${JSON.stringify(want.title)}`, ...want.texts.filter((t) => !text.includes(squash(t))).map((t) => `no ${JSON.stringify(t.slice(0, 50))}`), ...want.alts.filter((a) => !got.alts.includes(a)).map((a) => `no image with alt ${JSON.stringify(a.slice(0, 50))}`)].filter(Boolean);
    if (problems.length) report.fail(`text content /s/${slide.id} (${slide.layout})`, problems.join("; "));
    else report.pass(`text content /s/${slide.id} (${slide.layout}): the title, ${want.texts.length} text(s) and ${want.alts.length} image alt(s)`);
  }
  await ctx.close();
}

/** Each copy slide's images on the stage: drawn, and carrying the alt the author wrote. */
async function stageImages(session: Session) {
  const { report, deck } = session;
  const slides = deck.slides.filter((s) => !s.page && slideText(s).alts.length);
  if (!slides.length) return report.note("no copy slide has an image");
  report.log("\n  images on the stage");
  const ctx = await session.context({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  for (const slide of slides) {
    await openReader(session, page, slide.id);
    await page.evaluate(`Promise.all([...document.querySelectorAll("#stage img")].map((i) => i.decode().catch(() => {})))`);
    const shown = (await page.evaluate(`[...document.querySelectorAll("#stage img")].filter((i) => i.complete && i.naturalWidth > 0 && i.checkVisibility()).map((i) => i.alt)`)) as string[];
    const missing = slideText(slide).alts.filter((a) => !shown.includes(a));
    if (missing.length) report.fail(`image /s/${slide.id}`, `no drawn image with alt ${missing.map((a) => JSON.stringify(a.slice(0, 50))).join(", ")}; the stage has ${JSON.stringify(shown.map((a) => a.slice(0, 30)))}`);
    else report.pass(`image /s/${slide.id}: ${slideText(slide).alts.length} image(s) drawn with their alt text`);
  }
  await ctx.close();
}

async function textView(session: Session, framed: Target) {
  const { report, deck } = session;
  report.log("\n  text view");
  // A slide of each kind the deck has: the first and last, each beat, and one of each copy layout.
  const ids = [...new Set([deck.slides[0].id, ...deck.slides.filter((s, i, all) => all.findIndex((o) => (o.page?.beat ?? o.layout) === (s.page?.beat ?? s.layout)) === i).map((s) => s.id), deck.slides.at(-1)!.id])];
  for (const vp of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    const ctx = await session.context({ viewport: vp, deviceScaleFactor: 2, hasTouch: true });
    const page = await ctx.newPage();
    const frames: string[] = [];
    page.on("request", (r) => {
      if (r.resourceType() === "document" && r.frame() !== page.mainFrame()) frames.push(r.url());
    });
    for (const id of ids) {
      const where = `text ${vp.width}x${vp.height} /s/${id}`;
      await page.goto(session.reader(id));
      await page.waitForTimeout(700);
      const m = (await page.evaluate(`(() => {
        const rv = document.querySelector(".reading-view"), stage = document.querySelector(".stage");
        const small = [...rv.querySelectorAll("p, li, blockquote, figcaption")].filter((e) => e.checkVisibility() && e.textContent.trim() && !e.closest("pre")).map((e) => parseFloat(getComputedStyle(e).fontSize)).filter((s) => s < 16);
        const wide = [...rv.querySelectorAll("*")].filter((e) => !e.closest("pre") && e.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5).map((e) => e.tagName + "." + e.className);
        return { rv: getComputedStyle(rv).display, stage: getComputedStyle(stage).display, small: small.length, wide: wide.slice(0, 3), scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      })()`)) as { rv: string; stage: string; small: number; wide: string[]; scroll: number };
      const problems = [m.rv === "none" && "the text view is hidden", m.stage !== "none" && "the stage shows", m.small > 0 && `${m.small} text element(s) under 16 px`, m.scroll > 0 && `the page scrolls ${m.scroll} px sideways`, m.wide.length > 0 && `wider than the window: ${m.wide.join(", ")}`].filter(Boolean);
      if (problems.length) report.fail(where, problems.join(", "));
      else report.pass(`${where}: reflowing text at 16 px or more, no sideways scroll`);
      if (vp.width === 390) {
        await page.evaluate(axeSource);
        const res = (await page.evaluate(`axe.run(document, { runOnly: { type: "tag", values: ${JSON.stringify(AXE_TAGS)} }, rules: { region: { enabled: true } } })`)) as { violations: { id: string; nodes: { target: string[] }[] }[] };
        if (res.violations.length) report.fail(where, `axe: ${res.violations.map((v) => `${v.id} (${v.nodes.map((n) => n.target.join(" ")).slice(0, 2).join(", ")})`).join("; ")}`);
        else report.pass(`${where}: axe finds no violations`);
      }
    }
    if (frames.length) report.fail(`text ${vp.width}x${vp.height}`, `${frames.length} frame document(s) loaded: ${frames.slice(0, 2).join(", ")}`);
    else report.pass(`text ${vp.width}x${vp.height}: no frame document loaded in text view`);
    await ctx.close();
  }

  // The switch, from the keyboard, on a wide window. The frame mounts when the stage comes back.
  {
    const ctx = await session.context({ viewport: { width: 1600, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(session.reader(framed.page.id));
    await page.waitForSelector('.page-frame[data-status="ready"]', { timeout: 20000 }).catch(() => null);
    const hidden = (await page.evaluate(`getComputedStyle(document.querySelector(".reading-view")).display`)) as string;
    if (hidden !== "none") report.fail("text toggle", "the text view shows on a wide window with the switch off");
    await page.focus('[data-control="text"]');
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    const on = (await page.evaluate(`({ attr: document.documentElement.dataset.textView, pressed: document.querySelector('[data-control="text"]').getAttribute("aria-pressed"), rv: getComputedStyle(document.querySelector(".reading-view")).display, stage: getComputedStyle(document.querySelector(".stage")).display, focus: document.activeElement.dataset.control })`)) as Record<string, string>;
    if (on.attr !== "on" || on.pressed !== "true" || on.rv === "none" || on.stage !== "none" || on.focus !== "text") report.fail("text toggle", `Enter on Text view: ${JSON.stringify(on)}`);
    else report.pass("text toggle: Enter on Text view swaps the stage for the text view, and focus stays on the switch");
    // A slide change keeps it on, because the attribute is on <html>, and so does a reload.
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(600);
    await page.reload();
    await page.waitForTimeout(800);
    const kept = (await page.evaluate(`({ attr: document.documentElement.dataset.textView, pressed: document.querySelector('[data-control="text"]').getAttribute("aria-pressed") })`)) as Record<string, string>;
    if (kept.attr !== "on" || kept.pressed !== "true") report.fail("text toggle", `after a reload: ${JSON.stringify(kept)}`);
    else report.pass("text toggle: the choice survives a reload in the same tab");
    await page.focus('[data-control="text"]');
    await page.keyboard.press("Space");
    await page.waitForSelector('.page-frame[data-status="ready"], .slide, .intro', { timeout: 20000 }).catch(() => null);
    const off = (await page.evaluate(`({ attr: document.documentElement.dataset.textView ?? null, stage: getComputedStyle(document.querySelector(".stage")).display })`)) as { attr: string | null; stage: string };
    if (off.attr !== null || off.stage === "none") report.fail("text toggle", `Space to turn it off: ${JSON.stringify(off)}`);
    else report.pass("text toggle: Space turns it off, and the stage returns");
    await ctx.close();
  }

  // Never in the presenter windows, even with the switch on in the session.
  {
    const ctx = await session.context({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.addInitScript(`sessionStorage.setItem(${JSON.stringify(deck.stateKey.replace(/:state$/, ":text-view"))}, "on")`);
    for (const url of [session.present(framed.page.id), session.speaker(framed.page.id)]) {
      await page.goto(url);
      await page.waitForTimeout(800);
      const n = (await page.evaluate(`({ rv: document.querySelectorAll(".reading-view").length, stageHidden: [...document.querySelectorAll(".stage")].some((s) => getComputedStyle(s).display === "none") })`)) as { rv: number; stageHidden: boolean };
      const label = new URL(url).pathname;
      if (n.rv || n.stageHidden) report.fail("text presenter", `${label} at 390 px: ${JSON.stringify(n)}`);
      else report.pass(`text presenter: ${label} has no text view and keeps its stage at 390 px`);
    }
    await ctx.close();
  }
}

export async function walkA11y(session: Session, serversUp: Set<string>) {
  const { report, deck } = session;
  if (!deck.deck.reader.enabled) return report.note("reader.enabled is false: the reader checks do not apply");
  const live = liveFrames(deck, serversUp);
  const stepped = pageWithSteps(deck, 2, serversUp);
  const withTabs = live.filter((t) => t.page.files.length >= 2).slice(0, 2);
  const framed = stepped ?? live[0];
  const plain = plainRun(deck, 1);
  const walked = live.find((t) => t.page.beat !== "single") ?? null;
  if (withTabs.length) await codeTabs(session, withTabs);
  if (stepped) await focusAndAnnouncements(session, stepped);
  await pillRing(session, [deck.slides[0], deck.slides.at(-1)!]);
  if (framed) await demoToggle(session, framed, plain);
  await lows(session, plain, walked);
  if (framed) await textView(session, framed);
  await textContent(session);
  await stageImages(session);
}
