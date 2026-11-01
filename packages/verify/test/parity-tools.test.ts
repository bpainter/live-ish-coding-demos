import assert from "node:assert/strict";
import { test } from "node:test";
import { readMatrix } from "../src/parity/report";
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
