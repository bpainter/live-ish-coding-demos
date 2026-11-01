import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface MatrixRow {
  id: string;
  capability: string;
  check: string;
  suite: string | null;
  exception?: string;
}

export interface Matrix {
  rows: MatrixRow[];
  exceptions: { id: string; rows: string[]; status: string }[];
}

/**
 * - `pass`, `fail`: the row's check ran.
 * - `n/a`: the target has nothing the check can exercise, such as a tagged link on a deck with none.
 * - `not-run`: this row is proved by another tool, named in the matrix.
 */
export type Outcome = "pass" | "fail" | "n/a" | "not-run";

/** Facts compare across targets, so they hold no timing, no id and no text from the deck. */
export type Facts = Record<string, boolean | number | string>;

export interface RowResult {
  suite: string | null;
  outcome: Outcome;
  facts: Facts;
  /** A hash of what the row saw. Only comparable with another run of the same target. */
  digest?: string;
  /** For a person reading the report. Never compared. */
  note?: string;
}

export interface Report {
  version: 1;
  target: string;
  build: string;
  rows: Record<string, RowResult>;
}

export interface Difference {
  id: string;
  a: RowResult | null;
  b: RowResult | null;
  reason: string;
  /** The 10.18 exception that covers this row. */
  exception?: string;
}

export const REPORT_VERSION = 1;

export function readMatrix(): Matrix {
  return JSON.parse(readFileSync(fileURLToPath(new URL("../../../../parity/matrix.json", import.meta.url)), "utf8")) as Matrix;
}

export const digestOf = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

/** A row passes when none of its facts is false. A count or a label only describes. */
export const outcomeOf = (facts: Facts): Outcome => (Object.values(facts).includes(false) ? "fail" : "pass");

const sorted = (facts: Facts) => JSON.stringify(Object.entries(facts).sort(([a], [b]) => a.localeCompare(b)));

function rowDifference(a: RowResult, b: RowResult, sameTarget: boolean): string | null {
  if (a.outcome === "not-run" || b.outcome === "not-run") return null;
  if (a.outcome !== b.outcome) return `outcome: ${a.outcome} and ${b.outcome}`;
  if (sorted(a.facts) !== sorted(b.facts)) return `facts: ${sorted(a.facts)} and ${sorted(b.facts)}`;
  // A digest holds what one deck shows, so across targets it would always differ.
  if (sameTarget && a.digest !== b.digest) return `digest: ${a.digest} and ${b.digest}`;
  return null;
}

/**
 * Every row that differs, and the subset no exception covers. `ok` means that subset is empty. Facts
 * and outcomes compare across targets, and digests only between two runs of one target. A row that
 * ran on one side only proves nothing either way, so it is counted apart and never called a match:
 * the walks read a deck folder, and a report built from a manifest has none.
 */
export function compareReports(a: Report, b: Report, matrix: Matrix): { differences: Difference[]; unlisted: Difference[]; oneSided: string[]; ok: boolean } {
  const listed = new Map<string, string>();
  for (const row of matrix.rows) if (row.exception) listed.set(row.id, row.exception);
  for (const e of matrix.exceptions) for (const id of e.rows) listed.set(id, e.id);
  const sameTarget = a.target === b.target;
  const differences: Difference[] = [];
  for (const { id } of matrix.rows) {
    const [left, right] = [a.rows[id] ?? null, b.rows[id] ?? null];
    const reason = !left || !right ? `missing from ${left ? "the second" : "the first"} report` : rowDifference(left, right, sameTarget);
    if (reason) differences.push({ id, a: left, b: right, reason, ...(listed.has(id) ? { exception: listed.get(id) } : {}) });
  }
  const unlisted = differences.filter((d) => !d.exception);
  const oneSided = matrix.rows.filter(({ id }) => (a.rows[id]?.outcome === "not-run") !== (b.rows[id]?.outcome === "not-run")).map((r) => r.id);
  return { differences, unlisted, oneSided, ok: unlisted.length === 0 };
}
