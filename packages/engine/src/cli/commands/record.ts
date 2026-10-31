import { spawnSync } from "node:child_process";
import { closeSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { UsageError } from "../args";
import { CliError, EXIT, requireDeck, printJson, type Ctx, type ExitCode } from "../io";
import { keepExamples, lineDelay, outputLines, parseSession, scanTokens, type SessionEntry } from "../../lib/recording";
import type { TerminalLine, TerminalRecording } from "../../lib/frames/terminal";

/** A session runs on the author's laptop. A command that hangs must not hang the recorder with it. */
const COMMAND_TIMEOUT_MS = 60_000;

function osName(): string {
  if (process.platform === "darwin") {
    const run = spawnSync("sw_vers", ["-productVersion"], { encoding: "utf8" });
    if (run.status === 0) return `macOS ${run.stdout.trim()}`;
  }
  return `${os.type()} ${os.release()}`;
}

/** Runs one command with stdout and stderr on one file, so they interleave as a terminal shows them. */
function runCommand(command: string, cwd: string, work: string): { output: string; status: number | null; timedOut: boolean } {
  const log = path.join(work, "output.log");
  const fd = openSync(log, "w");
  try {
    const run = spawnSync("sh", ["-c", command], {
      cwd,
      stdio: ["ignore", fd, fd],
      timeout: COMMAND_TIMEOUT_MS,
      env: { ...process.env, CI: "", FORCE_COLOR: "0", NO_COLOR: "1", TERM: "dumb" },
    });
    return { output: readFileSync(log, "utf8"), status: run.status, timedOut: run.error !== undefined };
  } finally {
    closeSync(fd);
  }
}

type Draft = Omit<TerminalLine, "line">;

/** Runs a session in a temp copy of the demo folder, so a command never touches the real one. */
function runSession(folder: string, entries: SessionEntry[]): Draft[] {
  const work = realpathSync(mkdtempSync(path.join(os.tmpdir(), "live-ish-record-")));
  const session = path.join(work, "session");
  // Both spellings of the temp path: macOS links /var to /private/var, and tools print either.
  const paths = [session, session.replace(/^\/private/, "")];
  try {
    cpSync(folder, session, { recursive: true, filter: (src) => !["recordings", "node_modules"].includes(path.basename(src)) });
    const lines: Draft[] = [];
    for (const entry of entries) {
      if (entry.kind === "comment") {
        lines.push({ kind: "comment", text: entry.text, delay: lineDelay("comment", false) });
        continue;
      }
      lines.push({ kind: "cmd", text: `$ ${entry.text}`, delay: lineDelay("cmd", false) });
      const { output, status, timedOut } = runCommand(entry.text, session, work);
      const printed = outputLines(output, os.homedir(), paths);
      printed.forEach((text, i) => lines.push({ kind: "out", text, delay: lineDelay("out", i === 0) }));
      if (timedOut) throw new CliError(`\`${entry.text}\` ran past ${COMMAND_TIMEOUT_MS / 1000} seconds. Nothing was written.`, EXIT.findings, "A session command must exit by itself.");
      if (status !== 0 && !entry.expectFail) throw new CliError(`\`${entry.text}\` exited with ${status}. Nothing was written.${tail(printed)}`, EXIT.findings, "Fix the command, or end the line with `# expect-fail` if the failure is the point.");
      if (status === 0 && entry.expectFail) throw new CliError(`\`${entry.text}\` is marked # expect-fail but it passed. Nothing was written.`, EXIT.findings, "Remove the marker, or make the command fail.");
    }
    return lines;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** The end of a failed command's output: the part that names the problem. */
function tail(lines: string[]): string {
  return lines.slice(-8).map((l) => `\n  ${l}`).join("");
}

export interface Recorded {
  file: string;
  lines: number;
  commands: number;
}

/** Writes `recordings/<session>.json` for a demo. Writes nothing on a failed command or a token. */
export function recordDemo(root: string, id: string, session = "session"): Recorded {
  const folder = path.join(root, "demos", id);
  if (!existsSync(folder)) {
    const demos = existsSync(path.join(root, "demos")) ? readdirSync(path.join(root, "demos")).sort().join(", ") : "none";
    throw new UsageError(`There is no demo "${id}" under demos/. Found: ${demos || "none"}.`);
  }
  const source = path.join(folder, `${session}.txt`);
  if (!existsSync(source)) throw new CliError(`There is no ${path.relative(root, source)}.`, EXIT.findings, "Write one command per line in it.");
  const entries = parseSession(readFileSync(source, "utf8"));
  if (!entries.some((e) => e.kind === "cmd")) throw new CliError(`${path.relative(root, source)} has no commands.`, EXIT.findings);

  const file = path.join(folder, "recordings", `${session}.json`);
  const previous = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as TerminalRecording).lines : [];
  const lines = keepExamples(runSession(folder, entries), previous);

  const hits = scanTokens(lines);
  if (hits.length) {
    // The scan names the line and the kind, and never prints the value.
    throw new CliError(`Stopped: ${hits.map((h) => `line ${h.line} looks like a credential (${h.kind})`).join(", ")}. Nothing was written.`, EXIT.findings, "Revoke it if it is real, and change the command so it prints no secret.");
  }

  const recording: TerminalRecording = { id: session, capturedAt: new Date().toISOString(), env: { os: osName(), node: process.versions.node }, lines };
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(recording, null, 2)}\n`);
  return { file: path.relative(root, file), lines: lines.length, commands: entries.filter((e) => e.kind === "cmd").length };
}

export async function record(ctx: Ctx): Promise<ExitCode> {
  const root = requireDeck(ctx);
  const [id] = ctx.positionals;
  if (!id) throw new UsageError("Name the demo: live-ish record <id>.");
  const session = typeof ctx.flags.session === "string" ? ctx.flags.session : undefined;
  const result = recordDemo(root, id, session);
  if (ctx.json) printJson({ ok: true, ...result });
  else ctx.log(`Recorded ${result.commands} command${result.commands === 1 ? "" : "s"}, ${result.lines} line${result.lines === 1 ? "" : "s"}, to ${result.file}.`);
  return EXIT.ok;
}
