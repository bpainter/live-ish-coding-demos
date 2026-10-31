import os from "node:os";
import type { TerminalLine, TerminalRecording } from "./frames/terminal";

/**
 * The pure half of `live-ish record`: reading `session.txt`, cleaning what a command printed, and
 * the token scan shared by `record` and the `terminal-token` rule. No file or process work here, so
 * the tests can break one case at a time.
 */

/**
 * Credentials that must never reach a projector or a repository. Registry and host tokens have
 * stable prefixes, so the scan can stay strict without flagging ordinary output.
 */
const TOKEN_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "npm token", pattern: /npm_[A-Za-z0-9]{36}/ },
  { name: "npm auth setting", pattern: /_authToken=/ },
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}/ },
  { name: "GitHub token", pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}/ },
  { name: "GitLab token", pattern: /\bglpat-[A-Za-z0-9_-]{20,}/ },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Slack token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: "API key", pattern: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g;

/** Pause before a line appears, in ms. The runtime caps each at 350. */
const DELAY = { comment: 300, cmd: 650, firstOutput: 900, output: 110 };

/** One entry of `session.txt`. */
export type SessionEntry = { kind: "comment"; text: string } | { kind: "cmd"; text: string; expectFail: boolean };

/**
 * `session.txt`: one command per line. A `#` line is a comment that shows in the recording. A
 * command may end in `# expect-fail`, or follow a line holding only that marker: a failure is then
 * what the session is showing.
 */
export function parseSession(text: string): SessionEntry[] {
  const out: SessionEntry[] = [];
  let expectNext = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#\s*expect-fail$/.test(line)) {
      expectNext = true;
      continue;
    }
    if (line.startsWith("#")) {
      out.push({ kind: "comment", text: line });
      continue;
    }
    const marked = /^(.*?)\s+#\s*expect-fail$/.exec(line);
    out.push({ kind: "cmd", text: marked ? marked[1] : line, expectFail: expectNext || Boolean(marked) });
    expectNext = false;
  }
  return out;
}

/**
 * One raw terminal line as the recorder stores it. Color goes first, so a token split by color
 * codes still reads whole for the scan. Text before a carriage return is what a progress bar has
 * already overwritten, so only the last part is kept, as a terminal would show it.
 */
export function sanitize(line: string, home: string = os.homedir(), work: string[] = []): string {
  let clean = line.replace(ANSI, "").replace(/\r+$/, "");
  clean = clean.slice(clean.lastIndexOf("\r") + 1);
  for (const dir of work) clean = clean.split(dir).join(".");
  return (home ? clean.split(home).join("~") : clean).trimEnd();
}

/** What one command printed, as lines. Trailing blank lines are dropped; a blank line inside stays. */
export function outputLines(raw: string, home?: string, work?: string[]): string[] {
  const lines = raw.split("\n").map((l) => sanitize(l, home, work));
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines;
}

/** The lines that match a token pattern. The hit names the kind of token and never quotes it. */
export function scanTokens(lines: { line: number; text: string }[]): { line: number; kind: string }[] {
  const hits: { line: number; kind: string }[] = [];
  for (const l of lines) for (const t of TOKEN_PATTERNS) if (t.pattern.test(l.text)) hits.push({ line: l.line, kind: t.name });
  return hits;
}

/** Numbers a recording's lines from 1. */
export function renumber(lines: Omit<TerminalLine, "line">[]): TerminalLine[] {
  return lines.map((l, i) => ({ ...l, line: i + 1 }));
}

export function lineDelay(kind: TerminalLine["kind"], firstOutput: boolean): number {
  if (kind === "cmd") return DELAY.cmd;
  if (kind === "comment") return DELAY.comment;
  return firstOutput ? DELAY.firstOutput : DELAY.output;
}

/**
 * Hand-written lines (`example: true`) survive a new recording. Each one goes back after the same
 * number of recorded lines it followed, or at the end when the recording got shorter, so nothing
 * illustrative is lost and every line still claims only what it is.
 */
export function keepExamples(recorded: Omit<TerminalLine, "line">[], previous: TerminalLine[] = []): TerminalLine[] {
  const out = [...recorded];
  let before = 0;
  let added = 0;
  for (const line of previous) {
    if (!line.example) {
      before++;
      continue;
    }
    const { line: _old, ...rest } = line;
    out.splice(Math.min(before + added, out.length), 0, rest);
    added++;
  }
  return renumber(out);
}

/** Shape problems in a recording file, in words: numbering, kinds, prompts, delays, control codes. */
export function checkRecording(rec: TerminalRecording): string[] {
  const problems: string[] = [];
  if (!/^[a-z0-9-]+$/.test(rec.id)) problems.push(`id "${rec.id}" is not lowercase letters, digits and dashes`);
  if (Number.isNaN(new Date(rec.capturedAt).getTime())) problems.push(`capturedAt "${rec.capturedAt}" is not a date`);
  if (!Array.isArray(rec.lines) || rec.lines.length === 0) return [...problems, "the recording has no lines"];
  rec.lines.forEach((l, i) => {
    if (l.line !== i + 1) problems.push(`line ${i + 1} is numbered ${l.line}`);
    if (!["cmd", "out", "comment"].includes(l.kind)) problems.push(`line ${l.line}: kind "${l.kind}"`);
    if (l.kind === "cmd" && !l.text.startsWith("$ ")) problems.push(`line ${l.line}: a cmd line starts with "$ "`);
    if (l.kind === "comment" && !l.text.startsWith("#")) problems.push(`line ${l.line}: a comment line starts with "#"`);
    if (!Number.isInteger(l.delay) || l.delay < 0) problems.push(`line ${l.line}: delay ${l.delay}`);
    if (l.text !== sanitize(l.text, "")) problems.push(`line ${l.line}: holds color codes or a carriage return`);
  });
  return problems;
}
