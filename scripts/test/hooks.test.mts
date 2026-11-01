// The commit-msg hook does what AGENTS.md and CONTRIBUTING.md say hooks enforce.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { accessSync, constants, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { REPO } from "../ci/lib.mts";

const HOOK = path.join(REPO, ".githooks", "commit-msg");
const dir = mkdtempSync(path.join(os.tmpdir(), "commit-msg-"));
const SIGNED = "Signed-off-by: A Contributor <a@example.com>";

function run(message: string) {
  const file = path.join(dir, "COMMIT_EDITMSG");
  writeFileSync(file, message);
  const { status, stderr } = spawnSync(HOOK, [file], { encoding: "utf8" });
  return { status, stderr };
}

after(() => rmSync(dir, { recursive: true, force: true }));

test("the hook is executable, or git skips it without a word", () => {
  accessSync(HOOK, constants.X_OK);
});

test("a Conventional Commits subject with a sign-off passes", () => {
  assert.equal(run(`fix(verify): close a race\n\n${SIGNED}\n`).status, 0);
  assert.equal(run(`feat!: drop the old flag\n\nA body line.\n\n${SIGNED}\n`).status, 0);
});

test("a commit with no sign-off fails and says how to fix it", () => {
  const { status, stderr } = run("fix: close a race\n");
  assert.equal(status, 1);
  assert.match(stderr, /git commit -s/);
});

test("a sign-off needs a name and an address", () => {
  assert.equal(run("fix: close a race\n\nSigned-off-by: nobody\n").status, 1);
});

test("a sign-off inside a line does not count", () => {
  assert.equal(run(`fix: quote the trailer\n\nThe line "${SIGNED}" is an example.\n`).status, 1);
});

test("a subject outside Conventional Commits fails", () => {
  assert.equal(run(`Close a race\n\n${SIGNED}\n`).status, 1);
});

test("agent attribution fails, even when signed off", () => {
  const trailer = ["Co-Authored", "By: Claude <noreply@anthropic.com>"].join("-");
  assert.equal(run(`fix: close a race\n\n${SIGNED}\n${trailer}\n`).status, 1);
});
