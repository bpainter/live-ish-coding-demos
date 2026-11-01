import { existsSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import type { ChildProcess } from "node:child_process";
import path from "node:path";
import { portOf } from "../args";
import { CliError, EXIT, engineVersion, environment, readSummary, requireDeck, type Ctx, type ExitCode } from "../io";
import { openUrl, portAnswers, runNext, runSelf, spawnNext, startServers, watchDeck, type RunningServers } from "../process";
import { PUBLIC_NOTES_LINE } from "../../lib/validate/rules/hosting";
import { assertHosting, detectProvider, resolveHosting } from "../../next/hosting.cjs";
import { keepsNotes, prepareDeck } from "../../prepare";
import { collectNotes } from "../../prepare/strip";
import { encodeImages, hasMasters } from "./images";
import { runCheck, NOT_ASSEMBLED, printFindings } from "./check";
import { writeSchemas } from "./schema";

const PRESENT_DIST = ".next-present";

/** `next dev` and `present` leave route types behind, and a production build type-checks them against the routes it builds. */
function clearDevTypes(root: string): void {
  for (const dir of [path.join(".next", "dev", "types"), path.join(PRESENT_DIST, "types"), path.join(PRESENT_DIST, "dev", "types")]) {
    rmSync(path.join(root, dir), { recursive: true, force: true });
  }
}

const STAMP = "live-ish.json";

/** Stops the children, then leaves with their code. Runs on Ctrl-C and on a terminated parent. */
function onSignal(stop: () => void) {
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, stop);
}

/** The origin servers read to find the deck: the runtime's presenter, which `demo.ts` cannot know. */
const presenterEnv = (port: number) => ({ LIVE_ISH_PRESENTER_ORIGIN: `http://localhost:${port}` });

/** What makes a restart of `next dev` necessary: config it reads once, when it starts. */
function configKey(root: string): string {
  const { firstSlide, addresses, hosts } = readSummary(root);
  return JSON.stringify({ firstSlide, addresses, hosts });
}

export async function dev(ctx: Ctx): Promise<ExitCode> {
  const root = requireDeck(ctx);
  const port = portOf(ctx.flags);
  const env = { LIVE_ISH_PREPARED: root, ...presenterEnv(port) };
  let next: ChildProcess | null = null;
  let servers: RunningServers | null = null;
  let running = false;
  let again = false;
  let key = "";
  let finish: (code: ExitCode) => void = () => undefined;

  const start = async () => {
    writeSchemas(root);
    key = configKey(root);
    servers = await startServers(root, readSummary(root).servers, env, ctx.log);
    next = spawnNext(root, ["dev", "-p", String(port)], { env: { ...process.env, ...env } });
    next.on("exit", (code) => finish(code ? EXIT.findings : EXIT.ok));
    ctx.log(`Open http://localhost:${port}/present and press the arrow keys. Press s for the speaker window.`);
  };

  /** Regenerates and checks. A new demo file needs nothing more: Next follows the generated module. */
  const tick = async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    const code = await runSelf(["dev-tick"], root);
    running = false;
    if (code !== NOT_ASSEMBLED) {
      if (!next) await start();
      else if (configKey(root) !== key) {
        // Next reads rewrites and hosts once. Touching its config is how to ask it to read them again.
        key = configKey(root);
        const file = path.join(root, "next.config.ts");
        const now = new Date();
        utimesSync(file, now, now);
      }
    }
    if (again) {
      again = false;
      void tick();
    }
  };

  const stopWatching = watchDeck(root, () => void tick());
  await tick();
  if (!next) ctx.log("Fix the deck and save. The dev server starts as soon as it assembles.");
  return new Promise<ExitCode>((resolve) => {
    finish = (code) => {
      stopWatching();
      (servers as RunningServers | null)?.stop();
      resolve(code);
    };
    onSignal(() => {
      (next as ChildProcess | null)?.kill("SIGTERM");
      finish(EXIT.ok);
    });
  });
}

/** Files of a finished build that contain a line of the deck's notes. */
function notesInBuild(root: string, notes: string[]): string[] {
  const found: string[] = [];
  // `.next/dev` is the dev server's own output, which holds notes by design and never deploys.
  const devOutput = path.join(root, ".next", "dev");
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "cache" && file !== devOutput) visit(file);
      } else if (entry.isFile()) {
        const text = readFileSync(file, "utf8");
        if (notes.some((n) => text.includes(n))) found.push(path.relative(root, file));
      }
    }
  };
  visit(path.join(root, ".next"));
  return found;
}

/**
 * A deployable build. The target decides everything `withDeck()` does differently for a public host.
 * A build meant to carry no notes is then read back, so a `routes.ts` that imports its own `demo.ts`
 * fails here and not on the public host.
 */
export async function build(ctx: Ctx): Promise<ExitCode> {
  const root = requireDeck(ctx);
  const { findings, assembled } = await runCheck(root, ctx.flags.strict === true);
  await printFindings(findings, ctx.log);
  if (findings.some((f) => f.severity === "error") || !assembled) return EXIT.findings;

  // Before the deployed prepare, which writes a deck module with the notes removed: a failed build
  // must not leave that behind for the next `dev`.
  try {
    const { mode, site } = resolveHosting({ env: process.env, hosts: assembled.deck.hosts, target: "deployed", provider: detectProvider(process.env) });
    assertHosting({ target: "deployed", mode, site });
  } catch (error) {
    throw new CliError((error as Error).message.replace(/^live-ish: /, ""), EXIT.misuse, "To present from this laptop, run `live-ish present`.");
  }
  writeSchemas(root);
  if (hasMasters(root)) await encodeImages(root, { log: ctx.log, optional: true });
  const deployed = await prepareDeck(root, "deployed");
  clearDevTypes(root);
  const code = await runNext(root, ["build"], { ...process.env, LIVE_ISH_TARGET: "deployed", LIVE_ISH_PREPARED: root });
  if (code !== 0) return EXIT.findings;
  if (keepsNotes(deployed, "deployed")) {
    if (deployed.deck.presenter.onHost) ctx.log(PUBLIC_NOTES_LINE);
    return EXIT.ok;
  }
  const leaked = notesInBuild(root, collectNotes(deployed));
  if (!leaked.length) return EXIT.ok;
  throw new CliError(`Speaker notes reached the build, in ${leaked.join(", ")}.`, EXIT.findings, "A routes.ts must not import its demo.ts.");
}

export async function start(ctx: Ctx): Promise<ExitCode> {
  const root = requireDeck(ctx);
  if (!existsSync(path.join(root, ".next", "BUILD_ID"))) throw new CliError("There is no build to serve yet.", EXIT.findings, "Run `live-ish build`, or `live-ish present` for a local build.");
  const child = spawnNext(root, ["start", "-p", String(portOf(ctx.flags))], { env: { ...process.env, LIVE_ISH_TARGET: "deployed", LIVE_ISH_PREPARED: root } });
  onSignal(() => child.kill("SIGTERM"));
  return new Promise<ExitCode>((resolve) => child.on("exit", (code) => resolve(code ? EXIT.findings : EXIT.ok)));
}

const SKIPPED_PUBLIC = new Set(["live-ish", "opt"]);

/** The newest change among the files a build depends on, in ms. */
function newestSource(root: string): number {
  let newest = 0;
  const see = (file: string) => {
    newest = Math.max(newest, statSync(file).mtimeMs);
  };
  const walk = (dir: string, skip?: Set<string>) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") || skip?.has(e.name)) continue;
      const file = path.join(dir, e.name);
      if (e.isDirectory()) walk(file);
      else see(file);
    }
  };
  ["slides", "demos", "themes", "app"].forEach((d) => walk(path.join(root, d)));
  walk(path.join(root, "public"), SKIPPED_PUBLIC);
  ["deck.config.ts", "next.config.ts", "package.json"].forEach((f) => existsSync(path.join(root, f)) && see(path.join(root, f)));
  return newest;
}

interface Stamp {
  build: string;
  engine: string;
  builtAt: number;
}

function readStamp(root: string): Stamp | null {
  const dist = path.join(root, PRESENT_DIST);
  if (!existsSync(path.join(dist, "BUILD_ID"))) return null;
  try {
    return JSON.parse(readFileSync(path.join(dist, STAMP), "utf8")) as Stamp;
  } catch {
    return null;
  }
}

async function health(origin: string): Promise<{ ok?: boolean; build?: string } | null> {
  try {
    const res = await fetch(`${origin}/_health`, { signal: AbortSignal.timeout(2000) });
    return res.ok ? ((await res.json()) as { ok?: boolean; build?: string }) : null;
  } catch {
    return null;
  }
}

/** Step 2: both local origins answer and name this build. */
async function waitForOrigins(port: number, build: string, stopped: () => boolean): Promise<string | null> {
  const origins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
  const until = Date.now() + 30_000;
  let last = "No answer yet.";
  while (Date.now() < until) {
    if (stopped()) return "The server stopped before it answered.";
    const answers = await Promise.all(origins.map(health));
    const bad = origins.filter((_, i) => answers[i]?.build !== build);
    if (bad.length === 0) return null;
    last = answers.every(Boolean) ? `${bad.join(" and ")} answered with another build.` : `${bad.join(" and ")} did not answer.`;
    await new Promise((r) => setTimeout(r, 200));
  }
  return last;
}

/**
 * Local presenting: a build of its own, so it survives beside `dev` and needs no host, served with no
 * rebuild for a new port. Frames come from the other local address of whatever port is in use.
 */
export async function present(ctx: Ctx): Promise<ExitCode> {
  const root = requireDeck(ctx);
  const port = portOf(ctx.flags);
  if (await portAnswers(port)) throw environment(`Port ${port} is taken.`, `Stop what is using it, or pass --port=${port + 1}.`);

  // A local build needs no host, whatever this shell has set.
  const { LIVE_ISH_SITE_ORIGIN: _site, LIVE_ISH_FRAMES_ORIGIN: _frames, ...shell } = process.env;
  const env = { ...shell, LIVE_ISH_TARGET: "local", NEXT_DIST_DIR: PRESENT_DIST, LIVE_ISH_PREPARED: root, ...presenterEnv(port) };
  await prepareDeck(root, "local");
  writeSchemas(root);

  const stamp = readStamp(root);
  const fresh = stamp !== null && stamp.engine === engineVersion() && stamp.builtAt >= newestSource(root);
  let build = stamp?.build ?? "";
  if (fresh) {
    ctx.log(`Build ${build} is current.`);
  } else {
    build = `local-${Date.now().toString(36)}`;
    ctx.log(stamp ? "The deck changed since the last build. Building." : "Building for this laptop.");
    clearDevTypes(root);
    const code = await runNext(root, ["build"], { ...env, LIVE_ISH_BUILD_ID: build });
    if (code !== 0) return EXIT.findings;
    writeFileSync(path.join(root, PRESENT_DIST, STAMP), `${JSON.stringify({ build, engine: engineVersion(), builtAt: Date.now() }, null, 2)}\n`);
  }

  const { servers: list } = readSummary(root);
  const servers = await startServers(root, list, env, ctx.log);
  const child = spawnNext(root, ["start", "-p", String(port)], { env: { ...env, LIVE_ISH_BUILD_ID: build } });
  let stopped = false;
  child.on("exit", () => {
    stopped = true;
  });
  onSignal(() => child.kill("SIGTERM"));

  const problem = await waitForOrigins(port, build, () => stopped);
  if (problem) {
    child.kill("SIGTERM");
    servers.stop();
    throw environment(problem, `Check that localhost and 127.0.0.1 both reach this machine, then run \`live-ish present --port=${port}\` again.`);
  }
  const silent = await servers.ready();
  if (silent.length) ctx.log(`${silent.join(" and ")} did not start. Its slides show a still instead of a live frame.`);

  const speaker = `http://localhost:${port}/speaker`;
  // Never 127.0.0.1 for the presenter: frames would be blocked and the windows would stop syncing.
  if (ctx.flags["no-open"] !== true) openUrl(speaker);
  ctx.log("");
  ctx.log(`Presenting on ${speaker} (build ${build})`);
  ctx.log("");
  ctx.log("  1. Press s in the speaker window to open the audience window.");
  ctx.log("  2. Drag the audience window to the projector.");
  ctx.log("  3. Press f there for full screen.");
  ctx.log("");
  ctx.log("Press Ctrl-C to stop.");

  return new Promise<ExitCode>((resolve) => {
    child.on("exit", (code) => {
      servers.stop();
      resolve(code ? EXIT.findings : EXIT.ok);
    });
  });
}
