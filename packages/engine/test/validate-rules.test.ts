import assert from "node:assert/strict";
import { test } from "node:test";
import { SHELLS } from "../src/lib/frames/shells";
import { EXTERNAL_RULES, RULE_IDS } from "../src/lib/validate/catalog";
import { rulePage } from "../src/lib/validate";
import { allRules } from "../src/lib/validate/rules";
import type { AssembledDeck } from "../src/schema/assemble";
import type { DemoConfig, StepConfig } from "../src/schema/config";
import { shown } from "../src/schema";
import { fixture, type Fixture } from "./validate-fixture";

/**
 * One broken fixture per rule. A small valid deck has no findings at all; each case below breaks
 * one thing, and the test fails unless that rule reports it. A rule with no case fails too.
 */

const steps = (page: DemoConfig["before"]) => page!.steps;
const before = (f: Fixture) => steps(f.demo.before);
const after = (f: Fixture) => steps(f.demo.after);
const addSteps = (page: DemoConfig["after"], n: number) => {
  for (let i = 0; i < n; i++) page!.steps.push({ id: `s${page!.steps.length}`, label: "Click again", actions: [{ type: "click", target: "#open" }], code: { file: page!.files![0].file, lines: [1] }, notes: ["The button opens it."] });
};
const plain = (f: Fixture) => (f.config.writing = { preset: "plain" });
const png = (width: number, height: number, pad = 0) => {
  const b = Buffer.alloc(24 + pad);
  b.write("\x89PNG\r\n\x1a\n", 0, "latin1");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
};

interface Case {
  rule: string;
  name: string;
  breakIt: (f: Fixture) => void;
  tamper?: (deck: AssembledDeck) => void;
  /** Shells registered for the case, removed after it. */
  shell?: string;
}

const c = (rule: string, name: string, breakIt: Case["breakIt"], extra: Partial<Case> = {}): Case => ({ rule, name, breakIt, ...extra });

const CASES: Case[] = [
  // Integrity
  c("config", "a misspelled field", (f) => Object.assign(f.config, { titel: "Oops" })),
  c("build", "a demo in order with no folder", (f) => f.config.order.push("x2")),
  c("build", "a listed page that is gone", (f) => (f.demo.after!.pages = ["nope.html"])),
  c("build", "a terminal page with no recording", (f) => (f.demo.after!.kind = "terminal")),
  c("code", "a step with no code", (f) => delete after(f)[1].code),
  c("code", "code.file not in files", (f) => (after(f)[1].code = { file: "missing.html", lines: [1] })),
  c("code", "a line past the end", (f) => (after(f)[1].code = { file: "index.html", lines: [[1, 9]] })),
  c("code", "too many lines", (f) => (before(f)[1].code = { file: "app.js", lines: [[1, 13]] })),
  c("code", "an elision line", (f) => (before(f)[1].code = { file: "app.js", lines: [11] })),
  c("code", "a span past the panel", (f) => (before(f)[1].code = { file: "app.js", lines: [2, 23] })),
  c("files", "more tabs than fit", (f) => f.demo.after!.files!.push(shown("index.html"), shown("index.html"), shown("index.html"))),
  c("files", "a shown file that is gone", (f) => f.demo.after!.files!.push(shown("gone.css"))),
  c("excerpt", "ranges out of order", (f) => (f.demo.before!.files![0].ranges = [[20, 30], [1, 10]])),
  c("excerpt", "a range past the end", (f) => (f.demo.before!.files![0].ranges = [[1, 10], [50, 90]])),
  c("excerpt", "shown text that drifted", () => undefined, {
    tamper: (deck) => {
      const page = deck.demos[0].pages[1];
      if (page.beat === "intro") return;
      page.files[0] = { ...page.files[0], source: page.files[0].source.replace("const line2 = 2;", "const line2 = 3;") };
    },
  }),
  c("selector", "a spotlight that matches nothing", (f) => (after(f)[1].spotlight = ["#q9"])),
  c("selector", "an action target that matches nothing", (f) => (after(f)[1].actions = [{ type: "click", target: ".gone" }])),
  c("hook", "a hook no script defines", (f) => (after(f)[0].actions = [{ type: "hook", name: "rset" }])),
  c("hook", "a declared hook no script defines", (f) => (f.demo.after!.hooks = ["reset", "spin"])),
  c("flags", "a toggle of an undeclared flag", (f) => (after(f)[2].actions = [{ type: "toggle", flag: "enhance-js", on: false }])),
  c("via", "a via outside the vocabulary", (f) => after(f)[1].actions.push({ type: "key", key: "Escape", via: "magic" })),
  c("via", "a via wrong for its key", (f) => after(f)[1].actions.push({ type: "key", key: "Escape", via: "el.click()" })),
  c("via", "dispatch on an after page", (f) => after(f)[1].actions.push({ type: "key", key: "Enter", via: "dispatch(keydown)" })),
  c("viewport", "a split no layout has", (f) => (f.demo.after!.split = "70/30" as "60/40")),
  c("viewport", "a split on a page with no code panel", (f) => {
    f.demo.after = { ...f.demo.after!, split: "60/40", files: [], steps: f.demo.after!.steps.map(({ code: _code, ...s }) => s) };
  }),
  c("label", "a long label", (f) => (after(f)[1].label = "A label of far too many words")),
  c("label", "an empty label", (f) => (after(f)[1].label = " ")),
  c("page-order", "a before with no after", (f) => delete f.demo.after),
  c("frame-change", "a step that changes nothing", (f) => (after(f)[2].actions = [{ type: "wait", ms: 100 }])),
  c("duration", "a step over its ceiling", (f) => (after(f)[1].actions = [{ type: "wait", ms: 9000 }, { type: "click", target: "#open" }])),
  c("nav", "a demo the drawer misses", () => undefined, { tamper: (deck) => void (deck.slides = deck.slides.filter((s) => s.id !== "x1-intro")) }),
  c("group", "a navGroup that is split", (f) => {
    f.demo.navGroup = "Later";
    f.addDemo("x2");
    f.addDemo("x3").navGroup = "Later";
    f.input.demos[1].demo.navGroup = undefined;
  }),
  c("group", "a chip with no intro", (f) => {
    f.demo.chip = "Experimental";
    delete f.demo.intro;
  }),
  c("deck-links", "a link that is not https", (f) => (f.config.speaker.url = "http://example.com")),
  c("deck-links", "a closing link that is not https", (f) => (f.input.slides[2].url = "http://example.com")),
  c("theme", "a theme file that is gone", (f) => (f.config.theme = { extends: "./gone.css" })),
  c("theme", "a token outside --deck-*", (f) => (f.config.theme = { tokens: { "--accent": "red" } })),
  c("wrapper-unknown", "a shell nobody registered", (f) => (f.demo.after!.shell = { id: "nope" })),
  c("wrapper-missing", "an outside id the markup lacks", (f) => (f.demo.after!.shell = { id: "bare", outside: ["nope"] })),
  c("wrapper-shown", "a shown file with the wrap- prefix", (f) => {
    f.write("demos/x1/after/index.html", '<button id="open"></button><dialog id="box" class="wrap-card"></dialog>\n');
  }),
  c("wrapper-markup", "a shell with a link", (f) => {
    SHELLS["test-shell"] = { id: "test-shell", banned: [], render: () => ({ before: '<a class="wrap-x" href="/x">x</a>', after: "", styles: [], scripts: [] }) };
    f.demo.after!.shell = { id: "test-shell" };
  }, { shell: "test-shell" }),
  c("reserved-route", "a demo route on /present", (f) => (f.input.demos[0].routes = [{ method: "GET", path: "/present", handler: () => new Response("") }])),
  c("reserved-route", "a regex over /s/<id>", (f) => (f.input.demos[0].routes = [{ method: "GET", path: /^\/s\/(?<id>.+)$/, handler: () => new Response("") }])),
  c("reserved-route", "an address under /live-ish", (f) => (f.input.demos[0].routes = [{ method: "GET", path: "/live-ish/app.js", handler: () => new Response("") }])),
  c("bg-missing", "a blank background", (f) => (f.demo.background = " ")),
  c("bg-unknown", "a background that is no value", (f) => (f.demo.background = "hero.jpg")),
  c("bg-file", "a background file that is gone", (f) => (f.demo.background = "/backgrounds/gone.jpg")),

  // Fit
  c("file-size", "a line past 44 columns", (f) => f.write("demos/x1/after/index.html", `<button id="open">${"x".repeat(50)}</button><dialog id="box"></dialog>\n`)),
  c("file-size", "more lines than the panel holds", (f) => f.write("demos/x1/after/index.html", `<button id="open"></button><dialog id="box"></dialog>\n${"<p></p>\n".repeat(41)}`)),
  c("storage-clear", "shown code clears storage", (f) => {
    f.write("demos/x1/after/app.js", "localStorage.clear();\n");
    f.demo.after!.files!.push(shown("app.js"));
  }),
  c("callouts", "a callout on a before page", (f) => (before(f)[1].callouts = [{ target: "#open", text: "Open", side: "top" }])),
  c("callouts", "two callouts", (f) => after(f)[1].callouts!.push({ target: "#open", text: "Two", side: "left" })),
  c("callouts", "a long callout", (f) => (after(f)[1].callouts![0].text = "Four words are here")),
  c("step-cap", "too many steps", (f) => addSteps(f.demo.after, 4)),
  c("step-cap", "steps out of order", (f) => (after(f)[1].id = "s9")),
  c("bullets", "a step with no notes", (f) => (after(f)[1].notes = [])),
  c("bullets", "a step with too many notes", (f) => (before(f)[1].notes = ["One.", "Two.", "Three.", "Four."])),
  c("key-step", "two key steps", (f) => (after(f)[2].key = true)),
  c("key-step", "no key step", (f) => delete after(f)[1].key),
  c("keyboard", "a key action with no ifKeyboard", (f) => after(f)[1].actions.push({ type: "key", key: "Enter", via: "el.click()" })),
  c("proof", "too many proofs", (f) => after(f).forEach((s: StepConfig) => (s.proof = "Proof."))),
  c("meter", "a meter that disagrees with the count", (f) => (before(f)[2].meter = { label: "JavaScript", value: "12 lines", source: "before/*.js" })),
  c("meter", "a before meter off the last step", (f) => {
    before(f)[1].meter = before(f)[2].meter;
    delete before(f)[2].meter;
  }),
  c("todo", "a TODO in notes", (f) => (after(f)[1].notes = ["TODO rewrite this.", "Two."])),
  c("images", "a master with no manifest entry", (f) => {
    f.write(".live-ish/images.json", "{}");
    f.write("public/intro/a.png", png(10, 10));
  }),
  c("public-files", "a list that lags the disk", (f) => {
    f.write(".live-ish/public-files.json", "[]");
    f.write("public/images/a.txt", "x");
  }),
  c("fonts", "a font file that is gone", (f) => (f.config.theme = { fonts: { sans: ["/fonts/gone.woff2"] } })),
  c("poster-fresh", "a page with no capture record", (f) => f.write(".live-ish/posters.json", "{}")),
  c("poster-fresh", "a poster older than its inputs", (f) => f.write(".live-ish/posters.json", JSON.stringify({ "x1-after": { inputs: "stale", captured: "2026-01-01T00:00:00Z" }, "x1-before": { inputs: "stale", captured: "2026-01-01T00:00:00Z" } }))),
  c("og-stale", "a cover captured from old inputs", (f) => {
    f.write(".live-ish/og.json", JSON.stringify({ hash: "stale", width: 1200, height: 630, imageSha256: "", inputs: {} }));
    f.write("public/live-ish/og/cover.jpg", "x");
  }),
  c("og-image", "a record with no image", (f) => f.write(".live-ish/og.json", JSON.stringify({ hash: "x", width: 1200, height: 630, imageSha256: "", inputs: {} }))),
  c("jsonld", "a citation that is not https", (f) => (f.input.slides[1].citations = [{ text: "A source", url: "http://example.com" }])),
  c("seo-title", "two pages with one title", (f) => (f.input.slides[1].title = "Thank you")),
  c("event-date", "an event with no date", (f) => (f.config.event = { name: "A conference" })),
  c("theme-lint", "page CSS outside the layers", (f) => {
    f.write("public/page.css", ".x { color: red; }\n");
    f.demo.after!.styles = ["/page.css"];
  }),
  c("wrapper-lint", "shell CSS outside its layer", (f) => {
    f.write("public/test-shell.css", ".wrap-bar { color: #f00; }\n");
    SHELLS["test-shell"] = { id: "test-shell", banned: [], render: () => ({ before: "", after: "", styles: ["/test-shell.css"], scripts: [] }) };
    f.demo.after!.shell = { id: "test-shell" };
  }, { shell: "test-shell" }),
  c("wrapper-banned", "a shell using what it bans", (f) => {
    SHELLS["test-shell"] = { id: "test-shell", banned: [{ name: "popover", pattern: /popover/i }], render: () => ({ before: '<div class="wrap-menu" popover></div>', after: "", styles: [], scripts: [] }) };
    f.demo.after!.shell = { id: "test-shell" };
  }, { shell: "test-shell" }),
  c("support-claim", "an unsourced browser claim", (f) => (after(f)[1].notes = ["This works in all browsers.", "Two."])),
  c("support-claim", "a version outside the data", (f) => (f.input.slides[1].body = ["It landed in Chrome 41."])),
  c("skills-stale", "skills on an older schema", (f) => f.write(".live-ish/skills.lock", JSON.stringify({ engine: "0.0.0", schema: 0, files: {} }))),
  c("timing", "a deck past its target", (f) => (f.config.timing = { target: 1 })),
  c("bg-unused", "a background file nothing uses", (f) => {
    f.write("public/backgrounds/used.png", png(1920, 1080));
    f.write("public/backgrounds/old.png", png(1920, 1080, 1));
    f.demo.background = "/backgrounds/used.png";
  }),
  c("bg-shared", "one file on two slides", (f) => {
    f.write("public/backgrounds/used.png", png(1920, 1080));
    f.demo.background = "/backgrounds/used.png";
    f.input.slides[1].background = "/backgrounds/used.png";
  }),
  c("bg-size", "a background the wrong size", (f) => {
    f.write("public/backgrounds/used.png", png(2048, 1152));
    f.demo.background = "/backgrounds/used.png";
  }),
  c("bg-bytes", "a heavy background", (f) => {
    f.write("public/backgrounds/used.png", png(1920, 1080, 2_000_000));
    f.demo.background = "/backgrounds/used.png";
  }),
  c("bg-duplicate", "two names for one file", (f) => {
    f.write("public/backgrounds/a.png", png(1920, 1080));
    f.write("public/backgrounds/b.png", png(1920, 1080));
    f.demo.background = "/backgrounds/a.png";
    f.input.slides[1].background = "/backgrounds/b.png";
  }),
  c("bg-stats", "stats measured on another file", (f) => {
    f.write("public/backgrounds/used.png", png(1920, 1080));
    f.write(".live-ish/backgrounds.json", JSON.stringify({ "/backgrounds/used.png": { sha256: "stale" } }));
    f.demo.background = "/backgrounds/used.png";
  }),

  // Support
  c("support", "an id web-features does not have", (f) => (f.demo.support = { kind: "web-features", id: "no-such-feature" })),
  c("support", "too many features", (f) => (f.demo.support = { kind: "web-features", id: "dialog", alsoUses: ["popover", "dialog", "popover"] })),
  c("support", "generated data that is out of date", (f) => f.write(".live-ish/support.json", JSON.stringify({ package: "web-features", version: "0.0.1", toolDates: {}, demos: {} }))),
  c("intro", "an intro with no support", (f) => delete f.demo.support),
  c("intro", "a long description", (f) => (f.demo.intro!.description = "It confirms. It also closes. It stays open.")),
  c("intro", "a capture of a step that is gone", (f) => (f.demo.intro!.visual!.capture!.step = "s9")),
  c("intro", "a typed still that is missing", (f) => (f.demo.intro!.visual!.src = "/intro/gone.png")),
  c("eyebrow", "a title too long for one line", (f) => (f.demo.title = "A demo title that runs on for far longer than one eyebrow line can hold")),

  // Style, turned on the way a deck turns them on
  c("dash", "an em dash", (f) => plain(f) && (f.input.slides[1].title = "This one — that one")),
  c("exclaim", "an exclamation mark", (f) => plain(f) && (after(f)[1].notes = ["The button opens the dialog!", "Two."])),
  c("case", "a lowercase label", (f) => plain(f) && (after(f)[1].label = "open the dialog")),
  c("slide-case", "uppercase in the deck's CSS", (f) => {
    plain(f);
    f.write("theme.css", ".sg-eyebrow { text-transform: uppercase; letter-spacing: 0.1em; }\n");
    f.config.theme = { extends: "./theme.css" };
  }),
  c("banned", "a banned word", (f) => plain(f) && (f.demo.scenario = "The row just opens a dialog.")),
  c("banned", "a word from writing.banned", (f) => (f.config.writing = { banned: ["dialog"] })),
  c("sentence", "a sentence over the limit", (f) => plain(f) && (f.demo.scenario = "This one sentence keeps going on and on with many more words than anyone in the room could ever follow on the stage.")),
  c("x-not-y", "X, not Y", (f) => plain(f) && (after(f)[1].label = "Browser, not script")),
  c("intro-sentences", "one sentence of opening notes", (f) => {
    f.config.checks = { rules: { "intro-sentences": "error" } };
    f.demo.after!.notes = "One sentence only.";
  }),
  c("bullet-length", "a long notes paragraph", (f) => {
    f.config.checks = { rules: { "bullet-length": "error" } };
    after(f)[1].notes = [Array.from({ length: 46 }, () => "word").join(" "), "Two."];
  }),
  c("step-words", "a step with too many words", (f) => {
    f.config.checks = { rules: { "step-words": "error" } };
    after(f)[1].notes = Array.from({ length: 3 }, () => Array.from({ length: 30 }, () => "word").join(" "));
  }),
  c("budget", "opening notes over budget", (f) => {
    f.config.checks = { rules: { budget: "error" } };
    f.demo.intro!.notes = Array.from({ length: 8 }, () => "This sentence has nine words in it, all told.").join(" ");
  }),
  c("cautions", "too many cautions", (f) => {
    f.config.checks = { rules: { cautions: "error" } };
    f.demo.cautions = ["One.", "Two.", "Three.", "Four."];
  }),
  c("seo-description", "a description too long for a card", (f) => (f.input.slides[1].description = "A very long description. ".repeat(10))),
  c("seo-description", "a copy slide with no description", (f) => {
    f.config.checks = { rules: { "seo-description": "error" } };
    delete f.input.slides[1].description;
  }),
];

test("the valid fixture has no findings, plain or strict", async () => {
  const f = fixture();
  try {
    assert.deepEqual((await f.check()).findings, []);
    assert.deepEqual((await f.check({ strict: true })).findings, []);
  } finally {
    f.done();
  }
});

for (const { rule, name, breakIt, tamper, shell } of CASES) {
  test(`[${rule}] ${name}`, async () => {
    const f = fixture();
    try {
      breakIt(f);
      const { findings } = await f.check({ tamper });
      assert.ok(findings.some((x) => x.rule === rule), `expected [${rule}], got ${findings.map((x) => `[${x.rule}] ${x.message}`).join("; ") || "nothing"}`);
    } finally {
      if (shell) delete SHELLS[shell];
      f.done();
    }
  });
}

test("every registered rule has a broken fixture, and only external rules are missing from the list", () => {
  const registered = new Set(allRules.map((r) => r.id));
  const covered = new Set(CASES.map((x) => x.rule));
  assert.deepEqual([...registered].filter((id) => !covered.has(id)), []);
  assert.deepEqual(RULE_IDS.filter((id) => !registered.has(id)).sort(), [...EXTERNAL_RULES].filter((id) => !registered.has(id)).sort());
});

test("every rule in the catalog has a docs page and a one-line summary", () => {
  for (const id of RULE_IDS) assert.ok(rulePage(id), `no page at packages/engine/rules/${id}.md`);
  for (const rule of allRules) assert.ok(rule.summary && !rule.summary.includes("\n"), rule.id);
});
