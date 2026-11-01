#!/usr/bin/env node
// A small shim, as the engine's own: the Node check runs first, then the TypeScript through tsx.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const [major] = process.versions.node.split(".").map(Number);
if (major < 22) {
  console.error(`live-ish-verify needs Node 22 or later. This is ${process.version}.`);
  process.exit(3);
}
const here = dirname(fileURLToPath(import.meta.url));
const tsx = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
const child = spawn(process.execPath, ["--conditions=react-server", "--import", tsx, join(here, "..", "src", "main.ts"), ...process.argv.slice(2)], { stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
