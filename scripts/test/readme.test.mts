// RM-1 to RM-13, as far as a machine can check them. The `readme` job also runs the quick start.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { REPO, shellCommands } from "../ci/lib.mts";

const text = readFileSync(path.join(REPO, "README.md"), "utf8");
const prose = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
const headings = [...text.matchAll(/^#{1,3} (.+)$/gm)].map((m) => m[1]);

test("RM-1: under 100 lines", () => {
  assert.ok(text.trimEnd().split("\n").length < 100);
});

test("RM-2: sections in order", () => {
  const order = ["Live-ish", "Quick start", "Slide types", "Themes", "AI tools", "Docs", "Contributing", "License"];
  const at = order.map((h) => headings.indexOf(h));
  assert.ok(
    at.every((i) => i !== -1),
    `missing: ${order.filter((_, i) => at[i] === -1)}`,
  );
  assert.deepEqual(
    at,
    [...at].sort((a, b) => a - b),
  );
  assert.ok(text.indexOf("<img") < text.indexOf("## Quick start"));
});

test("RM-3: the quick start is three commands or fewer", () => {
  assert.ok(shellCommands(text, "Quick start").length <= 3);
});

test("RM-5: no badge without information", () => {
  assert.doesNotMatch(text, /shields\.io/);
});

test("RM-8: X, not Y at most once, and never in a heading", () => {
  const pattern = /, not /g;
  assert.ok((prose.match(pattern) ?? []).length <= 1);
  assert.ok(headings.every((h) => !/, not /.test(h)));
});

test("RM-9: sentence case headings", () => {
  const allowed = new Set(["Live-ish", "AI", "MIT"]);
  for (const heading of headings) for (const word of heading.split(" ").slice(1)) assert.ok(word === word.toLowerCase() || allowed.has(word), `"${heading}": ${word}`);
});

test("RM-10: it ends on the next action", () => {
  assert.match(text.trimEnd().split("\n").at(-1) ?? "", /^Start with /);
});

test("RM-12 and house style: no dashes, no exclamation marks", () => {
  assert.doesNotMatch(prose, /[–—]/);
  assert.doesNotMatch(prose.replace(/<!--[\s\S]*?-->/g, ""), /!(?!\[)/);
});

test("RM-13: the theme sentence comes from the theme files", () => {
  execFileSync(process.execPath, ["--import", "tsx", path.join(REPO, "scripts", "gen-readme.mts"), "--check"], { cwd: REPO, stdio: "pipe" });
});

test("every relative link and every docs link has a target", () => {
  // The docs links are reference definitions, so one block moves them to the site.
  for (const [, inline, reference] of text.matchAll(/\]\(([^)]+)\)|^\[[^\]]+\]: (\S+)$|src="[^"]+"/gm)) {
    const href = inline ?? reference;
    if (!href || href.startsWith("#")) continue;
    if (href.startsWith("https://live-ish.vercel.app/")) {
      const page = path.join(REPO, "docs", "content", `${href.slice("https://live-ish.vercel.app/".length)}.mdx`);
      assert.ok(existsSync(page), `${href} has no page`);
    } else if (!/^https?:/.test(href)) assert.ok(existsSync(path.join(REPO, href)), `${href} is missing`);
  }
  assert.ok(existsSync(path.join(REPO, "docs", "assets", "demo-slide.png")));
  for (const [, anchor] of text.matchAll(/\]\(#([^)]+)\)/g))
    assert.ok(
      headings.some((h) => h.toLowerCase().replace(/ /g, "-") === anchor),
      `#${anchor}`,
    );
});

test("the preview note stays until the packages are on npm", () => {
  assert.match(text, /Preview\. Packages are not on npm yet\. The API will change\./);
});
