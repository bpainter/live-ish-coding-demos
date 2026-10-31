import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { prepareDeck, keepsNotes } from "../prepare";
import { collectNotes } from "../prepare/strip";
import { PUBLIC_NOTES_LINE } from "../lib/validate/rules/hosting";
import { assertHosting, detectProvider, resolveHosting } from "../next/hosting.cjs";

/** The folder `live-ish present` builds into, so it never touches a deployable `.next`. */
const PRESENT_DIST = ".next-present";
/** The deck's own sources. A newer file means the local build is stale. */
const SOURCES = ["deck.config.ts", "slides", "demos", "public"];
const HEALTH_MS = 30_000;

function nextBin(root: string): string {
  return createRequire(path.join(root, "package.json")).resolve("next/dist/bin/next");
}

/** Everything but the host overrides: a local build needs no host, whatever this shell has set. */
function localEnv(): NodeJS.ProcessEnv {
  const { LIVE_ISH_SITE_ORIGIN: _site, LIVE_ISH_FRAMES_ORIGIN: _frames, ...env } = process.env;
  return { ...env, LIVE_ISH_TARGET: "local", NEXT_DIST_DIR: PRESENT_DIST };
}

function newestSource(root: string): number {
  let newest = 0;
  const visit = (file: string) => {
    const stat = statSync(file);
    newest = Math.max(newest, stat.mtimeMs);
    if (!stat.isDirectory()) return;
    for (const name of readdirSync(file)) if (name !== "live-ish") visit(path.join(file, name));
  };
  for (const name of SOURCES) if (existsSync(path.join(root, name))) visit(path.join(root, name));
  return newest;
}

/** Files of a finished build that contain a line of the deck's notes. */
function notesInBuild(root: string, notes: string[]): string[] {
  const found: string[] = [];
  const skip = new Set(["cache"]);
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) visit(file);
      } else if (entry.isFile()) {
        const text = readFileSync(file, "utf8");
        if (notes.some((n) => text.includes(n))) found.push(path.relative(root, file));
      }
    }
  };
  visit(path.join(root, process.env.NEXT_DIST_DIR ?? ".next"));
  return found;
}

/**
 * `live-ish build`: a deployable build. The target decides everything `withDeck()` does differently
 * for a public host. A build meant to carry no notes is then read back, so a `routes.ts` that imports
 * its own `demo.ts` fails here and not on the public host.
 */
export async function build(): Promise<number> {
  const root = process.cwd();
  const assembled = await prepareDeck(root, "deployed");
  try {
    const { mode, site } = resolveHosting({ env: process.env, hosts: assembled.deck.hosts, target: "deployed", provider: detectProvider(process.env) });
    assertHosting({ target: "deployed", mode, site });
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }
  const run = spawnSync(process.execPath, [nextBin(root), "build"], { cwd: root, stdio: "inherit", env: { ...process.env, LIVE_ISH_TARGET: "deployed", LIVE_ISH_PREPARED: root } });
  if (run.status !== 0) return run.status ?? 1;
  if (keepsNotes(assembled, "deployed")) {
    if (assembled.deck.presenter.onHost) console.log(PUBLIC_NOTES_LINE);
    return 0;
  }
  const leaked = notesInBuild(root, collectNotes(assembled));
  if (!leaked.length) return 0;
  console.error(`live-ish: speaker notes reached the build, in ${leaked.join(", ")}. A routes.ts must not import its demo.ts.`);
  return 1;
}

async function answers(url: string): Promise<{ build: string } | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as { build: string }) : null;
  } catch {
    return null;
  }
}

/** Waits for one address to answer `/_health`. */
async function healthy(origin: string): Promise<{ build: string } | null> {
  const until = Date.now() + HEALTH_MS;
  while (Date.now() < until) {
    const health = await answers(`${origin}/_health`);
    if (health) return health;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

function openBrowser(url: string) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(command, args, { stdio: "ignore", detached: true }).on("error", () => console.log(`Open ${url}`)).unref();
}

/**
 * `live-ish present [--port=3000] [--no-open]`: a separate local build, rebuilt only when the deck
 * changed, on any port. It needs no host, and it starts the servers the deck lists.
 */
export async function present(args: string[]): Promise<number> {
  const root = process.cwd();
  const port = Number(args.find((a) => a.startsWith("--port="))?.slice(7) ?? 3000);
  if (!Number.isInteger(port) || port <= 0) {
    console.error("live-ish present: --port must be a port number.");
    return 2;
  }
  const env = localEnv();
  const stamp = path.join(root, PRESENT_DIST, "BUILD_ID");
  if (!existsSync(stamp) || statSync(stamp).mtimeMs < newestSource(root)) {
    const run = spawnSync(process.execPath, [nextBin(root), "build"], { cwd: root, stdio: "inherit", env });
    if (run.status !== 0) return run.status ?? 1;
  }
  const { servers = [] } = (await import(pathToFileURL(path.join(root, ".live-ish", "deck.gen.ts")).href)).default.config as { servers?: { app: string; command: string; port: number }[] };
  const children: ChildProcess[] = servers.map((s) => spawn(s.command, { cwd: root, shell: true, stdio: "inherit", env: { ...process.env, PORT: String(s.port) } }));
  const server = spawn(process.execPath, [nextBin(root), "start", "-p", String(port)], { cwd: root, stdio: "inherit", env });
  children.push(server);
  const stop = () => {
    for (const child of children) child.kill();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  const [named, numbered] = await Promise.all([healthy(`http://localhost:${port}`), healthy(`http://127.0.0.1:${port}`)]);
  if (!named || !numbered) {
    console.error(`live-ish present: ${named ? "127.0.0.1" : "localhost"}:${port} did not answer. Frames need both addresses.`);
    stop();
    return 3;
  }
  const speaker = `http://localhost:${port}/speaker`;
  console.log(`\nBuild ${named.build} on ${speaker}\n\n  1. Press s to open the audience window.\n  2. Drag it to the projector.\n  3. Press f for full screen.\n`);
  if (!args.includes("--no-open")) openBrowser(speaker);
  return new Promise((resolve) => server.on("exit", (code) => resolve(code ?? 0)));
}
