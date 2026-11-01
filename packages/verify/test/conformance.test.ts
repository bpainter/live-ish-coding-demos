import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { hasFrame } from "@live-ish/engine/verify";
import { presenterTargets } from "../src/axe";
import { budgets } from "../src/lib/budgets";
import { fixturePage, isBlocked, liveFrames, loadDeck } from "../src/lib/deck";
import { slideText } from "../src/walk/a11y";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..", "..");
const CONFORMANCE = path.join(ROOT, "examples", "conformance");
const STARTER = path.join(ROOT, "examples", "starter");
const ENGINE = path.join(ROOT, "packages", "engine", "src", "schema");

const deck = await loadDeck(CONFORMANCE);
const pages = deck.demos.flatMap((d) => d.pages);
const framed = pages.filter(hasFrame);
const configs = deck.input.demos.map((d) => d.demo);
const beats = configs.flatMap((d) => [d.before, d.after, d.single].filter((b) => b !== undefined));

/** The `type: "..."` members of the `Action` union, read from the schema, so a new action fails here. */
function schemaActions(): string[] {
  const source = readFileSync(path.join(ENGINE, "demo.ts"), "utf8");
  const union = source.slice(source.indexOf("export type Action ="), source.indexOf("export interface Step"));
  return [...union.matchAll(/type: "(\w+)"/g)].map((m) => m[1]);
}

/** The `CopyLayout` union. */
function schemaLayouts(): string[] {
  const source = readFileSync(path.join(ENGINE, "slide.ts"), "utf8");
  const union = /export type CopyLayout =([^;]+);/.exec(source)?.[1] ?? "";
  return [...union.matchAll(/"([\w-]+)"/g)].map((m) => m[1]);
}

test("every action in the schema has a page of its own", () => {
  const actions = schemaActions();
  assert.equal(actions.length, 15, `the schema lists ${actions.length} actions`);
  for (const action of actions) {
    const demo = deck.demos.find((d) => d.id === `act-${action}`);
    assert.ok(demo, `no act-${action} demo`);
    assert.ok(demo.pages.some((p) => p.steps.some((s) => s.actions.some((a) => a.type === action))), `act-${action} does not use ${action}`);
  }
});

test("every copy layout has a slide", () => {
  const layouts = schemaLayouts();
  assert.ok(layouts.length >= 10, `read ${layouts.length} layouts`);
  for (const layout of layouts) assert.ok(deck.slides.some((s) => s.layout === layout), `no slide with layout ${layout}`);
});

test("every copy layout reaches axe --presenter and carries text for the text view", () => {
  const targets = presenterTargets(deck);
  for (const layout of schemaLayouts()) {
    const slides = deck.slides.filter((s) => s.layout === layout);
    assert.ok(slides.length, `no slide with layout ${layout}`);
    for (const slide of slides) {
      assert.ok(targets.some((t) => t.kind === "reader" && t.id === slide.id), `axe --presenter skips ${slide.id}`);
      const text = slideText(slide);
      assert.ok(text.title, `${slide.id} has no title to check`);
      assert.ok(text.texts.length + text.alts.length > 0 || layout === "statement", `${slide.id} gives the text view nothing to check`);
    }
  }
});

test("slideText reads an image's alt on any layout, and the cards' on a grid", () => {
  const portraits = deck.slides.find((s) => s.id === "grid-portraits")!;
  assert.equal(slideText(portraits).alts.length, 3);
  const pictured = deck.slides.find((s) => s.layout === "image")!;
  assert.deepEqual(slideText(pictured).alts, [pictured.image!.alt]);
});

/** A copy of the starter that resolves the engine from this checkout. */
function freshDeck(): string {
  const root = mkdtempSync(path.join(tmpdir(), "live-ish-layout-"));
  for (const entry of ["deck.config.ts", "slides", "demos", "public"]) cpSync(path.join(STARTER, entry), path.join(root, entry), { recursive: true });
  mkdirSync(path.join(root, "node_modules", "@live-ish"), { recursive: true });
  symlinkSync(path.join(ROOT, "packages", "engine"), path.join(root, "node_modules", "@live-ish", "engine"));
  return root;
}

const CLI = path.join(ROOT, "packages", "engine", "bin", "live-ish.mjs");

function cli(cwd: string, ...args: string[]): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    let output = "";
    const child = spawn(process.execPath, [CLI, ...args], { cwd });
    child.stdout.on("data", (d) => (output += String(d)));
    child.stderr.on("data", (d) => (output += String(d)));
    child.on("close", (code) => resolve({ code, output }));
  });
}

test("new copy then check exits 0 for every layout", async () => {
  const layouts = schemaLayouts();
  assert.equal(layouts.length, 14, `the schema lists ${layouts.length} layouts`);
  const results = await Promise.all(
    layouts.map(async (layout) => {
      const root = freshDeck();
      try {
        const made = await cli(root, "new", "copy", "X", `--layout=${layout}`);
        const checked = made.code === 0 ? await cli(root, "check") : made;
        return { layout, code: checked.code, output: checked.output };
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }),
  );
  assert.deepEqual(results.filter((r) => r.code !== 0).map((r) => `${r.layout}: exit ${r.code}\n${r.output}`), []);
});

/** Each variant in 11.2 and 11.6 that a deck can hold, and what proves the deck has it. */
const VARIANTS: Record<string, () => boolean> = {
  intro: () => pages.some((p) => p.beat === "intro"),
  before: () => pages.some((p) => p.beat === "before"),
  after: () => pages.some((p) => p.beat === "after"),
  single: () => pages.some((p) => p.beat === "single"),
  "static build": () => framed.some((p) => p.frame.kind === "static"),
  "terminal build": () => framed.some((p) => p.frame.kind === "terminal"),
  "mixed beats": () => deck.demos.some((d) => new Set(d.pages.filter(hasFrame).map((p) => p.frame.kind)).size > 1),
  "multi-page build": () => beats.some((b) => b.pages?.length) && framed.some((p) => p.steps.some((s) => s.route)),
  "server template": () => deck.input.demos.some((d) => d.render),
  "inner document": () => beats.some((b) => b.inner?.length),
  "frame shell": () => beats.some((b) => b.shell),
  "shell with outside and scrolls": () => beats.some((b) => b.shell?.outside?.length && b.shell.scrolls),
  "per-demo CSS": () => beats.some((b) => b.styles?.length),
  "spotlight clip and keycap": () => beats.some((b) => b.spotlightClip && b.keycap),
  "csp-enforce": () => beats.some((b) => b.flags?.["csp-enforce"] !== undefined && b.csp),
  "reloading flag": () => beats.some((b) => b.flags?.["enhance-js"] !== undefined && b.enhancement?.js?.length),
  "enhance-css files": () => beats.some((b) => typeof b.enhancement?.css === "object"),
  "enhance-css supports-blocks": () => beats.some((b) => b.enhancement?.css === "supports-blocks"),
  "root address": () => beats.some((b) => b.address),
  "demo server routes": () => deck.demos.some((d) => d.routes?.some((r) => r.method === "POST")),
  "blocked frame": () => framed.some(isBlocked),
  "poster left out": () => framed.some((p) => p.steps.some((s) => s.posterUnderlay === false)),
  "group and chip": () => deck.demos.some((d) => d.navGroup) && deck.demos.some((d) => d.chip),
  "background file": () => deck.demos.some((d) => d.background?.startsWith("/")),
  "background value": () => deck.demos.some((d) => d.background && !d.background.startsWith("/")),
  "slide background": () => deck.slides.some((s) => !s.page && s.background),
  "60/40 split": () => framed.some((p) => p.split === "60/40"),
  "spotlight fixture": () => fixturePage(deck) !== null,
  "assert with when": () => framed.some((p) => p.steps.some((s) => s.actions.some((a) => a.type === "assert" && a.when))),
};

for (const [name, has] of Object.entries(VARIANTS)) test(`the deck has a page for ${name}`, () => assert.ok(has(), name));

test("the deck gives at least 50 arrivals per window, with no repeats", () => {
  const legs = liveFrames(deck).reduce((n, { page }) => n + (deck.ids.indexOf(page.id) > 0 ? 1 : 0) + (deck.ids.indexOf(page.id) < deck.ids.length - 1 ? 1 : 0), 0);
  assert.ok(legs >= budgets.underlay.minArrivalsPerWindow, `${legs} arrivals`);
});

test("the demos hold neutral content: no id from another deck", () => {
  for (const d of deck.demos) assert.match(d.id, /^(00-fixtures|act-[a-z]+|v-[a-z]+|b-[a-z]+)$/);
});
