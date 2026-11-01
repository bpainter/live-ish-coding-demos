#!/usr/bin/env node
// Scaffolds a deck: copies the starter, installs, then asks the installed engine to write the shell
// and the agent files, so what lands always matches that engine. No dependencies: this runs before
// anything is installed. Exit codes match `live-ish`: 2 misuse, 3 environment.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const major = Number.parseInt(process.versions.node, 10);
if (major < 22) {
  console.error(`create-live-ish needs Node 22 or later. This is Node ${process.versions.node}.`);
  process.exit(3);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(here, "..", "template");
const USAGE = `create-live-ish <folder> [--no-agents] [--pm pnpm|npm]

Writes a Live-ish deck into <folder> and installs it.

  --no-agents   Skip AGENTS.md, CLAUDE.md and skills. \`live-ish add agents\` adds them later.
  --pm <name>   Install with pnpm or npm. Defaults to the one that launched this.
`;

function misuse(message) {
  console.error(`create-live-ish: ${message}\n\n${USAGE}`);
  process.exit(2);
}

function fail(message) {
  console.error(`create-live-ish: ${message}`);
  process.exit(3);
}

function parse(argv) {
  const options = { folder: undefined, agents: true, pm: undefined, engine: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(USAGE);
      process.exit(0);
    }
    if (arg === "--version" || arg === "-v") {
      process.stdout.write(`${JSON.parse(readFileSync(path.join(here, "..", "package.json"), "utf8")).version}\n`);
      process.exit(0);
    }
    if (arg === "--no-agents") options.agents = false;
    else if (arg === "--pm" || arg.startsWith("--pm=")) options.pm = arg.includes("=") ? arg.split("=")[1] : argv[++i];
    // Installs a build that is not on the registry, such as a packed tarball.
    else if (arg === "--engine" || arg.startsWith("--engine=")) options.engine = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : argv[++i];
    else if (arg.startsWith("-")) misuse(`Unknown flag ${arg}.`);
    else if (options.folder) misuse(`Expected one folder, found "${options.folder}" and "${arg}".`);
    else options.folder = arg;
  }
  if (!options.folder) misuse("Name a folder.");
  if (options.pm && !["pnpm", "npm"].includes(options.pm)) misuse(`--pm takes pnpm or npm, found "${options.pm}".`);
  return options;
}

const onPath = (command) => spawnSync(command, ["--version"], { stdio: "ignore", shell: process.platform === "win32" }).status === 0;

/** The manager that launched this, else pnpm when it is here, else npm. */
function packageManager(requested) {
  if (requested) return requested;
  const agent = process.env.npm_config_user_agent?.split("/")[0];
  if (agent === "pnpm" || agent === "npm") return agent;
  return onPath("pnpm") ? "pnpm" : "npm";
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  return result.status === 0;
}

const options = parse(process.argv.slice(2));
const target = path.resolve(options.folder);
const name = path.basename(target);
if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) misuse(`"${name}" is not a valid package name. Use lowercase letters, digits and dashes.`);
if (existsSync(target) && readdirSync(target).length > 0) misuse(`${options.folder} exists and is not empty.`);
if (!existsSync(path.join(TEMPLATE, "deck.config.ts"))) fail("This package has no template. Reinstall create-live-ish.");

const pm = packageManager(options.pm);
if (!onPath(pm)) fail(`${pm} is not on PATH.`);

cpSync(TEMPLATE, target, { recursive: true });
const manifestFile = path.join(target, "package.json");
const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
manifest.name = name;
if (options.engine) manifest.dependencies["@live-ish/engine"] = options.engine;
writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
// pnpm stops an install at any build script it was not told about. Both of these ship their
// binaries as optional dependencies, so neither script needs to run.
// Older pnpm stops on this file unless it also names the packages, so it names the one here.
if (pm === "pnpm") writeFileSync(path.join(target, "pnpm-workspace.yaml"), "packages:\n  - \".\"\nallowBuilds:\n  esbuild: false\n  sharp: false\n");

console.log(`Installing with ${pm}.`);
if (!run(pm, ["install"], target)) fail(`\`${pm} install\` failed. The deck is in ${options.folder}. Fix the install, then run \`${pm} exec live-ish upgrade --force\` there.`);

const cli = path.join(target, "node_modules", "@live-ish", "engine", "bin", "live-ish.mjs");
if (!run(process.execPath, [cli, "upgrade", "--force"], target)) fail("The engine could not write the shell.");
if (options.agents && !run(process.execPath, [cli, "add", "agents"], target)) fail("The engine could not write the agent files.");

const prefix = pm === "pnpm" ? "pnpm" : "npm run";
console.log(`
${options.folder} is ready.

  cd ${options.folder}
  ${prefix} dev

Then open http://localhost:3000/present and press the arrow keys. Press s for the speaker window.
`);
