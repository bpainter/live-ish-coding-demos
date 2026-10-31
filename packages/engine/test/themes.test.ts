import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CONTRACT_TOKENS, EFFECTS, lintThemeFile, listThemes, resolveTheme, themeCss, themeFrameCss } from "../src/lib/chrome-themes";
import { CHROME_THEME_IDS } from "../src/lib/chrome-themes.generated";
import { demoFaces, FONT_FAMILIES } from "../src/lib/fonts";
import { NAME_IDS, woff2Names } from "../src/lib/font-names";
import { frameQuery } from "../src/lib/frames/origins";
import { posterMatchesTheme, posterThemeInput, posterUrl } from "../src/lib/posters";
import { slideHref } from "../src/lib/presenter/url";

const ENGINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const THEME_CSS_BUDGET = 6 * 1024;
const FONT_BUDGET = 60 * 1024;

test("themes: ten, with the default first, and the generated list agrees", () => {
  assert.deepEqual(listThemes().map((t) => t.id), [...CHROME_THEME_IDS]);
  assert.equal(CHROME_THEME_IDS.length, 10);
  assert.equal(CHROME_THEME_IDS[0], "glass");
});

test("themes: generated files match their sources", () => {
  const out = execFileSync(process.execPath, ["--import", "tsx", "scripts/gen-themes.mts", "--check"], { cwd: ENGINE, encoding: "utf8" });
  assert.match(out, /checked/);
});

for (const { id } of listThemes()) {
  test(`themes: ${id} sets the whole contract, under budget, and frame CSS is --term-* only`, () => {
    const theme = resolveTheme(id);
    for (const token of CONTRACT_TOKENS) assert.ok(theme.tokens[token], `${id} leaves ${token} unset`);
    assert.deepEqual(Object.keys(theme.tokens).filter((k) => !CONTRACT_TOKENS.includes(k)), []);
    const css = themeCss(theme);
    assert.ok(css.length <= THEME_CSS_BUDGET, `${id} is ${css.length} bytes`);
    assert.ok(!css.includes("--speaker-"));
    const frame = themeFrameCss(theme);
    assert.deepEqual([...new Set(frame.match(/--[a-z]+-/g))], ["--term-"]);
    assert.deepEqual(lintThemeFile(JSON.parse(readFileSync(path.join(ENGINE, "themes", `${id}.json`), "utf8"))), []);
  });
}

test("themes: 16.7 motion and effects", () => {
  const motion = (id: string) => resolveTheme(id).motion;
  assert.deepEqual(motion("early-web"), { fade: 0, effects: ["blink", "marquee"] });
  assert.deepEqual(motion("phosphor"), { fade: 80, effects: ["scanlines"] });
  assert.deepEqual(motion("brutalist"), { fade: 0, effects: ["press"] });
  assert.deepEqual(motion("high-contrast"), { fade: 0, effects: [] });
  assert.equal(motion("soft").fade, 200);
  assert.deepEqual([...EFFECTS].sort(), ["blink", "marquee", "press", "scanlines"]);
});

test("theme-lint: a selector, raw CSS or a locked token fails", () => {
  const base = { schemaVersion: 1, id: "harbor", name: "Harbor" };
  assert.ok(lintThemeFile({ ...base, ".stage__canvas": { color: "red" } }).some((p) => /selectors/.test(p.message)));
  assert.ok(lintThemeFile({ ...base, tokens: { ".page__title": "red" } }).some((p) => /selectors/.test(p.message)));
  assert.ok(lintThemeFile({ ...base, tokens: { "--chrome-accent": "red; } .x { color: blue" } }).some((p) => /one CSS value/.test(p.message)));
  assert.ok(lintThemeFile({ ...base, tokens: { "--chrome-backdrop": 'url("https://example.com/a.png")' } }).length > 0);
  assert.ok(lintThemeFile({ ...base, tokens: { "--chrome-code-size": "20px" } }).some((p) => /Not themeable/.test(p.message)));
  assert.ok(lintThemeFile({ ...base, tokens: { "--speaker-ink": "#000000" } }).length > 0);
  assert.ok(lintThemeFile({ ...base, motion: { effect: "shake" } }).some((p) => /engine code/.test(p.message)));
  assert.ok(lintThemeFile({ ...base, motion: { fade: 900 } }).length > 0);
  assert.ok(lintThemeFile({ ...base, fonts: { mono: "Georgia, serif" } }).some((p) => /monospaced/.test(p.message)));
  assert.deepEqual(lintThemeFile({ ...base, tokens: { "--chrome-accent": "#0b5c8a" }, code: { ink: "#10203f" }, fonts: { sans: "system-ui", mono: "ui-monospace" }, motion: { effect: "none" } }), []);
});

test("chrome CSS holds no raw color: every value is a token", () => {
  const dir = path.join(ENGINE, "styles", "chrome");
  for (const file of readdirSync(dir)) {
    const css = readFileSync(path.join(dir, file), "utf8");
    assert.deepEqual(css.match(/#[0-9a-f]{6}\b|rgb\(/gi), null, file);
  }
});

test("presenter CSS reads --speaker-* and no audience token", () => {
  const dir = path.join(ENGINE, "styles", "speaker");
  for (const file of readdirSync(dir)) assert.doesNotMatch(readFileSync(path.join(dir, file), "utf8"), /var\(--chrome-|--glass-/, file);
});

test("fonts: every face states a license, and a demo page stays under budget", () => {
  for (const font of Object.values(FONT_FAMILIES)) {
    assert.ok(statSync(path.join(ENGINE, "assets", "fonts", font.id, "OFL.txt")).size > 1000);
    for (const face of font.faces) {
      const names = woff2Names(readFileSync(path.join(ENGINE, "assets", "fonts", font.id, face.file)));
      assert.match(names[NAME_IDS.family] ?? "", new RegExp(font.family.split(" ")[0]));
      assert.ok(names[NAME_IDS.licenseUrl] ?? names[NAME_IDS.licenseDescription], `${face.file} states no license`);
    }
  }
  for (const { id, fonts } of listThemes()) {
    const bytes = demoFaces(fonts).reduce((sum, f) => sum + statSync(path.join(ENGINE, "assets", f.url.replace("/live-ish/", ""))).size, 0);
    assert.ok(bytes <= FONT_BUDGET, `${id}: ${bytes} bytes of fonts`);
  }
});

test("terminal frames take the theme by query, and web frames never do", () => {
  assert.equal(frameQuery("/demos/a/after", { "enhance-css": true }), "?flags=enhance-css:1");
  assert.equal(frameQuery("/demos/a/after", undefined, "phosphor"), "?chrome=phosphor");
  assert.equal(frameQuery("/demos/a/after", { glass: false }, "flat"), "?flags=glass:0&chrome=flat");
});

test("posters: keyed by theme on terminal pages only", () => {
  const terminal = { id: "count-words", frame: { kind: "terminal" as const } };
  const web = { id: "faq-after", frame: { kind: "web" as const } };
  assert.equal(posterUrl(terminal, "s1", "flat"), "/posters/count-words/flat/s1.jpg");
  assert.equal(posterUrl(web, "s1", "flat"), "/posters/faq-after/s1.jpg");
  const versions = { "/live-ish/chrome/flat.frame.css": "abcd1234" };
  assert.equal(posterThemeInput("terminal", "flat", versions), "abcd1234");
  assert.equal(posterThemeInput("web", "flat", versions), "");
  assert.equal(posterMatchesTheme("terminal", "glass", "flat"), false);
  assert.equal(posterMatchesTheme("web", "glass", "flat"), true);
});

test("?chrome= is kept across slides, in the stated order", () => {
  const href = slideHref("faq-after", { pathname: "/present", search: "?s=faq-before&step=2&fade=0&chrome=flat&glass=off" });
  assert.equal(href, "/present?s=faq-after&glass=off&chrome=flat&fade=0");
});
