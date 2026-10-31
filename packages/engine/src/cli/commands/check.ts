import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { slideHints } from "../../lib/hints";
import type { Finding } from "../../lib/validate/types";
import { prepareDeck } from "../../prepare";
import { DeckError, type AssembledDeck } from "../../schema/assemble";
import { hasFrame } from "../../schema/demo";
import { EXIT, environment, printJson, requireDeck, resolveFromDeck, type Ctx, type ExitCode } from "../io";
import { runSelf, watchDeck } from "../process";
import { shellStatus } from "../shell";

type RunChecks = (options: { root: string; strict: boolean; only?: string }) => Promise<{ findings: Finding[] }>;

/** The validators ship in this package, and a build without them is a broken install. */
async function loadRunChecks(): Promise<RunChecks> {
  const file = new URL("../../lib/validate/index.ts", import.meta.url);
  if (!existsSync(file)) throw environment("This engine has no validators.", "Reinstall @live-ish/engine.");
  return ((await import(file.href)) as { runChecks: RunChecks }).runChecks;
}

/** A deck that does not assemble fails the same way as any other finding. */
function configFinding(error: DeckError): Finding {
  return { rule: "config", severity: "error", where: "deck.config.ts", message: error.message.replace(/^deck\.config\.ts: /, ""), docs: "https://live-ish.dev/errors/config" };
}

/** `check` includes the shell, so an edited generated file is caught before `doctor` is. */
function shellFindings(root: string, strict: boolean): Finding[] {
  return shellStatus(root)
    .filter((f) => f.state !== "current")
    .map((f) => ({
      rule: "shell",
      severity: strict ? ("error" as const) : ("warning" as const),
      where: f.target,
      message: f.state === "missing" ? "This generated file is missing." : f.state === "outdated" ? "This generated file is from an older engine." : "This generated file was edited.",
      fix: "Run `live-ish upgrade`.",
      docs: "https://live-ish.dev/errors/shell",
    }));
}

/** Prepares the deck and runs every rule. Any non-deck failure propagates. */
export async function runCheck(root: string, strict: boolean, only?: string): Promise<{ findings: Finding[]; assembled: AssembledDeck | null }> {
  let assembled: AssembledDeck;
  try {
    assembled = await prepareDeck(root);
  } catch (error) {
    if (error instanceof DeckError) return { findings: [configFinding(error)], assembled: null };
    throw error;
  }
  const runChecks = await loadRunChecks();
  const { findings } = await runChecks({ root, strict, only });
  return { findings: [...findings, ...shellFindings(root, strict)], assembled };
}

function printFinding(f: Finding, log: Ctx["log"]) {
  log(`${f.severity === "error" ? "✖" : "▲"} [${f.rule}] ${f.where}`);
  log(`  ${f.message}`);
  if (f.fix) log(`  ${f.fix}`);
  log(`  Docs: ${f.docs}`);
}

export function printFindings(findings: Finding[], log: Ctx["log"]) {
  const sorted = [...findings.filter((f) => f.severity === "error"), ...findings.filter((f) => f.severity === "warning")];
  for (const f of sorted) printFinding(f, log);
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.length - errors;
  const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  log(findings.length ? `check: ${count(errors, "error")}, ${count(warnings, "warning")}` : "check: passed");
}

/** One line for tier 1 not being set up. Having no captures is a normal first state, so it never fails. */
function captureNote(root: string, deck: AssembledDeck | null): string | null {
  if (!deck || resolveFromDeck(root, "@live-ish/verify/package.json")) return null;
  const framed = deck.demos.some((d) => d.pages.some(hasFrame));
  if (!framed || existsSync(path.join(root, "public", "posters"))) return null;
  return "No captures yet, so slides use a loading state. `live-ish add verify` adds them.";
}

export async function check(ctx: Ctx): Promise<ExitCode> {
  const root = requireDeck(ctx);
  const strict = ctx.flags.strict === true;
  const [only] = ctx.positionals;
  if (ctx.flags.watch === true) return watchChecks(ctx, root);
  const { findings, assembled } = await runCheck(root, strict, only);
  const note = captureNote(root, assembled);
  const failed = findings.some((f) => f.severity === "error");
  if (ctx.json) {
    printJson({ ok: !failed, strict, findings, notes: note ? [note] : [] });
  } else {
    printFindings(findings, ctx.log);
    if (note) ctx.log(note);
  }
  return failed ? EXIT.findings : EXIT.ok;
}

/** Each pass runs in a fresh process, so it reads the files as they are now. */
async function watchChecks(ctx: Ctx, root: string): Promise<ExitCode> {
  const args = ["check", ...ctx.positionals, ...(ctx.flags.strict ? ["--strict"] : []), ...(ctx.json ? ["--json"] : [])];
  let running = false;
  let again = false;
  const pass = async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    await runSelf(args, root);
    running = false;
    if (again) {
      again = false;
      void pass();
    }
  };
  await pass();
  ctx.log("Watching slides/, demos/ and deck.config.ts. Press Ctrl-C to stop.");
  const stop = watchDeck(root, () => void pass());
  return new Promise<ExitCode>((resolve) => {
    process.once("SIGINT", () => {
      stop();
      resolve(EXIT.ok);
    });
  });
}

/** Exit code of `dev-tick` when the deck does not assemble, so `dev` holds off starting Next. */
export const NOT_ASSEMBLED = 4;

/** One pass of `dev`, in its own process: regenerate, check, and say what a tool could still add. */
export async function devTick(ctx: Ctx): Promise<number> {
  const root = requireDeck(ctx);
  const { findings, assembled } = await runCheck(root, false);
  printFindings(findings, ctx.log);
  if (!assembled) return NOT_ASSEMBLED;
  const support = readSupportIds(root);
  for (const slide of assembled.slides) {
    const page = slide.page;
    const still = page?.beat === "intro" && page.visual ? existsSync(path.join(root, "public", page.visual.src)) : true;
    for (const hint of slideHints(slide, { still, support: Boolean(slide.demo && support.has(slide.demo.id)) })) ctx.log(`· ${slide.id}: ${hint}`);
  }
  return EXIT.ok;
}

function readSupportIds(root: string): Set<string> {
  try {
    return new Set(Object.keys((JSON.parse(readFileSync(path.join(root, ".live-ish", "support.json"), "utf8")) as { demos: object }).demos));
  } catch {
    return new Set();
  }
}
