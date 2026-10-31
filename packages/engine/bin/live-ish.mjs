#!/usr/bin/env node
// A small shim: check Node first, so an old version gets a sentence and not a syntax error, then
// run the TypeScript CLI through tsx with the conditions the engine's server modules expect.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const major = Number.parseInt(process.versions.node, 10);
if (major < 22) {
  console.error(`live-ish needs Node 22 or later. This is Node ${process.versions.node}.`);
  process.exit(3);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const tsx = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
const main = path.join(here, "..", "src", "cli", "main.ts");
const child = spawn(process.execPath, ["--conditions=react-server", "--import", tsx, main, ...process.argv.slice(2)], { stdio: "inherit" });

// The CLI stops its own children, so a signal only has to reach it.
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 3)));
