import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { slideHints } from "../../lib/hints";
import type { Finding } from "../../lib/validate/types";
import { prepareDeck } from "../../prepare";
import type { AssembledDeck } from "../../schema/assemble";
import { isDeckError } from "../../schema/errors";
import { UsageError } from "../args";
import { EXIT, printJson, requireDeck, resolveFromDeck, type Ctx, type ExitCode } from "../io";
import { runSelf, watchDeck } from "../process";
import { shellStatus } from "../shell";

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
      docs: "https://live-ish.vercel.app/errors/shell",
    }));
}

/**
 * Regenerates, then runs every rule and the shell. The rules compare generated files when they exist,
 * and every `dev` and `build` rebuilds those files, so a stale one would only report work the next
 * run does anyway: `new` followed by `check` must pass. A deck that cannot prepare still gets its
 * rules, which say the same thing with a path and a fix.
 */
export async function runCheck(root: string, strict: boolean, only?: string): Promise<{ findings: Finding[]; assembled: AssembledDeck | null }> {
  let assembled: AssembledDeck | null = null;
  let failure: unknown;
  try {
    assembled = await prepareDeck(root);
  } catch (error) {
    failure = error;
  }
  // Loaded here, not at the top: it pulls in the DOM parser, and most commands never need it.
  const { runChecks } = await import("../../lib/validate");
  let found: Finding[];
  try {
    found = (await runChecks({ root, strict, only })).findings;
  } catch (error) {
    if (only && isDeckError(error)) throw new UsageError(error.message);
    // A slide or demo that will not even load, such as one with a syntax error.
    found = [{ rule: "build", severity: "error", where: "slides/ and demos/", message: (error as Error).message.split("\n").slice(0, 4).join("\n  "), docs: "https://live-ish.vercel.app/errors/build" }];
  }
  const findings = [...found, ...shellFindings(root, strict)];
  if (failure && !findings.some((f) => f.severity === "error")) throw failure;
  return { findings, assembled };
}

export async function printFindings(findings: Finding[], log: Ctx["log"]) {
  const { formatFindings } = await import("../../lib/validate");
  log(findings.length ? formatFindings(findings) : "check: passed");
}

/** One line for tier 1 not being set up. Having no captures is a normal first state, so it never fails. */
function captureNote(root: string): string | null {
  const demos = path.join(root, "demos");
  if (!existsSync(demos) || readdirSync(demos).length === 0) return null;
  if (resolveFromDeck(root, "@live-ish/verify/package.json") || existsSync(path.join(root, "public", "posters"))) return null;
  return "No captures yet, so slides use a loading state. `live-ish add verify` adds them.";
}

export async function check(ctx: Ctx): Promise<ExitCode> {
  const root = requireDeck(ctx);
  const strict = ctx.flags.strict === true;
  const [only] = ctx.positionals;
  if (ctx.flags.watch === true) return watchChecks(ctx, root);
  const { findings } = await runCheck(root, strict, only);
  const note = captureNote(root);
  const failed = findings.some((f) => f.severity === "error");
  if (ctx.json) {
    printJson({ ok: !failed, strict, findings, notes: note ? [note] : [] });
  } else {
    await printFindings(findings, ctx.log);
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
  await printFindings(findings, ctx.log);
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
