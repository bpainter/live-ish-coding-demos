// The hashed scan keeps every hit a plain substring check would make, and never prints a term.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { addTerms, allowGlob, digest, normalize, parseList, renderList, scan, shapeOf } from "../scan/lib.mjs";

const SALT = "test-salt";
const dir = mkdtempSync(path.join(os.tmpdir(), "scan-"));
after(() => rmSync(dir, { recursive: true, force: true }));

const emptyList = () => ({ salt: SALT, shapes: [] as string[], hashes: new Set<string>(), owner: new Set<string>() });
const listOf = (...terms: string[]) => addTerms(emptyList(), terms);

function plant(files: Record<string, string>) {
  const root = mkdtempSync(path.join(dir, "tree-"));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

const walk = (root: string, at = ""): string[] =>
  readdirSync(path.join(root, at), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(at, entry.name);
    return entry.isDirectory() ? walk(root, rel) : [rel];
  });

function run(terms: ReturnType<typeof listOf>, files: Record<string, string>, extra: Record<string, unknown> = {}) {
  const root = plant(files);
  return scan({ root, files: walk(root), list: terms, ...extra });
}

test("a term is hashed in its normalized form", () => {
  assert.equal(normalize("Zephyr  QUILL-Press"), "zephyr quill press");
  assert.equal(shapeOf("zephyr quill press"), "6,5,5");
  assert.notEqual(digest("zephyr", SALT), digest("zephyr", "another-salt"));
  assert.equal(digest("zephyr", SALT).length, 16);
});

test("a one-word term hits in any case and inside a longer word", () => {
  const list = listOf("zephyrine");
  for (const text of ["zephyrine", "ZEPHYRINE", "a ZephyRine b", "prezephyrinepost", "x_zephyrine_y"]) {
    assert.equal(run(list, { "a.md": text }).length, 1, text);
  }
});

test("a term of several words hits across any separator", () => {
  const list = listOf("zephyr quill");
  for (const text of ["zephyr quill", "zephyr-quill", "zephyr\nquill", "zephyr\r\n// quill", "zephyr_quill", "ZEPHYR  QUILL", "prezephyr quillpost"]) {
    assert.equal(run(list, { "a.md": text }).length, 1, text);
  }
});

test("the words between a term's first and last stand alone", () => {
  const list = listOf("zephyr quill press");
  assert.equal(run(list, { "a.md": "prezephyr quill presses" }).length, 1);
  assert.equal(run(list, { "a.md": "zephyr quills press" }).length, 0);
});

test("a term that is only part of a word pair does not hit", () => {
  const list = listOf("zephyr quill");
  assert.equal(run(list, { "a.md": "zephyr only, then quill later" }).length, 0);
  assert.equal(run(list, { "a.md": "zephyrquill" }).length, 0);
});

test("a finding names the file, the line and a hash prefix, never the term", () => {
  const list = listOf("zephyrine");
  const [finding] = run(list, { "docs/a.md": "one\ntwo\nthree zephyrine\n" });
  assert.equal(finding, `docs/a.md:3: denied term, hash ${digest("zephyrine", SALT).slice(0, 8)}`);
});

test("a term in a path hits, and the finding blanks it", () => {
  const list = listOf("zephyr quill");
  const findings = run(list, { "docs/zephyr-quill/a.md": "clean\n", "docs/PreZephyr_Quill.md": "clean\n" });
  assert.equal(findings.length, 2);
  for (const finding of findings) assert.doesNotMatch(finding, /zephyr|quill/i);
  assert.ok(findings.some((finding) => finding.startsWith("docs/***/a.md: path contains a denied term, hash ")));
});

test("each term reports once per file, at its first line", () => {
  const list = listOf("zephyrine", "quillwort");
  const findings = run(list, { "a.md": "x\nzephyrine\nquillwort\nzephyrine\n" });
  assert.equal(findings.length, 2);
  assert.ok(findings.some((finding) => finding.startsWith("a.md:2:")));
  assert.ok(findings.some((finding) => finding.startsWith("a.md:3:")));
});

test("a clean tree passes, and a term's words apart from it do not count", () => {
  const list = listOf("zephyr quill", "zephyrine");
  assert.deepEqual(run(list, { "a.md": "An ordinary file.\n", "src/b.ts": "export const x = 1;\n" }), []);
});

test("a readable pattern stays readable in the finding", () => {
  const findings = run(listOf("zephyrine"), { "a.md": "see /srv/zz/ here\n" }, { plain: ["/srv/zz/"] });
  assert.deepEqual(findings, ['a.md:1: contains "/srv/zz/"']);
});

test("the owner exemption covers the allowed files and no others", () => {
  const list = listOf("owner name");
  list.owner.add(digest("owner name", SALT));
  const ownerAllowed = /^(LICENSE|(.*\/)?package\.json)$/;
  assert.deepEqual(run(list, { LICENSE: "Copyright Owner Name\n", "packages/a/package.json": '{ "author": "owner name" }\n' }, { ownerAllowed }), []);
  assert.equal(run(list, { "README.md": "by owner name\n" }, { ownerAllowed }).length, 1);
});

test("a binary must be on the allow-list, and a file with a NUL byte is skipped", () => {
  const list = listOf("zephyrine");
  const binary = /\.png$/;
  const allow = [allowGlob("assets/**")];
  const root = plant({ "assets/a.png": "x", "b.png": "x", "c.bin": "zephyrine\0" });
  assert.deepEqual(scan({ root, files: walk(root), list, allow, binary }), ["b.png: binary not on the allow-list"]);
});

test("the list file round-trips, sorted, with a hash kept apart from its shape", () => {
  const list = listOf("zephyr quill", "zephyrine");
  list.owner.add(digest("zephyrine", SALT));
  const text = renderList(list, ["# header"]);
  const back = parseList(text);
  assert.deepEqual([...back.hashes].sort(), [...list.hashes].sort());
  assert.deepEqual([...back.owner], [...list.owner]);
  assert.deepEqual(back.shapes.sort(), ["6,5", "9"]);
  assert.equal(back.salt, SALT);
  assert.doesNotMatch(text, /zephyr|quill/);
});

test("this repo's list holds no base64 and no readable term file", () => {
  const scanDir = path.join(import.meta.dirname, "..", "scan");
  assert.deepEqual(readdirSync(scanDir).sort(), ["binary-allow.txt", "lib.mjs", "private.mjs", "terms.hashed"]);
  const text = readFileSync(path.join(scanDir, "terms.hashed"), "utf8");
  const entries = text.split("\n").filter((line) => line && !line.startsWith("#"));
  for (const line of entries) assert.match(line, /^(salt [0-9a-f]{32}|shape \d+(,\d+)*|(term|owner) [0-9a-f]{16})$/);
});
