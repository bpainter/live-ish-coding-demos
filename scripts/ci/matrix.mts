/** The `matrix` job. Every row of `parity/matrix.json` must name the check that proves it. */
import { existsSync } from "node:fs";
import path from "node:path";
import { readJson, REPO } from "./lib.mts";

const file = path.join(REPO, "parity", "matrix.json");
if (!existsSync(file)) {
  console.error("parity/matrix.json is missing.");
  process.exit(1);
}

type Row = Record<string, unknown>;
const data = readJson<Row[] | { rows: Row[] }>(file);
const rows = Array.isArray(data) ? data : data.rows;
const proof = (row: Row) => row.proof ?? row.provingCheck ?? row.check ?? row.proving;
const missing = rows.filter((row) => typeof proof(row) !== "string" || !String(proof(row)).trim());

for (const row of missing) console.error(`FAIL ${String(row.id ?? JSON.stringify(row))} names no proving check.`);
if (missing.length || rows.length === 0) process.exit(1);
console.log(`matrix: ${rows.length} rows, each with a proving check`);
