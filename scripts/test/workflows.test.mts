// Every job from the CI table exists, and each workflow holds to the rules: actions pinned to a full
// commit SHA, minimal permissions, and no secret a fork can reach.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { parse } from "yaml";
import { REPO } from "../ci/lib.mts";

const DIR = path.join(REPO, ".github", "workflows");
const JOBS = ["static", "unit", "pack", "starter", "conformance", "budgets", "cross-browser", "offline", "readme", "themes", "theme-budgets", "generated", "skills", "agent-evals", "parity", "matrix", "codeql"];

const workflows = readdirSync(DIR).map((file) => {
  const text = readFileSync(path.join(DIR, file), "utf8");
  return { file, text, doc: parse(text) as Record<string, any> };
});
const named = (name: string) => {
  const found = workflows.find((w) => w.file === `${name}.yml`);
  assert.ok(found, `no ${name}.yml`);
  return found;
};
const actions = ["setup", "start-deck"].map((name) => path.join(REPO, ".github", "actions", name, "action.yml"));

test("every job in the table has a workflow", () => {
  for (const job of [...JOBS, "publish"]) assert.ok(named(job));
});

test("every action is pinned to a full commit SHA", () => {
  const texts = [...workflows.map((w) => ({ file: w.file, text: w.text })), ...actions.map((file) => ({ file, text: readFileSync(file, "utf8") }))];
  for (const { file, text } of texts) {
    for (const [, use] of text.matchAll(/^\s*(?:- )?uses:\s*(\S+)/gm)) {
      if (use.startsWith("./")) continue;
      assert.match(use, /@[0-9a-f]{40}$/, `${file}: ${use}`);
    }
  }
});

test("every workflow sets read-only default permissions", () => {
  for (const { file, doc } of workflows) assert.deepEqual(doc.permissions, { contents: "read" }, file);
});

test("only the publish job and CodeQL raise a permission", () => {
  for (const { file, doc } of workflows) {
    for (const [id, job] of Object.entries<Record<string, any>>(doc.jobs)) {
      if (!job.permissions) continue;
      assert.ok((file === "publish.yml" && id === "stage") || file === "codeql.yml", `${file}: ${id} raises a permission`);
    }
  }
});

test("no workflow runs on pull_request_target", () => {
  for (const { file, doc } of workflows) assert.ok(!doc.on.pull_request_target, file);
});

test("agent evals can run for no fork and do nothing without the key", () => {
  const { doc, text } = named("agent-evals");
  assert.ok(!doc.on.pull_request, "a pull_request trigger could reach the secret");
  assert.ok(doc.on.schedule);
  const job = doc.jobs["agent-evals"];
  assert.equal(job.environment, "agent-evals");
  assert.equal(job["continue-on-error"], true);
  assert.match(job.if, /github\.ref_protected/);
  for (const step of job.steps.slice(1)) assert.match(step.if, /steps\.key\.outputs\.present/);
  assert.match(text, /secrets\.ANTHROPIC_API_KEY/);
});

test("parity runs on the private runner, never for a pull request", () => {
  const { doc } = named("parity");
  assert.ok(!doc.on.pull_request);
  assert.deepEqual(doc.jobs.parity["runs-on"], ["self-hosted", "live-ish-parity"]);
  assert.match(doc.jobs.parity.if, /vars\.PARITY_RUNNER/);
});

test("publishing stages through a protected environment, with no token", () => {
  const { doc, text } = named("publish");
  const stage = doc.jobs.stage;
  assert.equal(stage.environment, "npm-publish");
  assert.deepEqual(stage.permissions, { contents: "read", "id-token": "write" });
  assert.match(text, /npm stage publish/);
  assert.doesNotMatch(text, /npm publish\b/);
  assert.doesNotMatch(text, /stage approve/);
  assert.doesNotMatch(text.replace(/^#.*$/gm, ""), /NPM_TOKEN|NODE_AUTH_TOKEN|secrets\./);
  assert.match(doc.jobs.gate.if, /vars\.PUBLISH_ENABLED == 'true'/);
  assert.ok(Object.keys(doc.on).every((trigger) => trigger === "push"));
  assert.deepEqual(doc.on.push.tags, ["v*"]);
});

test("every blocking job runs on pull requests, and nightly jobs run on a schedule", () => {
  for (const job of ["static", "unit", "pack", "starter", "conformance", "budgets", "readme", "themes", "generated", "skills", "matrix"]) assert.ok(named(job).doc.on.pull_request !== undefined, job);
  for (const job of ["cross-browser", "offline", "theme-budgets", "agent-evals", "parity"]) assert.ok(named(job).doc.on.schedule, job);
  assert.ok(named("codeql").doc.on.schedule);
});

test("budgets warn for now", () => {
  assert.equal(named("budgets").doc.jobs.budgets["continue-on-error"], true);
});

test("Dependabot groups monthly with a three-day cooldown", () => {
  const { updates } = parse(readFileSync(path.join(REPO, ".github", "dependabot.yml"), "utf8")) as { updates: Record<string, any>[] };
  for (const update of updates) {
    assert.equal(update.schedule.interval, "monthly");
    assert.equal(update.cooldown["default-days"], 3);
    assert.ok(update.groups);
  }
});

test("the release hold in pnpm matches the cooldown", () => {
  const workspace = parse(readFileSync(path.join(REPO, "pnpm-workspace.yaml"), "utf8")) as Record<string, any>;
  assert.equal(workspace.minimumReleaseAge, 4320);
  assert.ok(workspace.permissions, "the reviewed list lives under permissions");
  assert.equal(workspace.dangerouslyAllowAllBuilds, undefined);
  for (const [name, grants] of Object.entries<Record<string, boolean>>(workspace.permissions)) assert.equal(grants.build, false, `${name} may run a build script. Review it, then update this test.`);
});

test("community files are all here", () => {
  for (const file of [
    "LICENSE",
    "README.md",
    "THIRD_PARTY.md",
    "CONTRIBUTING.md",
    "CODE_OF_CONDUCT.md",
    "SECURITY.md",
    "GOVERNANCE.md",
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".github/ISSUE_TEMPLATE/config.yml",
    ".github/ISSUE_TEMPLATE/bug.yml",
    ".github/ISSUE_TEMPLATE/demo-engine.yml",
    ".github/ISSUE_TEMPLATE/feature.yml",
    ".github/ISSUE_TEMPLATE/docs.yml",
  ])
    assert.ok(existsSync(path.join(REPO, file)), file);
  const config = parse(readFileSync(path.join(REPO, ".github", "ISSUE_TEMPLATE", "config.yml"), "utf8")) as { blank_issues_enabled: boolean };
  assert.equal(config.blank_issues_enabled, false);
});
