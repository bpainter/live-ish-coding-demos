import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { OUTPUT, readMatrix, render } from "./render.mjs";

const matrix = readMatrix();
const SUITES = new Set(["routes", "frames", "presenter", "seo"]);
const PHASES = new Set(["v0.1", "beta", "v1.0", "None"]);

test("every row names a proving check", () => {
  const missing = matrix.rows.filter((r) => typeof r.check !== "string" || r.check.trim() === "");
  assert.deepEqual(missing.map((r) => r.id), []);
});

test("every row is complete", () => {
  for (const r of matrix.rows) {
    assert.match(r.id, /^[A-Z]{2}-\d+$/, `${r.id}: id`);
    assert.ok(r.capability, `${r.id}: capability`);
    assert.ok(Array.isArray(r.source) && r.source.length > 0, `${r.id}: source`);
    assert.ok(r.target, `${r.id}: target`);
    assert.ok(PHASES.has(r.phase), `${r.id}: phase ${r.phase}`);
  }
});

test("row ids are unique", () => {
  const ids = matrix.rows.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("a row in a suite says so in its check, and the suite exists", () => {
  for (const r of matrix.rows) {
    if (r.suite === null) assert.ok(!/`parity \w+`/.test(r.check), `${r.id}: its check names a suite`);
    else {
      assert.ok(SUITES.has(r.suite), `${r.id}: unknown suite ${r.suite}`);
      assert.ok(r.check.includes(`parity ${r.suite}`), `${r.id}: its check does not name ${r.suite}`);
    }
  }
});

test("all 23 exceptions are listed, none signed by anyone but the owner", () => {
  assert.deepEqual(matrix.exceptions.map((e) => e.id), Array.from({ length: 23 }, (_, i) => `E-${i + 1}`));
  for (const e of matrix.exceptions) {
    assert.equal(e.status, "approved-pending-owner", e.id);
    assert.ok(e.recommendation, e.id);
  }
});

test("a row and its exception point at each other", () => {
  const known = new Map(matrix.exceptions.map((e) => [e.id, e]));
  for (const r of matrix.rows.filter((row) => row.exception)) assert.ok(known.get(r.exception)?.rows.includes(r.id), `${r.id}: ${r.exception}`);
  for (const e of matrix.exceptions) for (const id of e.rows) assert.equal(matrix.rows.find((r) => r.id === id)?.exception, e.id, `${e.id}: ${id}`);
});

test("the docs table matches the data", () => {
  assert.equal(readFileSync(OUTPUT, "utf8"), render(matrix), "Run node parity/render.mjs");
});

test("the docs leave the sign-off table for the owner", () => {
  const signOff = render(matrix).split("## Sign-off")[1];
  assert.match(signOff, /\| E-1 \| \| \|/);
  assert.match(signOff, /\| E-23 \| \| \|/);
});
