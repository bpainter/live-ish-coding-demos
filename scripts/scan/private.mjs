#!/usr/bin/env node
// Deny-list and binary allow-list check. Runs on every commit and in CI.
// Terms live base64-encoded in terms.b64 so this public repo does not spell them out.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.SCAN_ROOT ?? join(here, "..", "..");
const OWNER_ALLOWED = /^(LICENSE|(.*\/)?package\.json)$/;
const OWNER_TERMS = new Set(["bermon painter", "bermonpainter"]);
const BINARY = /\.(otf|ttf|woff2?|png|jpe?g|webp|avif|gif|ico)$/i;

const terms = readFileSync(join(here, "terms.b64"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => Buffer.from(line, "base64").toString("utf8").toLowerCase());

const allow = readFileSync(join(here, "binary-allow.txt"), "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((glob) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, ".*")}$`));

const self = relative(root, fileURLToPath(import.meta.url));
const listing = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 });
const files = listing.split("\0").filter(Boolean).filter((f) => existsSync(join(root, f)));

const findings = [];
for (const file of files) {
  if (file === self || file === "pnpm-lock.yaml") continue;
  for (const term of terms) {
    if (OWNER_TERMS.has(term) && OWNER_ALLOWED.test(file)) continue;
    if (file.toLowerCase().includes(term)) findings.push(`${file}: path contains a denied term`);
  }
  if (BINARY.test(file)) {
    if (!allow.some((re) => re.test(file))) findings.push(`${file}: binary not on the allow-list`);
    continue;
  }
  const buf = readFileSync(join(root, file));
  if (buf.includes(0)) continue;
  const text = buf.toString("utf8").toLowerCase();
  for (const term of terms) {
    if (OWNER_TERMS.has(term) && OWNER_ALLOWED.test(file)) continue;
    const at = text.indexOf(term);
    if (at !== -1) findings.push(`${file}:${text.slice(0, at).split("\n").length}: denied term "${term.slice(0, 3)}…"`);
  }
}

if (findings.length) {
  console.error(`scan:private failed with ${findings.length} finding(s):`);
  for (const f of findings.slice(0, 200)) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`scan:private passed: ${files.length} files, ${terms.length} terms.`);
