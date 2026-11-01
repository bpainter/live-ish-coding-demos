import { bare } from "./bare";
import { BASE_CSS } from "./common";
import { terminalWindow } from "./terminal-window";
import type { ShellDef } from "./types";

export type { ShellContext, ShellDef, ShellRender } from "./types";

/** The frame shell registry: the engine's two, and whatever the deck's `shells/` folder adds. */
export const SHELLS: Record<string, ShellDef> = {
  bare,
  "terminal-window": terminalWindow,
};

/** The deck's own shells, as `.live-ish/deck.gen.ts` hands them over. */
export function registerShells(shells: ShellDef[]) {
  for (const shell of shells) SHELLS[shell.id] = shell;
}

export interface ShellConfig {
  id: string;
  /** Markup before the shown block. Classes start with `wrap-`, and nothing here takes focus. */
  before?: string;
  /** Markup after it. */
  after?: string;
  /** Root-relative stylesheets under public/, in `@layer wrapper`. */
  styles?: string[];
  /** Root-relative scripts, loaded as instrumentation. */
  scripts?: string[];
  /** A class on the shown slot, such as `wrap-shown--bare`. */
  shownClass?: string;
  /** What this shell must never use, checked in its markup and scripts. */
  banned?: { name: string; pattern: RegExp }[];
}

/**
 * `shells/<id>.ts`: context around the shown block, never shown as code. A page opens one with
 * `shell: { id }`, and may lift ids out of the slot with `outside` or let the document scroll with
 * `scrolls`. `check` lints the markup and the stylesheets.
 */
export function defineShell({ id, before = "", after = "", styles = [], scripts = [], shownClass, banned = [] }: ShellConfig): ShellDef {
  return { id, banned, render: () => ({ before, after, shownClass, styles: [BASE_CSS, ...styles], scripts }) };
}

export function shellDef(id: string): ShellDef {
  const def = SHELLS[id];
  if (!def) throw new Error(`Unknown frame shell "${id}". Known shells: ${Object.keys(SHELLS).join(", ")}.`);
  return def;
}
