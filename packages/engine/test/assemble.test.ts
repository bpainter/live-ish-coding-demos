import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { excerptLayout } from "../src/lib/excerpt";
import { parseFlags, presenterOriginFor } from "../src/lib/frames/origins";
import { renderLines } from "../src/lib/frames/terminal";
import { countLines } from "../src/prepare";
import { assembleDeck, DeckError, type DeckInput } from "../src/schema/assemble";
import { defineDemo, defineSlide, excerpt, shown } from "../src/schema";

const STARTER = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "examples", "starter");
process.env.LIVE_ISH_DECK_ROOT = STARTER;

const config = { schemaVersion: 1 as const, title: "Deck", order: ["one", "tabs", "term"], speaker: { name: "A Speaker" } };
const slide = defineSlide({ id: "one", title: "One", minutes: 1 });
const step = { id: "s0", label: "Start", actions: [] };
const tabs = defineDemo({
  id: "tabs",
  title: "Tabs",
  scenario: "A scenario.",
  intro: { description: "An intro.", minutes: 0.25 },
  before: { files: [excerpt("a.js", [[2, 3]])], steps: [step], minutes: 1 },
  after: { files: [shown("index.html")], split: "60/40", steps: [step], flags: { "custom-flag": true }, minutes: 2 },
});
const term = defineDemo({ id: "term", kind: "terminal", title: "Term", scenario: "A session.", beats: "single", single: { recording: "session", files: [shown("a.mjs")], steps: [step], minutes: 1.5 } });
const input: DeckInput = { config, slides: [slide], demos: [{ folder: "demos/tabs", demo: tabs, hooks: false }, { folder: "demos/term", demo: term, hooks: false }] };

test("one demo folder expands into pages, routes, viewports and timing", () => {
  const { slides, demos } = assembleDeck(input);
  assert.deepEqual(slides.map((s) => s.id), ["one", "tabs-intro", "tabs-before", "tabs-after", "term"]);
  assert.deepEqual(slides.map((s) => s.index), [1, 2, 3, 4, 5]);
  assert.deepEqual(slides.map((s) => s.timing.cumulative), [1, 1.25, 2.25, 4.25, 5.75]);
  const after = demos[0].pages[2];
  assert.ok(after.beat === "after");
  assert.equal(after.frame.route, "/demos/tabs/after");
  assert.deepEqual(after.frame.viewport, { width: 768, height: 628 });
  assert.equal(after.title, "What we can do today");
  assert.equal(after.frame.flags?.["custom-flag"], true);
});

test("a terminal page is single, resolves files from the demo folder and always has reset", () => {
  const page = assembleDeck(input).demos[1].pages[0];
  assert.ok(page.beat === "single");
  assert.equal(page.frame.kind, "terminal");
  assert.equal(page.frame.route, "/demos/term/single");
  assert.deepEqual(page.frame.hooks, ["reset"]);
});

test("beat labels come from the deck, and a kind can be set per beat", () => {
  const mixed = defineDemo({ id: "tabs", title: "Tabs", scenario: "S.", kind: "static", before: { steps: [step] }, after: { kind: "terminal", steps: [step] } });
  const { demos } = assembleDeck({ ...input, config: { ...config, order: ["tabs"], beats: { before: "Old", after: "New" } }, demos: [{ folder: "demos/tabs", demo: mixed, hooks: false }] });
  const [before, after] = demos[0].pages;
  assert.ok(before.beat === "before" && after.beat === "after");
  assert.equal(before.frame.kind, "static");
  assert.equal(after.frame.kind, "terminal");
  assert.equal(before.title, "Old");
});

test("order decides what is in the deck, and a typo names the nearest id", () => {
  assert.equal(assembleDeck({ ...input, config: { ...config, order: ["one"] } }).demos.length, 0);
  assert.throws(() => assembleDeck({ ...input, config: { ...config, order: ["tab"] } }), (e: Error) => e instanceof DeckError && /Did you mean "tabs"/.test(e.message));
});

test("route handlers stay off the slide, which reaches client components", () => {
  const routes = [{ method: "GET" as const, path: "/orders", handler: () => new Response("") }];
  const { slides, demos } = assembleDeck({ ...input, demos: [{ folder: "demos/tabs", demo: tabs, hooks: false, routes }] , config: { ...config, order: ["tabs"] } });
  assert.equal(demos[0].routes, routes);
  assert.ok(slides.every((s) => s.demo && !("routes" in s.demo)));
});

test("the starter's meter counts 43 lines before and the excerpt's offsets hold", () => {
  const source = readFileSync(path.join(STARTER, "demos/faq/before/accordion.js"), "utf8");
  assert.equal(countLines(source), 43);
  const layout = excerptLayout([[14, 20], [30, 45]], source.replace(/\n$/, "").split("\n").length);
  assert.deepEqual(layout[1], { kind: "source", line: 14 });
  assert.deepEqual(layout[9], { kind: "source", line: 30 });
});

test("a recording is served as hidden lines, escaped", () => {
  const html = renderLines({ id: "s", capturedAt: "", env: {}, lines: [{ line: 1, delay: 0, kind: "cmd", text: "$ echo <b>" }, { line: 2, delay: 0, kind: "out", text: "<b>", example: true }] });
  assert.match(html, /data-line="1" data-kind="cmd".* hidden>/);
  assert.match(html, /data-example/);
  assert.ok(!html.includes("<b>"));
});

test("local mode pairs the two addresses from the port, and one host uses itself", () => {
  assert.equal(presenterOriginFor("http://127.0.0.1:4100"), "http://localhost:4100");
  assert.equal(presenterOriginFor("http://localhost:4100"), "http://127.0.0.1:4100");
  assert.equal(presenterOriginFor("https://talk.example.com"), "https://talk.example.com");
  assert.deepEqual(parseFlags("enhance-css:0,custom:1"), { "enhance-css": false, custom: true });
});
