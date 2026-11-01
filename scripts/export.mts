/**
 * Proves a `live-ish export` on a host with no server at all: Python's static file server, which
 * ignores a query and sends no CSP. It opens a demo in Chromium and steps through it, moves between
 * slides, and fails on any console error or any request that does not succeed.
 *
 *   node --import tsx scripts/export.mts <export folder> <demo page id, or none> <steps> [poster page id]
 *
 * It stops only the server it starts.
 */
import { spawn } from "node:child_process";
import { chromium, type Page } from "@playwright/test";

const [folder, pageId, stepCount, posterId] = process.argv.slice(2);
if (!folder || !pageId || !stepCount) {
  console.error("Usage: scripts/export.mts <export folder> <demo page id> <steps> [poster page id]");
  process.exit(2);
}
const PORT = Number(process.env.EXPORT_PORT ?? 3440);
const BASE = `http://localhost:${PORT}`;

const failures: string[] = [];
const check = (ok: boolean, message: string) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${message}`);
  if (!ok) failures.push(message);
};

function listen() {
  if (window !== window.top) return;
  const w = window as unknown as { __runtime: unknown[] };
  w.__runtime = [];
  window.addEventListener("message", (e) => {
    const d = e.data as { type?: string };
    if (d && (d.type === "step-done" || d.type === "error")) w.__runtime.push(d);
  });
}

type Message = { type: string; stepId?: string; code?: string; message?: string; asserts?: { pass: boolean; target: string; expect: string; actual: string }[] };
const messages = (page: Page) => page.evaluate(() => (window as unknown as { __runtime: Message[] }).__runtime);

async function waitForDone(page: Page, seen: number): Promise<Message> {
  const until = Date.now() + 15_000;
  while (Date.now() < until) {
    const fresh = (await messages(page)).slice(seen);
    const hit = fresh.find((m) => m.type === "step-done" || m.type === "error");
    if (hit) return hit;
    await page.waitForTimeout(50);
  }
  throw new Error("no step-done");
}

const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1", "--directory", folder], { stdio: "ignore" });
const browser = await chromium.launch();
try {
  const until = Date.now() + 10_000;
  while (
    !(await fetch(`${BASE}/`).then(
      (r) => r.ok,
      () => false,
    ))
  ) {
    if (Date.now() > until) throw new Error("the static server did not start");
    await new Promise((r) => setTimeout(r, 100));
  }
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addInitScript(listen);
  const page = await context.newPage();
  const errors: string[] = [];
  const documents: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  page.on("request", (r) => {
    if (r.isNavigationRequest() && r.url().includes("/demos/")) documents.push(new URL(r.url()).pathname);
  });

  // A deck of server frames has no live page to open, so "none" skips this part.
  if (pageId !== "none") {
    await page.goto(`${BASE}/s/${pageId}`, { waitUntil: "load" });
    await page.waitForSelector(".page-frame__iframe[data-visible='true']", { timeout: 15_000 });
    const frame = page.locator(".page-frame__iframe[data-visible='true']");
    check((await frame.count()) === 1, "a reader gets a live frame from plain files");
    check(((await frame.getAttribute("sandbox")) ?? "").includes("allow-scripts"), "the frame is sandboxed");

    const framed = page.frames().find((f) => f.url().includes("/demos/"));
    const policy = await framed?.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content") ?? "");
    check(Boolean(policy?.includes("default-src 'none'")) && !policy?.includes("frame-ancestors"), "the frame's CSP is a <meta>, with no directive a <meta> can't hold");
    const blocked = await framed?.evaluate(async () => {
      const worked = await new Promise<boolean>((resolve) => {
        const s = document.createElement("script");
        s.src = "https://example.com/blocked.js";
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.head.append(s);
      });
      return !worked;
    });
    check(blocked === true, "the <meta> CSP really blocks a script from another origin");
    errors.splice(0, errors.length, ...errors.filter((e) => !/blocked\.js|Content Security Policy/.test(e)));

    let failed = 0;
    for (let i = 1; i < Number(stepCount); i++) {
      const seen = (await messages(page)).length;
      await page.keyboard.press("ArrowRight");
      const done = await waitForDone(page, seen);
      if (done.type === "error") {
        failed++;
        console.log(`       step ${i}: ${done.code} ${done.message}`);
      }
      failed += (done.asserts ?? []).filter((a) => !a.pass).length;
    }
    check(failed === 0, `${stepCount} steps play, with every assert passing`);
    const seen = (await messages(page)).length;
    await page.keyboard.press("ArrowLeft");
    const back = await waitForDone(page, seen);
    check(back.type === "step-done" && (back.asserts ?? []).every((a) => a.pass), "Back replays in a fresh document");
    if (documents.some((d) => d.includes(".off-"))) console.log(`       ${[...new Set(documents)].join(", ")}`);
  }

  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.waitForTimeout(500);
  await page.keyboard.press("ArrowRight");
  await page.waitForURL((url) => url.pathname.startsWith("/s/") && url.pathname !== "/s/title", { timeout: 10_000 });
  check(true, "a key press moves to another slide");

  if (posterId) {
    await page.goto(`${BASE}/s/${posterId}`, { waitUntil: "load" });
    await page.waitForSelector(".page__poster-note", { timeout: 10_000 });
    check((await page.locator(".page-frame__iframe").count()) === 0, "a demo that needs a server shows no frame");
    check(/needs a server/.test((await page.locator(".page__poster-note").textContent()) ?? ""), "it shows the note, in neutral words");
  }

  // Before the 404 below, which logs a line of its own on purpose.
  check(errors.length === 0, `no console error and no failed request${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  const missing = await page.goto(`${BASE}/s/no-such-slide`);
  check(missing?.status() === 404, "an unknown slide is a 404 from the host");
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

console.log(failures.length ? `\n${failures.length} failed` : "\nAll passed");
process.exit(failures.length ? 1 : 0);
