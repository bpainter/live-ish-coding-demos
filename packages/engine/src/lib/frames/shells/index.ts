import { bare } from "./bare";
import { terminalWindow } from "./terminal-window";
import type { ShellDef } from "./types";

export type { ShellContext, ShellDef, ShellRender } from "./types";

/** The frame shell registry. Ids are open: a deck's own shells register here in a later release. */
export const SHELLS: Record<string, ShellDef> = {
  bare,
  "terminal-window": terminalWindow,
};

export function shellDef(id: string): ShellDef {
  const def = SHELLS[id];
  if (!def) throw new Error(`Unknown frame shell "${id}". Known shells: ${Object.keys(SHELLS).join(", ")}.`);
  return def;
}
