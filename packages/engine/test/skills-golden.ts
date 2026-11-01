import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Golden tasks as data, and the judge they all share. `pnpm test` plays each task's scripted solution
 * through this judge with no agent, which proves the task, its commands and the judge at no cost.
 * `pnpm evals:claude` then hands the same prompt to an agent, and the same judge decides.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENGINE = path.join(HERE, "..");
export const REPO = path.join(ENGINE, "..", "..");
export const STARTER = path.join(REPO, "examples", "starter");
export const CLI = path.join(ENGINE, "bin", "live-ish.mjs");

export type Step = { run: string[]; exit?: number | number[] } | { write: string; text: string } | { replace: string; find: string; with: string };

export interface GoldenPass {
  /** At least one change must fall under one of these. */
  changed: string[];
  /** Regular expressions, with the `m` flag, that some file under `in` must match. */
  contains?: { in: string[]; pattern: string }[];
  /** Rules that may not report anything, warnings included. */
  noRules?: string[];
  /** `live-ish walk` on the new slide, when `verify` is present. */
  walk?: boolean;
}

export interface GoldenTask {
  id: string;
  prompt: string;
  setup: Step[];
  solution: Step[];
  pass: GoldenPass;
}

export interface GoldenFile {
  skill: string;
  why?: string;
  tasks: GoldenTask[];
  /** Commands a manual skill runs, played the same way. */
  commands?: Step[];
}

export interface TriggerFile {
  skill: string;
  invocation: "model" | "manual";
  should: string[];
  should_not: string[];
}

const evalPath = (skill: string, name: string) => path.join(ENGINE, "skills", skill, "evals", name);

export const readGolden = (skill: string) => JSON.parse(readFileSync(evalPath(skill, "golden.json"), "utf8")) as GoldenFile;
export const readTriggers = (skill: string) => JSON.parse(readFileSync(evalPath(skill, "triggers.json"), "utf8")) as TriggerFile;

export function cli(deck: string, args: string[], env: Record<string, string> = {}) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: deck, encoding: "utf8", env: { ...process.env, ...env } });
  return { code: run.status, stdout: run.stdout, stderr: run.stderr };
}

/** A copy of the starter that shares its installed packages. No install, so it costs under a second. */
export function freshDeck(prefix = "live-ish-skills-"): { deck: string; done(): void } {
  const parent = mkdtempSync(path.join(os.tmpdir(), prefix));
  const deck = path.join(parent, "deck");
  const skip = new Set(["node_modules", ".next", ".live-ish", "next-env.d.ts"]);
  cpSync(STARTER, deck, { recursive: true, filter: (src) => !skip.has(path.basename(src)) && !src.includes(`${path.sep}public${path.sep}live-ish`) });
  symlinkSync(path.join(STARTER, "node_modules"), path.join(deck, "node_modules"), "dir");
  return { deck, done: () => rmSync(parent, { recursive: true, force: true }) };
}

function git(deck: string, args: string[]): string {
  return spawnSync("git", args, { cwd: deck, encoding: "utf8" }).stdout;
}

/** A commit to measure the agent's changes against. Identity is local to this temp folder. */
export function baseline(deck: string) {
  git(deck, ["init", "-q"]);
  git(deck, ["add", "-A"]);
  git(deck, ["-c", "user.name=evals", "-c", "user.email=evals@example.invalid", "commit", "-q", "--no-verify", "-m", "baseline"]);
}

export function applyStep(deck: string, step: Step): string | null {
  if ("run" in step) {
    const { code, stderr, stdout } = cli(deck, step.run);
    const expected = step.exit === undefined ? [0] : [step.exit].flat();
    return expected.includes(code ?? -1) ? null : `live-ish ${step.run.join(" ")} exited ${code}: ${stderr || stdout}`;
  }
  const file = path.join(deck, "write" in step ? step.write : step.replace);
  mkdirSync(path.dirname(file), { recursive: true });
  if ("write" in step) {
    writeFileSync(file, step.text);
    return null;
  }
  const text = readFileSync(file, "utf8");
  if (!text.includes(step.find)) return `${step.replace} does not hold ${JSON.stringify(step.find)}`;
  writeFileSync(file, text.replace(step.find, step.with));
  return null;
}

const ALLOWED = /^(slides|demos|themes|public)\/|^deck\.config\.ts$/;
const UNTOUCHED = /^(app\/|next\.config\.ts$|\.live-ish\/|node_modules)/;

/** Paths from `git status --porcelain`, with the quotes and rename arrows gone. */
export function changedPaths(status: string): string[] {
  return status
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).split(" -> ").at(-1)!.replace(/^"|"$/g, ""));
}

/** The folders-only half of the verdict, so a test can break it with no deck. */
export function judgeChanges(paths: string[], pass: GoldenPass): string[] {
  const out: string[] = [];
  for (const file of paths) {
    if (UNTOUCHED.test(file)) out.push(`${file} must stay untouched`);
    else if (!ALLOWED.test(file)) out.push(`${file} is outside the allowed folders`);
  }
  if (!paths.some((p) => pass.changed.some((c) => p.startsWith(c)))) out.push(`nothing changed under ${pass.changed.join(", ")}`);
  return out;
}

function filesUnder(deck: string, target: string): string[] {
  const abs = path.join(deck, target);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [abs];
  return readdirSync(abs, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.join(e.parentPath, e.name));
}

export interface Verdict {
  ok: boolean;
  problems: string[];
}

/** Every line of section 17.8 a deck can answer. `build` and `walk` cost seconds, so a caller asks. */
export function judge(deck: string, pass: GoldenPass, options: { build?: boolean; walk?: boolean } = {}): Verdict {
  const paths = changedPaths(git(deck, ["status", "--porcelain", "--untracked-files=all"]));
  const problems = judgeChanges(paths, pass);
  const check = cli(deck, ["check", "--json"]);
  if (check.code !== 0) problems.push(`check exited ${check.code}`);
  try {
    const { findings } = JSON.parse(check.stdout) as { findings: { rule: string; severity: string; where: string; message: string }[] };
    for (const f of findings) {
      if (f.severity === "error") problems.push(`[${f.rule}] ${f.where}: ${f.message}`);
      else if (pass.noRules?.includes(f.rule)) problems.push(`[${f.rule}] must not report: ${f.message}`);
    }
  } catch {
    problems.push("check printed no JSON");
  }
  for (const { in: where, pattern } of pass.contains ?? []) {
    const re = new RegExp(pattern, "m");
    if (!where.flatMap((w) => filesUnder(deck, w)).some((f) => re.test(readFileSync(f, "utf8")))) problems.push(`no file under ${where.join(", ")} matches ${pattern}`);
  }
  if (options.build) {
    // A deployed build needs a site, and this one goes nowhere.
    const build = cli(deck, ["build"], { LIVE_ISH_SITE_ORIGIN: "https://example.com" });
    if (build.code !== 0) problems.push(`build exited ${build.code}: ${build.stderr}`);
  }
  if (options.walk && pass.walk && existsSync(path.join(deck, "node_modules", "@live-ish", "verify"))) {
    // The agent picks the id, so the new folder names the demo.
    for (const id of new Set(paths.flatMap((p) => /^demos\/([^/]+)\//.exec(p)?.[1] ?? []))) {
      const walk = cli(deck, ["walk", id]);
      if (walk.code !== 0) problems.push(`walk ${id} exited ${walk.code}`);
    }
  }
  return { ok: problems.length === 0, problems };
}
