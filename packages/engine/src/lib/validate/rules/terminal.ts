import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { checkRecording, scanTokens } from "../../recording";
import type { TerminalRecording } from "../../frames/terminal";
import { hasFrame, type Action } from "../../../schema/demo";
import type { Finding, Rule } from "../types";

const docs = (rule: string) => `https://live-ish.dev/errors/${rule}`;

type Read = { rec: TerminalRecording } | { problem: string };

function read(file: string): Read {
  if (!existsSync(file)) return { problem: "missing" };
  try {
    return { rec: JSON.parse(readFileSync(file, "utf8")) as TerminalRecording };
  } catch (error) {
    return { problem: (error as Error).message };
  }
}

function terminalRange(root: string, deck: Parameters<Rule["run"]>[0]["deck"]): Finding[] {
  const findings: Finding[] = [];
  const add = (where: string, message: string, fix: string) => findings.push({ rule: "terminal-range", severity: "error", where, message, fix, docs: docs("terminal-range") });
  for (const demo of deck.demos) {
    for (const page of demo.pages) {
      if (!hasFrame(page) || page.frame.kind !== "terminal") continue;
      const script = `${demo.folder}/demo.ts`;
      const name = page.frame.recording ?? "session";
      const rel = `${demo.folder}/recordings/${name}.json`;
      const loaded = read(path.join(root, rel));
      if ("problem" in loaded) {
        const missing = loaded.problem === "missing";
        add(`${script}: ${page.beat}`, missing ? `There is no recording at ${rel}.` : `${rel} is not valid JSON: ${loaded.problem}`, `Run \`live-ish record ${demo.id}\`.`);
        continue;
      }
      for (const problem of checkRecording(loaded.rec)) add(`${rel}`, problem, `Run \`live-ish record ${demo.id}\`.`);
      const last = Array.isArray(loaded.rec.lines) ? loaded.rec.lines.length : 0;
      // Ranges reveal the recording in order, so each starts where the one before stopped.
      let shown = 0;
      for (const step of page.steps) {
        for (const action of step.actions) {
          if (action.type !== "terminal") continue;
          const [from, to] = (action as Extract<Action, { type: "terminal" }>).lines;
          const where = `${script}: ${page.beat}, step ${step.id}, terminal`;
          if (from < 1 || from > to) add(where, `The range [${from}, ${to}] runs backwards or starts before line 1.`, "Use [first, last], counting from line 1.");
          else if (to > last) add(where, `The range [${from}, ${to}] runs past line ${last}, the last line of ${rel}.`, `End the range at ${last} or below, or record the session again.`);
          if (from > shown + 1) add(where, `Lines ${shown + 1} to ${from - 1} are never shown: the range starts at ${from} and the step before stopped at ${shown}.`, `Start this range at ${shown + 1}.`);
          shown = Math.max(shown, to);
        }
      }
    }
  }
  return findings;
}

function terminalToken(root: string, deck: Parameters<Rule["run"]>[0]["deck"]): Finding[] {
  const findings: Finding[] = [];
  for (const demo of deck.demos) {
    const dir = path.join(root, demo.folder, "recordings");
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
      const rel = `${demo.folder}/recordings/${file}`;
      const loaded = read(path.join(dir, file));
      if (!("rec" in loaded) || !Array.isArray(loaded.rec.lines)) continue;
      for (const hit of scanTokens(loaded.rec.lines)) {
        findings.push({
          rule: "terminal-token",
          severity: "error",
          where: `${rel}: line ${hit.line}`,
          message: `Line ${hit.line} looks like a credential (${hit.kind}).`,
          fix: `Revoke it if it is real, take it out of the session, then run \`live-ish record ${demo.id}\`.`,
          docs: docs("terminal-token"),
        });
      }
    }
  }
  return findings;
}

export const rules: Rule[] = [
  {
    id: "terminal-range",
    tier: "integrity",
    summary: "A terminal step's line range stays inside the recording, and steps leave no gap between them.",
    run: ({ root, deck }) => terminalRange(root, deck),
  },
  {
    id: "terminal-token",
    tier: "integrity",
    summary: "A recording holds no line that looks like a registry token, an API key or a private key.",
    run: ({ root, deck }) => terminalToken(root, deck),
  },
];
