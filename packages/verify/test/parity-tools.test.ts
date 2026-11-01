import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { compareReports, readMatrix, type Report } from "../src/parity/report";
import { text, toolRows, verdict } from "../src/parity/tools";

const matrix = readMatrix();
const byId = new Map(matrix.rows.map((r) => [r.id, r]));

test("every tool row is a matrix row that no suite claims", () => {
  for (const id of toolRows()) {
    const row = byId.get(id);
    assert.ok(row, `${id} is not in the matrix`);
    assert.equal(row.suite, null, `${id} already has a suite`);
  }
});

/** Proved outside this package, by `pnpm test`, CI, the CLI or a person. A new row has to pick a side. */
const ELSEWHERE = /test:|Unit test|Snapshot test|CI|Link check|Removed|Default differs|Runs per theme|fonts --check|record|lighthouse/i;

test("a row with no tool says where it is proved", () => {
  const tools = new Set(toolRows());
  const left = matrix.rows.filter((r) => r.suite === null && !tools.has(r.id));
  const unnamed = left.filter((r) => !ELSEWHERE.test(r.check) && !ELSEWHERE.test(r.capability)).map((r) => r.id);
  assert.deepEqual(unnamed, []);
});

const m = { rows: [{ id: "KY-1", capability: "", check: "", suite: null }], exceptions: [] };
const ran: Report = { version: 1, target: "a", build: "x", rows: { "KY-1": { suite: null, outcome: "pass", facts: { held: true } } } };
const not: Report = { version: 1, target: "b", build: "x", rows: { "KY-1": { suite: null, outcome: "not-run", facts: {} } } };

test("a row that ran on one side is not a pass, in either order", () => {
  for (const [a, b] of [[ran, not], [not, ran]]) {
    const { oneSided, compared, ok, okWherePartial, unlisted } = compareReports(a, b, m);
    assert.deepEqual(oneSided, ["KY-1"]);
    assert.equal(compared, 0);
    assert.equal(ok, false);
    assert.equal(okWherePartial, true, "a partial result still says nothing differed");
    assert.match(unlisted[0].reason, /one side only/);
  }
});

test("a one-sided row with an exception is listed, and does not block", () => {
  const listed = { ...m, rows: [{ ...m.rows[0], exception: "E-4" }] };
  const { ok, oneSided, differences } = compareReports(ran, not, listed);
  assert.equal(ok, true);
  assert.deepEqual(oneSided, []);
  assert.equal(differences[0].exception, "E-4");
});

test("a row neither side ran is not a difference, and is not counted as compared", () => {
  const { ok, neither, compared } = compareReports(not, not, m);
  assert.equal(ok, true);
  assert.deepEqual(neither, ["KY-1"]);
  assert.equal(compared, 0);
});

test("a row that failed on both sides is not a match", () => {
  const failed: Report = { ...ran, rows: { "KY-1": { suite: null, outcome: "fail", facts: { held: false } } } };
  const { ok, okWherePartial, unlisted } = compareReports(failed, { ...failed, target: "b" }, m);
  assert.equal(ok, false);
  assert.equal(okWherePartial, false);
  assert.match(unlisted[0].reason, /failed on both/);
});

test("a real difference fails a partial comparison too", () => {
  const rows = { rows: [...m.rows, { id: "KY-2", capability: "", check: "", suite: null }], exceptions: [] };
  const a: Report = { ...ran, rows: { ...ran.rows, "KY-2": { suite: null, outcome: "pass", facts: { held: true } } } };
  const b: Report = { ...not, rows: { ...not.rows, "KY-2": { suite: null, outcome: "fail", facts: { held: false } } } };
  assert.equal(compareReports(a, b, rows).okWherePartial, false);
});

test("a published package carries the matrix, because every parity command reads it", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { files: string[]; scripts: Record<string, string> };
  assert.ok(pkg.files.includes("matrix.json"));
  assert.match(pkg.scripts.prepack, /parity\/matrix\.json/);
});

test("the stopped-server row reads the walk, so it no longer waits on a person", () => {
  assert.ok(toolRows().includes("FR-19"));
});

test("a row's scope catches a failure named only in where, so the row cannot pass on it", () => {
  const run = { code: 1, passes: [{ section: "", where: "", message: "text 390x844 /s/a: reflowing text" }], fails: [{ section: "", where: "text 390x844 /s/b", message: "the stage shows" }] };
  assert.deepEqual(verdict(run, text(/^text /)), { held: false });
});
