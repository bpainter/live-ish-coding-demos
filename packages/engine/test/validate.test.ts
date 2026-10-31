import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { formatFinding, runChecks } from "../src/lib/validate";
import { EXTERNAL_RULES, REMOVED_RULES, RULE_IDS, TIERS, tierOf } from "../src/lib/validate/catalog";
import { assertDeckConfig, validateDeckConfig } from "../src/lib/validate/config";
import { frameHooks, hookNames } from "../src/lib/validate/dom";
import { fontCodePoints } from "../src/lib/validate/fonts";
import { LAYOUT } from "../src/lib/validate/layout";
import { BANNED, PRESETS, finalSeverity, resolveSettings } from "../src/lib/validate/presets";
import { RESERVED_ROUTES } from "../src/lib/validate/rules/frames";
import { allRules } from "../src/lib/validate/rules";
import { lintShellCss, lintTheme } from "../src/lib/validate/theme";
import { DeckConfigError, DeckError, isDeckConfigError, isDeckError } from "../src/schema/errors";
import { defineDeck, type DeckConfig } from "../src/schema";
import { ENGINE, fixture, starterCopy, STARTER } from "./validate-fixture";

/** The 77 ids the validators started from. Each is kept with a tier or removed on purpose. */
const ORIGINAL_IDS = ["page-order", "step-cap", "bullets", "bullet-length", "step-words", "budget", "proof", "key-step", "label", "keyboard", "frame-change", "duration", "intro", "intro-sentences", "eyebrow", "cautions", "callouts", "code", "files", "file-size", "excerpt", "selector", "via", "flags", "viewport", "build", "meter", "support", "todo", "dash", "exclaim", "case", "slide-case", "banned", "sentence", "x-not-y", "seo-title", "seo-description", "jsonld", "og-image", "og-stale", "event-date", "images", "public-files", "poster-fresh", "fonts", "deck-links", "nav", "theme", "theme-lint", "wrapper-banned", "wrapper-lint", "wrapper-markup", "wrapper-missing", "wrapper-shown", "wrapper-unknown", "bg-missing", "bg-unknown", "bg-unused", "bg-shared", "bg-file", "bg-size", "bg-bytes", "bg-duplicate", "bg-stats", "group", "timing", "title", "bg-adjacent", "bg-frame", "bg-glass", "bg-leftover", "qr", "grain", "theme-hash", "tailwind", "v3-field"];

const base: DeckConfig = { schemaVersion: 1, title: "Deck", order: ["a"], speaker: { name: "A Speaker" } };

// --------------------------------------------------------------- tiers

test("each of the 77 original rule ids has a tier or is removed, never both", () => {
  assert.equal(ORIGINAL_IDS.length, 77);
  assert.equal(new Set(ORIGINAL_IDS).size, 77);
  for (const id of ORIGINAL_IDS) assert.notEqual(Boolean(tierOf(id)), REMOVED_RULES.includes(id), id);
  assert.equal(REMOVED_RULES.length, 10);
  assert.equal(new Set(RULE_IDS).size, RULE_IDS.length);
});

test("rules sit in the tier their failure deserves", () => {
  for (const id of ["build", "selector", "viewport", "label", "reserved-route", "bg-file", "terminal-range"]) assert.equal(tierOf(id), "integrity", id);
  for (const id of ["file-size", "callouts", "support-claim", "skills-stale", "timing", "bg-stats", "theme-contrast"]) assert.equal(tierOf(id), "fit", id);
  assert.deepEqual([...TIERS.support], ["support", "intro", "eyebrow"]);
  for (const id of ["dash", "sentence", "budget", "seo-description"]) assert.equal(tierOf(id), "style", id);
});

test("no removed rule is registered, and a rule's tier is the catalog's", () => {
  for (const rule of allRules) {
    assert.ok(!REMOVED_RULES.includes(rule.id), rule.id);
    // The length half of seo-description stays Fit.
    if (rule.id !== "seo-description") assert.equal(rule.tier, tierOf(rule.id), rule.id);
  }
  assert.deepEqual(allRules.filter((r) => r.id === "seo-description").map((r) => r.tier).sort(), ["fit", "style"]);
  assert.ok(EXTERNAL_RULES.every((id) => tierOf(id)));
});

// --------------------------------------------------------------- severity

test("Integrity is always an error, Fit warns until strict, and notes stay warnings", () => {
  assert.equal(finalSeverity("integrity", "error", "warning", false, false), "error");
  assert.equal(finalSeverity("fit", "warn", "error", false, false), "warning");
  assert.equal(finalSeverity("fit", "warn", "error", true, false), "error");
  assert.equal(finalSeverity("fit", "warn", "error", true, true), "warning");
  assert.equal(finalSeverity("style", "error", "warning", true, false), "warning");
  assert.equal(finalSeverity("style", "warn", "error", false, false), "warning");
});

test("the plain preset ships its settings and 20 banned entries", () => {
  assert.equal(BANNED.length, 20);
  assert.deepEqual(PRESETS.plain.rules.sentence, { warn: 15, error: 20 });
  assert.equal(PRESETS.plain.rules["x-not-y"], "warn");
  assert.deepEqual(Object.keys(PRESETS.plain.rules).sort(), ["banned", "case", "dash", "exclaim", "sentence", "slide-case", "x-not-y"]);
  assert.equal(resolveSettings({}).level("dash", "style"), "off");
  assert.equal(resolveSettings({ writing: { preset: "plain" } }).level("dash", "style"), "error");
});

test("writing.rules and checks.rules layer over the preset", () => {
  const s = resolveSettings({ writing: { preset: "plain", rules: { dash: "warn", sentence: { warn: 10 } }, banned: ["Synergy"] }, checks: { fit: "error", rules: { todo: "off", dash: "off" } } });
  assert.equal(s.level("dash", "style"), "off");
  assert.equal(s.level("todo", "fit"), "off");
  assert.equal(s.level("proof", "fit"), "error");
  assert.deepEqual(s.sentence, { warn: 10, error: 20 });
  assert.ok(s.banned.includes("synergy") && s.banned.includes("seamless"));
});

test("limits live in layout data, and shown code is capped at 44 columns and 40 lines", () => {
  assert.equal(LAYOUT.columns, 44);
  assert.equal(LAYOUT.fileLines, 40);
});

test("a Fit rule relaxed to off is silent, and warnings turn to errors under strict", async () => {
  const f = fixture();
  try {
    f.demo.after!.steps[1].notes = [];
    assert.equal((await f.check()).findings[0].severity, "warning");
    assert.equal((await f.check({ strict: true })).findings[0].severity, "error");
    f.config.checks = { rules: { bullets: "warn" } };
    assert.equal((await f.check({ strict: true })).findings[0].severity, "warning");
    f.config.checks = { rules: { bullets: "off" } };
    assert.deepEqual((await f.check({ strict: true })).findings, []);
    f.config.checks = { fit: "off" };
    assert.deepEqual((await f.check()).findings, []);
  } finally {
    f.done();
  }
});

test("spoken notes warn on sentence length and banned words even at error level", async () => {
  const f = fixture();
  try {
    f.config.writing = { preset: "plain" };
    const long = "This one sentence keeps going on and on with many more words than anyone in the room could ever follow on the stage.";
    f.demo.after!.steps[1].notes = [long, "The button just opens it."];
    const found = (await f.check({ strict: true })).findings.filter((x) => x.rule === "sentence" || x.rule === "banned");
    assert.equal(found.length, 2);
    assert.ok(found.every((x) => x.severity === "warning"));
  } finally {
    f.done();
  }
});

// --------------------------------------------------------------- config

test("an Integrity rule cannot be turned off", () => {
  assert.throws(() => defineDeck({ ...base, checks: { rules: { selector: "off" } } }), (e: Error) => e instanceof DeckConfigError && /checks\.rules\.selector/.test(e.message) && /Integrity/.test(e.message));
});

test("a Fit rule can only relax", () => {
  const issue = (rules: Record<string, unknown>) => validateDeckConfig({ ...base, checks: { rules } });
  assert.deepEqual(issue({ "file-size": "off" }), []);
  assert.deepEqual(issue({ "file-size": "warn" }), []);
  assert.match(issue({ "file-size": "error" })[0].message, /can only relax/);
  assert.match(issue({ "file-size": { columns: 60 } })[0].message, /cannot be changed/);
  assert.deepEqual(issue({ dash: "error", support: "warn" }), []);
});

test("a wrong field names its path, the expected type and the nearest valid name", () => {
  const [misspelled] = validateDeckConfig({ ...base, writing: { presett: "plain" } });
  assert.equal(misspelled.path, "writing.presett");
  assert.match(misspelled.message, /Expected "none" \| "plain" at writing\.preset/);
  assert.equal(misspelled.fix, 'Did you mean "preset"?');
  const [wrongType] = validateDeckConfig({ ...base, timing: { target: "20" } });
  assert.equal(wrongType.path, "timing.target");
  assert.match(wrongType.message, /Expected number, found "20"/);
  const [topLevel] = validateDeckConfig({ ...base, titel: "x" });
  assert.equal(topLevel.path, "titel");
  assert.equal(topLevel.fix, 'Did you mean "title"?');
});

test("required fields, unknown rules and removed rules all fail", () => {
  assert.deepEqual(validateDeckConfig({}).map((i) => i.path), ["schemaVersion", "title", "order", "speaker"]);
  assert.deepEqual(validateDeckConfig({ ...base, speaker: {} }).map((i) => i.path), ["speaker.name"]);
  assert.equal(validateDeckConfig({ ...base, checks: { rules: { selectr: "warn" } } })[0].fix, 'Did you mean "selector"?');
  assert.match(validateDeckConfig({ ...base, checks: { rules: { tailwind: "off" } } })[0].message, /removed/);
  assert.equal(validateDeckConfig({ ...base, writing: { rules: { dsah: "error" } } })[0].fix, 'Did you mean "dash"?');
  assert.deepEqual(validateDeckConfig({ ...base, writing: { rules: { dash: "error", sentence: { warn: 15, error: 20 } } } }), []);
  assert.doesNotThrow(() => assertDeckConfig(base));
});

test("a config error is recognized across two copies of the class", () => {
  // The name carries this, because a deck's CommonJS modules and the CLI's ESM hold separate copies.
  const foreign = Object.assign(new Error("x"), { name: "DeckConfigError", issues: [{ path: "a", message: "b" }] });
  assert.ok(isDeckError(foreign) && isDeckConfigError(foreign));
  assert.ok(isDeckError(new DeckError("x")) && !isDeckConfigError(new DeckError("x")));
  assert.ok(!isDeckError(new TypeError("x")));
});

// --------------------------------------------------------------- the starter

test("the starter passes with 0 errors and 0 warnings, at default and strict", async () => {
  assert.deepEqual((await runChecks({ root: STARTER })).findings, []);
  assert.deepEqual((await runChecks({ root: STARTER, strict: true })).findings, []);
});

test("an em dash in a title passes by default and fails with [dash] under plain", async () => {
  const dash = (extra = "") =>
    starterCopy((replace) => {
      replace("slides/02-what-this-shows.ts", 'title: "What this deck shows"', 'title: "What this deck shows — and how"');
      if (extra) replace("deck.config.ts", 'speaker: { name: "Your Name" },', `speaker: { name: "Your Name" },\n  ${extra}`);
    });
  const off = dash();
  const plain = dash('writing: { preset: "plain" },');
  try {
    assert.deepEqual((await runChecks({ root: off.root })).findings, []);
    const { findings } = await runChecks({ root: plain.root });
    const hit = findings.filter((f) => f.rule === "dash");
    assert.equal(hit.length, 1);
    assert.equal(hit[0].severity, "error");
    assert.equal(hit[0].where, "slides/02-what-this-shows.ts: title");
  } finally {
    off.done();
    plain.done();
  }
});

test("the starter has no errors under the plain preset", async () => {
  const deck = starterCopy((replace) => replace("deck.config.ts", 'speaker: { name: "Your Name" },', 'speaker: { name: "Your Name" },\n  writing: { preset: "plain" },'));
  try {
    const { findings } = await runChecks({ root: deck.root });
    assert.deepEqual(findings.filter((f) => f.severity === "error").map(formatFinding), []);
  } finally {
    deck.done();
  }
});

test("checks.rules with selector off fails config validation through runChecks", async () => {
  const deck = starterCopy((replace) => replace("deck.config.ts", 'speaker: { name: "Your Name" },', 'speaker: { name: "Your Name" },\n  checks: { rules: { selector: "off" } },'));
  try {
    const { findings } = await runChecks({ root: deck.root });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].rule, "config");
    assert.equal(findings[0].where, "deck.config.ts: checks.rules.selector");
  } finally {
    deck.done();
  }
});

test("a broken selector prints exactly the documented shape", async () => {
  const deck = starterCopy((replace) => replace("demos/faq/demo.ts", 'spotlight: ["#q1", "#q2"],', 'spotlight: ["#q9"],'));
  try {
    const { findings } = await runChecks({ root: deck.root });
    assert.equal(findings.length, 1);
    assert.equal(formatFinding(findings[0]), ['✖ [selector] demos/faq/demo.ts: after, step s2, spotlight', '  "#q9" matches nothing in after/index.html.', "  Found: #q1, #q2, #note.", "  Docs: https://live-ish.dev/errors/selector"].join("\n"));
  } finally {
    deck.done();
  }
});

test("a demo in order with no folder names the path it looked in", async () => {
  const deck = starterCopy((replace) => replace("deck.config.ts", '"faq", ', '"faqs", '));
  try {
    const hit = (await runChecks({ root: deck.root })).findings.find((f) => f.rule === "build");
    assert.ok(hit);
    assert.equal(hit.where, "deck.config.ts: order");
    assert.equal(hit.fix, `Looked in ${path.join(deck.root, "demos", "faqs")}. Did you mean "faq"?`);
  } finally {
    deck.done();
  }
});

test("only narrows to one demo, and an unknown id is misuse", async () => {
  const deck = starterCopy((replace) => replace("demos/faq/demo.ts", 'spotlight: ["#q1", "#q2"],', 'spotlight: ["#q9"],'));
  try {
    assert.equal((await runChecks({ root: deck.root, only: "faq" })).findings.length, 1);
    assert.equal((await runChecks({ root: deck.root, only: "faq-after" })).findings.length, 1);
    assert.equal((await runChecks({ root: deck.root, only: "count-words" })).findings.length, 0);
    await assert.rejects(runChecks({ root: deck.root, only: "faqq" }), /Did you mean "faq"/);
  } finally {
    deck.done();
  }
});

// --------------------------------------------------------------- the message table

test("messages name what the author needs", async () => {
  const f = fixture();
  try {
    const first = async (rule: string) => (await f.check()).findings.find((x) => x.rule === rule)!;
    f.demo.after!.steps[1].code = { file: "missing.html", lines: [1] };
    assert.equal((await first("code")).fix, "Files: index.html.");

    f.demo.after!.steps[1].code = { file: "index.html", lines: [1] };
    f.demo.before!.steps[1].code = { file: "app.js", lines: [[1, 99]] };
    const past = await first("code");
    assert.match(past.message, /app\.js, which shows 23 lines/);
    assert.match(past.fix!, /counts shown lines/);
    assert.match(past.fix!, /elision/);

    f.demo.before!.steps[1].code = { file: "app.js", lines: [1] };
    f.write("demos/x1/after/index.html", `<button id="open">${"x".repeat(40)}</button>\n<dialog id="box"></dialog>\n`);
    const wide = await first("file-size");
    assert.match(wide.message, /^index\.html:1 is 67 columns wide/);
    assert.match(wide.fix!, /60\/40/);
  } finally {
    f.done();
  }
});

test("a drifted excerpt prints the first differing line", async () => {
  const f = fixture();
  try {
    const { findings } = await f.check({
      tamper: (deck) => {
        const page = deck.demos[0].pages[1];
        if (page.beat === "intro") return;
        page.files[0] = { ...page.files[0], source: page.files[0].source.replace("const line2 = 2;", "const line2 = 3;") };
      },
    });
    const hit = findings.find((x) => x.rule === "excerpt")!;
    assert.match(hit.message, /shown line 2 differs from demos\/x1\/before\/app\.js:2/);
    assert.equal(hit.fix, 'Shown: "const line2 = 3;". Source: "const line2 = 2;".');
  } finally {
    f.done();
  }
});

test("a missing web-features id suggests close ids from the data", async () => {
  const f = fixture();
  try {
    f.demo.support = { kind: "web-features", id: "details-nam" };
    const hit = (await f.check()).findings.find((x) => x.rule === "support")!;
    assert.match(hit.message, /has no feature "details-nam"/);
    assert.match(hit.fix!, /^Close ids: details-name/);
  } finally {
    f.done();
  }
});

test("a runtime selector takes runtimeSelectors, with the fix when a script names it", async () => {
  const f = fixture();
  try {
    f.write("demos/x1/after/app.js", 'const el = document.createElement("p");\nel.id = "late";\n');
    f.demo.after!.steps[1].spotlight = ["#late"];
    const hit = (await f.check()).findings.find((x) => x.rule === "selector")!;
    assert.match(hit.fix!, /^Found: #open, #box\. If a script creates it, add it to after\.runtimeSelectors in demo\.ts\.$/);
    f.demo.after!.runtimeSelectors = ["#late"];
    assert.deepEqual((await f.check()).findings.filter((x) => x.rule === "selector"), []);
  } finally {
    f.done();
  }
});

test("selectors with browser-only states look up the element they qualify", async () => {
  const f = fixture();
  try {
    f.demo.after!.steps[1].spotlight = ["dialog::backdrop", "#box:popover-open"];
    assert.deepEqual((await f.check()).findings, []);
    f.demo.after!.steps[1].spotlight = ["#gone:popover-open"];
    assert.equal((await f.check()).findings[0].rule, "selector");
  } finally {
    f.done();
  }
});

// --------------------------------------------------------------- reading scripts without a browser

test("hook names are read statically, as far as that can go", () => {
  assert.deepEqual(hookNames("window.demoHooks = { reset() {} };"), { names: ["reset"], complete: true });
  assert.deepEqual(hookNames('// window.demoHooks = { nope() {} };\nwindow.demoHooks = { async open() {}, "close": () => {}, spin: function () { return { x: 1 }; } };'), { names: ["open", "close", "spin"], complete: true });
  assert.deepEqual(hookNames("Object.assign(window.demoHooks, { later() {} });\nwindow.demoHooks.extra = () => {};"), { names: ["later", "extra"], complete: true });
  assert.equal(hookNames("window.demoHooks = { ...shared, reset() {} };").complete, false);
  assert.equal(hookNames("const key = 'demoHooks'; window[key] = hooks; window.demoHooks;").complete, false);
  assert.deepEqual(hookNames("console.log(1);"), { names: [], complete: true });
});

test("a hooks file no static read can follow proves nothing, so the check stays quiet", async () => {
  const f = fixture();
  try {
    f.write("demos/x1/hooks.js", "window.demoHooks = { ...shared };\n");
    f.demo.after!.hooks = ["whatever"];
    assert.deepEqual((await f.check()).findings.filter((x) => x.rule === "hook"), []);
  } finally {
    f.done();
  }
});

test("a script from outside the beat's folder could define a hook, so the check stays quiet", async () => {
  const f = fixture();
  try {
    f.demo.after!.hooks = ["fromVendor"];
    assert.equal((await f.check()).findings.filter((x) => x.rule === "hook").length, 1);
    f.write("demos/x1/after/index.html", '<script src="/vendor/hooks.js"></script>\n<button id="open"></button>\n<dialog id="box"></dialog>\n');
    assert.deepEqual((await f.check()).findings.filter((x) => x.rule === "hook"), []);
    f.write("demos/x1/after/index.html", '<script src="app.js"></script>\n<button id="open"></button>\n<dialog id="box"></dialog>\n');
    f.write("demos/x1/after/app.js", "window.demoHooks = { other() {} };\n");
    const [hit] = (await f.check()).findings.filter((x) => x.rule === "hook");
    assert.match(hit.message, /"fromVendor"/);
    assert.equal(hit.fix, "Found: reset, other.");
  } finally {
    f.done();
  }
});

test("terminal frames read their hooks from the engine's player", () => {
  const { names, complete } = frameHooks({ root: "", strict: false, deck: {} as never }, { folder: "" } as never, { frame: { kind: "terminal" } } as never);
  assert.ok(complete);
  assert.ok(names.includes("reset"));
});

// --------------------------------------------------------------- generated data and fonts

test("reserved routes cover what the shell serves", () => {
  for (const route of ["/s", "/present", "/speaker", "/_health", "/demos", "/live-ish"]) assert.ok(RESERVED_ROUTES.includes(route), route);
});

test("a route of the demo's own passes reserved-route", async () => {
  const f = fixture();
  try {
    f.input.demos[0].routes = [{ method: "GET", path: "/orders", handler: () => new Response("") }, { method: "GET", path: "/api", handler: () => new Response("") }, { method: "GET", path: /^\/orders\/(?<id>\d+)$/, handler: () => new Response("") }];
    assert.deepEqual((await f.check()).findings, []);
  } finally {
    f.done();
  }
});

test("skills-stale passes with no lock file and with a current one", async () => {
  const f = fixture();
  try {
    assert.deepEqual((await f.check()).findings, []);
    f.write(".live-ish/skills.lock", JSON.stringify({ engine: "0.1.0", schema: 1, files: {} }));
    assert.deepEqual((await f.check()).findings, []);
  } finally {
    f.done();
  }
});

/** A one-table SFNT whose cmap (format 4) maps "A" and "B". */
function tinyFont(): Buffer {
  const segCount = 2;
  const sub = Buffer.alloc(14 + segCount * 8 + 2);
  sub.writeUInt16BE(4, 0);
  sub.writeUInt16BE(sub.length, 2);
  sub.writeUInt16BE(segCount * 2, 6);
  sub.writeUInt16BE(0x42, 14);
  sub.writeUInt16BE(0xffff, 16);
  sub.writeUInt16BE(0x41, 20);
  sub.writeUInt16BE(0xffff, 22);
  sub.writeInt16BE(1 - 0x41, 24);
  sub.writeInt16BE(1, 26);
  const head = Buffer.alloc(12);
  head.writeUInt16BE(1, 2);
  head.writeUInt16BE(3, 4);
  head.writeUInt16BE(1, 6);
  head.writeUInt32BE(12, 8);
  const cmap = Buffer.concat([head, sub]);
  const sfnt = Buffer.alloc(12 + 16);
  sfnt.writeUInt16BE(1, 4);
  sfnt.write("cmap", 12, "latin1");
  sfnt.writeUInt32BE(sfnt.length, 12 + 8);
  sfnt.writeUInt32BE(cmap.length, 12 + 12);
  return Buffer.concat([sfnt, cmap]);
}

test("a font's character map is read, and the deck's missing characters are named", async () => {
  assert.deepEqual([...fontCodePoints(tinyFont())].sort(), [0x41, 0x42]);
  const f = fixture();
  try {
    f.write("public/fonts/a.woff2", tinyFont());
    f.config.theme = { fonts: { sans: ["/fonts/a.woff2"] } };
    const hit = (await f.check()).findings.find((x) => x.rule === "fonts")!;
    assert.match(hit.message, /sans faces miss \d+ characters the deck uses: " \(U\+0022\)/);
    assert.doesNotMatch(hit.message, /A \(U\+0041\)/);
  } finally {
    f.done();
  }
});

test("the engine's shipped frame CSS passes its own lint", () => {
  const css = (file: string) => readFileSync(path.join(ENGINE, "assets", file), "utf8");
  assert.deepEqual(lintTheme(css("frame-base.css")), []);
  assert.deepEqual(lintShellCss(css("shells/base.css")), []);
  assert.deepEqual(lintShellCss(css("shells/terminal-window.css")), []);
});

test("the lint still catches what it exists for", () => {
  assert.match(lintTheme(".x { color: red; }")[0].message, /outside @layer/);
  assert.match(lintTheme("@layer frame-theme { .x { display: grid; } }")[0].message, /layout/);
  assert.match(lintTheme("@layer frame-theme { dialog { margin: 0; } }")[0].message, /paint properties/);
  assert.match(lintTheme("@layer frame-layout { .app-shell { transition: opacity 1s; } }")[0].message, /never allowed/);
  assert.match(lintTheme("@layer frame-layout { dialog { display: block; } }")[0].message, /own class selectors/);
  assert.match(lintTheme("@layer frame-theme { .x { z-index: 2; } }")[0].message, /layout/);
  assert.match(lintTheme("@layer frame-theme { textarea { field-sizing: content; } }")[0].message, /never allowed/);
  assert.match(lintTheme("@layer frame-layout { .frame-menu { position-area: block-end; } }")[0].message, /never allowed/);
  assert.match(lintTheme("@layer frame-theme { @container (width > 1px) { .x { color: red; } } }")[0].message, /@container/);
  assert.match(lintTheme("@layer frame-theme { @scope (.x) { p { color: red; } } }")[0].message, /@scope/);
  assert.deepEqual(lintTheme("@layer frame-theme { dialog { padding: 4px; color: red; } [popover] > button { cursor: pointer; } } @layer frame-layout { .app-shell__nav { display: grid; } .frame-card::before { position: absolute; } }"), []);
  assert.match(lintShellCss("@layer wrapper { .wrap p { color: red; } }")[0].message, /\.wrap\* classes/);
  assert.match(lintShellCss("@layer wrapper { .wrap-bar { color: #f00; } }")[0].message, /raw color/);
});
