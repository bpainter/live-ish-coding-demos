/**
 * One hosting mode, end to end, in one browser. It copies the starter to `.hosting/<mode>/`, adds a
 * temporary multi-page demo, builds that copy for the mode, serves it and walks it.
 *
 *   node --import tsx scripts/hosting.mts --mode=one-host --browser=webkit [--port=3200] [--no-build]
 *   node --import tsx scripts/hosting.mts --compare
 *
 * Modes: `local` (the pair of local addresses, from the request), `one-host` (both origin variables
 * on one address), `two-hosts` (two named origins) and `deployed` (a public build, reader only).
 * Four more vary a deployed build: `vercel` (the preset, with its analytics), `on-host` (a public
 * presenter, with custom analytics), `closed` (no reader pages) and `noindex` (reader pages out of
 * search), each with no walk of its own.
 * Each run writes `.hosting/results/<mode>-<browser>.json`. `--compare` holds each one-origin run
 * against the two-origin run in the same browser.
 *
 * This is the early version of the walks, for spike S-2. It covers every stop forward and back, Next
 * during playback, presses with focus inside a frame, the key contract, a cleared store, and Back in
 * a multi-page demo, on the starter's demos and the temporary one. It does not walk a deck of 50
 * slides, take screenshots, measure geometry or run the accessibility checks.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit, type Browser, type BrowserContext, type Frame, type Page } from "@playwright/test";

type Mode = "local" | "one-host" | "two-hosts" | "deployed" | "vercel" | "on-host" | "closed" | "noindex";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORK = path.join(ROOT, ".hosting");
const RESULTS = path.join(WORK, "results");
const MODE = (arg("mode") ?? "local") as Mode;
const BROWSER = (arg("browser") ?? "chromium") as "chromium" | "webkit";
const PORT = Number(arg("port") ?? 3200);
const BASE = `http://localhost:${PORT}`;
const DECK = path.join(WORK, MODE);
const NEXT = path.join(ROOT, "examples", "starter", "node_modules", ".bin", "next");
const STATE_KEY = "live-ish:show-the-code-and-the-result:state";
const TIMEOUT = 15_000;

/** Every stop of the walk: slide id and step count. A slide with no frame counts as one stop. */
const SLIDES = [
  { id: "faq-before", steps: 4 },
  { id: "faq-after", steps: 6 },
  { id: "count-words", steps: 4 },
  { id: "closing", steps: 0 },
];
/** Walked on its own: its navigations grow `history.length`, which every later digest reads. */
const HISTORY = { id: "history", steps: 6 };
/** Lines revealed once each `count-words` step has played. */
const TERMINAL_LINES = [3, 5, 7, 10];

const HISTORY_DEMO = `import { defineDemo } from "@live-ish/engine/config";

export default defineDemo({
  id: "history",
  title: "History",
  scenario: "Two documents in one frame.",
  beats: "single",
  single: {
    pages: ["two.html"],
    minutes: 1,
    notes: "This temporary demo proves Back in a frame.",
    steps: [
      { id: "s0", label: "Page one", route: "index.html", actions: [{ type: "assert", target: "#page", expect: "contains:one" }] },
      { id: "s1", label: "Focus the link", actions: [{ type: "focus", target: "#to-two" }, { type: "assert", target: "#to-two", expect: "focused" }] },
      { id: "s2", label: "Follow it", route: "two.html", actions: [{ type: "click", target: "#to-two" }, { type: "assert", target: "#page", expect: "contains:two" }] },
      { id: "s3", label: "Focus the button", actions: [{ type: "focus", target: "#go" }, { type: "assert", target: "#go", expect: "focused" }] },
      { id: "s4", label: "Back", route: "index.html", actions: [{ type: "navigate", history: "back" }, { type: "assert", target: "#page", expect: "contains:one" }] },
      { id: "s5", label: "Forward", route: "two.html", actions: [{ type: "navigate", history: "forward" }, { type: "assert", target: "#page", expect: "contains:two" }] },
    ],
  },
});
`;
/** What each variant adds to `deck.config.ts`. */
const CONFIG: Partial<Record<Mode, string>> = {
  vercel: `analytics: { provider: "vercel", speedInsights: true },`,
  "on-host": `presenter: { onHost: true }, analytics: { provider: "custom", script: "./analytics.ts" },`,
  closed: `presenter: { onHost: true }, reader: { enabled: false },`,
  noindex: `reader: { index: false },`,
};
const CUSTOM_ANALYTICS = `export default function start() {\n  (window as unknown as { __analytics: number }).__analytics = 1;\n}\n`;
const HISTORY_ROUTES = `export default [{ method: "GET" as const, path: "/history-data", handler: () => Response.json({ ok: true }) }];\n`;
const PAGE_ONE = `<h2 id="page">Page one</h2>\n<a id="to-two" href="two.html">Go to page two</a>\n`;
const PAGE_TWO = `<h2 id="page">Page two</h2>\n<button id="go" type="button">Stay</button>\n`;
/** A sentence from the starter's notes, and one from the temporary demo's. */
const NOTE_SENTENCES = ["Our click handler reads the state and opens the panel.", "This temporary demo proves Back in a frame."];

const checks: Record<string, string> = {};
const digests: Record<string, string> = {};
function check(name: string, ok: boolean, detail = "") {
  checks[name] = ok ? "pass" : `fail${detail ? `: ${detail}` : ""}`;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
}

type RuntimeMessage = { type: string; stepId?: string; digest?: string; code?: string; message?: string; asserts?: { pass: boolean; target: string; expect: string; actual: string }[] };
type Stop = { id: string; step: number };
type PresenterState = { slideId: string; stepIndex: number; blank: boolean; handsOn: boolean; live: boolean; startedAt: number | null; pausedAt: number | null; resetSeq?: number };

// --------------------------------------------------------------- the temporary deck

function writeDeck() {
  rmSync(DECK, { recursive: true, force: true });
  const starter = path.join(ROOT, "examples", "starter");
  const skip = new Set(["node_modules", ".next", ".live-ish", "live-ish", "next-env.d.ts", "tsconfig.tsbuildinfo"]);
  cpSync(starter, DECK, { recursive: true, filter: (f) => !skip.has(path.basename(f)) && !path.basename(f).startsWith(".next-") });
  symlinkSync(path.relative(DECK, path.join(starter, "node_modules")), path.join(DECK, "node_modules"));
  const dir = path.join(DECK, "demos", "history");
  mkdirSync(path.join(dir, "single"), { recursive: true });
  writeFileSync(path.join(dir, "demo.ts"), HISTORY_DEMO);
  writeFileSync(path.join(dir, "routes.ts"), HISTORY_ROUTES);
  writeFileSync(path.join(dir, "single", "index.html"), PAGE_ONE);
  writeFileSync(path.join(dir, "single", "two.html"), PAGE_TWO);
  const config = path.join(DECK, "deck.config.ts");
  const extra = CONFIG[MODE] ? `speaker: { name: "Your Name" },\n  ${CONFIG[MODE]}` : 'speaker: { name: "Your Name" },';
  writeFileSync(config, readFileSync(config, "utf8").replace('"what-this-shows", "faq"', '"what-this-shows", "history", "faq"').replace('speaker: { name: "Your Name" },', extra));
  if (MODE === "on-host") writeFileSync(path.join(DECK, "analytics.ts"), CUSTOM_ANALYTICS);
}

function buildEnv(): Record<string, string> {
  const id = { LIVE_ISH_BUILD_ID: `hosting-${MODE}` };
  if (MODE === "one-host") return { ...id, LIVE_ISH_SITE_ORIGIN: BASE, LIVE_ISH_FRAMES_ORIGIN: BASE };
  if (MODE === "two-hosts") return { ...id, LIVE_ISH_SITE_ORIGIN: BASE, LIVE_ISH_FRAMES_ORIGIN: `http://127.0.0.1:${PORT}` };
  if (MODE === "vercel") return { VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "deck.example.com", VERCEL_GIT_COMMIT_SHA: "abcdef0123456789" };
  if (MODE !== "local") return { ...id, LIVE_ISH_TARGET: "deployed", LIVE_ISH_SITE_ORIGIN: BASE };
  return id;
}

function build() {
  writeDeck();
  console.log(`Building ${path.relative(ROOT, DECK)}`);
  const run = spawnSync(NEXT, ["build"], { cwd: DECK, env: { ...process.env, ...buildEnv() }, encoding: "utf8" });
  if (run.status !== 0) throw new Error(`next build failed:\n${run.stdout}\n${run.stderr}`);
  writeFileSync(path.join(DECK, "build.log"), run.stdout);
}

function serve(port: number): ChildProcess {
  return spawn(NEXT, ["start", "-p", String(port)], { cwd: DECK, stdio: "ignore", env: { ...process.env, ...buildEnv() } });
}

async function waitForServer(origin: string) {
  const until = Date.now() + 60_000;
  while (Date.now() < until) {
    if (await fetch(`${origin}/_health`).then((r) => r.ok, () => false)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`No answer from ${origin}/_health`);
}

// --------------------------------------------------------------- browser helpers

/** Collects what the frames post to the presenter. */
function listen() {
  if (window !== window.top) return;
  const w = window as unknown as { __runtime: unknown[] };
  w.__runtime = [];
  window.addEventListener("message", (e) => {
    const d = e.data as { type?: string };
    if (d && (d.type === "step-done" || d.type === "error")) w.__runtime.push(d);
  });
}

const messages = (page: Page) => page.evaluate(() => (window as unknown as { __runtime: unknown[] }).__runtime) as Promise<RuntimeMessage[]>;
const stateOf = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null") as unknown, STATE_KEY) as Promise<PresenterState | null>;

async function settled(page: Page, step: number, seen: number, timeout = TIMEOUT): Promise<RuntimeMessage | null> {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const done = (await messages(page)).slice(seen).find((m) => m.type === "step-done" && m.stepId === `s${step}`);
    if (done) return done;
    await page.waitForTimeout(25);
  }
  return null;
}

/** ms until the shared state says `want`, or -1. */
async function reaches(page: Page, want: (s: PresenterState) => boolean, timeout = 1500): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const s = await stateOf(page).catch(() => null);
    if (s && want(s)) return Date.now() - start;
    await page.waitForTimeout(15);
  }
  return -1;
}

async function shownFrame(page: Page): Promise<Frame | null> {
  const handle = await page.locator('iframe.page-frame__iframe[data-visible="true"]').last().elementHandle();
  return handle ? handle.contentFrame() : null;
}

const highlighted = (page: Page) => page.locator('.code__line[data-highlighted="true"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.line).join(","));

/** A typed `/present` URL, which claims both windows, ready to take a press. */
async function claim(audience: Page, id: string, step = 0) {
  const seen = 0;
  await audience.goto(`${BASE}/present?s=${id}${step ? `&step=${step}` : ""}`);
  await audience.waitForSelector('.page-frame__iframe[data-visible="true"]', { timeout: TIMEOUT }).catch(() => null);
  await settled(audience, step, seen);
  await audience.waitForTimeout(350);
}

type Windows = { context: BrowserContext; audience: Page; speaker: Page; errors: string[]; bad: string[] };

async function openWindows(browser: Browser): Promise<Windows> {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addInitScript(listen);
  const speaker = await context.newPage();
  await speaker.setViewportSize({ width: 1440, height: 900 });
  const audience = await context.newPage();
  const errors: string[] = [];
  const bad: string[] = [];
  for (const [name, page] of [["audience", audience], ["speaker", speaker]] as const) {
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`${name}: ${m.text()}`);
    });
    page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
    page.on("response", (r) => {
      if (r.status() >= 400) bad.push(`${name}: ${r.status()} ${r.url()}`);
    });
  }
  await speaker.goto(`${BASE}/speaker?s=faq-before`);
  await audience.goto(`${BASE}/present?s=faq-before`);
  await audience.bringToFront();
  return { context, audience, speaker, errors, bad };
}

// --------------------------------------------------------------- the walk: every stop, both ways

async function walkStops({ audience, speaker, errors: consoleErrors }: Windows, slides: typeof SLIDES, sameDigests: boolean) {
  const stops: Stop[] = slides.flatMap((s) => (s.steps ? Array.from({ length: s.steps }, (_, step) => ({ id: s.id, step })) : [{ id: s.id, step: 0 }]));
  const lines = new Map<string, string>();
  const problems: string[] = [];
  const where = slides[0].id;
  await claim(audience, where);
  const first = (await messages(audience)).findLast((m) => m.type === "step-done" && m.stepId === "s0") ?? null;
  check(`${where}: the first frame reports s0`, Boolean(first));
  const quietFrom = consoleErrors.length;

  const verify = async (stop: Stop, direction: "forward" | "back", done: RuntimeMessage | null) => {
    const key = `${stop.id}:s${stop.step}`;
    const slide = slides.find((s) => s.id === stop.id)!;
    if (slide.steps) {
      if (!done) return problems.push(`${direction} ${key}: no step-done`);
      for (const a of done.asserts ?? []) if (!a.pass) problems.push(`${direction} ${key}: assert ${a.target} ${a.expect}, found ${a.actual}`);
      if (direction === "forward") digests[key] = done.digest ?? "";
      else if (sameDigests && digests[key] !== done.digest) problems.push(`${key}: digest ${digests[key]} forward, ${done.digest} back`);
      const hi = await highlighted(audience);
      if (direction === "forward") lines.set(key, hi);
      else if (lines.get(key) !== hi) problems.push(`${key}: highlight ${lines.get(key)} forward, ${hi} back`);
      if (stop.id === "count-words") {
        const frame = await shownFrame(audience);
        const revealed = frame ? await frame.locator("li[data-line]:not([hidden])").count() : -1;
        if (revealed !== TERMINAL_LINES[stop.step]) problems.push(`${direction} ${key}: ${revealed} terminal lines`);
      }
    } else if ((await reaches(audience, (s) => s.slideId === stop.id, TIMEOUT)) < 0) problems.push(`${direction}: never reached ${stop.id}`);
    const want = slide.steps ? `Step ${stop.step + 1} of ${slide.steps}` : "Thank you";
    const target = slide.steps ? speaker.locator(".notes__step") : speaker.locator("#speaker-title");
    await target.filter({ hasText: want }).first().waitFor({ timeout: TIMEOUT }).catch(() => problems.push(`${direction} ${key}: speaker did not show "${want}"`));
  };

  await verify(stops[0], "forward", first);
  for (let i = 1; i < stops.length; i++) {
    const seen = (await messages(audience)).length;
    await audience.keyboard.press("ArrowRight");
    await verify(stops[i], "forward", stops[i].id === "closing" ? null : await settled(audience, stops[i].step, seen));
  }
  check(`${where}: forward through ${stops.length} stops`, problems.length === 0, problems.join("; "));
  const before = problems.length;
  for (let i = stops.length - 2; i >= 0; i--) {
    const seen = (await messages(audience)).length;
    await audience.keyboard.press("ArrowLeft");
    await verify(stops[i], "back", await settled(audience, stops[i].step, seen));
  }
  check(`${where}: back through ${stops.length} stops`, problems.length === before, problems.slice(before).join("; "));
  const all = await messages(audience);
  const errors = all.filter((m) => m.type === "error");
  const asserts = all.flatMap((m) => m.asserts ?? []);
  check(`${where}: no runtime errors`, errors.length === 0, errors.map((e) => `${e.code}: ${e.message}`).join("; "));
  check(`${where}: every assert passed through the runtime`, asserts.length > 0 && asserts.every((a) => a.pass), `${asserts.length} asserts`);
  check(`${where}: no console errors on the way`, consoleErrors.length === quietFrom, consoleErrors.slice(quietFrom, quietFrom + 6).join(" | "));
}

// --------------------------------------------------------------- Next during playback

async function walkAdvance({ audience, speaker }: Windows) {
  // A replay of the last step but one has no forward entry, so the press checks on the multi-page
  // demo run into the step that loads a document instead.
  for (const { id, next, steps, from } of [
    { id: "faq-after", next: "count-words", steps: 6, from: 4 },
    { id: "history", next: "faq-intro", steps: 6, from: 1 },
  ]) {
    const last = steps - 1;
    await claim(audience, id, last);
    await audience.focus('.page-frame__iframe[data-visible="true"]').catch(() => {});
    const inFrame = (await audience.evaluate(() => document.activeElement?.tagName)) === "IFRAME";
    await audience.keyboard.press("ArrowRight");
    check(`${id}: Next on the last step leaves the page, focus in the frame`, inFrame && (await reaches(audience, (s) => s.slideId === next)) >= 0);
    await audience.waitForTimeout(800);
    await audience.keyboard.press("ArrowLeft");
    check(`${id}: Back lands on the last step`, (await reaches(audience, (s) => s.slideId === id && s.stepIndex === last, 3000)) >= 0);
    await settled(audience, last, 0);
    await speaker.waitForURL(new RegExp(`s=${id}`), { timeout: 5000 }).catch(() => null);
    await audience.waitForTimeout(600);
    await speaker.locator(".speaker__controls button", { hasText: /^Next$/ }).click();
    check(`${id}: the speaker's Next leaves the page`, (await reaches(audience, (s) => s.slideId === next)) >= 0);
    await audience.waitForTimeout(400);

    for (const [label, delay] of [["200 ms into the code lead", 200], ["mid-playback", 700]] as const) {
      await claim(audience, id, from);
      const seen = (await messages(audience)).length;
      await audience.keyboard.press("ArrowRight");
      await audience.waitForTimeout(delay);
      await audience.keyboard.press("ArrowRight");
      const done = await settled(audience, from + 1, seen, 8000);
      await audience.waitForTimeout(150);
      // The second press either finished the step or, once the step had ended, took the next one.
      // A step's end moves by some milliseconds with the mode, so the check asks that the next press
      // moves one stop from wherever that left the deck, and that no press was lost.
      const at = (await stateOf(audience))!;
      await audience.keyboard.press("ArrowRight");
      const moved = await reaches(audience, (s) => s.slideId !== at.slideId || s.stepIndex === at.stepIndex + 1);
      check(`${id}: a press ${label} loses nothing, and the next press moves on`, Boolean(done) && at.stepIndex >= from + 1 && moved >= 0, `at ${at.slideId} s${at.stepIndex}`);
    }
  }
  const stuck = (await audience.evaluate(() => (window as unknown as { __stuckPlayback?: string[] }).__stuckPlayback ?? [])) as string[];
  check("the watchdog never fired", stuck.length === 0, stuck.join(", "));
}

// --------------------------------------------------------------- focus inside the frame

async function walkFocus({ audience }: Windows) {
  let lost = 0;
  let pressed = 0;
  const notes: string[] = [];
  for (const { id, steps } of [{ id: "faq-before", steps: 4 }, { id: "history", steps: 6 }]) {
    await claim(audience, id);
    for (let step = 1; step < steps; step++) {
      await audience.focus('.page-frame__iframe[data-visible="true"]').catch(() => {});
      const active = await audience.evaluate(() => document.activeElement?.tagName);
      if (active !== "IFRAME") notes.push(`${id} s${step - 1}: focus on ${active}`);
      const seen = (await messages(audience)).length;
      await audience.keyboard.press("ArrowRight");
      pressed++;
      if ((await reaches(audience, (s) => s.slideId === id && s.stepIndex === step)) < 0) {
        lost++;
        notes.push(`${id} s${step}: press lost`);
      }
      await settled(audience, step, seen);
      await audience.waitForTimeout(200);
    }
  }
  check(`${pressed} presses with focus in the frame, none lost`, lost === 0 && notes.length === 0, notes.join("; "));

  // A press soon after an intro arrives, while the warming frame loads.
  let warmLost = 0;
  const delays = [100, 400, 800, 1500];
  for (const delay of delays) {
    await audience.goto(`${BASE}/present?s=faq-intro`);
    await audience.waitForSelector("#stage", { timeout: TIMEOUT });
    await audience.waitForTimeout(delay);
    await audience.keyboard.press("ArrowRight");
    if ((await reaches(audience, (s) => s.slideId === "faq-before")) < 0) warmLost++;
  }
  check(`${delays.length} presses on an intro while its frame warms, none lost`, warmLost === 0, `${warmLost} lost`);
}

// --------------------------------------------------------------- the key contract

async function walkKeys({ context, audience, speaker }: Windows) {
  /** Next during playback finishes the step, so a move waits for its step before the next press. */
  const press = async (key: string, want: (s: PresenterState) => boolean, label: string, step?: number) => {
    const seen = (await messages(audience)).length;
    await audience.keyboard.press(key);
    const ok = (await reaches(audience, want, 3000)) >= 0;
    check(`key ${label}`, ok, ok ? "" : JSON.stringify(await stateOf(audience)));
    if (step !== undefined) await settled(audience, step, seen, 5000);
    await audience.waitForTimeout(350);
  };
  await claim(audience, "faq-after", 2);
  const on = (step: number) => (s: PresenterState) => s.slideId === "faq-after" && s.stepIndex === step;
  await press("ArrowRight", on(3), "ArrowRight", 3);
  await press("PageDown", on(4), "PageDown", 4);
  await press("Space", on(5), "Space", 5);
  await press("ArrowLeft", on(4), "ArrowLeft", 4);
  await press("PageUp", on(3), "PageUp", 3);
  await press("Backspace", on(2), "Backspace", 2);
  await press("Shift+ArrowRight", (s) => s.slideId === "count-words" && s.stepIndex === 0, "Shift+ArrowRight", 0);
  await press("Shift+ArrowLeft", on(0), "Shift+ArrowLeft", 0);
  await press("End", (s) => s.slideId === "closing", "End");
  await press("Home", (s) => s.slideId === "title", "Home");

  await claim(audience, "faq-after", 1);
  await press("b", (s) => s.blank, "b");
  await press(".", (s) => !s.blank, ".");
  await press("h", (s) => s.handsOn, "h");
  await press("h", (s) => !s.handsOn, "h again");
  const reset = (await stateOf(audience))?.resetSeq ?? 0;
  await press("r", (s) => (s.resetSeq ?? 0) > reset, "r");
  await press("t", (s) => s.startedAt !== null, "t");
  await press("t", (s) => s.pausedAt !== null, "t again");

  await audience.keyboard.press("d");
  check("key d shows the rehearsal overlay", await audience.locator(".stage__rehearsal").waitFor({ timeout: 2000 }).then(() => true, () => false));
  await audience.keyboard.press("d");

  const popup = context.waitForEvent("page", { timeout: 5000 }).catch(() => null);
  await audience.keyboard.press("o");
  const framePage = await popup;
  await framePage?.waitForLoadState().catch(() => {});
  check("key o opens the frame alone", Boolean(framePage?.url().includes("/demos/faq/after")), framePage?.url() ?? "no page");
  await framePage?.close();
  await audience.bringToFront();

  const opened = context.waitForEvent("page", { timeout: 5000 }).catch(() => null);
  await audience.keyboard.press("s");
  const other = await opened;
  check("key s opens the speaker window", Boolean(other));
  await other?.close();
  await audience.bringToFront();

  await claim(audience, "count-words", 0);
  await press("l", (s) => s.live, "l");
  await press("l", (s) => !s.live, "l again");

  await speaker.bringToFront();
  await speaker.locator("#speaker-title").click();
  await speaker.keyboard.press("g");
  check("key g opens the go-to dialog in the speaker window", await speaker.locator("dialog[open]").waitFor({ timeout: 2000 }).then(() => true, () => false));
  await speaker.keyboard.press("Escape");
  check("Escape closes it", await speaker.locator("dialog[open]").waitFor({ state: "detached", timeout: 2000 }).then(() => true, () => false));
  await speaker.waitForTimeout(200);
  await speaker.keyboard.press("?");
  check("key ? opens the keyboard help", await speaker.locator("dialog.keyboard-help[open]").waitFor({ timeout: 2000 }).then(() => true, () => false));
  await speaker.keyboard.press("Escape");
  const nextButton = speaker.locator(".speaker__controls button", { hasText: /^Next$/ });
  await speaker.waitForTimeout(300);
  const start = (await stateOf(speaker))!.stepIndex;
  await nextButton.focus();
  await speaker.keyboard.press("Space");
  check("Space on a focused control presses it once", (await reaches(speaker, (s) => s.stepIndex === start + 1, 2000)) >= 0);
  await speaker.waitForTimeout(500);
  check("and moves nothing else", (await stateOf(speaker))?.stepIndex === start + 1);
  await audience.bringToFront();

  const reader = await context.newPage();
  await reader.goto(`${BASE}/s/faq-before`);
  await reader.waitForSelector('.page-frame__iframe[data-visible="true"]', { timeout: TIMEOUT });
  await reader.waitForTimeout(800);
  await reader.keyboard.press("ArrowRight");
  check("reader: ArrowRight moves a step", await reader.waitForURL(/step=1/, { timeout: 5000 }).then(() => true, () => false));
  await reader.keyboard.press("b");
  await reader.waitForTimeout(200);
  check("reader: presenter keys are off", (await reader.locator('.stage[data-blank="true"]').count()) === 0);
  await reader.close();
  await audience.bringToFront();
}

// --------------------------------------------------------------- a cleared store

async function walkClearedStore({ audience, speaker }: Windows) {
  await claim(audience, "faq-after", 2);
  await speaker.waitForURL(/s=faq-after/, { timeout: 5000 }).catch(() => null);
  await speaker.locator('[aria-label="Larger notes text"]').click();
  const notesKey = STATE_KEY.replace(":state", ":notes-size");
  const notes = await speaker.evaluate((k) => localStorage.getItem(k), notesKey);
  const frame = await shownFrame(audience);
  const before = await stateOf(audience);
  await frame?.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await audience.waitForTimeout(300);
  const after = await stateOf(audience);
  // On one origin the clear reaches this store and it is written back at once; on two it never does.
  check("a frame's localStorage.clear() leaves the store with the place in it", after?.slideId === before?.slideId && after?.stepIndex === before?.stepIndex, JSON.stringify(after));
  check("notes size survives it", (await speaker.evaluate((k) => localStorage.getItem(k), notesKey)) === notes);
  const seen = (await messages(audience)).length;
  await audience.keyboard.press("ArrowRight");
  check("the next press goes on from the same place", (await reaches(audience, (s) => s.slideId === "faq-after" && s.stepIndex === 3, 3000)) >= 0);
  await settled(audience, 3, seen);
  await audience.waitForTimeout(400);
  await frame?.evaluate(() => localStorage.clear()).catch(() => {});
  await audience.waitForTimeout(300);
  await audience.reload();
  await settled(audience, 3, 0);
  await audience.waitForTimeout(500);
  check("a reload after a clear resumes the place", (await reaches(audience, (s) => s.slideId === "faq-after" && s.stepIndex === 3, 3000)) >= 0, JSON.stringify(await stateOf(audience)));
}

// --------------------------------------------------------------- Back in a multi-page demo

async function walkHistory({ context, audience }: Windows) {
  // Row 8. A replay opens page two with one navigation, so Back has a real entry to return to.
  await claim(audience, "history", 3);
  const seen = (await messages(audience)).length;
  await audience.keyboard.press("ArrowRight");
  const back = await settled(audience, 4, seen);
  check("Back in a multi-page demo, after a replay", Boolean(back) && (back?.asserts ?? []).every((a) => a.pass), JSON.stringify(back?.asserts ?? "no step-done"));
  const seenTwo = (await messages(audience)).length;
  await audience.keyboard.press("ArrowRight");
  const forward = await settled(audience, 5, seenTwo);
  check("Forward again", Boolean(forward) && (forward?.asserts ?? []).every((a) => a.pass), JSON.stringify(forward?.asserts ?? "no step-done"));

  // A real press on a link, in hands-on mode, with the frame's no-referrer policy in force.
  const reader = await context.newPage();
  await reader.goto(`${BASE}/s/history`);
  const iframe = reader.locator('.page-frame__iframe[data-visible="true"]');
  await iframe.waitFor({ timeout: TIMEOUT });
  await reader.waitForTimeout(800);
  await reader.locator("#stage").focus();
  await reader.keyboard.press("h");
  await reader.waitForTimeout(800);
  const frame = await shownFrame(reader);
  await frame?.locator("#to-two").click();
  await frame?.waitForURL(/two\.html/, { timeout: 5000 }).catch(() => null);
  const shown = await shownFrame(reader);
  await shown?.waitForSelector("#go", { timeout: 5000 }).catch(() => null);
  const depth = await shown?.evaluate(() => ({ name: window.name, referrer: document.referrer, url: location.pathname }));
  check("a link pressed by hand counts as the frame's own entry", depth?.name === '{"index":1,"max":1}', JSON.stringify(depth));
  check("frames send no referrer", depth?.referrer === "", depth?.referrer);
  await reader.close();
  await audience.bringToFront();
}

// --------------------------------------------------------------- banner and builds

async function walkWindows(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/speaker?s=faq-before`);
  const banner = page.locator(".address-banner a");
  const href = await banner.getAttribute("href", { timeout: 5000 }).catch(() => null);
  check("a presenter on 127.0.0.1 gets a banner with the localhost URL", href === `${BASE}/speaker?s=faq-before`, String(href));
  await page.goto(`${BASE}/speaker?s=faq-before`);
  await page.waitForSelector(".notes__step");
  check("a presenter on localhost gets none", (await page.locator(".address-banner").count()) === 0);

  // A window on another build, as a second tab on a redeployed origin would be.
  const other = await context.newPage();
  await other.goto(`${BASE}/s/title`);
  await other.evaluate((key) => {
    const channel = new BroadcastChannel(key);
    channel.postMessage({ build: "other-build" });
    window.setInterval(() => channel.postMessage({ build: "other-build" }), 1000);
  }, STATE_KEY.replace(":state", ":builds"));
  const pill = page.locator('.notes__play[data-status="offline"]');
  await pill.waitFor({ timeout: 9000 }).catch(() => null);
  const title = (await pill.getAttribute("title").catch(() => null)) ?? "";
  check('two windows on different builds: "No audience", with both build IDs in its tooltip', (await pill.textContent().catch(() => "")) === "No audience" && title.includes(`hosting-${MODE}`) && title.includes("other-build"), title);
  await context.close();
}

// --------------------------------------------------------------- what a request can see

async function checkResponses() {
  const frame = await fetch(`http://${MODE === "local" || MODE === "two-hosts" ? `127.0.0.1:${PORT}` : `localhost:${PORT}`}/demos/faq/before/index.html`);
  const csp = frame.headers.get("content-security-policy") ?? "";
  check("a frame document sends no-referrer", frame.headers.get("referrer-policy") === "no-referrer", String(frame.headers.get("referrer-policy")));
  check("a frame document sends X-Robots-Tag", frame.headers.get("x-robots-tag") === "noindex, nofollow");
  const ancestors = MODE === "one-host" || MODE === "deployed" ? "frame-ancestors 'self'" : `frame-ancestors ${BASE}`;
  check("its CSP names the right ancestor", csp.includes(ancestors), ancestors);
  const address = await fetch(`${BASE}/history-data`);
  check("a declared address sends no-referrer and X-Robots-Tag", address.headers.get("referrer-policy") === "no-referrer" && address.headers.get("x-robots-tag") === "noindex, nofollow");
  const reader = await fetch(`${BASE}/s/title`);
  check("a reader page keeps its referrer policy", reader.headers.get("referrer-policy") === "strict-origin-when-cross-origin");
  check("and no X-Robots-Tag", reader.headers.get("x-robots-tag") === null, String(reader.headers.get("x-robots-tag")));
  check("no provider header without a provider", (await fetch(`${BASE}/demos/faq/before/faq.css`)).headers.get("vercel-cdn-cache-control") === null);
  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  check("robots.txt allows /s/ and disallows /demos/", robots.includes("Allow: /s/") && robots.includes("Disallow: /demos/") && robots.includes("Disallow: /history-data"), robots);
  if (MODE !== "deployed") check("robots.txt has the link-preview group", robots.includes("User-agent: LinkedInBot"));
}

async function checkFrameAddress({ audience }: Windows) {
  await claim(audience, "faq-before");
  const src = await audience.locator('.page-frame__iframe[data-visible="true"]').getAttribute("src");
  const expected = MODE === "one-host" ? "/demos/faq/before/index.html" : `http://127.0.0.1:${PORT}/demos/faq/before/index.html`;
  check("the frame's address fits the mode", src?.split("?")[0] === expected, String(src));
}

/** The same build on another port. Two hosts name theirs at build, so they are left out. */
async function checkMovedPort(browser: Browser) {
  const port = PORT + 1;
  const second = serve(port);
  try {
    await waitForServer(`http://localhost:${port}`);
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await context.addInitScript(listen);
    const page = await context.newPage();
    await page.goto(`http://localhost:${port}${MODE === "deployed" ? "/s" : "/present?s="}${MODE === "deployed" ? "/" : ""}faq-before`);
    check("the same build serves a live frame on another port", Boolean(await settled(page, 0, 0)), `port ${port}`);
    await context.close();
  } finally {
    second.kill();
  }
}

function grepBuild(pattern: string, folder: string): string {
  return spawnSync("grep", ["-rl", "--exclude-dir=cache", pattern, folder], { cwd: DECK, encoding: "utf8" }).stdout.trim();
}

function checkBuildOutput() {
  check("no port in the client chunks", MODE === "two-hosts" || grepBuild(`localhost:${PORT}`, ".next/static") === "", grepBuild(`localhost:${PORT}`, ".next/static"));
  check("no _vercel in the client chunks", grepBuild("_vercel", ".next/static") === "", grepBuild("_vercel", ".next/static"));
}

// --------------------------------------------------------------- a deployed build

async function walkDeployed(browser: Browser) {
  for (const route of ["/speaker", "/present", "/speaker?s=title", "/present/title", "/speaker/title"]) check(`${route} answers 404`, (await fetch(`${BASE}${route}`)).status === 404);
  const log = readFileSync(path.join(DECK, "build.log"), "utf8");
  check("the pages are left out of the build", !/\/(present|speaker)\b/.test(log), log.match(/.*\/(present|speaker).*/)?.[0]);
  for (const sentence of NOTE_SENTENCES) {
    const found = grepBuild(sentence, ".next");
    check(`no note in the build: "${sentence}"`, found === "", found);
  }
  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  check("robots.txt has no link-preview group", !robots.includes("LinkedInBot") && !robots.includes("/speaker"), robots);
  const html = await (await fetch(`${BASE}/s/faq-before`)).text();
  check("reader pages describe the demo with no notes", html.includes("The details element gives you an accordion."));

  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addInitScript(listen);
  const page = await context.newPage();
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto(`${BASE}/s/faq-before`);
  const done = await settled(page, 0, 0);
  check("a reader page runs a live frame", Boolean(done));
  await page.waitForTimeout(800);
  const seen = (await messages(page)).length;
  await page.keyboard.press("ArrowRight");
  check("and takes a step", Boolean(await settled(page, 1, seen)));
  const src = await page.locator('.page-frame__iframe[data-visible="true"]').getAttribute("src");
  check("with a relative frame address", Boolean(src?.startsWith("/demos/")), String(src));
  check("no request leaves the host", requests.every((u) => u.startsWith(BASE)), requests.filter((u) => !u.startsWith(BASE)).join(", "));
  await context.close();
}

// --------------------------------------------------------------- the variants

/** A browser that says it is not automated, as a reader's does. */
async function readerWindow(browser: Browser, seen: string[]): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addInitScript('Object.defineProperty(navigator, "webdriver", { get() { return false; } })');
  const page = await context.newPage();
  page.on("request", (r) => seen.push(new URL(r.url()).pathname));
  return { page, close: () => context.close() };
}

async function walkVercel(browser: Browser) {
  const file = await fetch(`${BASE}/demos/faq/before/faq.css`);
  check("the preset adds Vercel-CDN-Cache-Control to build files", file.headers.get("vercel-cdn-cache-control") === "public, max-age=31536000", String(file.headers.get("vercel-cdn-cache-control")));
  check("beside the plain Cache-Control", file.headers.get("cache-control") === "public, max-age=300, stale-while-revalidate=86400", String(file.headers.get("cache-control")));
  const health = (await (await fetch(`${BASE}/_health`)).json()) as { build: string };
  check("the build ID is the commit SHA", health.build === "abcdef0", health.build);
  check("the site comes from the provider", (await (await fetch(`${BASE}/robots.txt`)).text()).includes("Sitemap: https://deck.example.com/sitemap.xml"));
  check("a provider's variable alone makes a deployed build", (await fetch(`${BASE}/speaker`)).status === 404);

  const seen: string[] = [];
  const reader = await readerWindow(browser, seen);
  await reader.page.goto(`${BASE}/s/title`);
  await reader.page.waitForTimeout(800);
  check("a reader page loads both Vercel scripts", seen.includes("/_vercel/insights/script.js") && seen.includes("/_vercel/speed-insights/script.js"), seen.filter((p) => p.includes("vercel")).join(" "));
  const captured: string[] = [];
  const capture = await readerWindow(browser, captured);
  await capture.page.goto(`${BASE}/s/title?capture=1`);
  await capture.page.waitForTimeout(600);
  check("?capture=1 loads neither", !captured.some((p) => p.startsWith("/_vercel")));
  await capture.close();
  await reader.close();
  const automated = await browser.newContext();
  const page = await automated.newPage();
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto(`${BASE}/s/title`);
  await page.waitForTimeout(600);
  check("an automated window loads neither", !requests.some((u) => u.includes("/_vercel/")));
  await automated.close();
}

async function walkOnHost(browser: Browser) {
  check("/speaker answers on a host that asked for it", (await fetch(`${BASE}/speaker`)).status === 200);
  check("so do its notes", (await (await fetch(`${BASE}/speaker?s=faq-before`)).text()).includes("Here is the list, built with buttons and panels."));
  check("robots.txt has the link-preview group", (await (await fetch(`${BASE}/robots.txt`)).text()).includes("LinkedInBot"));

  const seen: string[] = [];
  const reader = await readerWindow(browser, seen);
  await reader.page.goto(`${BASE}/s/title`);
  await reader.page.waitForFunction(() => (window as unknown as { __analytics?: number }).__analytics === 1, undefined, { timeout: 5000 }).then(() => check("custom analytics runs on a reader page", true), () => check("custom analytics runs on a reader page", false));
  await reader.page.goto(`${BASE}/present?s=title`);
  await reader.page.waitForTimeout(800);
  check("and not in the audience window", (await reader.page.evaluate(() => (window as unknown as { __analytics?: number }).__analytics)) === undefined);
  await reader.close();
  const automated = await browser.newContext();
  const page = await automated.newPage();
  await page.goto(`${BASE}/s/title`);
  await page.waitForTimeout(800);
  check("and not under automation", (await page.evaluate(() => (window as unknown as { __analytics?: number }).__analytics)) === undefined);
  await automated.close();
}

async function walkClosed() {
  for (const route of ["/", "/s/title", "/s/1"]) check(`${route} answers 404 with the reader off`, (await fetch(`${BASE}${route}`)).status === 404);
  check("/speaker still answers", (await fetch(`${BASE}/speaker`)).status === 200);
  check("robots.txt closes the host", (await (await fetch(`${BASE}/robots.txt`)).text()) === "User-agent: *\nDisallow: /\n");
  check("the sitemap is empty", !(await (await fetch(`${BASE}/sitemap.xml`)).text()).includes("<loc>"));
}

async function walkNoindex() {
  const html = await (await fetch(`${BASE}/s/title`)).text();
  check("reader pages still answer, marked noindex", /<meta name="robots" content="noindex, nofollow"/.test(html));
  check("robots.txt closes the host", (await (await fetch(`${BASE}/robots.txt`)).text()) === "User-agent: *\nDisallow: /\n");
  check("the sitemap is empty", !(await (await fetch(`${BASE}/sitemap.xml`)).text()).includes("<loc>"));
}

// --------------------------------------------------------------- compare

function compare(): number {
  const read = (name: string) => (existsSync(path.join(RESULTS, `${name}.json`)) ? (JSON.parse(readFileSync(path.join(RESULTS, `${name}.json`), "utf8")) as { checks: Record<string, string>; digests: Record<string, string> }) : null);
  let failures = 0;
  for (const browser of ["chromium", "webkit"]) {
    const two = read(`local-${browser}`);
    const one = read(`one-host-${browser}`);
    if (!two || !one) {
      console.log(`${browser}: missing a run`);
      failures++;
      continue;
    }
    const names = [...new Set([...Object.keys(two.checks), ...Object.keys(one.checks)])];
    const rows = names.filter((n) => (two.checks[n] ?? "absent").split(":")[0] !== (one.checks[n] ?? "absent").split(":")[0]);
    const steps = [...new Set([...Object.keys(two.digests), ...Object.keys(one.digests)])].filter((k) => two.digests[k] !== one.digests[k]);
    const failed = names.filter((n) => (one.checks[n] ?? "pass") !== "pass" || (two.checks[n] ?? "pass") !== "pass");
    console.log(`${browser}: ${names.length} checks, ${Object.keys(one.digests).length} step digests. ${rows.length} checks differ, ${steps.length} digests differ, ${failed.length} failed in a run.`);
    for (const r of rows) console.log(`  differs: ${r}\n    two origins: ${two.checks[r]}\n    one host:    ${one.checks[r]}`);
    for (const s of steps) console.log(`  digest differs: ${s} ${two.digests[s]} ${one.digests[s]}`);
    for (const f of failed) console.log(`  failed: ${f}\n    two origins: ${two.checks[f]}\n    one host:    ${one.checks[f]}`);
    failures += rows.length + steps.length + failed.length;
  }
  return failures ? 1 : 0;
}

// --------------------------------------------------------------- main

async function main(): Promise<number> {
  if (process.argv.includes("--compare")) return compare();
  if (!process.argv.includes("--no-build") || !existsSync(path.join(DECK, ".next"))) build();
  const launcher = { chromium, webkit }[BROWSER];
  const args = BROWSER === "chromium" ? ["--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] : [];
  const browser = await launcher.launch({ args });
  const server = serve(PORT);
  console.log(`hosting: ${MODE} in ${BROWSER} on ${BASE}`);
  try {
    await waitForServer(BASE);
    if (MODE === "closed") await walkClosed();
    else if (MODE === "noindex") await walkNoindex();
    else if (MODE === "on-host") await walkOnHost(browser);
    else if (MODE === "vercel") await walkVercel(browser);
    else if (MODE === "deployed") {
      await checkResponses();
      checkBuildOutput();
      await walkDeployed(browser);
    } else {
      await checkResponses();
      checkBuildOutput();
      const windows = await openWindows(browser);
      await walkStops(windows, SLIDES, true);
      await walkStops(windows, [HISTORY], false);
      await checkFrameAddress(windows);
      await walkAdvance(windows);
      await walkFocus(windows);
      await walkKeys(windows);
      await walkClearedStore(windows);
      await walkHistory(windows);
      // WebKit logs this line when a `goto` cancels a slide's prefetch, in both origins' runs alike.
      // The walks above have no `goto` in them, and they allow no such line.
      const ignored = (s: string) => s.includes("/favicon") || (s.includes("_rsc=") && s.includes("access control checks"));
      check("no console errors", windows.errors.filter((e) => !ignored(e)).length === 0, windows.errors.filter((e) => !ignored(e)).slice(0, 8).join(" | "));
      check("no failed responses", windows.bad.filter((e) => !ignored(e)).length === 0, windows.bad.filter((e) => !ignored(e)).slice(0, 8).join(" | "));
      await windows.context.close();
      await walkWindows(browser);
    }
    if (MODE === "local" || MODE === "one-host" || MODE === "deployed") await checkMovedPort(browser);
  } finally {
    await browser.close();
    server.kill();
  }
  mkdirSync(RESULTS, { recursive: true });
  writeFileSync(path.join(RESULTS, `${MODE}-${BROWSER}.json`), JSON.stringify({ mode: MODE, browser: BROWSER, checks, digests }, null, 2) + "\n");
  const failed = Object.entries(checks).filter(([, v]) => v !== "pass");
  console.log(failed.length ? `\nhosting: ${failed.length} failure(s) of ${Object.keys(checks).length}` : `\nhosting: all ${Object.keys(checks).length} checks passed`);
  return failed.length ? 1 : 0;
}

process.exit(await main());
