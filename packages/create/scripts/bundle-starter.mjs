#!/usr/bin/env node
// Copies examples/starter into template/ at pack time. The copy is generated and git-ignored, so the
// starter stays the one source. The shell is left out: the scaffolder writes it from the installed
// engine, the same way `live-ish upgrade` does.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "..", "..", "..");
const starter = path.join(repo, "examples", "starter");
const engine = path.join(repo, "packages", "engine");
const out = path.join(here, "..", "template");

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

/** Everything the shell writes, by its top-level name. Templates name the files, so this cannot drift. */
const shell = new Set(readdirSync(path.join(engine, "shell")).map((name) => (name === "gitignore" ? ".gitignore" : name)));
const generated = new Set(["node_modules", ".next", ".live-ish", "next-env.d.ts", "live-ish.shell.json", "AGENTS.md", "CLAUDE.md", ".agents", ".claude"]);

function keep(source) {
  const rel = path.relative(starter, source).split(path.sep).join("/");
  if (rel === "") return true;
  if (rel === "package.json" || rel === "public/live-ish" || rel === "public/opt") return false;
  const top = rel.split("/")[0];
  return !shell.has(top) && !generated.has(top) && !top.startsWith(".next") && !rel.endsWith(".tsbuildinfo");
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(starter, out, { recursive: true, filter: keep });

const { description, license, dependencies, devDependencies, scripts } = readJson(path.join(starter, "package.json"));
const { version, peerDependencies } = readJson(path.join(engine, "package.json"));
const { typecheck: _repoOnly, ...deckScripts } = scripts;
const manifest = {
  name: "deck",
  version: "0.1.0",
  private: true,
  description,
  license,
  scripts: deckScripts,
  dependencies: { ...dependencies, "@live-ish/engine": version, next: peerDependencies.next, react: peerDependencies.react, "react-dom": peerDependencies["react-dom"] },
  devDependencies,
};
writeFileSync(path.join(out, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
if (!existsSync(path.join(out, "deck.config.ts"))) throw new Error("The starter has no deck.config.ts.");
console.log(`bundled examples/starter into template/ for @live-ish/engine ${version}`);
