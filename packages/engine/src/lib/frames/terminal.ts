import { existsSync, readFileSync } from "node:fs";
import type { BuildDef } from "./types";
import { esc } from "./shells/common";

/**
 * The terminal frame kind. A recording is served as hidden lines and the runtime's `terminal` action
 * reveals ranges. `env` is a free map: the status bar shows whatever it holds.
 */
export interface TerminalLine {
  line: number;
  delay: number;
  text: string;
  kind: "cmd" | "out" | "comment";
  /** Written by hand. The window chip then reads "Example session". */
  example?: boolean;
}

export interface TerminalRecording {
  id: string;
  capturedAt: string;
  env: Record<string, string>;
  lines: TerminalLine[];
}

export const PLAYER_CSS = "/live-ish/terminal/player.css";
export const PLAYER_JS = "/live-ish/terminal/player.js";

export function readRecording(file: string): TerminalRecording | null {
  if (!existsSync(/*turbopackIgnore: true*/ file)) return null;
  return JSON.parse(readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as TerminalRecording;
}

/** One `<li>` per recording line, hidden, as the runtime's `terminal` action expects. */
export function renderLines(rec: TerminalRecording): string {
  return rec.lines
    .map((l) => {
      const text = l.kind === "cmd" ? l.text.replace(/^\$ /, "") : l.text;
      const prompt = l.kind === "cmd" ? '<span class="term__prompt" aria-hidden="true">$ </span>' : "";
      const example = l.example ? " data-example" : "";
      return `<li data-line="${l.line}" data-kind="${l.kind}" data-delay="${l.delay}"${example} style="--n: ${text.length}" hidden>${prompt}<span class="term__text">${esc(text)}</span></li>`;
    })
    .join("\n      ");
}

/** The status bar: each `env` entry, in the order the recording lists them. */
function renderEnv(rec: TerminalRecording): string {
  return Object.entries(rec.env)
    .map(([k, v]) => `<span class="wrap-window__pair"><span class="wrap-window__key">${esc(k)}</span> <span class="wrap-window__value">${esc(v)}</span></span>`)
    .join("");
}

function renderCaptured(rec: TerminalRecording): string {
  const d = new Date(rec.capturedAt);
  const label = Number.isNaN(d.getTime()) ? rec.capturedAt : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  // "Recorded <date>" while recorded lines are on screen; "Example session" once an example line is
  // revealed (the CSS swaps them), so nothing illustrative claims to be a recording.
  return `<span class="wrap-window__chip-recorded">Recorded <time datetime="${esc(rec.capturedAt)}">${esc(label)}</time></span><span class="wrap-window__chip-example">Example session</span>`;
}

/** The player: every recording line in a scroller the runtime keeps at its latest line. */
export function terminalBody(rec: TerminalRecording): string {
  return [
    `<link rel="stylesheet" href="${PLAYER_CSS}">`,
    '<div class="term" id="term">',
    '  <div class="term__scroll" data-terminal tabindex="0" role="region" aria-label="Terminal output">',
    '    <ol class="term__lines" id="lines">',
    `      ${renderLines(rec)}`,
    "    </ol>",
    "  </div>",
    "</div>",
    `<script type="module" src="${PLAYER_JS}"></script>`,
  ].join("\n");
}

/** What the terminal-window shell shows around the lines. */
export function terminalWindow(def: BuildDef, rec: TerminalRecording) {
  return { ...def.terminal!.window, chip: renderCaptured(rec), status: renderEnv(rec) };
}
