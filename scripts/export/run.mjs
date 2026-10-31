#!/usr/bin/env node
// One-time allow-list export from the source repo at a fixed commit. Usage:
//   node scripts/export/run.mjs <source repo> [commit]
// Output lands in the working tree. The pre-commit scan blocks anything that still names private terms.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [source, commit = "746e533"] = process.argv.slice(2);
if (!source) {
  console.error("usage: run.mjs <source repo> [commit]");
  process.exit(2);
}
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const toRegExp = (glob) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*")}$`);

const rules = [];
const excludes = [];
for (const raw of readFileSync(join(here, "export.allow"), "utf8").split("\n")) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  if (line.startsWith("!")) {
    excludes.push(toRegExp(line.slice(1)));
    continue;
  }
  const [glob, dest] = line.split(" => ");
  rules.push({ re: toRegExp(glob), dest, exact: !glob.includes("*") });
}

const tree = execFileSync("git", ["-C", source, "ls-tree", "-r", "--name-only", commit], { encoding: "utf8", maxBuffer: 1 << 28 }).split("\n").filter(Boolean);
let copied = 0;
for (const path of tree) {
  const rule = rules.find((r) => r.re.test(path));
  if (!rule) continue;
  if (!rule.exact && excludes.some((re) => re.test(path))) continue;
  const out = join(root, rule.dest, path.replace(/^(styles|public\/(runtime|theme|wrappers)|demos\/\d\d-[^/]+|eslint-plugin-local\/)\/?/, (m) => (m.startsWith("styles") ? "styles/" : m.startsWith("eslint") ? "eslint-plugin-local/" : "")).replace(/^(content|scripts|app)\//, ""));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, execFileSync("git", ["-C", source, "show", `${commit}:${path}`], { maxBuffer: 1 << 28 }));
  copied += 1;
}
console.log(`Exported ${copied} files from ${commit}.`);
