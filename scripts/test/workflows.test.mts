// Every job from the CI table exists, and each workflow holds to the rules: actions pinned to a full
// commit SHA, minimal permissions, and no secret a fork can reach.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { parse } from "yaml";
import { REPO } from "../ci/lib.mts";

const DIR = path.join(REPO, ".github", "workflows");
const JOBS = ["static", "unit", "pack", "starter", "conformance", "budgets", "cross-browser", "offline", "hosting", "readme", "themes", "theme-budgets", "generated", "skills", "agent-evals", "parity", "matrix", "codeql"];

const workflows = readdirSync(DIR).map((file) => {
  const text = readFileSync(path.join(DIR, file), "utf8");
  return { file, text, doc: parse(text) as Record<string, any> };
});
const named = (name: string) => {
  const found = workflows.find((w) => w.file === `${name}.yml`);
  assert.ok(found, `no ${name}.yml`);
  return found;
};
const actions = ["setup", "start-deck", "upload-results"].map((name) => path.join(REPO, ".github", "actions", name, "action.yml"));

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

test("only the publish jobs and CodeQL raise a permission", () => {
  for (const { file, doc } of workflows) {
    for (const [id, job] of Object.entries<Record<string, any>>(doc.jobs)) {
      if (!job.permissions) continue;
      assert.ok((file === "publish.yml" && (id === "stage" || id === "results")) || file === "codeql.yml", `${file}: ${id} raises a permission`);
    }
  }
});

test("the one job that can write to the repository runs no repository code", () => {
  const { results } = named("publish").doc.jobs;
  assert.deepEqual(results.permissions, { contents: "write" });
  assert.ok(!JSON.stringify(results.steps).includes("actions/checkout"));
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
  for (const job of ["static", "unit", "pack", "starter", "conformance", "budgets", "hosting", "readme", "themes", "generated", "skills", "matrix"]) assert.ok(named(job).doc.on.pull_request !== undefined, job);
  for (const job of ["conformance", "cross-browser", "offline", "hosting", "theme-budgets", "agent-evals", "parity"]) assert.ok(named(job).doc.on.schedule, job);
  assert.ok(named("codeql").doc.on.schedule);
});

test("budgets warn on a pull request and block a release", () => {
  const { doc } = named("budgets");
  assert.equal(doc.jobs.budgets["continue-on-error"], "${{ !inputs.blocking }}");
  assert.equal(doc.on.workflow_call.inputs.blocking.default, false);
  assert.equal(named("publish").doc.jobs.budgets.with.blocking, true);
});

/** Each workflow the publish workflow calls, by the id of the job that calls it. */
const called = () =>
  Object.entries<Record<string, any>>(named("publish").doc.jobs).flatMap(([id, job]) => {
    const name = /workflows\/(.+)\.yml$/.exec(job.uses ?? "")?.[1];
    return name ? [{ id, ...named(name) }] : [];
  });

test("nothing is staged until every called workflow has passed", () => {
  const { stage, results } = named("publish").doc.jobs;
  assert.equal(stage.needs, "results");
  assert.deepEqual(
    [...results.needs].sort(),
    called()
      .map((w) => w.id)
      .sort(),
  );
  for (const job of ["static", "unit", "pack", "starter", "conformance", "budgets", "cross-browser", "offline", "hosting", "readme", "themes", "theme-budgets", "generated", "skills", "matrix"])
    assert.ok(results.needs.includes(job), `${job} does not block a release`);
});

test("every published guarantee blocks a release", () => {
  const guarantees = ["walk --mode=focus", "walk --mode=advance", "walk --mode=underlay", "walk --mode=keys", "walk --mode=a11y", "perf headers", "perf load", "axe --presenter", "axe --origin", "test:contrast"];
  const release = called().map((w) => w.text);
  for (const command of guarantees)
    assert.ok(
      release.some((text) => text.includes(command)),
      `no release workflow runs ${command}`,
    );
  const { text: themes } = named("themes");
  assert.match(themes, /walk --mode=a11y --chrome="\$THEME"/);
});

test("a job that blocks a release cannot pass by failing", () => {
  for (const { file, doc, id } of called()) {
    for (const [name, job] of Object.entries<Record<string, any>>(doc.jobs)) {
      if (id === "budgets") continue;
      assert.equal(job["continue-on-error"], undefined, `${file}: ${name}`);
    }
  }
});

test("a walk that measures posters always captures them first", () => {
  for (const { file, text } of workflows) {
    if (!/--mode=underlay|live-ish parity/.test(text)) continue;
    assert.match(text, /capture: "1"/, `${file} walks the underlay of a deck with no posters`);
  }
});

test("each measuring job keeps its raw results, even on a failed run", () => {
  for (const name of ["conformance", "budgets", "themes", "theme-budgets", "hosting"]) {
    const { doc } = named(name);
    const uploads = Object.values<Record<string, any>>(doc.jobs).flatMap((job) => (job.steps ?? []).filter((step: Record<string, any>) => step.uses === "./.github/actions/upload-results"));
    assert.ok(uploads.length, `${name} uploads nothing`);
    for (const step of uploads) assert.equal(step.if, "${{ !cancelled() }}", name);
  }
});

test("gitleaks scans the whole history, with a binary held to its hash", () => {
  const { gitleaks } = named("static").doc.jobs;
  assert.equal(gitleaks.steps[0].with["fetch-depth"], 0);
  assert.match(gitleaks.env.GITLEAKS_SHA256, /^[0-9a-f]{64}$/);
  assert.match(JSON.stringify(gitleaks.steps), /sha256sum --check/);
  assert.equal(existsSync(path.join(REPO, ".gitleaks.toml")), false, "an allow-list needs a stated reason, here and in docs/decisions.md");
});

test("cross-browser walks the conformance deck and the starter", () => {
  const { matrix } = named("cross-browser").doc.jobs["cross-browser"].strategy;
  assert.deepEqual(matrix.browser, ["webkit", "firefox"]);
  assert.deepEqual(matrix.deck, ["conformance", "starter"]);
});

test("parity can pass from a clean checkout", () => {
  const steps = named("parity").doc.jobs.parity.steps as Record<string, any>[];
  assert.match(steps.find((s) => s.uses === "./.github/actions/setup")?.with.browsers, /\bwebkit\b/);
  assert.equal(steps.find((s) => s.uses === "./.github/actions/start-deck")?.with.capture, "1");
  assert.equal(named("parity").doc.jobs.parity.env.LIVE_ISH_SITE_ORIGIN, "http://localhost:3400", "canonical URLs need the origin the rows read");
});

test("generated skills are checked from the repo root, where the check is real", () => {
  const { text } = named("generated");
  assert.match(text, /pnpm live-ish skills sync --check/);
  assert.doesNotMatch(text, /--filter starter exec live-ish skills/);
});

test("every example answers `pnpm --filter <deck> walk`", () => {
  for (const deck of readdirSync(path.join(REPO, "examples"))) {
    const manifest = JSON.parse(readFileSync(path.join(REPO, "examples", deck, "package.json"), "utf8")) as { scripts: Record<string, string> };
    assert.equal(manifest.scripts.walk, "live-ish walk", deck);
  }
});

test("`pnpm test` runs every package's tests, the docs included", () => {
  const manifest = JSON.parse(readFileSync(path.join(REPO, "package.json"), "utf8")) as { scripts: Record<string, string> };
  for (const name of ["@live-ish/engine", "@live-ish/bridge", "@live-ish/verify", "docs"]) assert.ok(manifest.scripts.test.includes(`--filter ${name} test`), name);
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
