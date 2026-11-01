import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Page } from "@playwright/test";
import { POSTERS_FILE, encodeImages, posterInputHash, posterUrl, prepareDeck, startServers, type IntroPage, type PosterRecord } from "@live-ish/engine/verify";
import { EnvironmentError, UsageError, numberOpt, parseArgs } from "./lib/args";
import { liveFrames, loadDeck, runningServers, stepKey, type DeckData, type Target } from "./lib/deck";
import { Report } from "./lib/report";
import { BROWSER_VALUES, sessionOptions, withSession, type Session } from "./lib/session";
import { FRAME_VISIBLE, waitForResult } from "./lib/watch";

/**
 * Stills and posters from a production build, so no dev badge or dev overlay is ever in an image.
 * It builds into a directory of its own, so it runs beside `next dev`, serves that build, shoots
 * every page, encodes the results, and records each page's frame inputs for `poster-fresh`.
 *
 * Posters hold the frame document and no chrome, so one serves every theme. Terminal windows take the
 * theme, so a terminal page's posters are keyed by the theme it uses, and only themes in use.
 */

/** Only the frame: no overlay and no dev badge. Square corners, so a still has content to its edges. */
const CAPTURE_CSS = ".overlay, nextjs-portal { display: none !important; } .page-frame, .page-frame__scaled, .page-frame__slot, .page-frame__iframe { border-radius: 0 !important; }";
const DIST = ".next-capture";

/** Next adds its build directory's types to the deck's tsconfig, so this one puts the file back. */
function keepingTsconfig(root: string, body: () => number): number {
  const file = path.join(root, "tsconfig.json");
  const before = existsSync(file) ? readFileSync(file, "utf8") : null;
  try {
    return body();
  } finally {
    if (before !== null) writeFileSync(file, before);
  }
}

function nextBin(root: string): string {
  try {
    return createRequire(path.join(root, "package.json")).resolve("next/dist/bin/next");
  } catch {
    throw new EnvironmentError("next is not installed in this deck. Run your package manager's install.");
  }
}

function captureEnv(port: number): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NEXT_DIST_DIR: DIST, LIVE_ISH_TARGET: "local", NODE_ENV: "production", PORT: String(port) };
  // `withDeck()` skips its setup when this is inherited, and this build needs its own.
  delete env.LIVE_ISH_PREPARED;
  return env;
}

async function up(url: string): Promise<boolean> {
  for (let i = 0; i < 120; i++) {
    const res = await fetch(url).catch(() => null);
    if (res && res.status < 500) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/** Opens a step for its shot. False when the frame never finished it. */
async function reach(session: Session, page: Page, t: Target, index: number): Promise<boolean> {
  const step = t.page.steps[index];
  await page.goto(session.present(t.page.id, index, { capture: "1" }));
  if (!(await waitForResult(page, stepKey(t.page, step), 0, 25000))) return false;
  await page.waitForTimeout(500);
  await page.addStyleTag({ content: CAPTURE_CSS });
  return true;
}

async function captureStills(session: Session, targets: Target[], report: Report): Promise<number> {
  const { deck } = session;
  const ctx = await session.context({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  let shot = 0;
  for (const demo of deck.demos) {
    const intro = demo.pages.find((p): p is IntroPage => p.beat === "intro");
    const cap = intro?.visual?.capture;
    if (!intro || !cap) continue;
    const t = targets.find((x) => x.page.id === cap.pageId);
    if (!t) continue;
    const index = t.page.steps.findIndex((s) => s.id === cap.stepId);
    if (index < 0) {
      report.fail(intro.id, `the still's step ${cap.stepId} is not on ${cap.pageId}`);
      continue;
    }
    if (!(await reach(session, page, t, index))) {
      report.fail(intro.id, `no step result for ${cap.pageId} ${cap.stepId}`);
      continue;
    }
    // Stills show no focus ring that reads as a spotlight.
    const frame = await (await page.$(FRAME_VISIBLE))?.contentFrame();
    await frame?.evaluate(`document.activeElement && document.activeElement !== document.body && document.activeElement.blur()`).catch(() => {});
    await page.waitForTimeout(100);
    const out = path.join(deck.root, "public", intro.visual!.src);
    mkdirSync(path.dirname(out), { recursive: true });
    await page.locator(FRAME_VISIBLE).screenshot({ path: out, animations: "disabled" });
    report.pass(`still ${demo.id}: ${cap.pageId} ${cap.stepId} to public${intro.visual!.src}`);
    shot++;
  }
  await ctx.close();
  return shot;
}

async function capturePosters(session: Session, targets: Target[], report: Report): Promise<number> {
  const { deck } = session;
  const recordsFile = path.join(deck.root, ".live-ish", POSTERS_FILE);
  const records: Record<string, PosterRecord> = existsSync(recordsFile) ? (JSON.parse(readFileSync(recordsFile, "utf8")) as Record<string, PosterRecord>) : {};
  const ctx = await session.context({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  let total = 0;
  for (const t of targets) {
    let shot = 0;
    const config = deck.input.demos.find((d) => d.demo.id === t.demo.id)?.demo[t.page.beat];
    for (const [i, step] of t.page.steps.entries()) {
      const key = stepKey(t.page, step);
      if (!(await reach(session, page, t, i))) {
        report.fail(key, "no step result");
        continue;
      }
      const url = posterUrl(t.page, step.id, t.page.chrome);
      const out = path.join(deck.root, "public", url);
      mkdirSync(path.dirname(out), { recursive: true });
      await page.locator(FRAME_VISIBLE).screenshot({ path: out, type: "jpeg", quality: 72 });
      shot++;
    }
    total += shot;
    // Every step shot: these posters match the frame inputs on disk now.
    if (shot === t.page.steps.length) records[t.page.id] = { inputs: posterInputHash(deck.root, t.demo, t.page, config), captured: new Date().toISOString() };
    report.pass(`posters ${t.page.id}: ${shot} of ${t.page.steps.length}`);
  }
  await ctx.close();
  const sorted = Object.fromEntries(Object.keys(records).sort().map((k) => [k, records[k]]));
  writeFileSync(recordsFile, `${JSON.stringify(sorted, null, 2)}\n`);
  return total;
}

/** A page with no poster folder left over from an earlier capture of it. */
function clearPosters(deck: DeckData, targets: Target[]) {
  for (const t of targets) rmSync(path.join(deck.root, "public", "posters", t.page.id), { recursive: true, force: true });
}

export async function capture(argv: string[], context: { root: string }): Promise<number> {
  const args = parseArgs(argv, { values: [...BROWSER_VALUES, "port"], flags: ["headed", "json", "no-build", "local-only"] });
  const id = args.words[0];
  const report = new Report("capture", args.flag("json"));
  const deck = await loadDeck(context.root);
  const { root } = context;
  if (id && !deck.demos.some((d) => d.id === id || d.pages.some((p) => p.id === id))) throw new UsageError(`No page or demo "${id}" in this deck.`);
  const given = args.opt("origin");
  const port = numberOpt(args, "port", 3390);
  let server: ChildProcess | null = null;
  const options = sessionOptions(args);
  // Companion apps start and stop with the capture. A port already taken is the author's own. A
  // clean checkout has no summary yet, and a capture with no apps would shoot nothing and pass.
  await prepareDeck(root);
  const summary = path.join(root, ".live-ish", "deck.json");
  const servers = existsSync(summary) ? ((JSON.parse(readFileSync(summary, "utf8")) as { servers?: { app: string; command: string; port: number }[] }).servers ?? []) : [];
  const companions = await startServers(root, servers, {}, (m: string) => report.log(m), { json: args.flag("json") });
  try {
    const silent = await companions.ready();
    if (silent.length) report.note(`no answer from ${silent.join(", ")}: their pages keep the posters they have`);
    if (!given) {
      const next = nextBin(root);
      if (!args.flag("no-build")) {
        report.log(`capture: building into ${DIST}`);
        const code = keepingTsconfig(root, () => spawnSync(process.execPath, [next, "build"], { cwd: root, env: captureEnv(port), stdio: args.flag("json") ? ["ignore", 2, 2] : "inherit" }).status ?? 1);
        if (code !== 0) throw new EnvironmentError("The capture build failed.");
      }
      server = spawn(process.execPath, [next, "start", "-p", String(port)], { cwd: root, env: captureEnv(port), stdio: "ignore" });
      options.origin = `http://localhost:${port}`;
      if (!(await up(`${options.origin}/_health`))) throw new EnvironmentError(`The capture server did not start on port ${port}.`);
    }
    return await withSession(deck, options, report, async (session) => {
      const serversUp = await runningServers(deck);
      for (const app of Object.keys(deck.deck.hosts.external)) if (!serversUp.has(app)) report.note(`app ${app} is not running: its pages keep the posters they have`);
      const live = liveFrames(deck, serversUp);
      const targets = id ? live.filter((t) => t.demo.id === id || t.page.id === id) : live;
      clearPosters(deck, targets);
      const stills = await captureStills(session, id ? live.filter((t) => t.demo.id === id) : live, report);
      const posters = await capturePosters(session, targets, report);
      const encoded = await encodeImages(root, { log: (m = "") => report.log(m), optional: true });
      // `assetExists()` answers from the file list, so it has to see what this run wrote.
      await prepareDeck(root);
      report.data.posters = posters;
      report.data.stills = stills;
      report.log(`\ncapture: ${posters} poster(s), ${stills} still(s), ${encoded.encoded} encoded, ${encoded.skipped} unchanged. Rebuild to serve them.`);
      return report.finish("capture");
    });
  } finally {
    server?.kill();
    companions.stop();
  }
}
