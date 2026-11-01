// What the docs promise, as tests. `pnpm test` runs these after `pnpm generate`.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { RULE_IDS } from "../../packages/engine/src/lib/validate/catalog";
import { budgetFragment, parityFragment } from "../lib/fragments";
import { NAV_ORDER } from "../lib/nav";
import { allPages, DOCS, markdownHref, pageBySlug, REPO, toMarkdown } from "../lib/source";

const pages = allPages();
const slugs = new Set(pages.map((page) => page.slug));
const handWritten = pages.filter((page) => page.format === "mdx");
const cli = (...args: string[]) => execFileSync(process.execPath, [path.join(REPO, "packages", "engine", "bin", "live-ish.mjs"), ...args], { encoding: "utf8", cwd: path.join(REPO, "examples", "starter") });

const withoutCode = (text: string) => text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");

test("every rule id has a page, and every rule page has a rule (R-9.3)", () => {
  for (const id of RULE_IDS) assert.ok(slugs.has(`errors/${id}`), `no page for ${id}`);
  const files = readdirSync(path.join(REPO, "packages", "engine", "rules")).map((f) => f.replace(/\.md$/, ""));
  assert.deepEqual([...files].sort(), [...RULE_IDS].sort());
  assert.equal(pages.filter((page) => page.slug.startsWith("errors/") && page.format === "md").length, RULE_IDS.length);
});

test("every docs address the CLI prints has a page", () => {
  const check = readFileSync(path.join(REPO, "packages", "engine", "src", "cli", "commands", "check.ts"), "utf8");
  for (const [, id] of check.matchAll(/live-ish\.dev\/errors\/([a-z-]+)/g)) assert.ok(slugs.has(`errors/${id}`), id);
});

test("the rule list links every rule", () => {
  const index = pageBySlug("errors")?.body ?? "";
  for (const id of RULE_IDS) assert.ok(index.includes(`(/errors/${id})`), id);
});

test("every page the docs plan names exists (R-9.1, R-9.4)", () => {
  const planned = [
    "start",
    "copy-slides",
    "web-demos",
    "terminal-demos",
    "steps-and-actions",
    "code-and-spotlights",
    "speaker-notes",
    "presenting",
    "offline",
    "reader-view",
    "themes",
    "custom-themes",
    "ai-tools",
    "server-demos",
    "deploy",
    "config",
    "cli",
    "verification",
    "stage-day",
    "pacing",
    "accessibility",
    "performance",
    "upgrading",
    "troubleshooting",
    "architecture",
    "contributing",
    "limits",
    "browser-support",
    "node-support",
    "release",
    "themes/gallery",
    "parity",
    "live",
  ];
  for (const slug of planned) assert.ok(slugs.has(slug), slug);
  for (const provider of ["vercel", "netlify", "cloudflare", "render", "railway", "node", "docker"]) assert.ok(slugs.has(`deploy/${provider}`), provider);
});

test("the nav and the pages agree", () => {
  for (const slug of NAV_ORDER) assert.ok(slugs.has(slug), `the nav names ${slug}`);
  for (const page of handWritten) if (page.slug && !page.slug.startsWith("errors/")) assert.ok(NAV_ORDER.includes(page.slug), `${page.slug} is not in the nav`);
  assert.equal(new Set(NAV_ORDER).size, NAV_ORDER.length);
});

test("each page opens with what the reader will have when done", () => {
  for (const page of pages) assert.match(page.outcome, /^When you finish this page, you will /, page.slug);
});

test("house style holds on every hand-written page", () => {
  for (const page of handWritten) {
    const prose = withoutCode(page.body).replace(/<[A-Z][^>]*\/>/g, "");
    assert.doesNotMatch(`${page.title} ${page.outcome} ${prose}`, /[–—]/, `${page.slug} has a dash`);
    assert.doesNotMatch(`${page.title} ${page.outcome} ${prose.replace(/!\[/g, "[")}`, /!/, `${page.slug} has an exclamation mark`);
  }
});

/** Words that keep their capital in a heading. */
const PROPER = new Set([
  "AI",
  "API",
  "CI",
  "CLI",
  "CSS",
  "Claude",
  "Cloudflare",
  "Code",
  "Demo",
  "Docker",
  "GitHub",
  "HTML",
  "JSON",
  "Live-ish",
  "Markdown",
  "Netlify",
  "Next.js",
  "Node",
  "Railway",
  "React",
  "Render",
  "T",
  "URLs",
  "Vercel",
  "Wi-Fi",
]);

test("headings use sentence case", () => {
  for (const page of handWritten) {
    const source = page.body.replace(/```[\s\S]*?```/g, "");
    const headings = [page.title, ...[...source.matchAll(/^#{2,4} (.+)$/gm)].map((m) => m[1])];
    for (const heading of headings) {
      for (const word of withoutCode(heading).split(/\s+/).slice(1)) {
        if (!word || word === word.toLowerCase()) continue;
        assert.ok(PROPER.has(word.replace(/[,.:]$/, "")), `${page.slug}: "${heading}" capitalizes ${word}`);
      }
    }
  }
});

/** Commands that live in @live-ish/verify, with the flags it takes. */
const VERIFY_FLAGS = new Set(["--browser", "--channel", "--chrome", "--compare", "--headed", "--local-only", "--manifest", "--mode", "--origin", "--out", "--presenter", "--profile", "--without"]);

test("every live-ish command in the docs is real", () => {
  const help = cli("--help");
  const usages = help
    .split("\n")
    .filter((line) => /^ {2}\S/.test(line))
    .map((line) => line.trim().split(/\s{2,}/)[0]);
  const known = new Map<string, Set<string>>();
  for (const usage of usages) {
    const words = usage.split(" ");
    const name = words.filter((w, i) => i < 2 && /^[a-z-]+$/.test(w) && !w.startsWith("-")).join(" ");
    const flags = new Set([...usage.matchAll(/--[a-z-]+/g)].map((m) => m[0]));
    for (const key of [name, name.split(" ")[0]]) known.set(key, new Set([...(known.get(key) ?? []), ...flags]));
  }
  const verify = ["capture", "og", "walk", "axe", "warmup", "perf", "parity"];
  for (const page of handWritten) {
    const blocks = [...page.body.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1]);
    const inline = [...page.body.matchAll(/`([^`\n]*live-ish [a-z][^`\n]*)`/g)].map((m) => m[1]);
    for (const line of [...blocks.flatMap((b) => b.split("\n")), ...inline]) {
      if (/create[ -]live-ish/.test(line)) continue;
      const match = /(?:^|\s)(?:pnpm |npm run )?live-ish(?: --)? ([a-z][a-z-]*)((?: [^\s]+)*)/.exec(line);
      if (!match) continue;
      const [, command, rest] = match;
      assert.ok(known.has(command) || verify.includes(command), `${page.slug}: live-ish ${command} is not a command: ${line}`);
      const allowed = known.get(command) ?? new Set<string>();
      for (const [flag] of rest.matchAll(/--[a-z-]+/g)) {
        const ok = allowed.has(flag) || flag === "--help" || flag === "--version" || (verify.includes(command) && VERIFY_FLAGS.has(flag));
        assert.ok(ok, `${page.slug}: live-ish ${command} has no ${flag}: ${line}`);
      }
    }
  }
});

test("every internal link and fragment resolves", () => {
  const anchors = new Map(
    pages.map((page) => [
      page.slug,
      new Set(
        [...page.body.replace(/```[\s\S]*?```/g, "").matchAll(/^#{2,3} (.+)$/gm)].map((m) =>
          m[1]
            .replace(/[`*]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, ""),
        ),
      ),
    ]),
  );
  for (const page of pages) {
    for (const [, href] of withoutCode(page.body).matchAll(/\]\((\/[^)\s]*|#[^)\s]*)\)/g)) {
      const [target, fragment] = href.split("#");
      const clean = target.split("?")[0].replace(/^\//, "");
      const slug = target === "" ? page.slug : clean;
      if (/^(s|present|speaker)(\/|$)/.test(slug) || /\.(txt|png|md)$/.test(slug)) continue;
      assert.ok(slugs.has(slug), `${page.slug}: ${href} has no page`);
      if (fragment) assert.ok(anchors.get(slug)?.has(fragment), `${page.slug}: ${href} has no heading`);
    }
  }
});

test("every page has a Markdown copy, and llms.txt lists the nav (R-14.9)", () => {
  const publicDir = path.join(DOCS, "public");
  for (const page of pages) {
    const file = path.join(publicDir, markdownHref(page.slug));
    assert.ok(existsSync(file), `no copy of ${page.slug}`);
    assert.equal(readFileSync(file, "utf8"), toMarkdown(page));
    assert.ok(!/<ThemeSwatches|<Generated/.test(readFileSync(file, "utf8")), page.slug);
  }
  const llms = readFileSync(path.join(publicDir, "llms.txt"), "utf8");
  for (const slug of NAV_ORDER) assert.ok(llms.includes(`https://live-ish.dev/${slug}.md`), slug);
});

test("the theme gallery comes from the theme files", () => {
  const dir = path.join(REPO, "packages", "engine", "themes");
  const ids = readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.includes("schema"))
    .map((f) => f.replace(".json", ""));
  const gallery = pageBySlug("themes/gallery")?.body ?? "";
  assert.equal(ids.length, 10);
  for (const id of ids) assert.ok(gallery.includes(`<ThemeSwatches id="${id}" />`), id);
});

test("budgets and parity render from their files, and say so when one is absent", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "fragments-"));
  const budgets = path.join(dir, "budgets.json");
  writeFileSync(budgets, JSON.stringify({ underlay: { audienceP90Ms: 100 } }));
  assert.match(budgetFragment(budgets), /underlay\.audienceP90Ms.*100/);
  assert.match(budgetFragment(path.join(dir, "absent.json")), /no `packages\/verify\/budgets\.json`/);
  const matrix = path.join(dir, "matrix.json");
  writeFileSync(matrix, JSON.stringify({ rows: [{ id: "R1", check: "walk keys" }] }));
  assert.match(parityFragment(matrix), /\| R1 \| walk keys \|/);
  assert.match(parityFragment(path.join(dir, "absent.json")), /no `parity\/matrix\.json`/);
});

test("the limits page says every limit plainly", () => {
  const text = pageBySlug("limits")?.body ?? "";
  for (const phrase of ["needs Node and Next.js", "no PDF export", "typed objects", "no ecosystem or community", "fixed at 16:9", "Demo Time", "real effort to script"]) assert.ok(text.includes(phrase), phrase);
});

test("the accessibility statement keeps its wording", () => {
  const text = pageBySlug("accessibility")?.body ?? "";
  assert.ok(text.includes("tested against WCAG 2.2 AA with the tools below"));
  assert.ok(text.includes("does not honor text zoom"));
  assert.ok(text.includes("What has not been tested"));
  assert.ok(text.includes("No real screen reader"));
  assert.ok(text.includes("not a claim of conformance"));
});

test("the docs load no analytics", () => {
  const manifest = JSON.parse(readFileSync(path.join(DOCS, "package.json"), "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
  for (const dep of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) assert.doesNotMatch(dep, /analytics|insights|gtag|plausible/i);
  assert.doesNotMatch(readFileSync(path.join(DOCS, "deck.config.ts"), "utf8"), /^\s*analytics:/m);
});
