import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { UsageError } from "../args";
import { EXIT, engineVersion, findDeck, printJson, requireDeck, type Ctx, type ExitCode } from "../io";
import { agentsTemplate, applyPlan, claudeTemplate, findRepo, hasSkills, OUTPUTS, planDeck, prependBlock, refreshBlock, renderSkills, repoDrift, staleBlock, writeRepo, type PlanOptions, type SkillPlan } from "../../lib/skills";

/** A deck first, so `examples/starter` is a deck even though it sits in the monorepo. */
function target(ctx: Ctx): { root: string; repo: boolean } {
  const deck = findDeck(ctx.cwd);
  if (deck) return { root: requireDeck(ctx), repo: false };
  const repo = findRepo(ctx.cwd);
  if (!repo) throw new UsageError(`No deck.config.ts here or in any folder above ${ctx.cwd}. Run this inside a deck.`);
  return { root: repo, repo: true };
}

/** One line per file an author should look at. */
function report(log: Ctx["log"], plan: SkillPlan) {
  for (const { file, incoming } of plan.edited) log(`Kept your edit to ${file}. The new version is in ${incoming}.`);
  for (const file of plan.retired) log(`Kept ${file}. This engine no longer ships it, so it is yours now.`);
}

/** Writes a deck's skills, keeping what the author changed. Returns what happened. */
export function syncDeck(root: string, options: PlanOptions = {}): { rendered: Map<string, string>; plan: SkillPlan } {
  const rendered = renderSkills();
  const plan = planDeck(root, rendered, options);
  applyPlan(root, rendered, plan, engineVersion());
  return { rendered, plan };
}

export interface InstructionResult {
  written: string[];
  notes: string[];
}

/** `AGENTS.md` and `CLAUDE.md`. An existing file keeps every word, and gains the block if it has none. */
export function writeAgentFiles(root: string): InstructionResult {
  const result: InstructionResult = { written: [], notes: [] };
  const agents = path.join(root, "AGENTS.md");
  if (!existsSync(agents)) {
    writeFileSync(agents, agentsTemplate());
    result.written.push("AGENTS.md");
  } else {
    const text = readFileSync(agents, "utf8");
    const next = refreshBlock(text) ?? prependBlock(text);
    if (next !== text) {
      writeFileSync(agents, next);
      result.written.push("AGENTS.md");
    }
  }
  const claude = path.join(root, "CLAUDE.md");
  if (!existsSync(claude)) {
    writeFileSync(claude, claudeTemplate());
    result.written.push("CLAUDE.md");
  } else if (!readFileSync(claude, "utf8").includes("@AGENTS.md")) {
    result.notes.push("CLAUDE.md does not import AGENTS.md. Add a line `@AGENTS.md`, so Claude Code reads the deck's rules.");
  }
  return result;
}

/** What `upgrade` does for agent files: only what the deck already has, and only the engine's part of it. */
export function refreshAgents(root: string, log: Ctx["log"]) {
  const out = { written: [] as string[], kept: [] as SkillPlan["edited"], removed: [] as string[], deleted: [] as string[], retired: [] as string[] };
  const agents = path.join(root, "AGENTS.md");
  if (existsSync(agents)) {
    const text = readFileSync(agents, "utf8");
    const next = refreshBlock(text);
    if (next === null) {
      if (hasSkills(root)) log("AGENTS.md has no live-ish block, so the upgrade left it alone. `live-ish add agents` adds one.");
    } else if (next !== text) {
      writeFileSync(agents, next);
      out.written.push("AGENTS.md");
    }
  }
  if (!hasSkills(root)) return out;
  const { plan } = syncDeck(root);
  report(log, plan);
  out.written.push(...plan.write);
  out.kept = plan.edited;
  out.removed = plan.remove;
  out.deleted = plan.deleted;
  out.retired = plan.retired;
  return out;
}

function checkRepo(ctx: Ctx, root: string): ExitCode {
  const stale = repoDrift(root, renderSkills("repo"));
  if (ctx.json) printJson({ ok: stale.length === 0, stale });
  else if (stale.length) {
    ctx.log("These generated skill files differ from packages/engine/skills/:");
    for (const file of stale) ctx.log(`  ${file}`);
    ctx.log("Edit the source, then run `live-ish skills sync`.");
  } else ctx.log("Skills match packages/engine/skills/.");
  return stale.length ? EXIT.findings : EXIT.ok;
}

function checkDeck(ctx: Ctx, root: string): ExitCode {
  if (!hasSkills(root)) {
    if (ctx.json) printJson({ ok: true, stale: [] });
    else ctx.log("This deck has no agent skills. `live-ish add agents` adds them.");
    return EXIT.ok;
  }
  const plan = planDeck(root, renderSkills());
  const stale = [...plan.write, ...plan.edited.map((e) => e.file), ...plan.remove, ...plan.retired, ...(staleBlock(root) ? ["AGENTS.md"] : [])].sort();
  if (ctx.json) printJson({ ok: stale.length === 0, stale, deleted: plan.deleted });
  else if (stale.length) {
    ctx.log("These agent files differ from the installed engine:");
    for (const file of stale) ctx.log(`  ${file}`);
    ctx.log("`live-ish upgrade` refreshes what you did not edit. `live-ish skills sync --force` restores everything.");
  } else ctx.log(`Skills match @live-ish/engine ${engineVersion()}.`);
  return stale.length ? EXIT.findings : EXIT.ok;
}

export async function skillsSync(ctx: Ctx): Promise<ExitCode> {
  const { root, repo } = target(ctx);
  const force = ctx.flags.force === true;
  if (force && ctx.flags.check === true) throw new UsageError("--check and --force exclude each other: one reads and one writes.");
  if (ctx.flags.check === true) return repo ? checkRepo(ctx, root) : checkDeck(ctx, root);
  if (repo) {
    const rendered = renderSkills("repo");
    writeRepo(root, rendered);
    if (ctx.json) printJson({ ok: true, written: [...rendered.keys()] });
    else ctx.log(`Wrote ${rendered.size} skill file(s) to ${OUTPUTS.join(" and ")}.`);
    return EXIT.ok;
  }
  const { plan } = syncDeck(root, force ? { force: true, restore: true } : {});
  const agents = path.join(root, "AGENTS.md");
  if (existsSync(agents)) {
    const text = readFileSync(agents, "utf8");
    const next = refreshBlock(text);
    if (next !== null && next !== text) writeFileSync(agents, next);
  }
  report(ctx.log, plan);
  if (ctx.json) printJson({ ok: true, written: plan.write, kept: plan.edited, removed: plan.remove, retired: plan.retired, deleted: plan.deleted });
  else ctx.log(plan.write.length || plan.remove.length ? `Wrote ${plan.write.length} skill file(s) to ${OUTPUTS.join(" and ")}.` : "Skills are current.");
  return EXIT.ok;
}

export async function addAgents(ctx: Ctx): Promise<ExitCode> {
  const root = requireDeck(ctx);
  const { written, notes } = writeAgentFiles(root);
  // Asking for agent files is the one thing that brings a deleted skill back.
  const { rendered, plan } = syncDeck(root, { restore: true });
  report(ctx.log, plan);
  for (const note of notes) ctx.log(note);
  if (ctx.json) printJson({ ok: true, written, skills: [...rendered.keys()], kept: plan.edited, notes });
  else ctx.log(written.length ? `Wrote ${written.join(" and ")}, and ${rendered.size} skill file(s).` : `Kept your instruction files, and wrote ${rendered.size} skill file(s).`);
  return EXIT.ok;
}
