import type { Page } from "playwright";
import { eventually, get, inContext, open, slideOf, walkPage, type Check, type Target } from "./target";

const status = (page: Page, t: Target) => page.locator(t.selectors.play).first().getAttribute("data-status");

/** A check for one framed page, in one browser context, or n/a on a deck with none. */
function onWalkPage(run: (t: Target, id: string, context: Parameters<Parameters<typeof inContext>[1]>[0]) => ReturnType<Check>): Check {
  return async (t) => {
    const page = walkPage(t.manifest);
    return page ? inContext(t, (context) => run(t, page.id, context)) : null;
  };
}

/**
 * Stands in for the wake lock, which a headless browser refuses. A string, because a transpiler
 * may wrap a named function in a helper the browser does not have.
 */
const WAKE_LOCK_STUB = `Object.defineProperty(navigator, "wakeLock", { value: { request: async () => {
  window.__wakeLocks = (window.__wakeLocks ?? 0) + 1;
  return { release: async () => undefined, addEventListener: () => undefined };
} } });`;

/** Keeps the names of the channels a window opens. */
function channelSpy() {
  const Real = window.BroadcastChannel;
  const w = window as unknown as { __channels: string[] };
  w.__channels = [];
  window.BroadcastChannel = class extends Real {
    constructor(name: string) {
      super(name);
      w.__channels.push(name);
    }
  };
}

export const presenter: Record<string, Check> = {
  "PR-2": (t) =>
    inContext(t, async (context) => {
      const { slides, routes } = t.manifest;
      const page = await open(context, t, `${routes.present}?s=${slides[0].id}`);
      await page.keyboard.press("ArrowRight");
      await eventually(async () => slideOf(page) === slides[1].id);
      await page.keyboard.press("ArrowRight");
      await eventually(async () => slideOf(page) === slides[2].id);
      await page.reload({ waitUntil: "load" });
      await page.waitForTimeout(500);
      const refreshResumes = slideOf(page) === slides[2].id;
      await page.goto(`${t.origin}${routes.present}?s=${slides[0].id}`, { waitUntil: "load" });
      await page.waitForTimeout(500);
      return { refreshResumes, typedAddressWins: slideOf(page) === slides[0].id };
    }),

  "PR-3": (t) =>
    inContext(t, async (context) => {
      await context.addInitScript(channelSpy);
      const { slides, routes } = t.manifest;
      const { build } = JSON.parse((await get(t.origin, routes.health)).text) as { build: string };
      const page = await open(context, t, `${routes.present}?s=${slides[0].id}`);
      const names = await page.evaluate(() => (window as unknown as { __channels: string[] }).__channels);
      return { channelNamesBuild: names.some((n) => n.includes(build)) };
    }),

  "PR-4": onWalkPage(async (t, id, context) => {
    const speaker = await open(context, t, `${t.manifest.routes.speaker}?s=${id}`);
    const alone = await eventually(async () => (await status(speaker, t)) === "offline", 8000);
    const dot = (await speaker.locator(`${t.selectors.controls} [data-connected="false"]`).count()) === 1;
    await open(context, t, `${t.manifest.routes.present}?s=${id}`);
    const cleared = await eventually(async () => (await status(speaker, t)) !== "offline", 8000);
    return { noAudiencePill: alone, dotOnTheButton: dot, clearsWithAudience: cleared };
  }),

  "PR-6": onWalkPage(async (t, id, context) => {
    const speaker = await open(context, t, `${t.manifest.routes.speaker}?s=${id}`);
    const offline = await eventually(async () => (await status(speaker, t)) === "offline", 8000);
    await open(context, t, `${t.manifest.routes.present}?s=${id}`);
    const ready = await eventually(async () => (await status(speaker, t)) === "ready", 10_000);
    return { onePill: (await speaker.locator(t.selectors.play).count()) === 1, showsOffline: offline, showsReady: ready };
  }),

  "PR-8": (t) =>
    inContext(t, async (context) => {
      const { slides, routes } = t.manifest;
      const page = await open(context, t, `${routes.speaker}?s=${slides[0].id}`);
      const size = () => page.locator(t.selectors.notes).evaluate((el) => (el as HTMLElement).style.getPropertyValue("--notes-size"));
      const press = async (label: string) => {
        const button = page.getByRole("button", { name: label });
        while (await button.isEnabled()) await button.click();
      };
      await press("Larger notes text");
      const largest = await size();
      await press("Smaller notes text");
      const smallest = await size();
      await page.reload({ waitUntil: "load" });
      await page.waitForTimeout(500);
      return { largestIs56: largest === "56px", smallestIs28: smallest === "28px", remembered: (await size()) === smallest };
    }),

  "PR-9": onWalkPage(async (t, id, context) => {
    const page = await open(context, t, `${t.manifest.routes.speaker}?s=${id}`);
    const references = page.locator(t.selectors.references);
    await references.locator("summary").click();
    const text = await references.innerText();
    await references.getByRole("button").nth(1).click();
    const jumped = await eventually(async () => /Step 2 of/.test(await page.locator(t.selectors.step).innerText()));
    return { jumpToStep: /Jump to step/i.test(text), actions: /Actions/i.test(text), jumpMoves: jumped };
  }),

  "PR-11": (t) =>
    inContext(t, async (context) => {
      const { slides, routes } = t.manifest;
      const page = await open(context, t, `${routes.speaker}?s=${slides[0].id}`);
      const second = await open(context, t, `${routes.speaker}?s=${slides[0].id}`);
      const timer = page.locator(t.selectors.timer);
      const elapsed = () => timer.locator("time").innerText();
      const before = await elapsed();
      await page.bringToFront();
      await page.keyboard.press("t");
      const running = await eventually(async () => (await timer.getAttribute("data-running")) === "true");
      const synced = await eventually(async () => (await second.locator(t.selectors.timer).getAttribute("data-running")) === "true");
      const counts = await eventually(async () => (await elapsed()) !== before, 3000);
      await page.keyboard.press("t");
      const paused = await eventually(async () => (await timer.getAttribute("data-paused")) === "true");
      await page.getByRole("button", { name: "Reset timer" }).click();
      const reset = await eventually(async () => (await elapsed()) === before);
      return { starts: running, counts, pauses: paused, resets: reset, syncedAcrossWindows: synced };
    }),

  "PR-12": (t) =>
    inContext(t, async (context) => {
      const { slides, routes } = t.manifest;
      const page = await open(context, t, `${routes.speaker}?s=${slides[0].id}&rehearse=1`);
      const downloaded = page.waitForEvent("download", { timeout: 5000 });
      await page.getByRole("button", { name: "Export log" }).click();
      const file = await downloaded;
      const path = await file.path();
      const { readFileSync } = await import("node:fs");
      const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
      return { rehearseMode: (await page.locator("[data-rehearse='true']").count()) > 0, exportsJson: file.suggestedFilename().endsWith(".json") && typeof parsed === "object" };
    }),

  "PR-13": onWalkPage(async (t, id, context) => {
    const page = await open(context, t, `${t.manifest.routes.present}?s=${id}`);
    await page.keyboard.press("d");
    const overlay = page.locator(t.selectors.rehearsal);
    const shown = await eventually(() => overlay.isVisible());
    const text = shown ? await overlay.innerText() : "";
    return { shown, step: /step \d+\/\d+/.test(text), asserts: /assert/.test(text), frameTime: /p95 frame/.test(text) };
  }),

  "PR-15": (t) =>
    inContext(t, async (context) => {
      const { slides, routes } = t.manifest;
      const page = await open(context, t, `${routes.speaker}?s=${slides[0].id}`);
      await page.keyboard.press("g");
      const dialog = page.locator(`${t.selectors.goto}[open]`);
      const opens = await eventually(() => dialog.isVisible());
      await page.locator(t.selectors.gotoInput).fill("2");
      await page.keyboard.press("Enter");
      return { opens, goes: await eventually(async () => slideOf(page) === slides[1].id) };
    }),

  "PR-17": (t) =>
    inContext(t, async (context) => {
      const { slides, routes } = t.manifest;
      const speaker = await open(context, t, `${routes.speaker}?s=${slides[0].id}`);
      const audience = await open(context, t, `${routes.present}?s=${slides[0].id}`);
      const stage = audience.locator(t.selectors.stage).first();
      await audience.keyboard.press("b");
      const blank = await eventually(async () => (await stage.getAttribute("data-blank")) === "true");
      const flag = await eventually(() => speaker.locator(t.selectors.flagBlank).isVisible());
      const outline = (await speaker.locator(t.selectors.preview).getAttribute("data-blank")) === "true";
      await audience.keyboard.press("b");
      const clears = await eventually(async () => (await stage.getAttribute("data-blank")) !== "true");
      return { blanks: blank, flagOnPreview: flag, outlineOnPreview: outline, clears };
    }),

  "PR-19": (t) =>
    inContext(t, async (context) => {
      await context.addInitScript({ content: WAKE_LOCK_STUB });
      const { slides, routes } = t.manifest;
      const page = await open(context, t, `${routes.present}?s=${slides[0].id}`);
      const asked = await page.evaluate(() => (window as unknown as { __wakeLocks?: number }).__wakeLocks ?? 0);
      const audience = page.locator(t.selectors.audience);
      await page.mouse.move(200, 200);
      const visible = await eventually(async () => (await audience.getAttribute("data-cursor")) === "visible", 1000);
      const hidden = await eventually(async () => (await audience.getAttribute("data-cursor")) === "hidden", 3500);
      return { wakeLockAsked: asked > 0, cursorShowsOnMove: visible, cursorHidesWhenIdle: hidden };
    }),

  "PR-20": (t) =>
    inContext(t, async (context) => {
      const { slides, routes } = t.manifest;
      const count = async (path: string) => (await open(context, t, path)).locator(t.selectors.grain).count();
      return { inAudience: (await count(`${routes.present}?s=${slides[0].id}`)) === 1, notInSpeaker: (await count(`${routes.speaker}?s=${slides[0].id}`)) === 0, notForReaders: (await count(`${routes.reader}/${slides[0].id}`)) === 0 };
    }),

  "PR-24": onWalkPage(async (t, id, context) => {
    const page = await open(context, t, `${t.manifest.routes.present}?s=${id}&glass=off`);
    const solid = (await page.locator("html").getAttribute("data-glass")) === "off";
    const frame = page.locator(t.selectors.frame).first();
    await frame.waitFor({ state: "attached" });
    return { windowGoesSolid: solid, frameIsTold: ((await frame.getAttribute("src")) ?? "").includes("glass:0") };
  }),

  "PR-29": (t) =>
    inContext(t, async (context) => {
      const { slides, routes } = t.manifest;
      const total = slides.length;
      const speaker = await open(context, t, `${routes.speaker}?s=${slides[0].id}`);
      const audience = await open(context, t, `${routes.present}?s=${slides[0].id}`);
      const first = await speaker.title();
      await speaker.keyboard.press("ArrowRight");
      const moved = await eventually(async () => (await speaker.title()).includes(`(2/${total})`));
      return { speakerNamed: first.startsWith("Speaker · ") && first.includes(`(1/${total})`), followsTheSlide: moved, audienceNamed: (await audience.title()).length > 0 };
    }),

  "PR-30": (t) =>
    inContext(t, async (context) => {
      const { slides, routes } = t.manifest;
      const page = await open(context, t, `${routes.speaker}?s=${slides[0].id}`);
      const media = await page.evaluate(() => {
        const found = new Set<string>();
        for (const sheet of document.styleSheets) {
          for (const rule of sheet.cssRules) if (rule instanceof CSSMediaRule && /speaker/.test(rule.cssText)) found.add(rule.conditionText);
        }
        return [...found].join(" ");
      });
      return { reducedTransparency: /prefers-reduced-transparency/.test(media), forcedColors: /forced-colors/.test(media), reducedMotion: /prefers-reduced-motion/.test(media) };
    }),
};
