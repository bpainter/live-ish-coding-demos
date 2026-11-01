import assert from "node:assert/strict";
import { test } from "node:test";
import { replaySteps, segments } from "../src/lib/engine/steps";
import { frameDocument } from "../src/lib/frames/origins";
import { SHELLS, defineShell, registerShells } from "../src/lib/frames/shells";
import { strippedDeckModule } from "../src/prepare/strip";
import type { DeckInput } from "../src/schema/assemble";
import { refusesEmbedding, type Action, type FramePage, type Step } from "../src/schema/demo";

const step = (id: string, actions: Action[], route?: string): Step => ({ id, label: id, actions, notes: [], route });
const page = (steps: Step[]) => ({ steps, frame: { flags: {} } }) as unknown as FramePage;

test("a reloading toggle ends a segment, so a run stops before it", () => {
  const s = step("s1", [{ type: "reveal", target: "#a" }, { type: "toggle", flag: "enhance-js", on: false }, { type: "assert", target: "#a", expect: "visible" }]);
  const segs = segments(s, { "enhance-js": true });
  assert.deepEqual(segs.map((x) => [x.startAt, x.actions.length, x.reload]), [[0, 1, false], [2, 1, true]]);
  // PageFrame runs each segment on the step's actions up to here.
  assert.equal(s.actions.slice(0, segs[0].startAt + segs[0].actions.length).length, 1);
});

test("a page that walks its history replays every action", () => {
  const steps = [step("s0", [], "index.html"), step("s1", [{ type: "navigate", url: "two.html" }], "two.html"), step("s2", [{ type: "navigate", history: "back" }], "index.html")];
  const replay = replaySteps(page(steps), 2);
  assert.equal(replay[1].actions.length, 1);
  assert.equal(replay[2].actions.length, 1);
});

test("a routed page with no history walk opens its route directly", () => {
  const steps = [step("s0", [], "index.html"), step("s1", [{ type: "click", target: "#a" }, { type: "assert", target: "#b", expect: "visible" }], "two.html")];
  const replay = replaySteps(page(steps), 1);
  assert.deepEqual(replay[1].actions.map((a) => a.type), ["navigate", "assert"]);
});

test("a build opens its entry page, and a declared address opens as written", () => {
  assert.equal(frameDocument("/demos/faq/after"), "/demos/faq/after/index.html");
  assert.equal(frameDocument("/harbor"), "/harbor");
});

test("a frame that refuses every ancestor counts as blocked", () => {
  assert.equal(refusesEmbedding({ csp: "default-src 'none'; frame-ancestors 'none'" }), true);
  assert.equal(refusesEmbedding({ csp: "frame-ancestors PRESENTER" }), false);
  assert.equal(refusesEmbedding({}), false);
});

test("a deck's shell registers beside the engine's, on the shell base", () => {
  const shell = defineShell({ id: "test-shell", before: '<div class="wrap">', after: "</div>", styles: ["/shells/test.css"] });
  registerShells([shell]);
  assert.equal(SHELLS["test-shell"], shell);
  assert.deepEqual(shell.render({ build: "after", demo: "x" }).styles, ["/live-ish/shells/base.css", "/shells/test.css"]);
  delete SHELLS["test-shell"];
});

test("a public build keeps render.ts and routes.ts as imports, with the notes gone", () => {
  const input = {
    config: { schemaVersion: 1, title: "T", order: ["x"], speaker: { name: "A" } },
    slides: [],
    demos: [{ folder: "demos/x", hooks: false, routes: [], render: () => "", demo: { id: "x", title: "X", scenario: "S", beats: "single", single: { notes: "Secret words.", steps: [] } } }],
  } as unknown as DeckInput;
  const out = strippedDeckModule(input);
  assert.match(out, /import routes0 from "\.\.\/demos\/x\/routes"/);
  assert.match(out, /import render0 from "\.\.\/demos\/x\/render"/);
  assert.doesNotMatch(out, /Secret words/);
});
