/**
 * Trigger prompts and golden tasks, run in Claude Code. The data lives in each skill's `evals/`.
 *
 *   pnpm evals:claude                         prints the plan, and spends nothing
 *   pnpm evals:claude --run                   runs everything
 *   pnpm evals:claude --run --kind golden --task theme --model haiku --budget 0.5 --out report.json
 *
 * Every run gets a fresh deck, with only project settings, so a machine's own skills, plugins and
 * servers cannot change the result. It uses the Claude Code you are signed in to, and CI never runs
 * it, so this repo holds no AI key. Exit codes: 0 pass, 1 failures, 2 misuse, 3 environment.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { skillSources } from "../packages/engine/src/lib/skills";
import { applyStep, baseline, cli, freshDeck, judge, readGolden, readTriggers, type GoldenTask } from "../packages/engine/test/skills-golden";

const { values } = parseArgs({
  options: {
    run: { type: "boolean", default: false },
    kind: { type: "string", default: "all" },
    skill: { type: "string" },
    task: { type: "string" },
    model: { type: "string", default: "sonnet" },
    budget: { type: "string", default: "1" },
    out: { type: "string" },
    "no-build": { type: "boolean", default: false },
  },
});

if (!["all", "triggers", "golden"].includes(values.kind)) {
  console.error('--kind takes "all", "triggers" or "golden".');
  process.exit(2);
}

// Deck skills only: a contributor skill runs in the monorepo, so a fresh deck cannot hold it.
const skills = skillSources()
  .filter((s) => s.audience === "deck" && (!values.skill || s.name === values.skill))
  .map((s) => s.name);

if (values.skill && !skills.length) {
  console.error(`No deck skill named "${values.skill}".`);
  process.exit(2);
}

interface Result {
  kind: "trigger" | "golden";
  skill: string;
  name: string;
  ok: boolean;
  detail: string[];
}

const BASE = ["--output-format", "stream-json", "--verbose", "--no-session-persistence", "--setting-sources", "project", "--strict-mcp-config", "--model", values.model, "--max-budget-usd", values.budget];

function claude(deck: string, prompt: string, extra: string[]) {
  const run = spawnSync("claude", ["-p", prompt, ...BASE, ...extra], { cwd: deck, encoding: "utf8", timeout: 600_000, maxBuffer: 1 << 28 });
  const events = run.stdout
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as { type?: string; total_cost_usd?: number; is_error?: boolean; result?: string; message?: { content?: { type: string; name?: string; input?: { skill?: string } }[] } }];
      } catch {
        return [];
      }
    });
  const tools = events.flatMap((e) => (e.type === "assistant" ? (e.message?.content ?? []) : [])).filter((c) => c.type === "tool_use");
  const result = events.find((e) => e.type === "result");
  // No login reads the same on every run, so one run is enough to stop on.
  if (result?.is_error && /log(ged)? ?in|api key/i.test(result.result ?? "")) {
    console.error(`Claude Code cannot run: ${result.result}`);
    process.exit(3);
  }
  return { code: run.status, skills: tools.filter((t) => t.name === "Skill").map((t) => t.input?.skill ?? ""), cost: result?.total_cost_usd ?? 0 };
}

let spent = 0;

function trigger(skill: string, prompt: string, should: boolean): Result {
  const { deck, done } = freshDeck("live-ish-evals-");
  try {
    cli(deck, ["add", "agents"]);
    // Only the Skill tool, so a run stops at the choice this measures.
    const run = claude(deck, prompt, ["--tools", "Skill"]);
    spent += run.cost;
    const fired = run.skills.some((s) => s === skill || s.endsWith(`:${skill}`));
    return { kind: "trigger", skill, name: prompt, ok: fired === should && run.code === 0, detail: [`${should ? "should" : "should not"} trigger`, `used: ${run.skills.join(", ") || "none"}`] };
  } finally {
    done();
  }
}

function golden(skill: string, task: GoldenTask): Result {
  const { deck, done } = freshDeck("live-ish-evals-");
  try {
    cli(deck, ["add", "agents"]);
    for (const step of task.setup) {
      const problem = applyStep(deck, step);
      if (problem) return { kind: "golden", skill, name: task.id, ok: false, detail: [`setup: ${problem}`] };
    }
    baseline(deck);
    // Edits and the CLI only. Nothing here can reach past the temp deck by itself.
    const run = claude(deck, task.prompt, ["--permission-mode", "acceptEdits", "--allowedTools", "Read", "Glob", "Grep", "Edit", "Write", "Skill", "Bash(pnpm live-ish:*)", "Bash(npx live-ish:*)"]);
    spent += run.cost;
    const verdict = judge(deck, task.pass, { build: !values["no-build"], walk: true });
    return { kind: "golden", skill, name: task.id, ok: verdict.ok && run.code === 0, detail: [`exit ${run.code}`, `skills: ${run.skills.join(", ") || "none"}`, ...verdict.problems] };
  } finally {
    done();
  }
}

const plan: { label: string; go(): Result }[] = [];
for (const skill of skills) {
  if (values.kind !== "golden" && !values.task) {
    const { should, should_not } = readTriggers(skill);
    for (const prompt of should) plan.push({ label: `trigger  ${skill}: ${prompt}`, go: () => trigger(skill, prompt, true) });
    for (const prompt of should_not) plan.push({ label: `no-fire  ${skill}: ${prompt}`, go: () => trigger(skill, prompt, false) });
  }
  if (values.kind !== "triggers") {
    for (const task of readGolden(skill).tasks) {
      if (!values.task || task.id === values.task) plan.push({ label: `golden   ${skill}: ${task.prompt}`, go: () => golden(skill, task) });
    }
  }
}

if (!values.run) {
  for (const { label } of plan) console.log(label);
  console.log(`\n${plan.length} run(s), at most $${values.budget} each. Nothing ran. Add --run to spend.`);
  process.exit(0);
}

const version = spawnSync("claude", ["--version"], { encoding: "utf8" });
if (version.status !== 0) {
  console.error("Claude Code is not on PATH.");
  process.exit(3);
}

const results: Result[] = [];
for (const { label, go } of plan) {
  const result = go();
  results.push(result);
  console.log(`${result.ok ? "pass" : "FAIL"}  ${label}`);
  for (const line of result.detail) console.log(`      ${line}`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed, $${spent.toFixed(2)} spent, on Claude Code ${version.stdout.trim()}.`);
if (values.out) writeFileSync(values.out, `${JSON.stringify({ version: 1, claude: version.stdout.trim(), model: values.model, spent, results }, null, 2)}\n`);
process.exit(failed ? 1 : 0);
