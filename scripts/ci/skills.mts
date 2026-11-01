/**
 * The `skills` job, after `skills-ref validate`. Size limits on every skill, then the commands the
 * skills name, scripted on a fresh starter, then a check, a build and a walk with all agent files
 * removed, which proves a deck never needs them.
 *
 * SKILLS_PORT moves the walk's server off its default port.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { packAll, REPO, serve, stop, tempDir, waitForUrl } from "./lib.mts";

const failures: string[] = [];
const skills = path.join(REPO, "packages", "engine", "skills");
const PORT = process.env.SKILLS_PORT ?? "3219";
const site = `http://localhost:${PORT}`;

/** Limits from the Agent Skills spec, and the 200 lines the agent docs ask for. */
function limits() {
  if (!existsSync(skills)) {
    failures.push("packages/engine/skills is missing.");
    return;
  }
  for (const name of readdirSync(skills)) {
    const dir = path.join(skills, name);
    if (!statSync(dir).isDirectory()) continue;
    const text = readFileSync(path.join(dir, "SKILL.md"), "utf8");
    const description = /^description:\s*(.*)$/m.exec(text)?.[1] ?? "";
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) failures.push(`${name}: a bad name.`);
    if (!description || description.length > 1024) failures.push(`${name}: description is empty or over 1024 characters.`);
    if (text.split("\n").length >= 500) failures.push(`${name}: SKILL.md is 500 lines or more.`);
    const references = path.join(dir, "references");
    if (existsSync(references)) for (const entry of readdirSync(references)) if (statSync(path.join(references, entry)).isDirectory()) failures.push(`${name}: references go one level deep.`);
  }
  for (const file of ["AGENTS.md", "CLAUDE.md"]) if (existsSync(path.join(REPO, file)) && readFileSync(path.join(REPO, file), "utf8").split("\n").length > 200) failures.push(`${file} is over 200 lines.`);
}

function run(cli: string, args: string[], cwd: string) {
  console.log(`$ live-ish ${args.join(" ")}`);
  const { status } = spawnSync(cli, args, { cwd, stdio: "inherit" });
  if (status !== 0) failures.push(`live-ish ${args.join(" ")} exited ${status}.`);
}

/** The walk needs `@live-ish/verify` and a local build, since a deployed one leaves the presenter out. */
async function walked(deck: string, cli: string, verify: string) {
  const next = path.join(deck, "node_modules", ".bin", "next");
  for (const [command, args] of [
    [next, ["build"]],
    ["pnpm", ["add", "-D", `file:${verify}`]],
  ] as const) {
    console.log(`$ ${path.basename(command)} ${args.join(" ")}`);
    const { status } = spawnSync(command, args, { cwd: deck, stdio: "inherit" });
    if (status !== 0) {
      failures.push(`With no agent files, ${path.basename(command)} ${args.join(" ")} exited ${status}.`);
      return;
    }
  }
  const server = serve(next, ["start", "--port", PORT], deck);
  try {
    await waitForUrl(`${site}/_health`, 60_000);
    run(cli, ["walk", `--origin=${site}`], deck);
  } finally {
    stop(server);
  }
}

async function commands() {
  const blank = tempDir("skills");
  const tarballs = packAll(path.join(blank, ".tarballs"));
  const { status } = spawnSync(process.execPath, [path.join(REPO, "packages", "create", "bin", "create-live-ish.mjs"), "deck", "--pm", "pnpm", `--engine=file:${tarballs["@live-ish/engine"]}`], { cwd: blank, stdio: "inherit" });
  if (status !== 0) {
    failures.push("The scaffolder failed.");
    return;
  }
  const deck = path.join(blank, "deck");
  const cli = path.join(deck, "node_modules", ".bin", "live-ish");
  for (const args of [
    ["new", "copy", "Why teams write tests"],
    ["new", "web-demo", "tabs"],
    ["new", "terminal-demo", "setup"],
    ["record", "setup"],
    ["themes", "--json"],
    ["support", "popover", "--json"],
    ["check", "--json"],
  ])
    run(cli, args, deck);
  for (const name of ["AGENTS.md", "CLAUDE.md", ".agents", ".claude"]) rmSync(path.join(deck, name), { recursive: true, force: true });
  run(cli, ["check"], deck);
  await walked(deck, cli, tarballs["@live-ish/verify"]);
}

limits();
await commands();
if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
console.log("skills: passed");
