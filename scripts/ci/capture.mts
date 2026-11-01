/**
 * Posters for one example deck. Examples git-ignore their posters, so a clean checkout has none, and
 * `walk --mode=underlay` then passes on nothing at all. This fails when a capture writes none.
 *
 *   node --import tsx scripts/ci/capture.mts conformance
 *
 * `live-ish capture` builds and serves a copy of its own beside `.next`, so the deck's real build
 * only has to come after this one. CAPTURE_PORT moves that copy off its default port.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { REPO } from "./lib.mts";

const deck = process.argv[2];
if (!deck) {
  console.error("Usage: capture.mts <deck>");
  process.exit(2);
}

const cli = (args: string[], stdout: "inherit" | "pipe") => spawnSync("pnpm", ["--silent", "--filter", deck, "exec", "live-ish", ...args], { cwd: REPO, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", stdout, "inherit"] });

// Capture learns a deck's companion apps from `.live-ish/deck.json`, and it reads that before its
// build writes it. On a clean checkout a server deck would capture nothing and still exit 0.
const prepared = cli(["prepare"], "inherit");
if (prepared.status !== 0) process.exit(prepared.status ?? 1);

const port = process.env.CAPTURE_PORT;
const { status, stdout } = cli(["capture", "--json", ...(port ? [`--port=${port}`] : [])], "pipe");
if (status !== 0) process.exit(status ?? 1);

// A companion app writes to the same stdout, so the report is the last document, not the only text.
const text = stdout.slice(stdout.lastIndexOf("\n{\n") + 1);
if (process.env.RESULTS) writeFileSync(path.join(process.env.RESULTS, `capture-${deck}.json`), text);
const report = JSON.parse(text) as { ok: boolean; data: { posters?: number; stills?: number } };
const posters = report.data.posters ?? 0;
if (!report.ok || posters === 0) {
  console.error(`capture: ${deck} wrote ${posters} poster(s), so nothing below it would be measured.`);
  process.exit(1);
}
console.log(`capture: ${deck} wrote ${posters} poster(s) and ${report.data.stills ?? 0} still(s)`);
