/**
 * The agent files on a real scaffold: the engine packed, `create-live-ish` run from its tarball, a
 * real install. It takes minutes, so it stays out of `pnpm test`. Exit codes: 0 pass, 1 a line failed.
 *
 *   pnpm skills:fresh
 *
 * Proves, on one fresh deck each:
 *   - a scaffold has the agent files, and `skills sync --check` and `check` pass
 *   - `--no-agents` writes none, and `add agents` adds them later
 *   - a deck from an older engine upgrades, keeps an edit, and keeps a deletion
 *   - with all four agent paths deleted, the deck checks and builds
 *   - `next dev`, with an agent detected, leaves the author's AGENTS.md as it was
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const engine = path.join(repo, "packages", "engine");
const scaffold = path.join(repo, "packages", "create", "bin", "create-live-ish.mjs");
const temp = mkdtempSync(path.join(os.tmpdir(), "live-ish-fresh-"));
const PORT = 3417;

let failed = 0;
function line(ok: boolean, text: string, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${text}`);
  if (!ok) {
    failed++;
    if (detail)
      console.log(
        detail
          .trim()
          .split("\n")
          .slice(-12)
          .map((l) => `      ${l}`)
          .join("\n"),
      );
  }
}

function exec(command: string, args: string[], cwd: string, env: Record<string, string> = {}) {
  const run = spawnSync(command, args, { cwd, encoding: "utf8", env: { ...process.env, ...env }, maxBuffer: 1 << 28 });
  return { code: run.status ?? -1, out: `${run.stdout}${run.stderr}` };
}

const liveIsh = (deck: string, args: string[], env: Record<string, string> = {}) => exec(process.execPath, [path.join(deck, "node_modules", "@live-ish", "engine", "bin", "live-ish.mjs"), ...args], deck, env);
const expect = (deck: string, args: string[], code = 0) => {
  const run = liveIsh(deck, args);
  line(run.code === code, `live-ish ${args.join(" ")} exits ${code}`, run.out);
  return run;
};
const read = (...parts: string[]) => readFileSync(path.join(...parts), "utf8");

console.log("Packing the engine and the starter.");
exec(process.execPath, [path.join(repo, "packages", "create", "scripts", "bundle-starter.mjs")], repo);
const packed = exec("pnpm", ["pack", "--pack-destination", temp], engine);
if (packed.code !== 0) throw new Error(packed.out);
const tarball = path.join(temp, readdirSync(temp).find((f) => f.endsWith(".tgz")) as string);

function create(name: string, ...flags: string[]) {
  const deck = path.join(temp, name);
  const run = exec(process.execPath, [scaffold, deck, "--pm", "pnpm", "--engine", `file:${tarball}`, ...flags], temp);
  line(run.code === 0, `create-live-ish ${name} ${flags.join(" ")}`.trim(), run.out);
  return deck;
}

console.log("\nA fresh deck");
const deck = create("fresh");
for (const file of ["AGENTS.md", "CLAUDE.md", ".agents/skills/add-web-demo/SKILL.md", ".claude/skills/add-web-demo/SKILL.md", ".live-ish/skills.lock"]) line(existsSync(path.join(deck, file)), `has ${file}`);
line(read(deck, "CLAUDE.md") === "@AGENTS.md\n", "CLAUDE.md is one line");
line(!existsSync(path.join(deck, ".claude/skills/prepare-release")), "has no contributor skill");
expect(deck, ["skills", "sync", "--check"]);
expect(deck, ["check", "--json"]);
line(exec("git", ["check-ignore", "-q", ".live-ish/skills.lock"], deck).code !== 0 || !existsSync(path.join(deck, ".git")), "the lock is not ignored");

console.log("\n--no-agents");
const bare = create("bare", "--no-agents");
for (const file of ["AGENTS.md", "CLAUDE.md", ".agents", ".claude", ".live-ish/skills.lock"]) line(!existsSync(path.join(bare, file)), `has no ${file}`);
expect(bare, ["check", "--json"]);
expect(bare, ["upgrade"]);
line(!existsSync(path.join(bare, ".agents")), "upgrade adds no agent files");
expect(bare, ["add", "agents"]);
line(existsSync(path.join(bare, ".claude/skills/check-deck/SKILL.md")), "add agents adds them");
expect(bare, ["skills", "sync", "--check"]);

console.log("\nA deck from an older engine");
const lockFile = path.join(deck, ".live-ish", "skills.lock");
const lock = JSON.parse(readFileSync(lockFile, "utf8"));
const older = ".agents/skills/check-deck/SKILL.md";
const olderText = read(deck, older).replace('live-ish-schema: "1"', 'live-ish-schema: "0"');
writeFileSync(path.join(deck, older), olderText);
const { createHash } = await import("node:crypto");
lock.files[older] = createHash("sha256").update(olderText).digest("hex").slice(0, 16);
lock.engine = "0.0.0-previous";
lock.skills["check-deck"] = "0";
lock["live-ish-schema"] = "0";
writeFileSync(lockFile, JSON.stringify(lock));
const stale = JSON.parse(liveIsh(deck, ["check", "--json"]).out) as { findings: { rule: string }[] };
line(
  stale.findings.some((f) => f.rule === "skills-stale"),
  "check warns through skills-stale",
);
const edited = ".claude/skills/add-copy-slide/SKILL.md";
writeFileSync(path.join(deck, edited), `${read(deck, edited)}\nMy own step.\n`);
rmSync(path.join(deck, ".claude/skills/deploy-deck"), { recursive: true });
const upgrade = expect(deck, ["upgrade"]);
line(upgrade.out.includes(".live-ish/skills-incoming/add-copy-slide/claude/SKILL.md"), "upgrade prints the line naming the new version", upgrade.out);
line(read(deck, older).includes('live-ish-schema: "1"'), "the untouched skill matches the new schema");
line(read(deck, edited).endsWith("My own step.\n"), "the edited skill is kept");
line(existsSync(path.join(deck, ".live-ish/skills-incoming/add-copy-slide/claude/SKILL.md")), "the new version is in skills-incoming");
line(!existsSync(path.join(deck, ".claude/skills/deploy-deck")), "the deleted skill stays deleted");
line(JSON.parse(read(deck, ".live-ish", "skills.lock"))["live-ish-schema"] === "1", "the lock names the new schema");

console.log("\nnext dev and AGENTS.md");
const mine = `${read(deck, "AGENTS.md")}\nMy own line.\n`;
writeFileSync(path.join(deck, "AGENTS.md"), mine);
const dev = spawn(path.join(deck, "node_modules", ".bin", "next"), ["dev", "--port", String(PORT)], { cwd: deck, env: { ...process.env, CLAUDECODE: "1", AI_AGENT: "claude-code" }, stdio: "ignore" });
let up = false;
for (let i = 0; i < 60 && !up; i++) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  up = await fetch(`http://localhost:${PORT}/_health`, { signal: AbortSignal.timeout(2000) }).then(
    () => true,
    () => false,
  );
}
await new Promise((resolve) => setTimeout(resolve, 2000));
// All the way down: a server still dying would rewrite public/live-ish under the next command.
const stopped = new Promise((resolve) => dev.once("exit", resolve));
dev.kill("SIGTERM");
await stopped;
for (
  let i = 0;
  i < 40 &&
  (await fetch(`http://localhost:${PORT}/_health`, { signal: AbortSignal.timeout(500) }).then(
    () => true,
    () => false,
  ));
  i++
)
  await new Promise((resolve) => setTimeout(resolve, 250));
line(up, "next dev answered");
line(read(deck, "AGENTS.md") === mine, "AGENTS.md is byte for byte the author's");

console.log("\nAll four agent paths deleted");
for (const name of ["AGENTS.md", "CLAUDE.md", ".agents", ".claude"]) rmSync(path.join(deck, name), { recursive: true });
expect(deck, ["check", "--json"]);
expect(deck, ["upgrade"]);
line(!existsSync(path.join(deck, ".claude")) && !existsSync(path.join(deck, "AGENTS.md")), "upgrade brings nothing back");
// `next dev` above left route types for its presenter pages, which a deployed build leaves out.
rmSync(path.join(deck, ".next"), { recursive: true, force: true });
const build = liveIsh(deck, ["build"], { LIVE_ISH_SITE_ORIGIN: "https://example.com" });
line(build.code === 0, "live-ish build exits 0", build.out);
const present = exec(path.join(deck, "node_modules", ".bin", "next"), ["build"], deck, { LIVE_ISH_TARGET: "local", NEXT_DIST_DIR: ".next-local" });
line(present.code === 0, "a local next build exits 0", present.out);

rmSync(temp, { recursive: true, force: true });
console.log(failed ? `\n${failed} line(s) failed.` : "\nEvery line passed.");
process.exit(failed ? 1 : 0);
