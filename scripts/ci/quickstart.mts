/**
 * Runs a page's shell commands, in order, from a blank folder, against packed tarballs. A broken
 * command fails the job, so the page cannot rot.
 *
 *   node --import tsx scripts/ci/quickstart.mts README.md "Quick start"
 *   node --import tsx scripts/ci/quickstart.mts docs/content/start.mdx
 *
 * Until the packages are on npm, `pnpm create live-ish <folder>` runs the packed scaffolder. Once they
 * are, drop TARBALLS from the job and it runs as printed.
 */
import { spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { packAll, REPO, serve, shellCommands, stop, tempDir, waitForUrl } from "./lib.mts";

const [file, heading] = process.argv.slice(2);
if (!file) {
  console.error("Name a Markdown file, and optionally a heading.");
  process.exit(2);
}
const PORT = process.env.QUICKSTART_PORT ?? "3000";
const commands = shellCommands(readFileSync(path.resolve(REPO, file), "utf8"), heading);
if (!commands.length) throw new Error(`No sh commands in ${file}.`);

const blank = tempDir("quickstart");
const tarballs = packAll(path.join(blank, ".tarballs"));
const workspace = path.join(blank, "work");
mkdirSync(workspace);
console.log(`Blank folder: ${workspace}`);

/** Lines a deck leaves running. Each gets a request, then a stop. */
const LONG_RUNNING: { match: RegExp; url: string }[] = [
  { match: /^(pnpm|npm run) dev\b/, url: `http://localhost:${PORT}/present` },
  { match: /^pnpm --filter starter dev\b/, url: `http://localhost:${PORT}/present` },
  { match: /^pnpm live-ish present\b/, url: `http://localhost:${PORT}/speaker` },
];

let cwd = workspace;

function run(command: string) {
  const { status } = spawnSync(command, { cwd, shell: "/bin/bash", stdio: "inherit" });
  if (status !== 0) throw new Error(`"${command}" exited ${status}.`);
}

async function runLong(command: string, url: string) {
  const port = /--port/.test(command) || PORT === "3000" ? command : `${command} --port=${PORT}`;
  // `present` opens a browser, and a job has no one to look at it.
  const line = /\bpresent\b/.test(port) ? `${port} --no-open` : port;
  const child: ChildProcess = serve("/bin/bash", ["-c", `exec ${line}`], cwd);
  let exited = false;
  child.on("exit", () => (exited = true));
  try {
    const status = await waitForUrl(url, 180_000, () => exited);
    if (status !== 200) throw new Error(`${url} answered ${status}.`);
    console.log(`ok   ${url} answered 200`);
  } finally {
    stop(child);
    await new Promise((r) => setTimeout(r, 500));
  }
}

for (const command of commands) {
  console.log(`\n$ ${command}`);
  const cd = /^cd (\S+)$/.exec(command);
  const long = LONG_RUNNING.find((l) => l.match.test(command));
  const create = /^pnpm create live-ish (\S+)$/.exec(command);
  if (cd) cwd = path.join(cwd, cd[1]);
  else if (long) await runLong(command, long.url);
  else if (create && tarballs["create-live-ish"]) run(`pnpm dlx ${tarballs["create-live-ish"]} ${create[1]} --engine=file:${tarballs["@live-ish/engine"]}`);
  else run(command);
}
console.log(`\nquickstart: ${commands.length} commands passed for ${file}`);
