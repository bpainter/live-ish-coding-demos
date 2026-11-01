// `pnpm install` with an unapproved build script does not run the script. This uses the repo's own
// install settings, on a local tarball, so it needs no network.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import { parse, stringify } from "yaml";
import { readJson, REPO, tempDir } from "../ci/lib.mts";

const root = tempDir("install-policy");
after(() => rmSync(root, { recursive: true, force: true }));
const marker = path.join(root, "script-ran");
const dep = path.join(root, "dep");
const app = path.join(root, "app");
mkdirSync(dep);
mkdirSync(app);
writeFileSync(path.join(dep, "package.json"), JSON.stringify({ name: "unapproved-dep", version: "1.0.0", scripts: { postinstall: "node -e \"require('fs').writeFileSync(process.env.MARK, 'ran')\"" } }));
execFileSync("npm", ["pack", "--silent"], { cwd: dep });
const tarball = "unapproved-dep-1.0.0.tgz";
copyFileSync(path.join(dep, tarball), path.join(app, tarball));

const { packageManager } = readJson<{ packageManager: string }>(path.join(REPO, "package.json"));
writeFileSync(path.join(app, "package.json"), JSON.stringify({ name: "app", version: "1.0.0", private: true, packageManager, dependencies: { "unapproved-dep": `file:${tarball}` } }));
const { minimumReleaseAge, permissions } = parse(readFileSync(path.join(REPO, "pnpm-workspace.yaml"), "utf8")) as Record<string, unknown>;

const install = () => {
  rmSync(path.join(app, "node_modules"), { recursive: true, force: true });
  rmSync(marker, { force: true });
  return spawnSync("pnpm", ["install"], { cwd: app, encoding: "utf8", env: { ...process.env, MARK: marker, CI: "" } });
};

test("an unlisted build script stops the install and does not run", () => {
  writeFileSync(path.join(app, "pnpm-workspace.yaml"), stringify({ minimumReleaseAge, permissions }));
  const result = install();
  assert.notEqual(result.status, 0, "pnpm should stop the install");
  assert.match(`${result.stdout}${result.stderr}`, /IGNORED_BUILDS|Ignored build scripts/);
  assert.ok(!existsSync(marker), "the script ran");
});

test("a denied build script stays off, and the install passes", () => {
  writeFileSync(path.join(app, "pnpm-workspace.yaml"), stringify({ minimumReleaseAge, permissions: { ...(permissions as object), "unapproved-dep": { build: false } } }));
  const result = install();
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!existsSync(marker), "the script ran");
});
