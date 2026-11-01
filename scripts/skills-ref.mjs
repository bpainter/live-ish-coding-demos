#!/usr/bin/env node
// Runs the Agent Skills reference validator on the skill source and both generated folders. The
// package needs Python 3.11 or later, so this stays out of `pnpm test`, where `skills-lint.ts` holds
// the same limits. The command it installs is `agentskills`. Exit codes: 0 pass, 1 findings, 3 environment.
//
// `skills-ref` only knows the portable fields, so it refuses the Claude-only key the spec tells us to
// merge into the manual skills. Those three copies are checked with that key taken out, and the keys
// are named in the output. Everything else is checked as it stands.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILLS_REF = "0.1.1";
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const works = (command, args) => spawnSync(command, args, { stdio: "ignore" }).status === 0;

/** A local install first, for machines with no runner, then the pinned package. */
function runner() {
  if (process.env.SKILLS_REF_BIN) return [process.env.SKILLS_REF_BIN];
  if (works("uvx", ["--version"])) return ["uvx", "--from", `skills-ref==${SKILLS_REF}`, "agentskills"];
  if (works("pipx", ["--version"])) return ["pipx", "run", "--spec", `skills-ref==${SKILLS_REF}`, "agentskills"];
  return null;
}

const command = runner();
if (!command) {
  console.error(`skills-ref needs uvx or pipx, or SKILLS_REF_BIN pointing at an install of skills-ref ${SKILLS_REF}.`);
  process.exit(3);
}

const skillDirs = (root) =>
  readdirSync(path.join(repo, root), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(repo, root, e.name));

const validate = (dir) => spawnSync(command[0], [...command.slice(1), "validate", dir], { encoding: "utf8" });

const temp = mkdtempSync(path.join(os.tmpdir(), "live-ish-skills-ref-"));
const failures = [];
let passed = 0;

function run(dir, label = path.relative(repo, dir)) {
  const result = validate(dir);
  if (result.status === 0) passed++;
  else failures.push(`${label}: ${(result.stdout + result.stderr).trim()}`);
}

for (const dir of skillDirs("packages/engine/skills")) run(dir);
for (const dir of skillDirs(".agents/skills")) run(dir);
for (const dir of skillDirs(".claude/skills")) {
  const extra = path.join(repo, "packages/engine/skills", path.basename(dir), "claude.yaml");
  if (!existsSync(extra)) {
    run(dir);
    continue;
  }
  const keys = readFileSync(extra, "utf8").split("\n").filter(Boolean);
  const copy = path.join(temp, path.basename(dir));
  cpSync(dir, copy, { recursive: true });
  const skill = path.join(copy, "SKILL.md");
  const lines = readFileSync(skill, "utf8").split("\n");
  writeFileSync(skill, lines.filter((line) => !keys.includes(line)).join("\n"));
  console.log(`${path.relative(repo, dir)}: checked without ${keys.join(", ")}`);
  run(copy, path.relative(repo, dir));
}

rmSync(temp, { recursive: true, force: true });
for (const failure of failures) console.error(failure);
console.log(`skills-ref ${SKILLS_REF}: ${passed} passed, ${failures.length} failed.`);
process.exit(failures.length ? 1 : 0);
