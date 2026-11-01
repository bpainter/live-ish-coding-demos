import assert from "node:assert/strict";
import { test } from "node:test";
import { compareReports, readMatrix, type Report } from "../src/parity/report";
import { toolRows } from "../src/parity/tools";

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
const ELSEWHERE = /test:|Unit test|Snapshot test|CI|Link check|Removed|Default differs|Runs per theme|fonts --check|record|with the server down|lighthouse/i;

test("a row with no tool says where it is proved", () => {
  const tools = new Set(toolRows());
  const left = matrix.rows.filter((r) => r.suite === null && !tools.has(r.id));
  const unnamed = left.filter((r) => !ELSEWHERE.test(r.check) && !ELSEWHERE.test(r.capability)).map((r) => r.id);
  assert.deepEqual(unnamed, []);
});

test("a row that ran on one side is counted apart, and is not a difference", () => {
  const m = { rows: [{ id: "KY-1", capability: "", check: "", suite: null }], exceptions: [] };
  const ran: Report = { version: 1, target: "a", build: "x", rows: { "KY-1": { suite: null, outcome: "pass", facts: { held: true } } } };
  const not: Report = { version: 1, target: "b", build: "x", rows: { "KY-1": { suite: null, outcome: "not-run", facts: {} } } };
  const { differences, oneSided, ok } = compareReports(ran, not, m);
  assert.equal(differences.length, 0);
  assert.deepEqual(oneSided, ["KY-1"]);
  assert.equal(ok, true);
});
