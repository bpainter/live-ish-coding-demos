import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Our own read of the Agent Skills limits. `skills-ref` runs in `pnpm skills:ref`, pinned, but it needs
 * Python, so `pnpm test` holds the same limits with nothing to install.
 */

export const LIMITS = { name: 64, description: 1024, bodyLines: 500, bodyTokens: 5000, instructionLines: 200 };

const PORTABLE = ["name", "description", "license", "compatibility", "metadata"];
/** Keys that must never reach a shared `SKILL.md`, or the other tool's copy. */
export const TOOL_ONLY = ["disable-model-invocation", "allowed-tools", "allow_implicit_invocation"];

export const MANUAL = ["deploy-deck", "prepare-release", "upgrade-deck"];
export const DECK_SKILLS = ["add-copy-slide", "add-terminal-demo", "add-web-demo", "apply-chrome-theme", "check-deck", "create-chrome-theme", "deploy-deck", "upgrade-deck", "write-speaker-notes"];
export const CONTRIBUTOR_SKILLS = ["add-chrome-theme", "add-parity-row", "add-validator-rule", "prepare-release"];

/** Every skill says these, word for word. */
export const SKILL_RULES = ["Use the public CLI and schema. Never write engine internals by hand.", "Run `live-ish check` before saying a task is done.", "Never state browser support without `live-ish support`.", "If `check` fails twice on the same issue, stop and report it."];

export interface ParsedSkill {
  keys: string[];
  fields: Record<string, string>;
  metadata: Record<string, string>;
  body: string;
}

/** Enough YAML for a frontmatter that is flat apart from `metadata`. */
export function parseSkill(text: string): ParsedSkill | null {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!match) return null;
  const skill: ParsedSkill = { keys: [], fields: {}, metadata: {}, body: match[2] };
  let inMetadata = false;
  for (const line of match[1].split("\n")) {
    const top = /^([a-zA-Z_-]+):\s*(.*)$/.exec(line);
    const nested = /^\s+([a-zA-Z_-]+):\s*(.*)$/.exec(line);
    if (top) {
      skill.keys.push(top[1]);
      skill.fields[top[1]] = top[2];
      inMetadata = top[1] === "metadata";
    } else if (nested && inMetadata) skill.metadata[nested[1]] = nested[2].replace(/^["']|["']$/g, "");
  }
  return skill;
}

/** A cautious count: about 3.5 characters a token, so the real count sits under this one. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 3.5);

/** Each `references/...` a file names, as written. */
const referencesIn = (text: string) => [...text.matchAll(/\breferences\/[\w./-]+\.\w+/g)].map((m) => m[0].replace(/[.,:;]$/, ""));

/** One copy of a skill, generated or source. `allowed` adds the keys of its tool. */
export function lintSkill(dir: string, schema: string, allowed: string[] = []): string[] {
  const problems: string[] = [];
  const name = path.basename(dir);
  const file = path.join(dir, "SKILL.md");
  if (!existsSync(file)) return [`${name}: no SKILL.md`];
  const skill = parseSkill(readFileSync(file, "utf8"));
  if (!skill) return [`${name}: SKILL.md does not start with frontmatter`];
  const known = [...PORTABLE, ...allowed];
  for (const key of skill.keys) if (!known.includes(key)) problems.push(`${name}: "${key}" does not belong in this frontmatter`);

  const declared = skill.fields.name;
  if (declared !== name) problems.push(`${name}: name "${declared}" must match its folder`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(declared ?? "") || (declared ?? "").length > LIMITS.name) problems.push(`${name}: name breaks the spec`);

  const description = skill.fields.description ?? "";
  if (!description) problems.push(`${name}: no description`);
  if (description.length > LIMITS.description) problems.push(`${name}: description is ${description.length} characters`);
  if (!/\buse\b[^.]*\bwhen\b/i.test(description)) problems.push(`${name}: description must say when to trigger`);
  if (!/\bdo not use\b/i.test(description)) problems.push(`${name}: description must say when not to trigger`);
  if (skill.metadata["live-ish-schema"] !== schema) problems.push(`${name}: metadata.live-ish-schema must be "${schema}"`);

  const lines = skill.body.split("\n").length;
  if (lines >= LIMITS.bodyLines) problems.push(`${name}: body is ${lines} lines`);
  if (estimateTokens(skill.body) >= LIMITS.bodyTokens) problems.push(`${name}: body is about ${estimateTokens(skill.body)} tokens`);
  for (const rule of SKILL_RULES) if (!skill.body.includes(rule)) problems.push(`${name}: missing the rule "${rule}"`);

  const refDir = path.join(dir, "references");
  if (existsSync(refDir)) {
    for (const entry of readdirSync(refDir)) {
      const ref = path.join(refDir, entry);
      if (statSync(ref).isDirectory()) problems.push(`${name}: references/${entry} nests a folder, and references stay one level deep`);
      else if (referencesIn(readFileSync(ref, "utf8")).length) problems.push(`${name}: references/${entry} points at another reference, and references stay one level deep`);
    }
  }
  return problems;
}

/** The references a `SKILL.md` names that its folder does not hold. */
export function missingReferences(dir: string): string[] {
  return referencesIn(readFileSync(path.join(dir, "SKILL.md"), "utf8")).filter((ref) => !existsSync(path.join(dir, ref)));
}

export interface LiveIshCommand {
  text: string;
  words: string[];
  flags: string[];
}

/** Every `live-ish ...` span in a text: its leading words, and any flags. */
export function commandsIn(text: string): LiveIshCommand[] {
  const out: LiveIshCommand[] = [];
  for (const m of text.matchAll(/`(?:pnpm )?live-ish ([^`]+)`/g)) {
    const parts = m[1].trim().split(/\s+/);
    const end = parts.findIndex((p) => !/^[a-z][a-z-]*$/.test(p));
    out.push({ text: m[0], words: end === -1 ? parts : parts.slice(0, end), flags: parts.filter((p) => p.startsWith("--")).map((p) => p.replace(/=.*$/, "")) });
  }
  return out;
}

/** `pnpm <script>` spans in a text, as the script names they need. `--filter` forms are skipped. */
export function pnpmScriptsIn(text: string): string[] {
  return [...text.matchAll(/`pnpm ([a-z][\w:-]*)[^`]*`/g)].map((m) => m[1]).filter((s) => s !== "live-ish" && s !== "up" && s !== "create" && s !== "exec" && s !== "install");
}
