/**
 * Walks `examples/server` in Chromium: the whole deck with its app running, then with the app
 * stopped, then with it back. It reads the runtime's own messages, so an assert that fails in the
 * frame fails here. `live-ish walk` covers more once it can reach this deck. This proves the three
 * things only a server frame has.
 *
 *   node --import tsx scripts/server.mts
 *
 * It starts the app itself, before `live-ish present`, which leaves a taken port alone. That is
 * what lets it stop the app and leave the deck running. It stops only what it started.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";

const DECK = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "examples", "server");
const PORT = Number(process.env.SERVER_DECK_PORT ?? 3410);
const APP_PORT = 4100;
const BASE = `http://localhost:${PORT}`;
const APP = `http://localhost:${APP_PORT}`;
const POSTERS = path.join(DECK, "public", "posters");

const STOPS = [
  { page: "request-log-before", steps: ["s0", "s1", "s2"] },
  { page: "request-log-after", steps: ["s0", "s1", "s2"] },
];

const failures: string[] = [];
const check = (ok: boolean, message: string) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${message}`);
  if (!ok) failures.push(message);
};

type Done = { type: string; stepId?: string; digest?: string; code?: string; message?: string; asserts?: { pass: boolean; target: string; expect: string; actual: string }[] };

function listen() {
  if (window !== window.top) return;
  const w = window as unknown as { __runtime: unknown[] };
  w.__runtime = [];
  window.addEventListener("message", (e) => {
    const d = e.data as { type?: string };
    if (d && (d.type === "step-done" || d.type === "error")) w.__runtime.push(d);
  });
}

const messages = (page: Page) => page.evaluate(() => (window as unknown as { __runtime: Done[] }).__runtime);

async function stepDone(page: Page, stepId: string, seen: number): Promise<Done> {
  const until = Date.now() + 15_000;
  while (Date.now() < until) {
    const all = await messages(page);
    const failed = all.slice(seen).find((m) => m.type === "error");
    if (failed) throw new Error(`runtime error on ${stepId}: ${failed.code} ${failed.message}`);
    const done = all.slice(seen).find((m) => m.type === "step-done" && m.stepId === stepId);
    if (done) return done;
    await page.waitForTimeout(50);
  }
  throw new Error(`no step-done for ${stepId}`);
}

/** Every console error, failed request and request to the app, from this point on. */
function watch(page: Page) {
  const out = { errors: [] as string[], cancelled: [] as string[], toApp: [] as string[] };
  page.on("console", (m) => {
    if (m.type() === "error") out.errors.push(m.text());
  });
  page.on("pageerror", (e) => out.errors.push(String(e)));
  // A load cancels what its document had open, which no console reports. Anything else counts.
  page.on("requestfailed", (r) => {
    const reason = r.failure()?.errorText ?? "";
    (reason === "net::ERR_ABORTED" ? out.cancelled : out.errors).push(`${reason}: ${r.url()}`);
  });
  page.on("request", (r) => {
    if (r.url().startsWith(APP)) out.toApp.push(r.url());
  });
  return out;
}

const asserted = (done: Done) => (done.asserts ?? []).every((a) => a.pass);
const failedAsserts = (done: Done) => (done.asserts ?? []).filter((a) => !a.pass).map((a) => `${a.target} ${a.expect}: ${a.actual}`).join("; ");

async function walkUp(browser: Browser) {
  console.log("\nWith the app running");
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addInitScript(listen);
  const page = await context.newPage();
  const seen = watch(page);

  await page.goto(`${BASE}/present?s=request-log-intro`, { waitUntil: "load" });
  await page.waitForTimeout(800);
  check((await page.locator(".frame-warm").count()) === 0, "an intro warms no server frame");
  check(seen.toApp.length === 0, "an intro asks the app for nothing");

  const forward: Record<string, string> = {};
  for (const { page: id, steps } of STOPS) {
    for (const step of steps) {
      // The first press of a page enters it, and entering replays s0. Each later press plays a step.
      const count = (await messages(page)).length;
      await page.keyboard.press("ArrowRight");
      const done = await stepDone(page, step, count);
      check(asserted(done), `${id} ${step}: asserts pass${asserted(done) ? "" : ` (${failedAsserts(done)})`}`);
      forward[`${id}/${step}`] = done.digest ?? "";
    }
    if (id === "request-log-before") {
      const frame = page.frames().find((f) => f.url().startsWith(APP));
      check(Boolean(frame), "the frame is the app's own origin");
      const rows = (await frame?.locator(".log__row").allTextContents()) ?? [];
      check(rows.length === 3 && rows.every((r) => r.includes("render")), `the server's log shows three renders (${rows.length})`);
    }
  }

  // Back mounts a fresh document and replays, in a fresh session, so the digest must not move.
  for (const [id, step] of [["request-log-after", "s1"], ["request-log-after", "s0"]] as const) {
    const count = (await messages(page)).length;
    await page.keyboard.press("ArrowLeft");
    const done = await stepDone(page, step, count);
    check(asserted(done), `back to ${id} ${step}: asserts pass${asserted(done) ? "" : ` (${failedAsserts(done)})`}`);
    check(done.digest === forward[`${id}/${step}`], `back to ${id} ${step}: same digest as forward`);
  }
  check(seen.errors.length === 0, `no console error or failed request${seen.errors.length ? `: ${seen.errors.join(" | ")}` : ""}`);
  console.log(`       ${seen.cancelled.length} requests cancelled by a document load: ${[...new Set(seen.cancelled.map((c) => new URL(c.slice(c.indexOf("http"))).pathname))].join(", ")}`);

  const reader = await context.newPage();
  const readerSeen = watch(reader);
  await reader.goto(`${BASE}/s/request-log-before`, { waitUntil: "load" });
  await reader.waitForSelector(".page-frame__iframe[data-visible='true']", { timeout: 15_000 });
  check(true, "a reader gets the live frame");
  check(readerSeen.errors.length === 0, `reader: no console error${readerSeen.errors.length ? `: ${readerSeen.errors.join(" | ")}` : ""}`);
  await context.close();
}

async function walkDown(browser: Browser) {
  console.log("\nWith the app stopped");
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const audience = await context.newPage();
  const seen = watch(audience);
  await audience.goto(`${BASE}/present?s=request-log-intro`, { waitUntil: "load" });
  await audience.waitForTimeout(600);
  for (const id of ["request-log-before", "request-log-after"]) {
    await audience.keyboard.press("Shift+ArrowRight");
    await audience.waitForSelector(`.page__poster-note`, { timeout: 10_000 });
    check((await audience.locator(".page__poster-note").textContent())?.includes("not running") === true, `${id}: the note shows, in neutral words`);
    check((await audience.locator(".page-frame__iframe").count()) === 0, `${id}: no frame mounts`);
    const image = audience.locator(".page__poster-image");
    check((await image.count()) === 1 && (await image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)), `${id}: the poster shows`);
    await audience.keyboard.press("ArrowRight");
    await audience.waitForTimeout(200);
    check((await audience.locator(".page__poster-note").count()) === 1, `${id}: the steps still move, with the note up`);
  }
  check(seen.toApp.length === 0, `no request went to the dead origin${seen.toApp.length ? `: ${seen.toApp.join(" ")}` : ""}`);
  check(seen.errors.length === 0, `no console error or failed request${seen.errors.length ? `: ${seen.errors.join(" | ")}` : ""}`);

  const speaker = await context.newPage();
  await speaker.goto(`${BASE}/speaker?s=request-log-before`, { waitUntil: "load" });
  await speaker.waitForTimeout(800);
  const reader = await context.newPage();
  const readerSeen = watch(reader);
  await reader.goto(`${BASE}/s/request-log-before`, { waitUntil: "load" });
  await reader.waitForSelector(".page__poster-note", { timeout: 10_000 });
  check(true, "a reader gets the poster and the note");
  check(readerSeen.toApp.length === 0 && readerSeen.errors.length === 0, `reader: no request to the dead origin and no console error${readerSeen.errors.length ? `: ${readerSeen.errors.join(" | ")}` : ""}`);
  await context.close();
}

/** One still per step, standing in for `live-ish capture`, which needs @live-ish/verify. */
async function stills(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 640, height: 628 } });
  const page = await context.newPage();
  for (const [id, url] of [["request-log-before", "/products/1"], ["request-log-after", "/cached/products/1"]]) {
    await page.goto(`${APP}${url}`);
    for (const step of ["s0", "s1", "s2"]) {
      mkdirSync(path.join(POSTERS, id), { recursive: true });
      await page.screenshot({ path: path.join(POSTERS, id, `${step}.jpg`), type: "jpeg", quality: 70 });
    }
  }
  await context.close();
}

async function answers(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}

async function until(test: () => Promise<boolean>, label: string, ms = 180_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await test()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timed out waiting for ${label}`);
}

function startApp(): ChildProcess {
  return spawn(process.execPath, ["demos/request-log/app/server.mjs"], { cwd: DECK, stdio: "ignore", env: { ...process.env, PORT: String(APP_PORT), LIVE_ISH_PRESENTER_ORIGIN: BASE } });
}

function stop(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
  });
}

for (const [label, url] of [["the deck's port", `${BASE}/_health`], ["the app's port", `${APP}/`]] as const) {
  if (await answers(url)) {
    console.error(`Something already answers on ${label}. Stop it first: this script only stops what it starts.`);
    process.exit(3);
  }
}

const browser = await chromium.launch();
let app = startApp();
let deck: ChildProcess | null = null;
let hadPosters = existsSync(POSTERS);
try {
  await until(() => answers(`${APP}/products/1`), "the app");
  if (!hadPosters) await stills(browser);
  deck = spawn("pnpm", ["exec", "live-ish", "present", `--port=${PORT}`, "--no-open"], { cwd: DECK, stdio: "inherit", detached: true });
  await until(() => answers(`${BASE}/_health`), "the deck");

  await walkUp(browser);
  await stop(app);
  await until(async () => !(await answers(`${APP}/`)), "the app to stop", 5000);
  await walkDown(browser);

  console.log("\nWith the app back");
  app = startApp();
  await until(() => answers(`${APP}/products/1`), "the app");
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addInitScript(listen);
  const page = await context.newPage();
  await page.goto(`${BASE}/present?s=request-log-before`, { waitUntil: "load" });
  const done = await stepDone(page, "s0", 0);
  check(asserted(done), "the frame comes back on the next load, with no rebuild");
  await context.close();
} finally {
  await browser.close();
  if (deck?.pid) {
    try {
      process.kill(-deck.pid, "SIGTERM");
    } catch {
      /* gone */
    }
  }
  await stop(app);
  if (!hadPosters) rmSync(POSTERS, { recursive: true, force: true });
  hadPosters = true;
}

console.log(failures.length ? `\n${failures.length} failed` : "\nAll passed");
process.exit(failures.length ? 1 : 0);
