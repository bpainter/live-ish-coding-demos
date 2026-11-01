import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listThemes } from "./chrome-themes";

/**
 * Agent skills, generated from one source so the copies each tool reads cannot drift.
 *
 * `packages/engine/skills/<name>/` is the source. Its `SKILL.md` holds portable frontmatter only.
 * `claude.yaml` is merged into the `.claude/skills` copy, and `openai.yaml` becomes `agents/openai.yaml`
 * in the `.agents/skills` copy, so a setting one tool reads never reaches the other. A deck keeps a lock
 * file with the hash of what the engine last wrote: that hash tells a file the engine moved on from
 * (safe to rewrite) from a file a person edited (never overwritten).
 */

const ENGINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const SKILL_SOURCE = path.join(ENGINE, "skills");
export const AGENTS_OUTPUT = ".agents/skills";
export const CLAUDE_OUTPUT = ".claude/skills";
export const OUTPUTS = [AGENTS_OUTPUT, CLAUDE_OUTPUT] as const;
export const LOCK = ".live-ish/skills.lock";
export const INCOMING = ".live-ish/skills-incoming";

/** Deck skills reach every deck. Contributor skills stay in the monorepo. */
export type SkillScope = "deck" | "repo";

export const hashOf = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

const readText = (file: string): string | null => (existsSync(file) ? readFileSync(file, "utf8") : null);

/** The value of one frontmatter line, unquoted. Enough for the flat fields this file reads. */
export function frontmatterValue(text: string, key: string): string | null {
  const head = /^---\n([\s\S]*?)\n---/.exec(text)?.[1];
  const value = head && new RegExp(`^\\s*${key}:\\s*(.+)$`, "m").exec(head)?.[1];
  return value ? value.trim().replace(/^["']|["']$/g, "") : null;
}

/** Adds tool-only lines to the end of the frontmatter, leaving the shared text byte for byte. */
export function mergeFrontmatter(skill: string, extra: string): string {
  const end = skill.indexOf("\n---", 3);
  if (!skill.startsWith("---\n") || end === -1) throw new Error("A SKILL.md must start with frontmatter.");
  return `${skill.slice(0, end)}\n${extra.trim()}${skill.slice(end)}`;
}

/** `references/themes.md`: the built-in themes, from the theme files, so a skill cannot disagree. */
export function themesReference(): string {
  const rows = listThemes().map((t) => `| \`${t.id}\` | ${t.name} | ${t.traits.join(". ")}. | ${String(t.fonts.sans)}, ${String(t.fonts.mono)} | ${t.motion.fade} ms${t.motion.effect === "none" ? "" : `, ${t.motion.effect}`} |`);
  return [
    "# Built-in themes",
    "",
    "Generated from the engine's theme files by `live-ish skills sync`. `live-ish themes --json` lists the same themes, plus any custom theme in this deck, with every token.",
    "",
    "| ID | Name | Look | Fonts | Motion |",
    "|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

/** Files a skill reads that come from engine data, not from its source folder. */
const GENERATED: Record<string, () => string> = { "references/themes.md": themesReference };
const THEME_SKILLS = ["apply-chrome-theme", "create-chrome-theme"];

export interface SkillSource {
  name: string;
  audience: "deck" | "contributor";
  /** `metadata.live-ish-schema`: the schema this skill targets. */
  schema: string | null;
  dir: string;
}

export function skillSources(): SkillSource[] {
  if (!existsSync(SKILL_SOURCE)) return [];
  return readdirSync(SKILL_SOURCE, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(path.join(SKILL_SOURCE, e.name, "SKILL.md")))
    .map((e) => {
      const dir = path.join(SKILL_SOURCE, e.name);
      const text = readFileSync(path.join(dir, "SKILL.md"), "utf8");
      return { name: e.name, audience: frontmatterValue(text, "live-ish-audience") === "contributor" ? ("contributor" as const) : ("deck" as const), schema: frontmatterValue(text, "live-ish-schema"), dir };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** `references/` of one skill, relative to the skill folder. */
function references(dir: string): Map<string, string> {
  const files = new Map<string, string>();
  const folder = path.join(dir, "references");
  if (!existsSync(folder)) return files;
  for (const e of readdirSync(folder, { withFileTypes: true })) {
    if (e.isFile() && e.name !== ".DS_Store") files.set(`references/${e.name}`, readFileSync(path.join(folder, e.name), "utf8"));
  }
  return files;
}

/**
 * Every generated file, keyed by its path from the deck or repo root. `evals/` stays out: it tests a
 * skill and is no part of one. This is the seam for anything that derives from engine data: `sync`,
 * `--check` and the lock file all follow what it returns.
 */
export function renderSkills(scope: SkillScope = "deck"): Map<string, string> {
  const out = new Map<string, string>();
  for (const skill of skillSources()) {
    if (scope === "deck" && skill.audience === "contributor") continue;
    const shared = readFileSync(path.join(skill.dir, "SKILL.md"), "utf8");
    const claude = readText(path.join(skill.dir, "claude.yaml"));
    const openai = readText(path.join(skill.dir, "openai.yaml"));
    const refs = references(skill.dir);
    if (THEME_SKILLS.includes(skill.name)) for (const [file, make] of Object.entries(GENERATED)) refs.set(file, make());
    const forAgents = `${AGENTS_OUTPUT}/${skill.name}`;
    const forClaude = `${CLAUDE_OUTPUT}/${skill.name}`;
    out.set(`${forAgents}/SKILL.md`, shared);
    out.set(`${forClaude}/SKILL.md`, claude ? mergeFrontmatter(shared, claude) : shared);
    if (openai) out.set(`${forAgents}/agents/openai.yaml`, openai);
    for (const [file, body] of refs) {
      out.set(`${forAgents}/${file}`, body);
      out.set(`${forClaude}/${file}`, body);
    }
  }
  return new Map([...out].sort(([a], [b]) => a.localeCompare(b)));
}

export interface SkillsLock {
  /** Bumped only for a breaking change to this file's shape. */
  version: number;
  /** The engine that last wrote the skills. */
  engine: string;
  /** The oldest schema any skill here targets, which is what `skills-stale` compares. */
  "live-ish-schema": string;
  /** The schema each skill on disk targets, from its `metadata.live-ish-schema`. */
  skills: Record<string, string>;
  /** The hash of what the engine last wrote, per generated file. */
  files: Record<string, string>;
  /** Copies the author deleted, as `.claude/skills/deploy-deck`. They stay deleted. */
  deleted: string[];
}

export function readLock(root: string): SkillsLock | null {
  try {
    const lock = JSON.parse(readFileSync(path.join(root, LOCK), "utf8")) as Partial<SkillsLock>;
    return { version: 1, engine: "", "live-ish-schema": "", skills: {}, deleted: [], ...lock, files: lock.files ?? {} };
  } catch {
    return null;
  }
}

/** `.claude/skills/x/SKILL.md` to `.claude/skills/x`. */
const copyOf = (file: string) => file.split("/").slice(0, 3).join("/");
const skillOf = (copy: string) => copy.split("/")[2];
const outputOf = (copy: string) => copy.split("/").slice(0, 2).join("/");
const incomingFor = (file: string) => `${INCOMING}/${skillOf(file)}/${file.startsWith(CLAUDE_OUTPUT) ? "claude" : "agents"}/${file.split("/").slice(3).join("/")}`;

export interface SkillEdit {
  file: string;
  /** Where the engine's new version waits for the author. */
  incoming: string;
}

export interface SkillPlan {
  /** New files, and files the engine last wrote and has since changed. */
  write: string[];
  /** Files already on disk from an older engine, a subset of `write`. */
  outdated: string[];
  /** Files the author changed. Never overwritten without `force`. */
  edited: SkillEdit[];
  /** Files of a skill the engine no longer ships, untouched, so safe to remove. */
  remove: string[];
  /** Files of a skill the engine no longer ships, which the author changed. */
  retired: string[];
  /** Copies the author deleted. */
  deleted: string[];
}

/**
 * Whether this deck has the engine's skills at all. A `--no-agents` deck has neither a lock nor a
 * copy. An author's own skill in the same folder does not count: `upgrade` must not move in beside it.
 */
export function hasSkills(root: string): boolean {
  if (existsSync(path.join(root, LOCK))) return true;
  return skillSources().some((s) => OUTPUTS.some((o) => existsSync(path.join(root, o, s.name))));
}

export interface PlanOptions {
  /** Bring back what the author deleted, as `add agents` does on request. */
  restore?: boolean;
  /** Overwrite the author's edits too. */
  force?: boolean;
}

/** What a sync would do to a deck, with no writes. `check` reads this, so it stays cheap and pure. */
export function planDeck(root: string, rendered: Map<string, string>, options: PlanOptions = {}): SkillPlan {
  const lock = readLock(root);
  const known = lock?.files ?? {};
  const deleted = new Set(options.restore ? [] : (lock?.deleted ?? []));
  const plan: SkillPlan = { write: [], outdated: [], edited: [], remove: [], retired: [], deleted: [] };
  // A folder the lock knew and the disk does not is a deletion, and that is the author's call.
  if (lock && !options.restore) {
    const knownCopies = new Set(Object.keys(known).map(copyOf));
    for (const copy of new Set([...rendered.keys()].map(copyOf))) {
      const output = existsSync(path.join(root, outputOf(copy)));
      if (!existsSync(path.join(root, copy)) && (knownCopies.has(copy) || !output)) deleted.add(copy);
    }
  }
  for (const [file, body] of rendered) {
    if (deleted.has(copyOf(file))) continue;
    const disk = readText(path.join(root, file));
    if (disk === body) continue;
    if (disk === null) plan.write.push(file);
    else if (known[file] === hashOf(disk)) {
      plan.write.push(file);
      plan.outdated.push(file);
    } else if (options.force) plan.write.push(file);
    else plan.edited.push({ file, incoming: incomingFor(file) });
  }
  for (const [file, hash] of Object.entries(known)) {
    if (rendered.has(file)) continue;
    const disk = readText(path.join(root, file));
    if (disk === null) continue;
    (hashOf(disk) === hash || options.force ? plan.remove : plan.retired).push(file);
  }
  plan.deleted = [...deleted].sort();
  return plan;
}

function pruneEmpty(root: string, file: string) {
  for (let dir = path.dirname(path.join(root, file)); dir !== root && readdirSync(dir).length === 0; dir = path.dirname(dir)) rmdirSync(dir);
}

/** Carries a plan out, and records it in the lock. */
export function applyPlan(root: string, rendered: Map<string, string>, plan: SkillPlan, engine: string): void {
  const previous = readLock(root);
  for (const file of plan.write) {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, rendered.get(file) as string);
  }
  for (const file of plan.remove) {
    rmSync(path.join(root, file));
    pruneEmpty(root, file);
  }
  const incoming = path.join(root, INCOMING);
  rmSync(incoming, { recursive: true, force: true });
  for (const { file, incoming: target } of plan.edited) {
    mkdirSync(path.dirname(path.join(root, target)), { recursive: true });
    writeFileSync(path.join(root, target), rendered.get(file) as string);
  }
  const edited = new Set(plan.edited.map((e) => e.file));
  const files: Record<string, string> = {};
  for (const [file, body] of rendered) {
    if (plan.deleted.includes(copyOf(file))) continue;
    // An edited file keeps its old hash, so it still reads as edited on the next run.
    if (edited.has(file)) {
      const hash = previous?.files[file];
      if (hash) files[file] = hash;
    } else files[file] = hashOf(body);
  }
  const skills: Record<string, string> = {};
  for (const copy of new Set(Object.keys(files).map(copyOf))) {
    const schema = frontmatterValue(readText(path.join(root, copy, "SKILL.md")) ?? "", "live-ish-schema");
    const name = skillOf(copy);
    if (schema && (!skills[name] || Number(schema) < Number(skills[name]))) skills[name] = schema;
  }
  const targets = Object.values(skills).map(Number);
  const newest = skillSources().map((s) => Number(s.schema)).filter(Number.isFinite);
  const lock: SkillsLock = { version: 1, engine, "live-ish-schema": String(targets.length ? Math.min(...targets) : Math.max(0, ...newest)), skills, files, deleted: plan.deleted };
  mkdirSync(path.dirname(path.join(root, LOCK)), { recursive: true });
  writeFileSync(path.join(root, LOCK), `${JSON.stringify(lock, null, 2)}\n`);
}

/** The `AGENTS.md` block the engine owns. `upgrade` replaces what sits between the markers, and nothing else. */
export const BLOCK_BEGIN = "<!-- BEGIN:live-ish -->";
export const BLOCK_END = "<!-- END:live-ish -->";

const template = (name: string) => readFileSync(path.join(ENGINE, "templates", "agents", name), "utf8");

export const agentsTemplate = () => template("AGENTS.md");
export const claudeTemplate = () => template("CLAUDE.md");

function blockRange(text: string): [number, number] | null {
  const start = text.indexOf(BLOCK_BEGIN);
  const end = text.indexOf(BLOCK_END);
  return start !== -1 && end > start ? [start, end + BLOCK_END.length] : null;
}

export function agentsBlock(): string {
  const text = agentsTemplate();
  const range = blockRange(text);
  if (!range) throw new Error("The AGENTS.md template has no live-ish block.");
  return text.slice(...range);
}

/** The file with a current block, or null when its markers are gone or out of order. */
export function refreshBlock(text: string): string | null {
  const range = blockRange(text);
  return range && `${text.slice(0, range[0])}${agentsBlock()}${text.slice(range[1])}`;
}

/** Puts the block above what the author already wrote, which stays as it was. */
export function prependBlock(text: string): string {
  return `${agentsBlock()}\n\n${text}`;
}

/** `AGENTS.md`, when it has a block that differs from this engine's. */
export function staleBlock(root: string): boolean {
  const text = readText(path.join(root, "AGENTS.md"));
  const fresh = text === null ? null : refreshBlock(text);
  return fresh !== null && fresh !== text;
}

/**
 * The monorepo's copies differ from the source: anything edited, missing or extra. Every file under
 * these two folders is generated here, where a deck's may also hold an author's own skills.
 */
export function repoDrift(root: string, rendered: Map<string, string>): string[] {
  const out = new Set<string>();
  for (const [file, body] of rendered) if (readText(path.join(root, file)) !== body) out.add(file);
  for (const output of OUTPUTS) {
    const dir = path.join(root, output);
    if (!existsSync(dir)) continue;
    for (const e of readdirSync(dir, { withFileTypes: true, recursive: true })) {
      if (!e.isFile() || e.name === ".DS_Store") continue;
      const file = path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join("/");
      if (!rendered.has(file)) out.add(file);
    }
  }
  return [...out].sort();
}

/** Rewrites the monorepo's copies from the source. No lock: the source sits beside them. */
export function writeRepo(root: string, rendered: Map<string, string>): void {
  for (const output of OUTPUTS) rmSync(path.join(root, output), { recursive: true, force: true });
  for (const [file, body] of rendered) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), body);
  }
}

/** The checkout this engine lives in, when `from` sits inside it. A published engine has none. */
export function findRepo(from: string): string | null {
  const repo = path.join(ENGINE, "..", "..");
  if (!existsSync(path.join(repo, "pnpm-workspace.yaml")) || !existsSync(path.join(repo, "packages", "engine", "skills"))) return null;
  const inside = path.relative(repo, path.resolve(from));
  return inside.startsWith("..") || path.isAbsolute(inside) ? null : repo;
}
