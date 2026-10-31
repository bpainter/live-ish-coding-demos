import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { nearest, parseArgs, portOf, UsageError } from "../src/cli/args";
import { detectPackageManager } from "../src/cli/commands/maintain";
import { LAYOUTS, nextSlideNumber, slugify } from "../src/cli/commands/new";
import { providerSite } from "../src/cli/commands/run";
import { searchFeatures } from "../src/cli/commands/support";
import { addServer, insertOrderId, readOrder, readSchemaVersion } from "../src/cli/edit-config";
import { hashOf, HEADER, MANIFEST, shellFiles, shellStatus, strayFiles, writeShell } from "../src/cli/shell";
import { blockedFault, runtimeFault } from "../src/lib/engine/faults";
import { slideHints } from "../src/lib/hints";
import { checkRecording, keepExamples, outputLines, parseSession, sanitize, scanTokens } from "../src/lib/recording";
import { rules } from "../src/lib/validate/rules/terminal";
import type { RuleContext } from "../src/lib/validate/types";
import type { AssembledDeck } from "../src/schema/assemble";

const here = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.join(here, "..");
const STARTER = path.join(ENGINE, "..", "..", "examples", "starter");

const tempDir = () => mkdtempSync(path.join(os.tmpdir(), "live-ish-test-"));

// --- Arguments ------------------------------------------------------------------------------------

test("parseArgs reads --flag, --flag=value and --flag value", () => {
  const spec = { port: "string", json: "boolean" } as const;
  assert.deepEqual(parseArgs(["--port=3400", "--json"], spec), { positionals: [], flags: { port: "3400", json: true } });
  assert.deepEqual(parseArgs(["--port", "3400", "faq"], spec), { positionals: ["faq"], flags: { port: "3400" } });
  assert.deepEqual(parseArgs(["faq", "--", "--json"], spec), { positionals: ["faq", "--json"], flags: {} });
  assert.deepEqual(parseArgs(["-h"], {}).flags, { help: true });
});

test("parseArgs rejects what it does not know, so a typo never passes for a default", () => {
  assert.throws(() => parseArgs(["--prot=1"], { port: "string" }), UsageError);
  assert.throws(() => parseArgs(["--json=yes"], { json: "boolean" }), /takes no value/);
  assert.throws(() => parseArgs(["--port"], { port: "string" }), /needs a value/);
  assert.throws(() => parseArgs(["--port", "--json"], { port: "string", json: "boolean" }), /needs a value/);
});

test("portOf keeps a default and refuses a bad port", () => {
  assert.equal(portOf({}), 3000);
  assert.equal(portOf({ port: "3400" }), 3400);
  assert.throws(() => portOf({ port: "70000" }), UsageError);
  assert.throws(() => portOf({ port: "abc" }), UsageError);
});

test("nearest suggests only what is close", () => {
  assert.equal(nearest("chck", ["check", "doctor"]), "check");
  assert.equal(nearest("zzzzzz", ["check", "doctor"]), undefined);
});

// --- Editing deck.config.ts -----------------------------------------------------------------------

const STARTER_CONFIG = readFileSync(path.join(STARTER, "deck.config.ts"), "utf8");

test("insertOrderId appends on one line and keeps every comment", () => {
  const out = insertOrderId(STARTER_CONFIG, "tabs");
  assert.ok(out.includes('"closing", "tabs"]'));
  assert.equal(out.replace(', "tabs"', ""), STARTER_CONFIG);
  assert.equal(insertOrderId(out, "tabs"), out, "an id already there changes nothing");
});

test("insertOrderId goes ahead of a closing slide", () => {
  const out = insertOrderId(STARTER_CONFIG, "tabs", "closing");
  assert.deepEqual(readOrder(out), ["title", "what-this-shows", "faq", "count-words", "tabs", "closing"]);
});

test("insertOrderId follows a multi-line array, its commas, comments and quotes", () => {
  const multi = `defineDeck({
  schemaVersion: 1,
  order: [
    "one", // first
    // the middle
    "two", /* note */
    "three" // no comma here
  ],
});`;
  const out = insertOrderId(multi, "four");
  assert.deepEqual(readOrder(out), ["one", "two", "three", "four"]);
  assert.ok(out.includes('"three", // no comma here\n    "four"\n  ],'));
  assert.ok(out.includes("// the middle"));
  const trailing = insertOrderId('defineDeck({ order: [\n  "a",\n  "b",\n] })', "c");
  assert.ok(trailing.includes('"b",\n  "c",\n]'));
  const before = insertOrderId(multi, "x", "two");
  assert.ok(before.includes('"x",\n    "two", /* note */'));
  assert.ok(insertOrderId("defineDeck({ order: ['a'] })", "b").includes("['a', 'b']"));
  assert.ok(insertOrderId("defineDeck({ order: [] })", "b").includes('["b"]'));
});

test("insertOrderId is not fooled by order inside a string, a comment or a nested object", () => {
  const src = `// order: ["old"]
export default defineDeck({
  title: "order: [\\"nope\\"]",
  theme: { order: ["nested"] },
  ...shared,
  order: ["real"],
});`;
  assert.deepEqual(readOrder(insertOrderId(src, "new")), ["real", "new"]);
});

test("insertOrderId refuses an order it cannot edit in place", () => {
  assert.throws(() => insertOrderId("const o = [];\nexport default defineDeck({ order: o });", "x"), /not an array/);
  assert.throws(() => insertOrderId("defineDeck({ title: 'x' });", "x"), /no order/);
});

test("addServer adds servers and hosts, and joins what is there", () => {
  const server = { app: "shop", command: "node server.mjs", port: 3106, origin: "http://localhost:3106" };
  const fresh = addServer(STARTER_CONFIG, server);
  assert.ok(fresh.includes('servers: [{ app: "shop", command: "node server.mjs", port: 3106 }],'));
  assert.ok(fresh.includes('hosts: { external: { shop: "http://localhost:3106" } },'));
  assert.ok(fresh.includes("// writing: { preset: "), "comments stay");
  const second = addServer(fresh, { ...server, app: "my-app", port: 3107, origin: "http://localhost:3107" });
  assert.ok(second.includes('port: 3106 }, { app: "my-app"'));
  assert.ok(second.includes('shop: "http://localhost:3106", "my-app": "http://localhost:3107"'));
  const hosts = addServer('defineDeck({\n  order: ["a"],\n  hosts: { site: "https://x.dev" },\n});', server);
  assert.ok(hosts.includes('hosts: { site: "https://x.dev", external: { shop: "http://localhost:3106" } }'));
});

test("readSchemaVersion reads the number from the text", () => {
  assert.equal(readSchemaVersion(STARTER_CONFIG), 1);
  assert.equal(readSchemaVersion("defineDeck({ schemaVersion: v })"), null);
});

// --- Recording --------------------------------------------------------------------------------------

test("sanitize strips color, replaces the home path and keeps what a terminal shows", () => {
  assert.equal(sanitize("\u001b[32mok\u001b[0m  ", ""), "ok");
  assert.equal(sanitize("\u001b]0;title\u0007done", ""), "done");
  assert.equal(sanitize("/home/a/x/file.txt:1", "/home/a"), "~/x/file.txt:1");
  assert.equal(sanitize("10%\r50%\r100%", ""), "100%");
  assert.equal(sanitize("line\r", ""), "line");
  assert.equal(sanitize("/tmp/session/a.txt", "/home/a", ["/tmp/session"]), "./a.txt");
});

test("outputLines drops trailing blanks and keeps blanks inside", () => {
  assert.deepEqual(outputLines("a\n\nb\n\n", ""), ["a", "", "b"]);
  assert.deepEqual(outputLines("", ""), []);
});

test("parseSession reads commands, comments and expect-fail", () => {
  assert.deepEqual(parseSession("# intro\ncat a.txt\n\nnode b.mjs  # expect-fail\n# expect-fail\nnode c.mjs\n"), [
    { kind: "comment", text: "# intro" },
    { kind: "cmd", text: "cat a.txt", expectFail: false },
    { kind: "cmd", text: "node b.mjs", expectFail: true },
    { kind: "cmd", text: "node c.mjs", expectFail: true },
  ]);
});

test("scanTokens finds credentials and never quotes them", () => {
  const npm = `npm_${"a1".repeat(18)}`;
  const github = `ghp_${"a".repeat(36)}`;
  const aws = `AKIA${"B".repeat(16)}`;
  const lines = [npm, "//registry/:_authToken=abc", github, aws, "-----BEGIN RSA PRIVATE KEY-----", "13 words"].map((text, i) => ({ line: i + 1, text }));
  const hits = scanTokens(lines);
  assert.deepEqual(hits.map((h) => h.line), [1, 2, 3, 4, 5]);
  for (const hit of hits) assert.ok(!Object.values(hit).join(" ").includes(npm));
  assert.deepEqual(scanTokens([{ line: 1, text: "npm_ is a prefix, sk-short too" }]), []);
});

test("a token split by color still reads whole after sanitizing", () => {
  const split = `npm_\u001b[1m${"a1".repeat(18)}\u001b[0m`;
  assert.equal(scanTokens([{ line: 1, text: split }]).length, 0);
  assert.equal(scanTokens([{ line: 1, text: sanitize(split, "") }]).length, 1);
});

test("keepExamples puts hand-written lines back where they were", () => {
  const recorded = [
    { kind: "cmd" as const, text: "$ one", delay: 650 },
    { kind: "out" as const, text: "1", delay: 900 },
    { kind: "cmd" as const, text: "$ two", delay: 650 },
  ];
  const previous = [
    { line: 1, kind: "cmd" as const, text: "$ old", delay: 0 },
    { line: 2, kind: "comment" as const, text: "# by hand", delay: 0, example: true },
    { line: 3, kind: "out" as const, text: "old", delay: 0 },
    { line: 4, kind: "cmd" as const, text: "$ end", delay: 0 },
    { line: 5, kind: "out" as const, text: "by hand", delay: 0, example: true },
  ];
  const out = keepExamples(recorded, previous);
  assert.deepEqual(out.map((l) => l.text), ["$ one", "# by hand", "1", "$ two", "by hand"]);
  assert.deepEqual(out.map((l) => l.line), [1, 2, 3, 4, 5]);
  assert.deepEqual(out.filter((l) => l.example).map((l) => l.text), ["# by hand", "by hand"]);
  assert.equal(keepExamples(recorded).length, 3);
});

test("checkRecording names shape problems", () => {
  const good = { id: "session", capturedAt: "2026-10-31T00:00:00Z", env: {}, lines: [{ line: 1, delay: 0, text: "$ ls", kind: "cmd" as const }] };
  assert.deepEqual(checkRecording(good), []);
  assert.ok(checkRecording({ ...good, capturedAt: "soon" })[0].includes("not a date"));
  assert.ok(checkRecording({ ...good, lines: [{ line: 2, delay: 0, text: "ls", kind: "cmd" }] }).some((p) => p.includes('starts with "$ "')));
});

test("the starter's recording is what its session prints", () => {
  const rec = JSON.parse(readFileSync(path.join(STARTER, "demos", "count-words", "recordings", "session.json"), "utf8")) as { lines: { text: string }[]; capturedAt: string };
  assert.deepEqual(rec.lines.map((l) => l.text), ["$ cat notes.txt", "show the code and show the result", "the room can follow the result", "$ node word-count.mjs notes.txt", "13 words", "$ node word-count.mjs --top notes.txt", "13 words", "4 the", "2 show", "2 result"]);
  assert.notEqual(rec.capturedAt, "2026-10-31T00:00:00Z", "the hand-set timestamp is gone");
});

// --- Terminal rules ---------------------------------------------------------------------------------

function terminalDeck(lines: [number, number][], recording: string[]): { ctx: RuleContext; root: string } {
  const root = tempDir();
  const folder = "demos/term";
  mkdirSync(path.join(root, folder, "recordings"), { recursive: true });
  const rec = { id: "session", capturedAt: "2026-10-31T00:00:00Z", env: {}, lines: recording.map((text, i) => ({ line: i + 1, delay: 0, text, kind: text.startsWith("$ ") ? "cmd" : "out" })) };
  writeFileSync(path.join(root, folder, "recordings", "session.json"), JSON.stringify(rec));
  const page = {
    id: "term",
    beat: "single",
    notes: "",
    steps: lines.map((range, i) => ({ id: `s${i}`, label: "Step", notes: [], actions: [{ type: "terminal", lines: range }] })),
    timing: { minutes: 1, cumulative: 1 },
    title: "Term",
    split: "50/50",
    files: [],
    frame: { kind: "terminal", route: "/demos/term/single", viewport: { width: 640, height: 628 }, recording: "session" },
  };
  const deck = { deck: {}, slides: [], demos: [{ id: "term", order: 1, folder, title: "Term", scenario: "", pages: [page], citations: [], cautions: [] }] } as unknown as AssembledDeck;
  return { ctx: { root, deck, strict: false }, root };
}

const ruleOf = (id: string) => rules.find((r) => r.id === id)!;

test("terminal-range passes contiguous ranges, and fails past the end or on a gap", async () => {
  const recording = ["$ a", "1", "$ b", "2"];
  const ok = terminalDeck([[1, 2], [3, 4]], recording);
  assert.deepEqual(await ruleOf("terminal-range").run(ok.ctx), []);
  const past = terminalDeck([[1, 2], [3, 9]], recording);
  const [pastFinding] = await ruleOf("terminal-range").run(past.ctx);
  assert.match(pastFinding.message, /runs past line 4/);
  assert.match(pastFinding.where, /step s1/);
  const gap = terminalDeck([[1, 2], [4, 4]], recording);
  const [gapFinding] = await ruleOf("terminal-range").run(gap.ctx);
  assert.match(gapFinding.message, /Lines 3 to 3 are never shown/);
  for (const d of [ok, past, gap]) rmSync(d.root, { recursive: true });
});

test("terminal-range leaves a missing recording to the build rule, and names one that will not parse", async () => {
  const { ctx, root } = terminalDeck([[1, 1]], ["$ a"]);
  const file = path.join(root, "demos/term/recordings/session.json");
  writeFileSync(file, "{ not json");
  const [finding] = await ruleOf("terminal-range").run(ctx);
  assert.match(finding.message, /not valid JSON/);
  assert.match(finding.fix ?? "", /live-ish record term/);
  rmSync(file);
  assert.deepEqual(await ruleOf("terminal-range").run(ctx), []);
  rmSync(root, { recursive: true });
});

test("terminal-token fails on a token-like line and never quotes it", async () => {
  const token = `npm_${"z9".repeat(18)}`;
  const { ctx, root } = terminalDeck([[1, 2]], ["$ cat .npmrc", token]);
  const [finding] = await ruleOf("terminal-token").run(ctx);
  assert.equal(finding.severity, "error");
  assert.match(finding.where, /session.json: line 2/);
  assert.ok(!JSON.stringify(finding).includes(token));
  rmSync(root, { recursive: true });
});

// --- new ----------------------------------------------------------------------------------------------

test("slugify and slide numbers", () => {
  assert.equal(slugify("My point: a café!"), "my-point-a-cafe");
  assert.equal(slugify("!!!"), "");
  assert.equal(nextSlideNumber(["01-title.ts", "02-x.ts", "07-closing.ts"]), "08");
  assert.equal(nextSlideNumber([]), "01");
});

test("every layout has a template, and it reads as a slide", () => {
  for (const layout of LAYOUTS) {
    const body = readFileSync(path.join(ENGINE, "templates", "copy", `${layout}.ts.tmpl`), "utf8");
    assert.ok(body.includes(`layout: "${layout}"`), layout);
    assert.ok(body.includes('id: "{{id}}"'), layout);
  }
});

// --- Shell ------------------------------------------------------------------------------------------

test("the starter's shell is a generated copy of the templates", () => {
  assert.deepEqual(shellStatus(STARTER).filter((f) => f.state !== "current"), []);
  assert.deepEqual(strayFiles(STARTER), { retired: [], foreign: [] });
  const headed = shellFiles().filter((f) => f.target !== "tsconfig.json");
  for (const f of headed) assert.ok(f.body.includes(HEADER), `${f.target} has no header`);
});

test("a shell edit, an old file and a missing file read differently", () => {
  const root = tempDir();
  mkdirSync(path.join(root, "app"));
  writeShell(root);
  assert.ok(shellStatus(root).every((f) => f.state === "current"));

  const edited = path.join(root, "next.config.ts");
  writeFileSync(edited, "// mine\n");
  const manifest = JSON.parse(readFileSync(path.join(root, MANIFEST), "utf8")) as { files: Record<string, string> };
  const old = path.join(root, "app", "page.tsx");
  writeFileSync(old, "// Generated by live-ish. An older template.\n");
  manifest.files["app/page.tsx"] = hashOf(readFileSync(old));
  writeFileSync(path.join(root, MANIFEST), JSON.stringify(manifest));
  rmSync(path.join(root, "app", "layout.tsx"));
  writeFileSync(path.join(root, "app", "gone.tsx"), `// ${HEADER}\n`);
  writeFileSync(path.join(root, "app", "mine.tsx"), "export {};\n");

  const state = (target: string) => shellStatus(root).find((f) => f.target === target);
  assert.equal(state("next.config.ts")?.state, "edited");
  assert.equal(state("next.config.ts")?.headerLost, true);
  assert.equal(state("app/page.tsx")?.state, "outdated");
  assert.equal(state("app/layout.tsx")?.state, "missing");
  assert.deepEqual(strayFiles(root), { retired: ["app/gone.tsx"], foreign: ["app/mine.tsx"] });

  const { removed } = writeShell(root);
  assert.deepEqual(removed, ["app/gone.tsx"]);
  assert.ok(shellStatus(root).every((f) => f.state === "current"));
  assert.ok(existsSync(path.join(root, "app", "mine.tsx")), "a file the engine did not write stays");
  rmSync(root, { recursive: true });
});

// --- Small rules --------------------------------------------------------------------------------------

test("detectPackageManager prefers the lockfile", () => {
  const root = tempDir();
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ packageManager: "pnpm@12.0.0" }));
  assert.equal(detectPackageManager(root, {}), "pnpm");
  writeFileSync(path.join(root, "package-lock.json"), "{}");
  assert.equal(detectPackageManager(root, {}), "npm");
  rmSync(root, { recursive: true });
});

test("providerSite reads a host's own address", () => {
  assert.deepEqual(providerSite({ VERCEL_PROJECT_PRODUCTION_URL: "talk.example.com" }), { provider: "Vercel", site: "https://talk.example.com" });
  assert.equal(providerSite({ URL: "https://x.dev" }), null);
});

test("searchFeatures ranks an exact id first and keeps versions from the data", () => {
  const data = {
    browsers: {},
    features: {
      "dialog-closedby": { name: "closedby", status: { baseline: false as const, support: { chrome: "134" } } },
      dialog: { name: "<dialog>", status: { baseline: "high" as const, baseline_low_date: "2022-03-14", support: { chrome: "37", safari: "15.4" } } },
      other: { name: "Other", status: { baseline: false as const, support: {} } },
    },
  };
  const hits = searchFeatures(data, "dialog");
  assert.deepEqual(hits.map((h) => h.id), ["dialog", "dialog-closedby"]);
  assert.equal(hits[0].support.safari, "15.4");
  assert.equal(hits[0].support.firefox, null);
});

test("runtimeFault names the step, the selector, what was found and the fix", () => {
  const fault = runtimeFault({ code: "selector-not-found", message: "No element", selector: "#q9", ids: ["q1", "q2"] }, "s2");
  assert.equal(fault.title, 'Step s2: "#q9" matches nothing');
  assert.equal(fault.detail, "Found: #q1, #q2.");
  assert.match(fault.fix, /demo\.ts/);
});

test("blockedFault names the host mismatch and the config field", () => {
  const blocked = blockedFault({ origin: "https://frames.example.com", allowed: "https://talk.example.com", app: null }, "https://other.example.com");
  assert.match(blocked.detail, /allow https:\/\/talk\.example\.com\. This window is on https:\/\/other\.example\.com/);
  assert.match(blocked.fix, /hosts\.site and hosts\.frames/);
  assert.match(blockedFault({ origin: "", allowed: null, app: "shop" }, "http://localhost:3000").fix, /hosts\.external\.shop/);
});

test("tool hints stay off slides that have what they need", () => {
  const slide = { page: { beat: "intro", visual: { src: "/intro/x.png", alt: "x" } }, demo: { support: { kind: "web-features", id: "details" } } } as never;
  assert.equal(slideHints(slide, { still: false, support: false }).length, 2);
  assert.equal(slideHints(slide, { still: true, support: true }).length, 0);
  for (const hint of slideHints(slide, { still: false, support: false })) assert.doesNotMatch(hint, /Run (pnpm|live-ish)/);
});
