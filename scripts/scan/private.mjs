#!/usr/bin/env node
// Deny-list and binary allow-list check. Runs on every commit and in CI.
// Terms live as salted hashes in terms.hashed. Only patterns that are public anyway stay readable here.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { addTerms, allowGlob, readList, scan, writeList } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.SCAN_ROOT ?? join(here, "..", "..");
const LIST = join(here, "terms.hashed");
const PLAIN = ["/users/", "/private/tmp/"];
const OWNER_ALLOWED = /^(LICENSE|(.*\/)?package\.json)$/;
const BINARY = /\.(otf|ttf|woff2?|png|jpe?g|webp|avif|gif|ico)$/i;

const list = readList(LIST);

// Reads stdin so a new term lands in neither an argument list nor a shell history.
if (process.argv[2] === "--add") {
  const before = list.hashes.size;
  addTerms(list, readFileSync(0, "utf8").split("\n"));
  writeList(LIST, list, readFileSync(LIST, "utf8").split("\n").filter((line) => line.startsWith("#")));
  console.log(`scan:private added ${list.hashes.size - before} term(s).`);
  process.exit(0);
}

const allow = readFileSync(join(here, "binary-allow.txt"), "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map(allowGlob);

const self = relative(root, fileURLToPath(import.meta.url));
const listing = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 });
const files = listing.split("\0").filter(Boolean).filter((f) => existsSync(join(root, f)));

const findings = scan({ root, files, list, plain: PLAIN, allow, binary: BINARY, ownerAllowed: OWNER_ALLOWED, skip: (file) => file === self || file === "pnpm-lock.yaml" });

if (findings.length) {
  console.error(`scan:private failed with ${findings.length} finding(s):`);
  for (const f of findings.slice(0, 200)) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`scan:private passed: ${files.length} files, ${list.hashes.size + PLAIN.length} terms.`);
