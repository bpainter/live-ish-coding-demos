import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { rules } from "../src/lib/validate/rules/chrome";
import { renderCodeFile } from "../src/lib/highlight";
import { prepareDeck } from "../src/prepare";
import { assembleDeck, type DeckInput } from "../src/schema/assemble";
import type { CopyLayout, SlideConfig } from "../src/schema/slide";

const ENGINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFORMANCE = path.join(ENGINE, "..", "..", "examples", "conformance");
const temp: string[] = [];
after(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** A deck on disk with one copy slide and no engine imports, so it runs from a temp folder. */
function deckFolder(config: string, extra: Record<string, string> = {}): string {
  const root = mkdtempSync(path.join(tmpdir(), "live-ish-theme-"));
  temp.push(root);
  mkdirSync(path.join(root, "slides"));
  writeFileSync(path.join(root, "deck.config.ts"), `export default { schemaVersion: 1, title: "T", order: ["s"], speaker: { name: "N" }, ${config} };`);
  writeFileSync(path.join(root, "slides", "01-s.ts"), `export default { id: "s", title: "S" };`);
  for (const [file, text] of Object.entries(extra)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

const run = async (id: string, root: string, strict = false) => {
  const deck = await prepareDeck(root);
  return rules.find((r) => r.id === id)!.run({ root, deck, strict });
};

const demoInput = (config: Partial<DeckInput["config"]>, demo: Partial<DeckInput["demos"][number]["demo"]>): DeckInput => ({
  config: { schemaVersion: 1, title: "T", order: ["d"], speaker: { name: "N" }, ...config },
  slides: [],
  demos: [{ folder: "demos/d", hooks: false, demo: { id: "d", title: "D", scenario: "S", intro: { description: "x" }, before: { steps: [] }, after: { steps: [] }, ...demo } }],
});
const themes = (input: DeckInput) => Object.fromEntries(assembleDeck(input).slides.map((s) => [s.id, s.chrome]));

test("selection: page, then beat default, then demo, then deck", () => {
  assert.deepEqual(themes(demoInput({}, {})), { "d-intro": "glass", "d-before": "glass", "d-after": "glass" });
  assert.deepEqual(themes(demoInput({ chrome: { theme: "flat" } }, {})), { "d-intro": "flat", "d-before": "flat", "d-after": "flat" });
  assert.deepEqual(themes(demoInput({ chrome: { theme: "flat" } }, { chrome: "soft" })), { "d-intro": "soft", "d-before": "soft", "d-after": "soft" });
  assert.deepEqual(themes(demoInput({ chrome: { theme: "flat", beats: { before: "early-web" } } }, { chrome: "soft" })), { "d-intro": "soft", "d-before": "early-web", "d-after": "soft" });
  assert.deepEqual(themes(demoInput({ chrome: { beats: { before: "early-web" } } }, { before: { steps: [], chrome: "swiss" } })), { "d-intro": "glass", "d-before": "swiss", "d-after": "glass" });
});

test("selection: copy slides carry no theme", () => {
  const { slides } = assembleDeck({ config: { schemaVersion: 1, title: "T", order: ["s"], speaker: { name: "N" }, chrome: { theme: "flat" } }, slides: [{ id: "s", title: "S" }], demos: [] });
  assert.equal(slides[0].chrome, undefined);
});

test("prepareDeck copies fonts only for themes the deck resolves to", async () => {
  const root = deckFolder(`chrome: { theme: "brutalist" }`);
  await prepareDeck(root);
  const fonts = path.join(root, "public", "live-ish", "fonts");
  assert.deepEqual(readdirSync(fonts).sort(), ["inter", "jetbrains-mono", "space-grotesk"]);
  assert.ok(existsSync(path.join(fonts, "inter", "OFL.txt")));
  assert.match(readFileSync(path.join(root, "public", "live-ish", "fonts.css"), "utf8"), /Space Grotesk/);
  // Every theme's CSS stays on the host for ?chrome= previews.
  assert.equal(readdirSync(path.join(root, "public", "live-ish", "chrome")).filter((f) => !f.endsWith(".frame.css")).length, 10);
});

test("theme.tokens and theme.extends reach deck.css, and an unknown theme stops the build", async () => {
  const root = deckFolder(`theme: { extends: "./my-tokens.css", tokens: { "--deck-accent": "#0b57d0" } }`, { "my-tokens.css": ":root { --deck-grain: 0; }\n" });
  await prepareDeck(root);
  const css = readFileSync(path.join(root, "public", "live-ish", "deck.css"), "utf8");
  assert.match(css, /--deck-grain: 0/);
  assert.match(css, /:root:root \{\n  --deck-accent: #0b57d0;/);
  await assert.rejects(prepareDeck(deckFolder(`chrome: { theme: "glas" }`)), /Unknown chrome theme "glas".*glass/);
});

test("theme-contrast reports a failing theme.tokens value with its ratio", async () => {
  const findings = await run("theme-contrast", deckFolder(`theme: { tokens: { "--deck-accent": "#f0e0d0" } }`));
  const hit = findings.find((f) => f.message.includes("--deck-accent on --deck-paper"));
  assert.ok(hit);
  assert.match(hit.message, /\d\.\d+:1\. The floor is 4\.5:1\./);
  assert.equal(hit.where, "deck.config.ts: theme.tokens");
  assert.equal(hit.severity, "warning");
  assert.equal((await run("theme-contrast", deckFolder(`theme: { tokens: { "--deck-accent": "#f0e0d0" } }`), true))[0].severity, "error");
});

test("a custom theme inherits, generates, and is checked like a built-in", async () => {
  const good = { schemaVersion: 1, id: "harbor", name: "Harbor", extends: "flat", tokens: { "--chrome-accent": "#0b5c8a" }, code: { keyword: "#0b4f78" } };
  const root = deckFolder(`chrome: { theme: "harbor", custom: ["./themes/harbor.json"] }`, { "themes/harbor.json": JSON.stringify(good) });
  assert.deepEqual(await run("theme-lint", root), []);
  const css = readFileSync(path.join(root, "public", "live-ish", "chrome", "harbor.css"), "utf8");
  assert.match(css, /\[data-chrome="harbor"\]/);
  assert.match(css, /--chrome-accent: #0b5c8a/);
  assert.match(css, /--chrome-backdrop: #f4f4f2/);
  assert.ok(existsSync(path.join(root, "public", "live-ish", "chrome", "harbor.frame.css")));
  const failing = { ...good, tokens: { "--chrome-ink": "#f0f0f0" } };
  const findings = await run("theme-contrast", deckFolder(`chrome: { theme: "harbor", custom: ["./themes/harbor.json"] }`, { "themes/harbor.json": JSON.stringify(failing) }));
  assert.ok(findings.some((f) => /--chrome-ink on the backdrop is 1\.\d+:1\. The floor is 4\.5:1\./.test(f.message)));
});

test("a theme file with a selector fails theme-lint, and never reaches the CSS", async () => {
  const bad = { schemaVersion: 1, id: "harbor", name: "Harbor", tokens: { ".page__title": "red" } };
  const root = deckFolder(`chrome: { custom: ["./themes/harbor.json"] }`, { "themes/harbor.json": JSON.stringify(bad) });
  await assert.rejects(prepareDeck(root), /theme-lint|selectors/);
  const injected = { schemaVersion: 1, id: "harbor", name: "Harbor", tokens: { "--chrome-accent": "red; } body { display: none" } };
  await assert.rejects(prepareDeck(deckFolder(`chrome: { custom: ["./themes/harbor.json"] }`, { "themes/harbor.json": JSON.stringify(injected) })), /one CSS value/);
});

test("Shiki writes tokens, not colors", async () => {
  const { lines } = await renderCodeFile({ file: "a.js", lang: "js", source: 'const a = "x"; // note\n' });
  const json = JSON.stringify(lines);
  for (const token of ["keyword", "string", "comment"]) assert.ok(json.includes(`var(--chrome-code-${token})`), token);
  assert.doesNotMatch(json, /#00000\d/);
});

test("conformance: every copy layout has a slide", async () => {
  const layouts: CopyLayout[] = ["content", "title", "closing", "grid", "statement", "section", "quotes", "people", "image", "stat", "comparison", "table", "timeline", "chart"];
  const dir = path.join(CONFORMANCE, "slides");
  const used = new Set<string>();
  for (const file of readdirSync(dir)) {
    const text = readFileSync(path.join(dir, file), "utf8");
    used.add(/layout: "([a-z]+)"/.exec(text)?.[1] ?? "content");
  }
  assert.deepEqual(layouts.filter((l) => !used.has(l)), []);
  const config = readFileSync(path.join(CONFORMANCE, "deck.config.ts"), "utf8");
  for (const file of readdirSync(dir)) assert.ok(config.includes(`"${file.replace(/^\d+-|\.ts$/g, "")}"`), `${file} is not in order`);
});

export type { SlideConfig };
