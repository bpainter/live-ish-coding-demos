import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { deckManifest, type Manifest } from "@live-ish/engine/export";
import { compareReports, digestOf, outcomeOf, readMatrix, REPORT_VERSION, type Facts, type Matrix, type Report, type RowResult } from "./report";
import { frames } from "./frames";
import { presenter } from "./presenter";
import { routes } from "./routes";
import { seo } from "./seo";
import { DEFAULT_SELECTORS, framesOriginOf, get, type Check, type Target } from "./target";

export { compareReports, type Report } from "./report";

const SUITES: Record<string, Record<string, Check>> = { routes, frames, presenter, seo };
/** The public exit codes. */
const EXIT = { ok: 0, findings: 1, misuse: 2, environment: 3 } as const;
const USAGE = "Usage: live-ish parity --manifest=<file or deck> --origin=<url> --out=<file> [--frames-origin=<url>] [--suite=routes,frames,presenter,seo]\n       live-ish parity --compare <a.json> <b.json>";

export interface ParityContext {
  root?: string;
  engineVersion?: string;
}

function flag(argv: string[], name: string): string | undefined {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const at = argv.indexOf(`--${name}`);
  return at !== -1 ? argv[at + 1] : undefined;
}

function assertManifest(value: unknown, source: string): Manifest {
  const m = value as Partial<Manifest>;
  const missing = (["version", "name", "slides", "pages", "routes"] as const).filter((k) => m?.[k] === undefined);
  if (missing.length) throw new Error(`${source}: a manifest needs ${missing.join(", ")}.`);
  if (m.version !== 1) throw new Error(`${source}: manifest version ${String(m.version)}, and this tool reads version 1.`);
  if ((m.slides ?? []).length < 3) throw new Error(`${source}: the suites need at least three slides.`);
  return m as Manifest;
}

/** A manifest file, or a deck folder that writes its own. */
async function loadManifest(source: string): Promise<Manifest> {
  const resolved = path.resolve(source);
  if (!existsSync(resolved)) throw new Error(`${source} does not exist.`);
  if (!statSync(resolved).isDirectory()) return assertManifest(JSON.parse(readFileSync(resolved, "utf8")), source);
  const { prepareDeck } = await import("@live-ish/engine/prepare");
  const deck = await prepareDeck(resolved, "local");
  const { servers = [] } = JSON.parse(readFileSync(path.join(resolved, ".live-ish", "deck.json"), "utf8")) as { servers?: { app: string; port: number }[] };
  return assertManifest(deckManifest(deck, servers), source);
}

async function runRow(id: string, suite: string, check: Check, t: Omit<Target, "evidence">): Promise<RowResult> {
  let evidence: unknown;
  try {
    const facts = await check({
      ...t,
      evidence: (value) => {
        evidence = value;
      },
    });
    if (facts === null) return { suite, outcome: "n/a", facts: {} };
    return { suite, outcome: outcomeOf(facts), facts, digest: digestOf(evidence ?? facts) };
  } catch (error) {
    return { suite, outcome: "fail", facts: {} satisfies Facts, note: `${id}: ${(error as Error).message.split("\n")[0]}` };
  }
}

/** Runs the suites against a running deck and writes one report, keyed by matrix row. */
export async function runSuites(options: { manifest: Manifest; origin: string; framesOrigin: string; suites: string[]; browser: Browser; matrix: Matrix; log(line: string): void }): Promise<Report> {
  const { manifest, origin, framesOrigin, suites, browser, matrix, log } = options;
  const t = { origin, framesOrigin, manifest, browser, selectors: { ...DEFAULT_SELECTORS, ...manifest.selectors } };
  const health = JSON.parse((await get(origin, manifest.routes.health)).text) as { build?: string };
  const rows: Report["rows"] = {};
  for (const row of matrix.rows) {
    const check = row.suite && suites.includes(row.suite) ? SUITES[row.suite][row.id] : undefined;
    if (!check) {
      rows[row.id] = { suite: row.suite, outcome: "not-run", facts: {} };
      continue;
    }
    rows[row.id] = await runRow(row.id, row.suite!, check, t);
    const result = rows[row.id];
    log(`  ${result.outcome.padEnd(4)} ${row.id} ${row.capability}${result.note ? ` (${result.note})` : ""}`);
    if (result.outcome === "fail") for (const [fact, value] of Object.entries(result.facts)) if (value === false) log(`         ${fact}`);
  }
  return { version: REPORT_VERSION, target: manifest.name, build: health.build ?? "", rows };
}

function compare(argv: string[], log: (line: string) => void): number {
  const at = argv.indexOf("--compare");
  const files = argv.slice(at + 1).filter((a) => !a.startsWith("--"));
  if (files.length !== 2) {
    log(USAGE);
    return EXIT.misuse;
  }
  const reports = files.map((f) => {
    if (!existsSync(f)) throw new Error(`${f} does not exist.`);
    return JSON.parse(readFileSync(f, "utf8")) as Report;
  });
  for (const [i, r] of reports.entries()) if (r.version !== REPORT_VERSION) throw new Error(`${files[i]}: report version ${String(r.version)}, and this tool reads version ${REPORT_VERSION}.`);
  const matrix = readMatrix();
  const { differences, unlisted, ok } = compareReports(reports[0], reports[1], matrix);
  for (const d of differences) log(`  ${d.exception ? `listed ${d.exception}` : "DIFFERS"} ${d.id}: ${d.reason}`);
  log(`${reports[0].target} and ${reports[1].target}: ${matrix.rows.length} rows, ${differences.length} differ, ${unlisted.length} not listed in the exceptions.`);
  return ok ? EXIT.ok : EXIT.findings;
}

/**
 * `live-ish parity`. Called by `@live-ish/verify/cli`, with `argv` after the command name. Returns a
 * public exit code: 0 pass, 1 findings, 2 misuse, 3 environment.
 */
export async function parity(argv: string[], context: ParityContext = {}): Promise<number> {
  const log = (line: string) => console.log(line);
  try {
    if (argv.includes("--compare")) return compare(argv, log);
    const source = flag(argv, "manifest") ?? context.root;
    const origin = flag(argv, "origin");
    const out = flag(argv, "out");
    const suites = (flag(argv, "suite") ?? Object.keys(SUITES).join(",")).split(",");
    const unknown = suites.filter((s) => !SUITES[s]);
    if (!source || !origin || !out || unknown.length) {
      console.error(unknown.length ? `Unknown suite ${unknown.join(", ")}. ${USAGE}` : USAGE);
      return EXIT.misuse;
    }
    const manifest = await loadManifest(source);
    const base = new URL(origin).origin;
    if (!(await fetch(`${base}${manifest.routes.health}`).then((r) => r.ok, () => false))) {
      console.error(`Nothing answers ${manifest.routes.health} at ${base}. Build and start the deck first.`);
      return EXIT.environment;
    }
    const browser = await chromium.launch().catch((error: Error) => {
      console.error(`Chromium did not start: ${error.message.split("\n")[0]}`);
      return null;
    });
    if (!browser) return EXIT.environment;
    try {
      const matrix = readMatrix();
      const report = await runSuites({ manifest, origin: base, framesOrigin: flag(argv, "frames-origin") ?? framesOriginOf(base), suites, browser, matrix, log });
      writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
      const counts = Object.values(report.rows).reduce<Record<string, number>>((all, r) => ({ ...all, [r.outcome]: (all[r.outcome] ?? 0) + 1 }), {});
      log(`${report.target}: ${JSON.stringify(counts)}. Report at ${out}`);
      return counts.fail ? EXIT.findings : EXIT.ok;
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error((error as Error).message);
    return EXIT.findings;
  }
}
