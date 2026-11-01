/**
 * The `hosting` job. Every hosting mode, end to end, then `--compare`, which holds each one-host run
 * against the two-origin run in the same browser. Every mode runs even after one fails, so a single
 * red run shows them all.
 *
 *   node --import tsx scripts/ci/hosting.mts [--port=3200]
 *
 * A mode takes two ports, the one named and the next. Each run writes `.hosting/results/`, which the
 * job keeps with its raw results.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import path from "node:path";
import { REPO } from "./lib.mts";

const port = process.argv.find((a) => a.startsWith("--port="))?.slice("--port=".length) ?? "3200";
const hosting = path.join(REPO, "scripts", "hosting.mts");

/** The modes that serve the same deck every way. `--compare` reads local and one-host in both browsers. */
const WALKED = ["local", "one-host", "two-hosts"];
/** The public build and its variants, which change what a host sends, not how a browser walks it. */
const DEPLOYED = ["deployed", "vercel", "on-host", "closed", "noindex"];

const RUNS = [...["chromium", "webkit"].flatMap((browser) => WALKED.map((mode) => [mode, browser])), ...DEPLOYED.map((mode) => [mode, "chromium"])];

const failed: string[] = [];
function run(label: string, args: string[]) {
  console.log(`\n$ hosting ${args.join(" ")}`);
  const { status } = spawnSync(process.execPath, ["--import", "tsx", hosting, ...args], { cwd: REPO, stdio: "inherit" });
  if (status !== 0) failed.push(`${label} exited ${status}`);
}

for (const [mode, browser] of RUNS) run(`${mode} in ${browser}`, [`--mode=${mode}`, `--browser=${browser}`, `--port=${port}`]);
run("the comparison", ["--compare"]);

const results = path.join(REPO, ".hosting", "results");
if (process.env.RESULTS && existsSync(results)) cpSync(results, path.join(process.env.RESULTS, "hosting"), { recursive: true });

if (failed.length) {
  for (const f of failed) console.error(`FAIL ${f}`);
  process.exit(1);
}
console.log(`\nhosting: ${RUNS.length} runs and the comparison passed`);
