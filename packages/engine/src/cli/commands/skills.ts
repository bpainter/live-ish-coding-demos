import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ENGINE, EXIT, engineVersion, printJson, requireDeck, type Ctx, type ExitCode } from "../io";
import { hashOf } from "../shell";
import { writeAgentFiles } from "./maintain";

/** The canonical skills. Each folder holds one skill. */
const SOURCE = path.join(ENGINE, "skills");
/** Where a deck's agent tools read them. Generated, so nothing here is edited by hand. */
const OUTPUTS = [".agents/skills", ".claude/skills"];
const LOCK = ".live-ish/skills.lock";

/**
 * The skill files a deck should hold, as paths relative to an output folder. This is the seam for
 * anything that derives from deck or engine data: a generator changes what this returns, and `sync`,
 * `--check` and the lock file follow.
 */
export function renderSkills(): Map<string, string> {
  const files = new Map<string, string>();
  if (!existsSync(SOURCE)) return files;
  for (const e of readdirSync(SOURCE, { withFileTypes: true, recursive: true })) {
    if (!e.isFile() || e.name === ".DS_Store") continue;
    const abs = path.join(e.parentPath, e.name);
    const rel = path.relative(SOURCE, abs).split(path.sep).join("/");
    // A file at the top of the source folder is about the folder, and is no skill.
    if (rel.includes("/")) files.set(rel, readFileSync(abs, "utf8"));
  }
  return files;
}

function drifted(root: string, files: Map<string, string>): string[] {
  const out: string[] = [];
  for (const output of OUTPUTS) {
    for (const [rel, body] of files) {
      const file = path.join(root, output, rel);
      if (!existsSync(file) || readFileSync(file, "utf8") !== body) out.push(`${output}/${rel}`);
    }
    const dir = path.join(root, output);
    if (!existsSync(dir)) continue;
    for (const e of readdirSync(dir, { withFileTypes: true, recursive: true })) {
      const rel = path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join("/");
      if (e.isFile() && !files.has(rel)) out.push(`${output}/${rel}`);
    }
  }
  return out.sort();
}

function write(root: string, files: Map<string, string>) {
  for (const output of OUTPUTS) {
    rmSync(path.join(root, output), { recursive: true, force: true });
    for (const [rel, body] of files) {
      const file = path.join(root, output, rel);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, body);
    }
  }
  const lock = path.join(root, LOCK);
  mkdirSync(path.dirname(lock), { recursive: true });
  writeFileSync(lock, `${JSON.stringify({ engine: engineVersion(), files: Object.fromEntries([...files].map(([rel, body]) => [rel, hashOf(body)])) }, null, 2)}\n`);
}

export async function skillsSync(ctx: Ctx): Promise<ExitCode> {
  const root = requireDeck(ctx);
  const files = renderSkills();
  if (ctx.flags.check === true) {
    const stale = drifted(root, files);
    if (ctx.json) printJson({ ok: stale.length === 0, stale });
    else if (stale.length) {
      ctx.log("These skill files differ from the installed engine:");
      for (const file of stale) ctx.log(`  ${file}`);
      ctx.log("Run `live-ish skills sync`.");
    } else ctx.log(`Skills match @live-ish/engine ${engineVersion()}.`);
    return stale.length ? EXIT.findings : EXIT.ok;
  }
  write(root, files);
  if (ctx.json) printJson({ ok: true, files: [...files.keys()] });
  else ctx.log(files.size ? `Wrote ${files.size} skill file(s) to ${OUTPUTS.join(" and ")}.` : "This engine ships no skills yet.");
  return EXIT.ok;
}

export async function addAgents(ctx: Ctx): Promise<ExitCode> {
  const root = requireDeck(ctx);
  const written = writeAgentFiles(root);
  const skills = renderSkills();
  write(root, skills);
  if (ctx.json) printJson({ ok: true, written, skills: [...skills.keys()] });
  else ctx.log(written.length ? `Wrote ${written.join(" and ")}, and ${skills.size} skill file(s).` : `Kept your instruction files, and wrote ${skills.size} skill file(s).`);
  return EXIT.ok;
}
