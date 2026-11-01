import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
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

/** A published package carries a copy made at pack time. A checkout reads the repo's own. */
export function readMatrix(): Matrix {
  const packed = fileURLToPath(new URL("../../matrix.json", import.meta.url));
  const file = existsSync(packed) ? packed : fileURLToPath(new URL("../../../../parity/matrix.json", import.meta.url));
  return JSON.parse(readFileSync(file, "utf8")) as Matrix;
}

export const digestOf = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

/** A row passes when none of its facts is false. A count or a label only describes. */
export const outcomeOf = (facts: Facts): Outcome => (Object.values(facts).includes(false) ? "fail" : "pass");

const sorted = (facts: Facts) => JSON.stringify(Object.entries(facts).sort(([a], [b]) => a.localeCompare(b)));

export const ONE_SIDED = "ran on one side only";

function rowDifference(a: RowResult, b: RowResult, sameTarget: boolean): string | null {
  if (a.outcome === "not-run" && b.outcome === "not-run") return null;
  if (a.outcome === "not-run" || b.outcome === "not-run") return `${ONE_SIDED}: ${a.outcome} and ${b.outcome}`;
  if (a.outcome !== b.outcome) return `outcome: ${a.outcome} and ${b.outcome}`;
  if (a.outcome === "fail") return `failed on both sides: ${a.note ?? b.note ?? sorted(a.facts)}`;
  if (sorted(a.facts) !== sorted(b.facts)) return `facts: ${sorted(a.facts)} and ${sorted(b.facts)}`;
  // A digest holds what one deck shows, so across targets it would always differ.
  if (sameTarget && a.digest !== b.digest) return `digest: ${a.digest} and ${b.digest}`;
  return null;
}

export interface Comparison {
  differences: Difference[];
  /** The differences no exception covers. */
  unlisted: Difference[];
  /** Unlisted rows that ran on one side only. They prove nothing either way, and `ok` needs none. */
  oneSided: string[];
  /** Rows neither report ran: the matrix names `pnpm test`, CI or a person as their proof. */
  neither: string[];
  /** Rows with a result on both sides, the only rows this comparison speaks for. */
  compared: number;
  /** Nothing unlisted differs and nothing went uncompared: the only result that means parity. */
  ok: boolean;
  /** Nothing unlisted differs among the rows that compared. Not a parity result. */
  okWherePartial: boolean;
}

/**
 * Every row that differs, and the subset no exception covers. Facts and outcomes compare across
 * targets, and digests only between two runs of one target. A row that ran on one side has nothing
 * to compare, and a row that failed on both matches nothing worth matching, so each is a difference
 * and neither reads as a pass. A report built from a manifest leaves the tool rows `not-run`, because
 * the walks read a deck folder, so it can only ever reach `okWherePartial`.
 */
export function compareReports(a: Report, b: Report, matrix: Matrix): Comparison {
  const listed = new Map<string, string>();
  for (const row of matrix.rows) if (row.exception) listed.set(row.id, row.exception);
  for (const e of matrix.exceptions) for (const id of e.rows) listed.set(id, e.id);
  const sameTarget = a.target === b.target;
  const differences: Difference[] = [];
  const neither: string[] = [];
  for (const { id } of matrix.rows) {
    const [left, right] = [a.rows[id] ?? null, b.rows[id] ?? null];
    if (left?.outcome === "not-run" && right?.outcome === "not-run") neither.push(id);
    const reason = !left || !right ? `missing from ${left ? "the second" : "the first"} report` : rowDifference(left, right, sameTarget);
    if (reason) differences.push({ id, a: left, b: right, reason, ...(listed.has(id) ? { exception: listed.get(id) } : {}) });
  }
  const unlisted = differences.filter((d) => !d.exception);
  const isOneSided = (d: Difference) => d.reason.startsWith(ONE_SIDED);
  const oneSided = unlisted.filter(isOneSided).map((d) => d.id);
  const compared = matrix.rows.length - neither.length - differences.filter(isOneSided).length - differences.filter((d) => d.reason.startsWith("missing")).length;
  return { differences, unlisted, oneSided, neither, compared, ok: unlisted.length === 0, okWherePartial: unlisted.every(isOneSided) };
}
