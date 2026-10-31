/**
 * Headless end-to-end smoke of the starter deck. Starts its own server, opens the audience and
 * speaker windows, presses Right through every step to `closing`, then Left back to `faq-before`.
 *
 *   node --import tsx scripts/smoke.mts          against `next start` (run the build first)
 *   node --import tsx scripts/smoke.mts --dev    against `next dev`
 *
 * It reads the runtime's own messages, so an assert that fails in the frame fails here. It stops
 * only the server it started.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Frame, type Page } from "@playwright/test";

const DEV = process.argv.includes("--dev");
const PORT = Number(process.env.SMOKE_PORT ?? 3217);
const BASE = `http://localhost:${PORT}`;
const STARTER = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "examples", "starter");
/** A first request in development compiles the route. */
const TIMEOUT = DEV ? 60_000 : 15_000;

/** Every stop, in order: slide id and step count. A slide with no frame counts as one stop. */
const SLIDES: { id: string; steps: number }[] = [
  { id: "faq-before", steps: 4 },
  { id: "faq-after", steps: 6 },
  { id: "count-words", steps: 4 },
  { id: "closing", steps: 0 },
];
/** Lines revealed once each `count-words` step has played. */
const TERMINAL_LINES = [3, 5, 7, 10];

type Stop = { id: string; step: number };
const stops: Stop[] = SLIDES.flatMap((s) => (s.steps ? Array.from({ length: s.steps }, (_, step) => ({ id: s.id, step })) : [{ id: s.id, step: 0 }]));

const failures: string[] = [];
const fail = (message: string) => {
  failures.push(message);
  console.log(`  FAIL ${message}`);
};
const pass = (message: string) => console.log(`  ok   ${message}`);

type RuntimeMessage = { type: string; stepId?: string; digest?: string; code?: string; message?: string; asserts?: { pass: boolean; target: string; expect: string; actual: string }[] };

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

async function waitForServer(): Promise<void> {
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    try {
      if ((await fetch(`${BASE}/_health`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No answer from ${BASE}/_health`);
}

/** Resolves once the frame has reported `stop`'s step, counting only reports after `seen`. */
async function settled(page: Page, stop: Stop, seen: number): Promise<RuntimeMessage | null> {
  const until = Date.now() + TIMEOUT;
  while (Date.now() < until) {
    const fresh = (await messages(page)).slice(seen);
    const done = fresh.find((m) => m.type === "step-done" && m.stepId === `s${stop.step}`);
    if (done) return done;
    await page.waitForTimeout(25);
  }
  return null;
}

const highlighted = (page: Page) => page.locator('.code__line[data-highlighted="true"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.line).join(","));

/** The document on show: a replayed step swaps frames, so it is found again each time. */
async function shownFrame(page: Page): Promise<Frame | null> {
  const handle = await page.locator('iframe.page-frame__iframe[data-visible="true"]').last().elementHandle();
  return handle ? handle.contentFrame() : null;
}

async function main() {
  const next = path.join(STARTER, "node_modules", ".bin", "next");
  const server = spawn(next, [DEV ? "dev" : "start", "-p", String(PORT)], { cwd: STARTER, stdio: "ignore" });
  const browser = await chromium.launch();
  try {
    await waitForServer();
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await context.addInitScript(listen);
    const audience = await context.newPage();
    const speaker = await context.newPage();

    const consoleErrors: string[] = [];
    const badResponses: string[] = [];
    for (const [name, page] of [["audience", audience], ["speaker", speaker]] as const) {
      page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(`${name}: ${m.text()}`);
      });
      page.on("pageerror", (e) => consoleErrors.push(`${name}: ${e.message}`));
      page.on("response", (r) => {
        if (r.status() >= 400) badResponses.push(`${name}: ${r.status()} ${r.url()}`);
      });
    }

    console.log(`Smoke against ${DEV ? "next dev" : "next start"} at ${BASE}`);
    await speaker.goto(`${BASE}/speaker?s=faq-before`);
    await audience.goto(`${BASE}/present?s=faq-before`);
    await audience.bringToFront();

    if (!(await settled(audience, stops[0], 0))) throw new Error("The first frame never reported s0.");
    pass("frame loaded and reported s0 at /present?s=faq-before");
    const forward = new Map<string, string>();
    const lines = new Map<string, string>();
    let spotlights = 0;

    /** Checks the window after arriving at `stop`. */
    const verify = async (stop: Stop, direction: string, done: RuntimeMessage | null) => {
      const key = `${stop.id}:s${stop.step}`;
      const slide = SLIDES.find((s) => s.id === stop.id)!;
      if (slide.steps) {
        if (!done) return fail(`${direction} ${key}: no step-done`);
        for (const a of done.asserts ?? []) if (!a.pass) fail(`${direction} ${key}: assert ${a.target} ${a.expect}, found ${a.actual}`);
        if (direction === "forward") forward.set(key, done.digest ?? "");
        else if (forward.get(key) !== done.digest) fail(`${key}: digest ${forward.get(key)} forward, ${done.digest} back`);
        const hi = await highlighted(audience);
        if (direction === "forward") lines.set(key, hi);
        else if (lines.get(key) !== hi) fail(`${key}: highlight ${lines.get(key)} forward, ${hi} back`);
        if (stop.id === "count-words") {
          const frame = await shownFrame(audience);
          const revealed = frame ? await frame.locator("li[data-line]:not([hidden])").count() : -1;
          if (revealed !== TERMINAL_LINES[stop.step]) fail(`${direction} ${key}: ${revealed} terminal lines shown, wanted ${TERMINAL_LINES[stop.step]}`);
        }
        const spot = await audience.locator(".overlay__spotlight").count();
        if (stop.step > 0 && spot === 0 && direction === "forward") {
          await audience.waitForSelector(".overlay__spotlight", { timeout: 3000 }).then(
            () => spotlights++,
            () => fail(`${key}: no spotlight rendered`),
          );
        } else if (spot > 0) spotlights++;
      } else {
        await audience.waitForFunction((id) => new URLSearchParams(location.search).get("s") === id, stop.id, { timeout: TIMEOUT }).catch(() => fail(`${direction}: never reached ${stop.id}`));
      }
      // The speaker window follows the audience window, on the shared channel.
      const want = slide.steps ? `Step ${stop.step + 1} of ${slide.steps}` : "Thank you";
      const target = slide.steps ? speaker.locator(".notes__step") : speaker.locator("#speaker-title");
      await target.filter({ hasText: want }).first().waitFor({ timeout: TIMEOUT }).catch(() => fail(`${direction} ${key}: speaker did not show "${want}"`));
    };

    await verify(stops[0], "forward", (await messages(audience)).findLast((m) => m.type === "step-done") ?? null);
    for (let i = 1; i < stops.length; i++) {
      const seen = (await messages(audience)).length;
      await audience.keyboard.press("ArrowRight");
      await verify(stops[i], "forward", stops[i].id === "closing" ? null : await settled(audience, stops[i], seen));
    }
    pass(`forward through ${stops.length} stops to closing`);
    for (let i = stops.length - 2; i >= 0; i--) {
      const seen = (await messages(audience)).length;
      await audience.keyboard.press("ArrowLeft");
      await verify(stops[i], "back", await settled(audience, stops[i], seen));
    }
    const back = await audience.evaluate(() => location.search);
    if (back.includes("s=faq-before")) pass(`back to faq-before (${back})`);
    else fail(`ended at ${back}, not faq-before`);

    const all = await messages(audience);
    const errors = all.filter((m) => m.type === "error");
    const asserts = all.flatMap((m) => m.asserts ?? []);
    const failed = asserts.filter((a) => !a.pass);
    if (errors.length) fail(`runtime errors: ${errors.map((e) => `${e.code}: ${e.message}`).join("; ")}`);
    else pass("no runtime errors (assert-failed, selector-not-found, hook-missing)");
    if (failed.length || asserts.length === 0) fail(`${failed.length} of ${asserts.length} asserts failed`);
    else pass(`${asserts.length} asserts passed through the runtime`);
    const moved = [lines.get("faq-before:s1"), lines.get("faq-before:s2"), lines.get("faq-after:s2"), lines.get("count-words:s3")];
    if (new Set(moved).size === moved.length && moved.every(Boolean)) pass(`highlight moved: ${moved.join(" | ")}`);
    else fail(`highlight did not move: ${moved.join(" | ")}`);
    if (lines.get("faq-after:s2") === "4,8") pass("after s2 highlights lines 4 and 8 at once");
    else fail(`after s2 highlight is ${lines.get("faq-after:s2")}`);
    if (spotlights > 0) pass(`spotlight rendered on ${spotlights} stops`);
    else fail("no spotlight rendered");
    const checked = (word: string, message: string) => (failures.some((f) => f.includes(word)) ? fail(`not proven: ${message}`) : pass(message));
    checked("digest", `digests match forward and back on ${forward.size} steps`);
    checked("highlight ", "highlights match forward and back");
    checked("terminal lines", `terminal lines revealed ${TERMINAL_LINES.join(", ")} both ways`);
    checked("speaker did not", "speaker window stayed in sync on every stop");
    if (consoleErrors.length) fail(`console errors:\n    ${consoleErrors.join("\n    ")}`);
    else pass("no console errors");
    if (badResponses.length) fail(`failed responses:\n    ${badResponses.join("\n    ")}`);
    else pass("no failed responses");
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(failures.length ? `\nsmoke: ${failures.length} failure(s)` : "\nsmoke: passed");
  process.exit(failures.length ? 1 : 0);
}

await main();
