/**
 * The `pack` job. Packs every published package, then reads each tarball's manifest: every `bin`,
 * every `exports` target and every `types` entry must be a file in the tarball, the shared metadata
 * must hold, no `workspace:` range may survive, and nothing that belongs to the repo may ship.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { packAll, tempDir } from "./lib.mts";

const out = tempDir("pack");
const tarballs = packAll(path.join(out, "tarballs"));
const failures: string[] = [];
const fail = (name: string, message: string) => failures.push(`${name}: ${message}`);

type ExportValue = string | { [condition: string]: ExportValue };

/** Every file path an `exports` entry names. */
function targets(value: ExportValue): string[] {
  return typeof value === "string" ? [value] : Object.values(value).flatMap(targets);
}

function exists(root: string, target: string): boolean {
  const file = path.join(root, target);
  if (!target.includes("*")) return existsSync(file);
  // `./src/routes/*.tsx`: the folder must hold at least one match.
  const [before, after] = path.basename(target).split("*");
  const dir = path.dirname(file);
  return existsSync(dir) && readdirSync(dir).some((f) => f.startsWith(before) && f.endsWith(after));
}

function walk(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) walk(file, found);
    else found.push(file);
  }
  return found;
}

for (const [name, tarball] of Object.entries(tarballs)) {
  const root = path.join(out, name.replace("/", "-"));
  execFileSync("mkdir", ["-p", root]);
  execFileSync("tar", ["-xzf", tarball, "-C", root, "--strip-components=1"]);
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as Record<string, any>;

  for (const field of ["name", "version", "license", "homepage", "repository", "engines", "files", "exports"]) if (!pkg[field]) fail(name, `package.json has no ${field}.`);
  for (const [bin, file] of Object.entries<string>(pkg.bin ?? {})) if (!exists(root, file)) fail(name, `bin ${bin} points at ${file}, which is not in the tarball.`);
  for (const [entry, value] of Object.entries<ExportValue>(pkg.exports ?? {})) for (const target of targets(value)) if (!exists(root, target)) fail(name, `exports["${entry}"] points at ${target}, which is not in the tarball.`);
  for (const group of ["dependencies", "peerDependencies", "optionalDependencies"]) for (const [dep, range] of Object.entries<string>(pkg[group] ?? {})) if (range.startsWith("workspace:")) fail(name, `${group}.${dep} still says ${range}.`);

  const shipped = walk(root).map((f) => path.relative(root, f));
  for (const file of shipped) if (/(^|\/)(_source|\.next|test|node_modules)(\/|$)/.test(file) && !/^templates\//.test(file)) fail(name, `ships ${file}.`);
  if (!shipped.includes("LICENSE") && !shipped.includes("README.md")) console.log(`note ${name}: no LICENSE or README in the tarball`);
  console.log(`ok   ${name}@${pkg.version}: ${shipped.length} files`);
}

if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
console.log(`pack: ${Object.keys(tarballs).length} tarballs passed`);
