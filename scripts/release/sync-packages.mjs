#!/usr/bin/env node
// Writes the metadata all four published packages share: one version, the homepage, the repository,
// the license, the engine range and public access. Run it when a package joins the group. Changesets
// keeps the version in step after that, and `scripts/test/packages.test.mts` fails on any drift.
//
//   node scripts/release/sync-packages.mjs [--version 0.1.0-next.0]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FOLDERS = ["engine", "verify", "bridge", "create"];
const REPOSITORY = "git+https://github.com/bpainter/live-ish-coding-demos.git";
const HOMEPAGE = "https://live-ish.dev";

const at = process.argv.indexOf("--version");
const version = at === -1 ? JSON.parse(readFileSync(path.join(root, "packages", "engine", "package.json"), "utf8")).version : process.argv[at + 1];

for (const folder of FOLDERS) {
  const file = path.join(root, "packages", folder, "package.json");
  if (!existsSync(file)) {
    console.log(`packages/${folder}: not here yet`);
    continue;
  }
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  const { name, description, ...rest } = pkg;
  const next = {
    name,
    version,
    description,
    license: "MIT",
    homepage: HOMEPAGE,
    repository: { type: "git", url: REPOSITORY, directory: `packages/${folder}` },
    bugs: { url: "https://github.com/bpainter/live-ish-coding-demos/issues" },
    ...rest,
    version,
    license: "MIT",
    homepage: HOMEPAGE,
    repository: { type: "git", url: REPOSITORY, directory: `packages/${folder}` },
    engines: { node: ">=22" },
    exports: pkg.exports ?? { "./package.json": "./package.json" },
    publishConfig: { access: "public", tag: "next" },
  };
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`packages/${folder}: ${name}@${version}`);
}
