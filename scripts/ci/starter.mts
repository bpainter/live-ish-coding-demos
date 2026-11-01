/**
 * The `starter` job. Scaffolds from the tarballs with pnpm or npm, builds, starts, and runs the
 * Chromium walk. `@live-ish/verify` stays out of the deck until the walk step, which proves a deck
 * never needs it.
 *
 *   node --import tsx scripts/ci/starter.mts --pm pnpm
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { packAll, REPO, serve, stop, tempDir, waitForUrl } from "./lib.mts";

const at = process.argv.indexOf("--pm");
const pm = at === -1 ? "pnpm" : process.argv[at + 1];
if (pm !== "pnpm" && pm !== "npm") {
  console.error("--pm takes pnpm or npm.");
  process.exit(2);
}
const PORT = process.env.STARTER_PORT ?? "3218";
const blank = tempDir("starter");
const deck = path.join(blank, "my-talk");
const tarballs = packAll(path.join(blank, ".tarballs"));
const site = `http://localhost:${PORT}`;

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const { status } = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (status !== 0) throw new Error(`${command} ${args.join(" ")} exited ${status}.`);
}

run(process.execPath, [path.join(REPO, "packages", "create", "bin", "create-live-ish.mjs"), "my-talk", "--pm", pm, `--engine=file:${tarballs["@live-ish/engine"]}`], blank);
if (existsSync(path.join(deck, "node_modules", "@live-ish", "verify"))) throw new Error("@live-ish/verify reached a fresh deck.");

const cli = path.join(deck, "node_modules", ".bin", "live-ish");
run(cli, ["check"], deck);
run(cli, ["build"], deck, { ...process.env, LIVE_ISH_SITE_ORIGIN: site });

const server = serve(cli, ["start", `--port=${PORT}`], deck);
try {
  const status = await waitForUrl(`${site}/s/faq-before`, 60_000);
  if (status !== 200) throw new Error(`/s/faq-before answered ${status}.`);
  console.log("ok   /s/faq-before answered 200");
} finally {
  stop(server);
  await new Promise((r) => setTimeout(r, 500));
}

// The walk step. It drives the presenter, which a deployed build leaves out, so it needs a local build.
run(path.join(deck, "node_modules", ".bin", "next"), ["build"], deck);
run(process.execPath, ["--import", "tsx", path.join(REPO, "scripts", "smoke.mts")], REPO, { ...process.env, SMOKE_DECK: deck, SMOKE_PORT: PORT });

const verify = tarballs["@live-ish/verify"];
if (verify) {
  run(pm, pm === "pnpm" ? ["add", "-D", `file:${verify}`] : ["install", "--save-dev", `file:${verify}`], deck);
  run(cli, ["walk"], deck);
} else console.log("note @live-ish/verify is not packed yet, so the smoke walk stood in for `live-ish walk`.");
console.log(`\nstarter: passed with ${pm}`);
