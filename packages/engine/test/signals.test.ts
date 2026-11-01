import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { ENGINE } from "./validate-fixture";

/** Stays up after `onSignal` fires, as `dev` and `present` do while they stop their servers. */
const child = (stopMs: number) => `
import { onSignal } from ${JSON.stringify(pathToFileURL(path.join(ENGINE, "src", "cli", "process.ts")).href)};
const keepAlive = setInterval(() => undefined, 1000);
onSignal(() => {
  console.log("stopping");
  setTimeout(() => {
    console.log("stopped");
    clearInterval(keepAlive);
  }, ${stopMs});
});
console.log("ready");
`;

interface Run {
  output: string;
  code: number | null;
  signal: NodeJS.Signals | null;
}

/** Runs the child, and calls `send` once it is listening. */
async function run(stopMs: number, send: (signal: (name: NodeJS.Signals) => void) => void): Promise<Run> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "live-ish-signals-"));
  const file = path.join(dir, "child.mts");
  writeFileSync(file, child(stopMs));
  try {
    const proc = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", file], { cwd: ENGINE, stdio: ["ignore", "pipe", "inherit"] });
    let output = "";
    let sent = false;
    proc.stdout.on("data", (chunk: Buffer) => {
      output += String(chunk);
      if (!sent && output.includes("ready")) {
        sent = true;
        send((name) => proc.kill(name));
      }
    });
    return await new Promise<Run>((resolve) => proc.on("exit", (code, signal) => resolve({ output, code, signal })));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a stop heard twice still finishes, as Ctrl-C through the shim does", async () => {
  const { output, code, signal } = await run(300, (kill) => {
    kill("SIGINT");
    setTimeout(() => kill("SIGINT"), 50);
  });
  assert.equal(signal, null, `the process died on the second signal: ${output}`);
  assert.equal(code, 0);
  assert.match(output, /stopped/);
  assert.equal(output.match(/stopping/g)?.length, 1, "stop runs once");
});

test("SIGINT and SIGTERM count as the same stop", async () => {
  const { output, signal } = await run(300, (kill) => {
    kill("SIGTERM");
    setTimeout(() => kill("SIGINT"), 50);
  });
  assert.equal(signal, null);
  assert.equal(output.match(/stopping/g)?.length, 1);
});

test("a signal well after the first forces the exit, so a hung server can't trap anyone", async () => {
  const { output, code } = await run(60_000, (kill) => {
    kill("SIGINT");
    setTimeout(() => kill("SIGINT"), 1300);
  });
  assert.equal(code, 130);
  assert.equal(output.includes("stopped"), false);
});
