/** The shape `--json` prints. `version` moves when the shape does. */
export const REPORT_VERSION = 1;

export interface Failure {
  where: string;
  message: string;
}

export interface JsonReport {
  version: typeof REPORT_VERSION;
  command: string;
  ok: boolean;
  checks: number;
  failures: Failure[];
  /** What the command measured, by name. */
  data: Record<string, unknown>;
}

/**
 * Collects checks as they run. Human lines go to stdout, or to stderr under `--json`, so stdout
 * carries exactly one JSON document.
 */
export class Report {
  checks = 0;
  readonly failures: Failure[] = [];
  readonly data: Record<string, unknown> = {};

  constructor(
    readonly command: string,
    private readonly json = false,
    private readonly silent = false,
  ) {}

  /** A line of progress. */
  log(line = "") {
    if (this.silent) return;
    if (this.json) console.error(line);
    else console.log(line);
  }

  section(title: string) {
    this.log(`\n== ${title}`);
  }

  pass = (message: string) => {
    this.checks++;
    this.log(`    ok   ${message}`);
  };

  fail = (where: string, message: string) => {
    this.failures.push({ where, message });
    this.log(`    FAIL ${where}: ${message}`);
  };

  note(message: string) {
    this.log(`    note ${message}`);
  }

  /** Prints the tally, and the JSON document when asked. Returns the exit code. */
  finish(label: string): number {
    this.log(`\n${label}: ${this.checks} check(s) passed, ${this.failures.length} failure(s)`);
    for (const f of this.failures) this.log(`  FAIL ${f.where}: ${f.message}`);
    if (this.json) {
      const out: JsonReport = { version: REPORT_VERSION, command: this.command, ok: this.failures.length === 0, checks: this.checks, failures: this.failures, data: this.data };
      console.log(JSON.stringify(out, null, 2));
    }
    return this.failures.length ? 1 : 0;
  }
}

/** The two calls a check needs. Walk modules take this, so a test can hand them a fake. */
export type Checks = Pick<Report, "pass" | "fail">;
