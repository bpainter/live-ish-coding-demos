import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { hasFrame, runChecks, type FramePage } from "@live-ish/engine/verify";
import { axe } from "../axe";
import { isBlocked, loadDeck, type DeckData } from "../lib/deck";
import { Report, type Entry } from "../lib/report";
import { perf } from "../perf";
import { selfTestRows, runRow } from "../selftest";
import { walk } from "../walk";
import { warmup } from "../warmup";
import type { Facts, MatrixRow } from "./report";
import type { Check } from "./target";

/**
 * The rows the matrix proves with a tool of this package, not with a suite of its own. Each row
 * names what it reads from a walk, an `axe` run, `check` or `perf`. One run answers every row that
 * reads it. A row passes when a check it reads passed and none it reads failed, and it is `n/a` on a
 * deck with nothing for it to read. Rows proved by `pnpm test` or CI stay `not-run`: `check` in the
 * matrix names them.
 */

interface Run {
  code: number;
  passes: Entry[];
  fails: Entry[];
}

type Reader = (tools: Tools) => Promise<Facts | null>;

/** What a row reads from a run: entries by section, by text, or all of them. */
type Scope = (e: Entry) => boolean;

const everything: Scope = () => true;
const sections = (ids: string[]): Scope => (e) => ids.some((id) => e.section === id || e.section.startsWith(`${id} `));
const text = (re: RegExp): Scope => (e) => re.test(e.message);

/** Facts compare across targets, so they say only whether the row held. */
function verdict(run: Run, scope: Scope): Facts | null {
  const fails = run.fails.filter(scope);
  const passes = run.passes.filter(scope);
  if (!fails.length && !passes.length) return null;
  return { held: fails.length === 0 };
}

class Tools {
  private readonly runs = new Map<string, Promise<Run>>();
  private checked: Promise<Set<string>> | null = null;
  constructor(
    readonly root: string,
    readonly deck: DeckData,
    readonly origin: string,
    readonly log: (line: string) => void,
  ) {}

  /** One command, once, however many rows read it. */
  private once(key: string, body: (report: Report) => Promise<number>): Promise<Run> {
    let run = this.runs.get(key);
    if (!run) {
      this.log(`  running ${key}`);
      const report = new Report(key, false, true);
      run = body(report).then((code) => ({ code, passes: report.passes, fails: report.entries }));
      this.runs.set(key, run);
    }
    return run;
  }

  walk(argv: string) {
    return this.once(`walk ${argv}`.trim(), (report) => walk([...argv.split(" ").filter(Boolean), `--origin=${this.origin}`], { root: this.root, deck: this.deck, report }));
  }

  axe(argv: string) {
    return this.once(`axe ${argv}`.trim(), (report) => axe([...argv.split(" ").filter(Boolean), `--origin=${this.origin}`], { root: this.root, deck: this.deck, report }));
  }

  perf(argv: string) {
    return this.once(`perf ${argv}`, (report) => perf([...argv.split(" "), `--origin=${this.origin}`], { root: this.root, deck: this.deck, report }));
  }

  warmup(argv: string) {
    return this.once(`warmup ${argv}`, (report) => warmup([...argv.split(" ").filter(Boolean), `--origin=${this.origin}`], { root: this.root, deck: this.deck, report }));
  }

  /** The rule ids `check --strict` reports. */
  findings(): Promise<Set<string>> {
    this.checked ??= runChecks({ root: this.root, strict: true }).then((r) => new Set(r.findings.map((f) => f.rule)));
    return this.checked;
  }

  /** Self-tests, in one pass: a row is whether its walk caught what its break broke. */
  selfTests() {
    return this.once("selftest", async (report) => {
      for (const row of selfTestRows(this.deck)) {
        const { ok, detail } = await runRow(this.root, this.deck, this.origin, row);
        (ok ? report.pass : (m: string) => report.fail(row.id, m))(`${row.id} ${detail}`);
      }
      return report.finish("selftest");
    });
  }
}

const pagesWhere = (deck: DeckData, has: (p: FramePage) => boolean) => deck.demos.flatMap((d) => d.pages.filter(hasFrame).filter(has).map((p) => p.id));
const usesAction = (type: string) => (p: FramePage) => p.steps.some((s) => s.actions.some((a) => a.type === type));
/** The author's config of a page's beat, which holds what assembly does not carry through. */
const beatOf = (t: Tools, p: FramePage) => {
  const id = t.deck.demos.find((d) => d.pages.includes(p))?.id;
  return t.deck.input.demos.find((d) => d.demo.id === id)?.demo[p.beat];
};

/** A row that reads the full walk, narrowed to the pages it is about. */
const onPages = (has: (p: FramePage, t: Tools) => boolean): Reader => async (t) => {
  const ids = pagesWhere(t.deck, (p) => has(p, t));
  return ids.length ? verdict(await t.walk(""), sections(ids)) : null;
};
const fromWalk = (scope: Scope = everything): Reader => async (t) => verdict(await t.walk(""), scope);
const fromMode = (mode: string, scope: Scope = everything): Reader => async (t) => verdict(await t.walk(mode), scope);
const fromAxe = (argv: string): Reader => async (t) => verdict(await t.axe(argv), everything);
const fromPerf = (task: string): Reader => async (t) => verdict(await t.perf(task), everything);
/** The rules a row names, against the deck. Nothing it reads may be reported. */
const fromCheck = (...rules: string[]): Reader => async (t) => {
  const found = await t.findings();
  return { held: !rules.some((r) => found.has(r)) };
};
const fromSelfTest: (id: string) => Reader = (id) => async (t) => verdict(await t.selfTests(), (e) => e.message.startsWith(`${id} `));

const records = (deck: DeckData) => {
  const file = path.join(deck.root, ".live-ish", "posters.json");
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>) : {};
};
/** A capture ran on this deck, and its posters match today's inputs. */
const captured: Reader = async (t) => {
  const pages = pagesWhere(t.deck, (p) => !isBlocked(p));
  const have = records(t.deck);
  const found = await t.findings();
  return pages.length ? { held: pages.every((id) => have[id]) && !found.has("poster-fresh") && !found.has("images") } : null;
};

const ACTIONS: Record<string, string> = { "AC-1": "pointer", "AC-2": "click", "AC-3": "key", "AC-4": "focus", "AC-5": "type", "AC-6": "paste", "AC-7": "resize", "AC-8": "toggle", "AC-9": "navigate", "AC-10": "network", "AC-11": "hook", "AC-12": "terminal", "AC-13": "reveal", "AC-14": "wait", "AC-15": "assert" };

const READERS: Record<string, Reader> = {
  "RT-12": fromMode("fixtures"),
  "PR-1": fromWalk(text(/^speaker /)),
  "PR-5": fromWalk(text(/^speaker: /)),
  "PR-10": fromWalk(text(/cautions|hands-on/)),
  "PR-14": fromMode("drawer"),
  "PR-16": fromMode("a11y", text(/help/)),
  "PR-18": fromWalk(text(/hands-on/)),
  "PR-21": fromPerf("nav"),
  "PR-22": fromPerf("nav"),
  "PR-23": fromMode("transitions"),
  "PR-25": fromMode("keys"),
  "PR-26": fromWalk(text(/^speaker /)),
  "PR-27": fromMode("advance"),
  "PR-28": fromMode("focus"),
  "EN-1": async (t) => {
    const found = await t.findings();
    const run = verdict(await t.walk(""), everything);
    return run ? { held: run.held === true && !found.has("page-order") } : null;
  },
  "EN-2": onPages((p, t) => (t.deck.demos.find((d) => d.pages.includes(p))?.pages.filter(hasFrame).map((x) => x.frame.kind) ?? []).some((k) => k !== p.frame.kind)),
  "EN-3": fromMode("advance", text(/code lead/)),
  "EN-4": fromMode("advance", text(/mid-playback/)),
  "EN-5": fromWalk(text(/digest/)),
  "EN-6": onPages((p) => p.steps.some((s) => s.actions.some((a) => a.type === "toggle" && (a.flag === "enhance-js" || a.flag === "csp-enforce")))),
  "EN-7": async (t) => verdict(await t.walk("--browser=webkit --no-speaker"), everything),
  "EN-8": fromMode("fixtures", text(/radii|boxes|protocol/)),
  "EN-9": fromMode("fixtures", text(/hidden at|shown/)),
  "EN-10": fromMode("fixtures"),
  "EN-11": onPages((p) => Boolean(p.frame.spotlightClip || p.frame.keycap)),
  "EN-12": fromMode("fixtures", text(/callout/)),
  "EN-13": fromMode("fixtures", text(/keycap/)),
  "EN-14": fromWalk(text(/code|fixture fits/)),
  "EN-15": fromCheck("excerpt"),
  "EN-16": onPages((p) => p.steps.some((s) => s.code?.off)),
  "EN-17": fromWalk(text(/slots are|frame slot|fixture/)),
  "EN-18": fromCheck("meter"),
  "EN-19": fromWalk(text(/^intro: /)),
  "EN-21": fromMode("drawer", text(/group/)),
  "EN-22": fromWalk(text(/frame background|frame on its background/)),
  "FR-2": fromWalk(text(/^protocol/)),
  "FR-4": onPages((p) => p.frame.flags?.["csp-enforce"] !== undefined),
  "FR-6": onPages((p) => p.frame.flags?.["enhance-css"] !== undefined),
  "FR-7": onPages((p) => p.frame.flags?.["enhance-js"] !== undefined),
  "FR-8": async (t) => {
    const ids = pagesWhere(t.deck, (p) => p.steps.some((s) => s.route));
    if (!ids.length) return null;
    const walked = verdict(await t.walk(""), sections(ids));
    const scanned = verdict(await t.axe(""), everything);
    return walked && scanned ? { held: walked.held === true && scanned.held === true } : null;
  },
  "FR-9": async (t) => (t.deck.input.demos.some((d) => d.render) ? verdict(await t.walk(""), sections(t.deck.input.demos.filter((d) => d.render).flatMap((d) => [d.demo.id, `${d.demo.id}-before`, `${d.demo.id}-after`]))) : null),
  "FR-10": onPages((p, t) => Boolean(t.deck.demos.find((d) => d.pages.includes(p))?.routes?.length)),
  "FR-11": onPages((p, t) => Boolean(beatOf(t, p)?.inner?.length)),
  "FR-12": fromWalk(text(/^shell /)),
  "FR-13": onPages((p, t) => Boolean(beatOf(t, p)?.styles?.length)),
  "FR-14": onPages((p) => p.frame.kind === "static"),
  "FR-15": onPages((p) => p.frame.kind === "terminal"),
  "FR-16": fromMode("keys", text(/hides the recording/)),
  "FR-17": onPages((p) => p.frame.kind === "server"),
  "FR-18": onPages((p) => p.frame.kind === "server"),
  "FR-21": fromMode("focus", text(/iframe\.frame-warm|warming/)),
  "FR-22": async (t) => verdict(await t.walk("underlay --runs=1"), everything),
  "FR-23": async (t) => {
    const ids = pagesWhere(t.deck, isBlocked);
    return ids.length ? verdict(await t.walk(""), sections(ids)) : null;
  },
  "FR-24": fromPerf("headers"),
  "RD-1": fromMode("a11y", text(/ring|reader rows/)),
  "RD-2": fromMode("keys", text(/Tab/)),
  "RD-3": fromMode("a11y", text(/Try the demo/)),
  "RD-4": fromMode("a11y", text(/^text /)),
  "RD-5": fromMode("a11y", text(/no frame document/)),
  "RD-6": fromMode("a11y", text(/code tabs|tabpanel|End and Home|ArrowRight walks/)),
  "RD-7": fromMode("a11y", text(/^a11y announce/)),
  "RD-8": fromMode("a11y", text(/^a11y focus/)),
  "RD-9": fromMode("a11y", text(/described as|off file/)),
  "RD-10": fromMode("links"),
  "SE-3": fromCheck("og-image", "og-stale"),
  "SE-9": fromMode("deck", text(/footer|cover name/)),
  "SE-10": fromMode("deck", text(/^closing/)),
  "WK-15": fromAxe(""),
  "WK-16": fromAxe("--presenter"),
  "CP-1": captured,
  "CP-2": captured,
  "CP-3": fromCheck("images"),
  "CP-4": fromCheck("poster-fresh"),
  "CP-5": captured,
  "CP-6": captured,
  "CP-7": async (t) => (Object.keys(t.deck.deck.hosts.external).length ? captured(t) : null),
  "CP-10": fromCheck("meter"),
  "CP-12": fromCheck("bg-stats"),
  "CP-14": fromCheck("theme", "theme-lint"),
  "WU-1": async (t) => verdict(await t.warmup("--expect=dev"), everything),
  "WU-2": async (t) => {
    const run = await t.warmup("--expect=no-such-build");
    return { held: run.code === 1 && run.fails.some((f) => f.where === "build") };
  },
  "WU-3": async (t) => verdict(await t.warmup("--expect=dev --concurrency=2"), everything),
  "PF-1": fromPerf("load"),
  "PF-2": fromPerf("nav"),
  "PF-3": fromPerf("frame"),
  "PF-4": fromPerf("walk"),
  "PF-5": fromPerf("headers"),
  "PF-6": fromPerf("lighthouse --form=desktop --only=/"),
  "PF-7": fromPerf("functions"),
  "PF-8": fromPerf("frame --profile=venue --label=parity"),
  "PF-9": fromPerf("load"),
  "OT-3": async (t) => verdict(await t.walk("links --local-only"), text(/local-only/)),
};

for (const [row, action] of Object.entries(ACTIONS)) READERS[row] = onPages(usesAction(action));
for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) READERS[`WK-${n}`] = fromSelfTest(`WK-${n}`);
for (let n = 1; n <= 20; n++) READERS[`KY-${n}`] = fromMode("keys");
READERS["KY-19"] = fromMode("keys", text(/keys audience \(frame\)/));
READERS["KY-20"] = fromMode("keys", text(/Space/));

export const toolRows = () => Object.keys(READERS);

/** The rows in `matrix` a deck folder can answer, as checks the suites' loop runs. */
export async function toolChecks(root: string, origin: string, rows: MatrixRow[], log: (line: string) => void): Promise<Record<string, Check>> {
  const tools = new Tools(root, await loadDeck(root), origin, log);
  return Object.fromEntries(rows.flatMap((row) => (READERS[row.id] ? [[row.id, () => READERS[row.id](tools)]] : [])));
}
