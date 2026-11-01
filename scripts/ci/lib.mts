// Shared by the CI scripts. Each script here is one job's body, so a contributor can run it locally.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The published packages, by folder. Two of them can be absent while a workstream is open. */
export const PUBLISHED = { engine: "@live-ish/engine", verify: "@live-ish/verify", bridge: "@live-ish/bridge", create: "create-live-ish" } as const;

export const readJson = <T = Record<string, unknown>,>(file: string) => JSON.parse(readFileSync(file, "utf8")) as T;

export const tempDir = (prefix: string) => mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));

/** Packs every published package with pnpm, so `workspace:*` becomes a real version. */
export function packAll(outDir: string): Record<string, string> {
  mkdirSync(outDir, { recursive: true });
  const tarballs: Record<string, string> = {};
  for (const [folder, name] of Object.entries(PUBLISHED)) {
    const dir = path.join(REPO, "packages", folder);
    if (!existsSync(path.join(dir, "package.json"))) continue;
    execFileSync("pnpm", ["pack", "--pack-destination", outDir], { cwd: dir, stdio: "pipe" });
    const prefix = name.replace("@", "").replace("/", "-");
    const file = readdirSync(outDir).find((f) => f.startsWith(`${prefix}-`) && f.endsWith(".tgz"));
    if (!file) throw new Error(`pnpm pack wrote no tarball for ${name}.`);
    tarballs[name] = path.join(outDir, file);
  }
  return tarballs;
}

export async function waitForUrl(url: string, ms: number, stopped: () => boolean = () => false): Promise<number> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (stopped()) throw new Error(`The server stopped before ${url} answered.`);
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (res.status < 500) return res.status;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No answer from ${url} in ${ms} ms.`);
}

/** Stops a detached server and everything it started. */
export function stop(child: ChildProcess) {
  if (child.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

export function serve(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env): ChildProcess {
  return spawn(command, args, { cwd, env, detached: true, stdio: ["ignore", "inherit", "inherit"] });
}

/** The commands in one fenced `sh` block, or every block, in order. Comments and blank lines go. */
export function shellCommands(markdown: string, heading?: string): string[] {
  let text = markdown;
  if (heading) {
    const at = text.indexOf(`## ${heading}`);
    if (at === -1) throw new Error(`No "## ${heading}" section.`);
    const after = text.indexOf("\n## ", at + 3);
    text = text.slice(at, after === -1 ? undefined : after);
  }
  const blocks = [...text.matchAll(/```sh\n([\s\S]*?)```/g)].map((m) => m[1]);
  return blocks.flatMap((block) =>
    block
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );
}
