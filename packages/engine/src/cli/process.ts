import { spawn, spawnSync, type ChildProcess, type SpawnOptions } from "node:child_process";
import { existsSync, watch, type FSWatcher } from "node:fs";
import { connect } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { environment, resolveFromDeck, type DeckSummary } from "./io";

const MAIN = path.join(path.dirname(fileURLToPath(import.meta.url)), "main.ts");

/**
 * Runs a CLI command in a fresh process. A long-running command needs this for every re-read: Node
 * caches an imported module for the life of a process, so a second `prepareDeck` in the same one
 * would see the old slides.
 */
export function runSelf(args: string[], cwd: string, env: Record<string, string> = {}): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [...process.execArgv, MAIN, ...args], { cwd, stdio: "inherit", env: { ...process.env, ...env } });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

/** A repeat inside this window is the same stop arriving twice. After it, a person means it. */
const SIGNAL_ECHO_MS = 1000;

/**
 * Runs `stop` on the first signal, and keeps listening. Ctrl-C reaches the whole process group and
 * the shim forwards it too, so this process hears every stop twice. A one-shot listener leaves the
 * second on Node's default, which kills the process before it stops a deck's servers, and the next
 * `dev` then finds the port taken and serves the old code. A later signal still forces the exit,
 * because a hung server must not trap someone on stage.
 */
export function onSignal(stop: () => void) {
  let first = 0;
  const handle = () => {
    if (first === 0) {
      first = Date.now();
      stop();
    } else if (Date.now() - first > SIGNAL_ECHO_MS) process.exit(130);
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, handle);
}

/** `next <args>` from the deck's own install. */
export function spawnNext(root: string, args: string[], options: SpawnOptions = {}): ChildProcess {
  const bin = resolveFromDeck(root, "next/dist/bin/next");
  if (!bin) throw environment("next is not installed in this deck.", "Run your package manager's install.");
  return spawn(process.execPath, [bin, ...args], { cwd: root, stdio: "inherit", ...options });
}

/** Runs `next <args>` to the end, with exactly this environment, and returns its exit code. */
export function runNext(root: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve) => {
    const child = spawnNext(root, args, { env });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

const WATCHED = ["slides", "demos", "themes"];

/** Calls `onChange` once per burst of saves under `slides/`, `demos/`, `themes/` and `deck.config.ts`. */
export function watchDeck(root: string, onChange: () => void): () => void {
  let timer: NodeJS.Timeout | undefined;
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, 150);
  };
  const followed = new Map<string, FSWatcher>();
  const follow = (name: string) => {
    const dir = path.join(root, name);
    if (!followed.has(name) && existsSync(dir)) followed.set(name, watch(dir, { recursive: true }, changed));
  };
  WATCHED.forEach(follow);
  // The root itself is watched flat: a folder that does not exist yet, such as the first `themes/`,
  // joins when it appears, and node_modules and the build output stay out of it.
  const top = watch(root, (_event, file) => {
    const name = file?.toString();
    if (name === "deck.config.ts") changed();
    else if (name && WATCHED.includes(name)) {
      follow(name);
      changed();
    }
  });
  return () => {
    clearTimeout(timer);
    top.close();
    followed.forEach((w) => w.close());
  };
}

export interface RunningServers {
  stop(): void;
  /** Resolves once every server's port answers, or the time is up. Returns the apps still silent. */
  ready(ms?: number): Promise<string[]>;
}

/**
 * Whether anything answers on a port. A connection, not a trial bind: on macOS a bind to 127.0.0.1
 * succeeds beside a server listening on every address.
 */
export const portAnswers = (port: number, host = "127.0.0.1") =>
  new Promise<boolean>((resolve) => {
    const socket = connect({ port, host });
    const done = (answer: boolean) => {
      socket.destroy();
      resolve(answer);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(500, () => done(false));
  });

/**
 * Starts `servers` from the config in their own process groups, so stopping one stops whatever its
 * command spawned. A port already taken is left alone: the author started that server by hand.
 * With `json`, a server's output goes to stderr, because stdout holds one document.
 */
export async function startServers(root: string, servers: DeckSummary["servers"], env: Record<string, string | undefined>, log: (message: string) => void, { json = false } = {}): Promise<RunningServers> {
  const children: ChildProcess[] = [];
  for (const server of servers) {
    if (await portAnswers(server.port)) {
      log(`${server.app}: port ${server.port} is taken, so it is left running as it is.`);
      continue;
    }
    log(`${server.app}: ${server.command}`);
    children.push(spawn(server.command, { cwd: root, shell: true, detached: true, stdio: json ? ["ignore", 2, 2] : "inherit", env: { ...process.env, ...env, PORT: String(server.port) } }));
  }
  return {
    stop() {
      for (const child of children) {
        try {
          process.kill(-child.pid!, "SIGTERM");
        } catch {
          /* gone */
        }
      }
    },
    async ready(ms = 15_000) {
      const until = Date.now() + ms;
      let silent = servers;
      while (Date.now() < until) {
        const up = await Promise.all(silent.map((s) => portAnswers(s.port)));
        silent = silent.filter((_, i) => !up[i]);
        if (silent.length === 0) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      return silent.map((s) => s.app);
    },
  };
}

/** Opens a URL in the default browser. A machine with no opener is not an error: the URL is printed. */
export function openUrl(url: string) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(command, args, { stdio: "ignore", detached: true }).on("error", () => undefined).unref();
  } catch {
    /* printed anyway */
  }
}

/** The running version of a tool, or null when it is not on PATH. */
export function toolVersion(command: string): string | null {
  const run = spawnSync(command, ["--version"], { encoding: "utf8" });
  return run.status === 0 ? run.stdout.trim().split("\n")[0] : null;
}
