// One version across the four packages, in a Changesets fixed group, with complete metadata (R-10.2).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { PUBLISHED, readJson, REPO } from "../ci/lib.mts";

type Manifest = Record<string, any>;

const present = Object.entries(PUBLISHED)
  .map(([folder, name]) => ({ folder, name, file: path.join(REPO, "packages", folder, "package.json") }))
  .filter((p) => existsSync(p.file))
  .map((p) => ({ ...p, pkg: readJson<Manifest>(p.file) }));

test("the fixed group covers all four packages and only those", () => {
  const config = readJson<{ fixed: string[][]; access: string; baseBranch: string }>(path.join(REPO, ".changeset", "config.json"));
  assert.equal(config.fixed.length, 1);
  const covers = (name: string) => config.fixed[0].some((glob) => (glob.endsWith("/*") ? name.startsWith(glob.slice(0, -1)) : glob === name));
  for (const name of Object.values(PUBLISHED)) assert.ok(covers(name), `${name} is outside the fixed group`);
  for (const name of ["docs", "starter", "conformance", "live-ish-monorepo"]) assert.ok(!covers(name), `${name} must not be in the group`);
  assert.equal(config.access, "public");
  assert.equal(config.baseBranch, "main");
});

test("pre-releases go to the next tag", () => {
  const pre = readJson<{ mode: string; tag: string }>(path.join(REPO, ".changeset", "pre.json"));
  assert.equal(pre.mode, "pre");
  assert.equal(pre.tag, "next");
});

test("every package here has the same version", () => {
  const versions = new Set(present.map((p) => p.pkg.version));
  assert.equal(versions.size, 1, `versions differ: ${present.map((p) => `${p.name}@${p.pkg.version}`).join(", ")}`);
  assert.match([...versions][0], /^\d+\.\d+\.\d+(-next\.\d+)?$/);
});

test("every package here has its metadata", () => {
  for (const { folder, name, pkg } of present) {
    assert.equal(pkg.name, name);
    for (const field of ["bin", "repository", "homepage", "license", "files", "exports", "engines"]) {
      // `@live-ish/bridge` is a library with no command.
      if (field === "bin" && folder === "bridge") continue;
      assert.ok(pkg[field], `${name} has no ${field}`);
    }
    assert.equal(pkg.license, "MIT");
    assert.equal(pkg.repository.directory, `packages/${folder}`);
    assert.equal(pkg.engines.node, ">=22");
    assert.equal(pkg.publishConfig?.access, "public", `${name} needs publishConfig.access`);
  }
});

test("the repo's own tools stay pinned", () => {
  const root = readJson<Manifest>(path.join(REPO, "package.json"));
  assert.match(root.packageManager, /^pnpm@\d+\.\d+\.\d+\+sha512\./);
  for (const [dep, range] of Object.entries<string>({ ...root.devDependencies })) assert.match(range, /^\d/, `${dep} is not an exact version`);
});

test("no npm token anywhere in the tracked tree", () => {
  const listing = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: REPO, encoding: "utf8", maxBuffer: 1 << 28 });
  const offenders = listing
    .split("\0")
    .filter((file) => file && existsSync(path.join(REPO, file)) && /\.(ya?ml|json|mjs|mts|ts|sh|npmrc)$|^\.npmrc$/.test(file) && file !== "scripts/test/packages.test.mts" && file !== "scripts/test/workflows.test.mts")
    .filter((file) => /NPM_TOKEN|NODE_AUTH_TOKEN/.test(readFileSync(path.join(REPO, file), "utf8")));
  assert.deepEqual(offenders, []);
});
