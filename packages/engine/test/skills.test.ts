import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { agentsBlock, agentsTemplate, AGENTS_OUTPUT, applyPlan, BLOCK_BEGIN, BLOCK_END, CLAUDE_OUTPUT, hashOf, INCOMING, LOCK, mergeFrontmatter, prependBlock, readLock, refreshBlock, renderSkills, repoDrift, skillSources, SKILL_SOURCE } from "../src/lib/skills";
import { listThemes } from "../src/lib/chrome-themes";
import { applyStep, baseline, changedPaths, cli, ENGINE, freshDeck, judge, judgeChanges, readGolden, readTriggers, REPO, type Step } from "./skills-golden";
import { commandsIn, CONTRIBUTOR_SKILLS, DECK_SKILLS, LIMITS, lintSkill, MANUAL, missingReferences, parseSkill, pnpmScriptsIn, TOOL_ONLY } from "./skills-lint";

const SCHEMA = "1";
const all = [...DECK_SKILLS, ...CONTRIBUTOR_SKILLS].sort();
const read = (...parts: string[]) => readFileSync(path.join(...parts), "utf8");

// --- Structure ------------------------------------------------------------------------------------

test("skills: the nine deck skills and the four contributor skills, and no others", () => {
  assert.deepEqual(skillSources().map((s) => s.name), all);
  assert.deepEqual(skillSources().filter((s) => s.audience === "contributor").map((s) => s.name), [...CONTRIBUTOR_SKILLS].sort());
});

test("skills: every source obeys the spec limits and the four rules", () => {
  for (const { dir } of skillSources()) assert.deepEqual(lintSkill(dir, SCHEMA), []);
});

test("skills: the lint catches each limit", () => {
  const { deck: root, done } = freshDeck();
  try {
    const dir = path.join(root, "bad--name");
    mkdirSync(path.join(dir, "references", "deep"), { recursive: true });
    const long = "x".repeat(LIMITS.description + 1);
    writeFileSync(path.join(dir, "SKILL.md"), `---\nname: bad--name\ndescription: ${long}\nallowed-tools: Bash\nmetadata:\n  live-ish-schema: "0"\n---\n\n${"line\n".repeat(LIMITS.bodyLines)}`);
    const text = lintSkill(dir, SCHEMA).join("\n");
    for (const want of ["allowed-tools", "name breaks the spec", "description is", "must say when to trigger", "must say when not to trigger", "live-ish-schema", "body is 50", "missing the rule", "nests a folder"]) assert.match(text, new RegExp(want));
  } finally {
    done();
  }
});

test("skills: the shared file holds no tool-only key, and the manual skills hold both in their own copy", () => {
  const rendered = renderSkills("repo");
  for (const { name, dir } of skillSources()) {
    const shared = read(dir, "SKILL.md");
    for (const key of TOOL_ONLY) assert.ok(!shared.includes(key), `${name} shares ${key}`);
    const claude = rendered.get(`${CLAUDE_OUTPUT}/${name}/SKILL.md`) as string;
    const codex = rendered.get(`${AGENTS_OUTPUT}/${name}/agents/openai.yaml`);
    assert.equal(rendered.get(`${AGENTS_OUTPUT}/${name}/SKILL.md`), shared, "the Agents copy is the shared file");
    assert.equal(rendered.has(`${CLAUDE_OUTPUT}/${name}/agents/openai.yaml`), false, "Codex settings stay out of the Claude copy");
    if (MANUAL.includes(name)) {
      assert.match(claude.split("---")[1], /^disable-model-invocation: true$/m, name);
      assert.match(codex ?? "", /^policy:\n {2}allow_implicit_invocation: false$/m, name);
    } else {
      assert.equal(claude, shared, `${name} is model-invoked, so its copies match`);
      assert.equal(codex, undefined, name);
    }
  }
});

test("skills: every named reference exists in both generated copies", () => {
  const rendered = renderSkills("repo");
  for (const { name, dir } of skillSources()) {
    const refs = [...read(dir, "SKILL.md").matchAll(/references\/[\w-]+\.md/g)].map((m) => m[0]);
    for (const ref of refs) {
      assert.ok(rendered.has(`${AGENTS_OUTPUT}/${name}/${ref}`), `${name} ${ref}`);
      assert.ok(rendered.has(`${CLAUDE_OUTPUT}/${name}/${ref}`), `${name} ${ref}`);
    }
  }
  assert.ok(existsSync(path.join(SKILL_SOURCE, "add-web-demo", "references", "server.md")));
  assert.deepEqual(missingReferences(path.join(SKILL_SOURCE, "add-web-demo")), []);
});

test("skills: references/themes.md comes from the theme files, in both theme skills", () => {
  assert.ok(!existsSync(path.join(SKILL_SOURCE, "apply-chrome-theme", "references", "themes.md")), "generated, so no source copy");
  const rendered = renderSkills();
  for (const skill of ["apply-chrome-theme", "create-chrome-theme"]) {
    const text = rendered.get(`${AGENTS_OUTPUT}/${skill}/references/themes.md`) as string;
    for (const t of listThemes()) assert.match(text, new RegExp(`\`${t.id}\` \\| ${t.name} \\|`), `${skill} lists ${t.id}`);
  }
});

test("skills: evals hold prompts, and the golden table is covered once each", () => {
  const prompts = new Map<string, string>();
  for (const name of all) {
    const triggers = readTriggers(name);
    const golden = readGolden(name);
    assert.equal(triggers.skill, name);
    assert.equal(golden.skill, name);
    assert.equal(triggers.invocation, MANUAL.includes(name) ? "manual" : "model", name);
    assert.ok(triggers.should_not.length >= 3, `${name} needs prompts that should not trigger it`);
    if (MANUAL.includes(name)) assert.deepEqual(triggers.should, [], `${name} never triggers by itself`);
    else assert.ok(triggers.should.length >= 3, `${name} needs prompts that should trigger it`);
    assert.ok(golden.tasks.length > 0 || golden.why, `${name} needs a task, or a reason it has none`);
    for (const task of golden.tasks) prompts.set(task.id, task.prompt);
  }
  assert.deepEqual([...prompts.keys()].sort(), ["check", "copy", "custom-theme", "notes", "terminal-demo", "theme", "web-demo"]);
});

// --- Instructions ---------------------------------------------------------------------------------

test("instructions: every AGENTS.md is under the line target, and each package has one", () => {
  const packages = readdirSync(path.join(REPO, "packages")).filter((p) => existsSync(path.join(REPO, "packages", p, "package.json")));
  const files = ["AGENTS.md", "CLAUDE.md", ...packages.map((p) => `packages/${p}/AGENTS.md`), "packages/engine/templates/agents/AGENTS.md", "packages/engine/templates/agents/CLAUDE.md"];
  for (const file of files) {
    assert.ok(existsSync(path.join(REPO, file)), `${file} is missing`);
    assert.ok(read(REPO, file).split("\n").length < LIMITS.instructionLines, `${file} is too long`);
  }
});

test("instructions: CLAUDE.md has one job", () => {
  assert.equal(read(REPO, "CLAUDE.md"), "@AGENTS.md\n");
  assert.equal(read(ENGINE, "templates", "agents", "CLAUDE.md"), "@AGENTS.md\n");
});

test("instructions: the deck block states every rule", () => {
  const block = agentsBlock();
  for (const rule of [
    "Use `live-ish new` to create slides. Do not hand-write engine internals.",
    "Edit only `slides/`, `demos/`, `themes/`, `public/` and `deck.config.ts`.",
    "Never edit `app/`, `next.config.ts`, `.live-ish/` or `node_modules/`.",
    "Run `live-ish check --json` after each change, and fix what it reports.",
    "Take browser support from `live-ish support`. Never state it from memory.",
    "Do not deploy unless the user asks.",
    "Speaker notes are the author's words. Ask before rewriting them.",
  ])
    assert.ok(block.includes(rule), rule);
  assert.match(agentsTemplate().slice(agentsTemplate().indexOf(BLOCK_END)), /## Notes for this deck/);
});

test("instructions: a refresh replaces the block and nothing else", () => {
  const author = "\n\n## Mine\n\nKeep this.\n";
  const old = `${BLOCK_BEGIN}\nold rules\n${BLOCK_END}${author}`;
  assert.equal(refreshBlock(old), `${agentsBlock()}${author}`);
  assert.equal(refreshBlock("# Mine\n"), null, "no markers, no change");
  assert.equal(refreshBlock(`${BLOCK_END}\n${BLOCK_BEGIN}\n`), null, "markers out of order");
  assert.ok(prependBlock("# Mine\n").endsWith("# Mine\n"));
});

// --- Commands -------------------------------------------------------------------------------------

const help = spawnSync(process.execPath, [path.join(ENGINE, "bin", "live-ish.mjs"), "--help"], { encoding: "utf8" }).stdout;
/** The usage lines of `--help`: the fixed words of each, and every flag it takes. */
const USAGE = help
  .split("\n")
  .filter((l) => l.startsWith("  "))
  .map((l) => {
    const usage = l.trim().split(/ {2,}/)[0];
    return { words: usage.split(/ [<["]|,/)[0].split(" "), flags: [...usage.matchAll(/--[a-z-]+/g)].map((m) => m[0]) };
  });

/** Prose may name a family, such as `live-ish new`, so a prefix of a command counts. */
function knownCommand(words: string[], flags: string[]): string | null {
  const matches = USAGE.filter((u) => u.words.every((w, i) => words[i] === w) || words.every((w, i) => u.words[i] === w));
  if (!matches.length) return `no command "${words.join(" ")}"`;
  const bad = flags.filter((f) => !matches.some((u) => u.flags.includes(f)));
  return bad.length ? `${words.join(" ")} takes no ${bad.join(", ")}` : null;
}

test("skills: every `live-ish` command they name is real, with real flags", () => {
  assert.ok(USAGE.length > 20, "--help printed its table");
  const texts = [...renderSkills("repo")].filter(([file]) => file.endsWith(".md")).map(([file, text]) => [file, text]);
  texts.push(["AGENTS.md", read(REPO, "AGENTS.md")], ["template", agentsTemplate()]);
  for (const [file, text] of texts) {
    for (const { text: span, words, flags } of commandsIn(text)) assert.equal(knownCommand(words, flags), null, `${file}: ${span}`);
  }
});

test("skills: the package scripts contributor skills name exist", () => {
  const root = JSON.parse(read(REPO, "package.json")) as { scripts: Record<string, string> };
  for (const name of [...CONTRIBUTOR_SKILLS, ...DECK_SKILLS]) {
    for (const script of pnpmScriptsIn(read(SKILL_SOURCE, name, "SKILL.md"))) {
      // `pnpm dev` is a deck's script, not the repo's.
      if (script !== "dev") assert.ok(root.scripts[script], `${name}: pnpm ${script}`);
    }
  }
});

function play(deck: string, steps: Step[]) {
  for (const step of steps) assert.equal(applyStep(deck, step), null);
}

const scripted = DECK_SKILLS.filter((name) => readGolden(name).tasks.length);

for (const name of scripted) {
  test(`golden: ${name} passes its judge with a scripted solution, on a fresh starter`, () => {
    const { deck, done } = freshDeck();
    try {
      assert.equal(cli(deck, ["add", "agents"]).code, 0);
      const [task] = readGolden(name).tasks;
      play(deck, task.setup);
      baseline(deck);
      play(deck, task.solution);
      assert.deepEqual(judge(deck, task.pass), { ok: true, problems: [] });
    } finally {
      done();
    }
  });
}

test("golden: the manual skills' commands run on a fresh starter", () => {
  const { deck, done } = freshDeck();
  try {
    assert.equal(cli(deck, ["add", "agents"]).code, 0);
    for (const name of MANUAL) play(deck, readGolden(name).commands ?? []);
  } finally {
    done();
  }
});

test("golden: the judge fails a change outside the allowed folders, and a task that did nothing", () => {
  const pass = { changed: ["slides/"] };
  assert.deepEqual(judgeChanges(["slides/09-a.ts"], pass), []);
  assert.match(judgeChanges(["slides/09-a.ts", "app/layout.tsx"], pass).join(), /must stay untouched/);
  assert.match(judgeChanges(["slides/09-a.ts", "README.md"], pass).join(), /outside the allowed/);
  assert.match(judgeChanges(["deck.config.ts"], pass).join(), /nothing changed/);
  assert.deepEqual(changedPaths(' M deck.config.ts\n?? "slides/09 a.ts"\nR  a -> demos/b\n'), ["deck.config.ts", "slides/09 a.ts", "demos/b"]);
});

// --- Machine-readable surfaces --------------------------------------------------------------------

test("doctor exits 1 and names an edited shell file", () => {
  const { deck, done } = freshDeck();
  try {
    assert.equal(cli(deck, ["upgrade", "--force"]).code, 0);
    assert.equal(cli(deck, ["doctor"]).code, 0);
    appendFileSync(path.join(deck, "app", "layout.tsx"), "\n// edited\n");
    const run = cli(deck, ["doctor", "--json"]);
    assert.equal(run.code, 1, run.stderr);
    assert.match(run.stdout, /app\/layout\.tsx/);
  } finally {
    done();
  }
});

test("--json prints one versioned document to stdout, on success and on failure, with the public codes", () => {
  const { deck, done } = freshDeck();
  try {
    const cases: [string[], number][] = [
      [["check", "--json"], 0],
      [["new", "copy", "A thing", "--json"], 0],
      [["new", "web-demo", "tabs", "--json"], 0],
      [["new", "terminal-demo", "term", "--json"], 0],
      [["doctor", "--json"], 0],
      [["themes", "--json"], 0],
      [["support", "popover", "--json"], 0],
      [["upgrade", "--json"], 0],
      [["schema", "--json"], 0],
      [["explain", "selector", "--json"], 0],
      [["actions", "--json"], 0],
      [["skills", "sync", "--check", "--json"], 0],
      [["add", "agents", "--json"], 0],
      [["record", "term", "--json"], 0],
      [["check", "nope", "--json"], 2],
      [["new", "copy", "--json"], 2],
      [["support", "--json"], 2],
      [["explain", "nope", "--json"], 2],
      [["nosuch", "--json"], 2],
      [["check", "--bogus", "--json"], 2],
      [["walk", "--json"], 3],
      [["axe", "--json"], 3],
    ];
    for (const [args, code] of cases) {
      const run = cli(deck, args);
      assert.equal(run.code, code, `${args.join(" ")}: ${run.stderr}`);
      const doc = JSON.parse(run.stdout) as { version: number; ok?: boolean; error?: { code: number; message: string } };
      assert.equal(doc.version, 1, args.join(" "));
      if (code !== 0) assert.deepEqual([doc.ok, doc.error?.code, typeof doc.error?.message], [false, code, "string"], args.join(" "));
    }
    assert.equal(cli(deck, ["schema"]).code, 0);
    for (const file of ["deck-config", "slide", "demo", "recording", "chrome-theme"]) assert.ok(existsSync(path.join(deck, ".live-ish", "schema", `${file}.json`)), file);
  } finally {
    done();
  }
});

// --- Sync, lock, upgrade --------------------------------------------------------------------------

test("sync: the repo's generated copies match the source, and an edit fails", () => {
  const rendered = renderSkills("repo");
  assert.deepEqual(repoDrift(REPO, rendered), []);
  const { deck: root, done } = freshDeck();
  try {
    const [file, body] = [...rendered][0];
    for (const [f, b] of rendered) {
      mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
      writeFileSync(path.join(root, f), b);
    }
    assert.deepEqual(repoDrift(root, rendered), []);
    writeFileSync(path.join(root, file), `${body}edited\n`);
    writeFileSync(path.join(root, ".claude/skills/stray.md"), "extra\n");
    assert.deepEqual(repoDrift(root, rendered), [file, ".claude/skills/stray.md"].sort());
  } finally {
    done();
  }
});

test("sync: a contributor skill stays out of a deck", () => {
  const files = [...renderSkills().keys()].join("\n");
  for (const name of CONTRIBUTOR_SKILLS) assert.ok(!files.includes(`/${name}/`), name);
  for (const name of DECK_SKILLS) assert.ok(files.includes(`/${name}/SKILL.md`), name);
  assert.ok(![...renderSkills("repo").keys()].some((f) => f.includes("/evals/")), "evals test a skill and are no part of one");
});

test("mergeFrontmatter leaves the shared text as it was, and refuses a file with none", () => {
  assert.equal(mergeFrontmatter("---\nname: a\n---\n\nBody\n", "x: true\n"), "---\nname: a\nx: true\n---\n\nBody\n");
  assert.throws(() => mergeFrontmatter("Body\n", "x: true"));
  assert.deepEqual(parseSkill(mergeFrontmatter("---\nname: a\n---\nBody\n", "x: true"))?.keys, ["name", "x"]);
});

test("add agents, sync --check and the lock on a fresh deck", () => {
  const { deck, done } = freshDeck();
  try {
    assert.equal(cli(deck, ["skills", "sync", "--check"]).code, 0, "a deck with no agent files has nothing to differ");
    assert.equal(cli(deck, ["add", "agents"]).code, 0);
    assert.equal(read(deck, "CLAUDE.md"), "@AGENTS.md\n");
    assert.ok(read(deck, "AGENTS.md").includes(BLOCK_BEGIN));
    assert.equal(cli(deck, ["skills", "sync", "--check"]).code, 0);
    const lock = readLock(deck)!;
    assert.equal(lock["live-ish-schema"], SCHEMA);
    assert.equal(lock.skills["add-web-demo"], SCHEMA);
    assert.deepEqual(Object.keys(lock.files).sort(), [...renderSkills().keys()].sort());
    assert.deepEqual(JSON.parse(cli(deck, ["check", "--json"]).stdout).findings, []);
  } finally {
    done();
  }
});

test("add agents keeps an author's AGENTS.md and CLAUDE.md, and says when CLAUDE.md skips the import", () => {
  const { deck, done } = freshDeck();
  try {
    writeFileSync(path.join(deck, "AGENTS.md"), "# Mine\n\nKeep this.\n");
    writeFileSync(path.join(deck, "CLAUDE.md"), "# Mine\n");
    const run = cli(deck, ["add", "agents"]);
    assert.equal(run.code, 0);
    assert.match(run.stdout, /does not import AGENTS\.md/);
    const text = read(deck, "AGENTS.md");
    assert.ok(text.startsWith(BLOCK_BEGIN) && text.endsWith("# Mine\n\nKeep this.\n"));
    assert.equal(read(deck, "CLAUDE.md"), "# Mine\n");
  } finally {
    done();
  }
});

/** Writes what an older engine would have, with the lock agreeing. */
function pretendOlder(deck: string, skill: string) {
  const lock = readLock(deck)!;
  const rendered = new Map(renderSkills());
  const file = `${AGENTS_OUTPUT}/${skill}/SKILL.md`;
  rendered.set(file, `${rendered.get(file)}\nOlder wording.\n`);
  writeFileSync(path.join(deck, file), rendered.get(file) as string);
  applyPlan(deck, rendered, { write: [], outdated: [], edited: [], remove: [], retired: [], deleted: lock.deleted }, "0.0.0-old");
  return file;
}

test("upgrade: refreshes an untouched file, keeps an edited one, leaves a deleted skill deleted", () => {
  const { deck, done } = freshDeck();
  try {
    assert.equal(cli(deck, ["add", "agents"]).code, 0);
    writeFileSync(path.join(deck, "AGENTS.md"), read(deck, "AGENTS.md").replace("## Rules", "## Old rules"));
    const outdated = pretendOlder(deck, "check-deck");
    const edited = `${CLAUDE_OUTPUT}/add-copy-slide/SKILL.md`;
    writeFileSync(path.join(deck, edited), `${read(deck, edited)}\nMy own step.\n`);
    rmSync(path.join(deck, CLAUDE_OUTPUT, "deploy-deck"), { recursive: true });
    const notes = `${read(deck, "AGENTS.md")}`;
    assert.ok(notes.includes("## Notes for this deck"));

    const run = cli(deck, ["upgrade"]);
    assert.equal(run.code, 0, run.stderr);
    const incoming = `${INCOMING}/add-copy-slide/claude/SKILL.md`;
    assert.ok(run.stdout.includes(`Kept your edit to ${edited}. The new version is in ${incoming}.`), run.stdout);
    assert.equal(read(deck, outdated), renderSkills().get(outdated), "untouched, so refreshed");
    assert.ok(read(deck, edited).endsWith("My own step.\n"), "edited, so kept");
    assert.equal(read(deck, incoming), renderSkills().get(edited), "the new version waits");
    assert.ok(!existsSync(path.join(deck, CLAUDE_OUTPUT, "deploy-deck")), "deleted, so it stays deleted");
    assert.deepEqual(readLock(deck)!.deleted, [`${CLAUDE_OUTPUT}/deploy-deck`]);
    assert.ok(read(deck, "AGENTS.md").includes("## Rules") && read(deck, "AGENTS.md").includes("## Notes for this deck"), "the block is back, the notes stayed");

    assert.equal(cli(deck, ["skills", "sync", "--check"]).code, 1, "the edit still reads as a difference");
    const second = cli(deck, ["upgrade", "--json"]);
    assert.deepEqual(JSON.parse(second.stdout).agents.kept, [{ file: edited, incoming }], "an edit stays an edit across upgrades");
    assert.ok(!existsSync(path.join(deck, CLAUDE_OUTPUT, "deploy-deck")));

    const stale = JSON.parse(cli(deck, ["check", "--json"]).stdout).findings;
    assert.deepEqual(stale.map((f: { rule: string; where: string }) => [f.rule, f.where]), [["skills-stale", edited]]);

    assert.equal(cli(deck, ["add", "agents"]).code, 0);
    assert.ok(existsSync(path.join(deck, CLAUDE_OUTPUT, "deploy-deck")), "asking for agent files brings it back");
    assert.equal(cli(deck, ["skills", "sync", "--force"]).code, 0);
    assert.equal(cli(deck, ["skills", "sync", "--check"]).code, 0, "--force restores every file");
  } finally {
    done();
  }
});

test("upgrade: a deck with no agent files gets none, and an author's own skill is left alone", () => {
  const { deck, done } = freshDeck();
  try {
    const own = path.join(deck, CLAUDE_OUTPUT, "my-skill", "SKILL.md");
    mkdirSync(path.dirname(own), { recursive: true });
    writeFileSync(own, "mine\n");
    writeFileSync(path.join(deck, "AGENTS.md"), "# Mine\n");
    const run = cli(deck, ["upgrade"]);
    assert.equal(run.code, 0, run.stderr);
    assert.ok(!existsSync(path.join(deck, AGENTS_OUTPUT)));
    assert.ok(!existsSync(path.join(deck, LOCK)));
    assert.equal(read(deck, "AGENTS.md"), "# Mine\n");
    assert.equal(cli(deck, ["add", "agents"]).code, 0);
    assert.equal(cli(deck, ["upgrade"]).code, 0);
    assert.equal(read(own), "mine\n", "not the engine's, so never touched");
    assert.equal(cli(deck, ["skills", "sync", "--check"]).code, 0, "and not a difference");
  } finally {
    done();
  }
});

test("upgrade: all four agent paths deleted stay deleted, and check still passes", () => {
  const { deck, done } = freshDeck();
  try {
    assert.equal(cli(deck, ["add", "agents"]).code, 0);
    for (const name of ["AGENTS.md", "CLAUDE.md", ".agents", ".claude"]) rmSync(path.join(deck, name), { recursive: true });
    assert.deepEqual(JSON.parse(cli(deck, ["check", "--json"]).stdout).findings, []);
    assert.equal(cli(deck, ["upgrade"]).code, 0);
    for (const name of ["AGENTS.md", "CLAUDE.md", ".agents", ".claude"]) assert.ok(!existsSync(path.join(deck, name)), name);
    assert.equal(cli(deck, ["skills", "sync", "--check"]).code, 0);
  } finally {
    done();
  }
});

test("upgrade: a retired skill goes if untouched, and stays as the author's if edited", () => {
  const { deck, done } = freshDeck();
  try {
    assert.equal(cli(deck, ["add", "agents"]).code, 0);
    const lock = readLock(deck)!;
    const clean = `${AGENTS_OUTPUT}/old-skill/SKILL.md`;
    const edited = `${CLAUDE_OUTPUT}/old-skill/SKILL.md`;
    for (const f of [clean, edited]) {
      mkdirSync(path.dirname(path.join(deck, f)), { recursive: true });
      writeFileSync(path.join(deck, f), "old\n");
      lock.files[f] = hashOf("old\n");
    }
    writeFileSync(path.join(deck, edited), "old, and mine\n");
    writeFileSync(path.join(deck, LOCK), JSON.stringify(lock));
    const run = cli(deck, ["upgrade"]);
    assert.ok(run.stdout.includes(`Kept ${edited}. This engine no longer ships it, so it is yours now.`), run.stdout);
    assert.ok(!existsSync(path.join(deck, AGENTS_OUTPUT, "old-skill")), "untouched, so removed, with its folder");
    assert.equal(read(deck, edited), "old, and mine\n");
    assert.equal(readLock(deck)!.files[edited], undefined, "no longer the engine's");
  } finally {
    done();
  }
});

test("next dev cannot be turned on to write to AGENTS.md through withDeck", () => {
  const source = read(ENGINE, "src", "next", "with-deck.cjs");
  assert.ok(source.indexOf("agentRules: false") > source.indexOf("...next,"), "it must come after the deck's own options");
});

test("the shell tracks the lock, and nothing ignores AGENTS.md", () => {
  const ignore = read(ENGINE, "shell", "gitignore");
  assert.match(ignore, /^\.live-ish\/\*$/m);
  assert.match(ignore, /^!\.live-ish\/skills\.lock$/m);
  assert.doesNotMatch(ignore, /AGENTS|CLAUDE/);
});
