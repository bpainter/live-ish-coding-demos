import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeDeckModule } from "../../prepare";
import { assembleDeck, type AssembledDeck, type DeckInput } from "../../schema/assemble";
import { SPLITS } from "../../schema/demo";
import { DeckError, isDeckConfigError, isDeckError } from "../../schema/errors";
import { docsUrl } from "./catalog";
import { facts, setFacts, type DeckFacts } from "./context";
import { closeTo } from "./nearest";
import { finalSeverity, resolveSettings } from "./presets";
import { allRules, configFindings } from "./rules";
import type { Finding, Rule, RuleContext } from "./types";

export { allRules } from "./rules";
export { formatFinding, formatFindings } from "./format";
export type { Finding, Rule, RuleContext, Severity, Tier } from "./types";

export interface CheckOptions {
  root: string;
  /** Fit warnings become errors, unless the deck relaxed the rule by name. */
  strict?: boolean;
  /** One demo, page or slide id. */
  only?: string;
}

export interface CheckResult {
  findings: Finding[];
}

const configProblem = (message: string): Finding => ({ rule: "config", severity: "error", where: "deck.config.ts", message, docs: docsUrl("config") });

/** The deck's own modules, in the order `.live-ish/deck.gen.ts` imports them. */
async function loadInput(root: string): Promise<{ input: DeckInput; slideFiles: Map<string, string> }> {
  process.env.LIVE_ISH_DECK_ROOT = root;
  if (!existsSync(path.join(root, "deck.config.ts"))) throw new DeckError(`No deck.config.ts in ${root}.`);
  const file = writeDeckModule(root);
  const input = ((await import(pathToFileURL(file).href)) as { default: DeckInput }).default;
  const dir = path.join(root, "slides");
  const names = existsSync(dir) ? readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".d.ts")).sort() : [];
  return { input, slideFiles: new Map(input.slides.map((s, i) => [s.id, `slides/${names[i]}`])) };
}

/** The mistakes that would stop assembly, taken out of the way so every other rule still runs. */
function preflight(root: string, input: DeckInput): { input: DeckInput; missing: DeckFacts["missing"]; badSplits: DeckFacts["badSplits"] } {
  const known = [...input.slides.map((s) => s.id), ...input.demos.map((d) => d.demo.id)];
  const missing = input.config.order.filter((id) => !known.includes(id)).map((id) => ({ id, looked: path.join(root, "demos", id), hint: closeTo(id, known) }));
  const badSplits: DeckFacts["badSplits"] = [];
  const demos = input.demos.map((entry) => {
    const demo = { ...entry.demo };
    for (const beat of ["before", "after", "single"] as const) {
      const page = demo[beat];
      if (page?.split && !(page.split in SPLITS)) {
        badSplits.push({ demo: demo.id, beat, split: page.split });
        demo[beat] = { ...page, split: undefined };
      }
    }
    return { ...entry, demo };
  });
  return { input: { ...input, demos, config: { ...input.config, order: input.config.order.filter((id) => known.includes(id)) } }, missing, badSplits };
}

/** Findings that belong to one demo, page or slide. */
function inScope(found: Finding[], deck: AssembledDeck, ctx: RuleContext, only: string): Finding[] {
  const demo = deck.demos.find((d) => d.id === only || d.pages.some((p) => p.id === only));
  const slide = facts(ctx).slideFiles.get(only);
  if (!demo && !slide) {
    const hint = closeTo(only, [...deck.demos.map((d) => d.id), ...deck.slides.map((s) => s.id)]);
    throw new DeckError(`"${only}" is not a demo, page or slide in this deck.${hint ? ` Did you mean "${hint}"?` : ""}`);
  }
  return found.filter((f) => (demo ? f.where.startsWith(`${demo.folder}/`) : f.where.startsWith(slide!)));
}

/** Runs each rule at its level. A rule that crashes is reported as a finding, and the rest still run. */
async function runRules(ctx: RuleContext, rules: Rule[]): Promise<Finding[]> {
  const { settings } = facts(ctx);
  const out: Finding[] = [];
  for (const rule of rules) {
    const level = settings.level(rule.id, rule.tier);
    if (level === "off") continue;
    let found: Finding[];
    try {
      found = await rule.run(ctx);
    } catch (e) {
      found = [{ rule: rule.id, severity: "error", where: "live-ish check", message: `This check could not run: ${(e as Error).message}`, docs: docsUrl(rule.id) }];
    }
    for (const f of found) out.push({ ...f, severity: finalSeverity(rule.tier, level, f.severity, ctx.strict, settings.explicit(rule.id)) });
  }
  return out.sort((a, b) => a.where.localeCompare(b.where));
}

export interface CheckInput extends CheckOptions {
  input: DeckInput;
  slideFiles?: Map<string, string>;
  /** Test only: changes the assembled deck before the rules see it. */
  tamper?: (deck: AssembledDeck) => void;
}

/** The checks on a deck already in memory. `runChecks` is this, after loading the deck's modules. */
export async function checkInput({ root, input, slideFiles = new Map(), strict = false, only, tamper }: CheckInput): Promise<CheckResult> {
  const invalid = configFindings(input.config);
  if (invalid.length) return { findings: invalid };
  process.env.LIVE_ISH_DECK_ROOT = root;
  const ready = preflight(root, input);
  let deck: AssembledDeck;
  try {
    if (!ready.input.config.order.length) throw new DeckError("Nothing in order could be found.");
    deck = assembleDeck(ready.input);
  } catch (e) {
    if (!isDeckError(e)) throw e;
    return { findings: [configProblem(e.message), ...ready.missing.map((m): Finding => ({ rule: "build", severity: "error", where: "deck.config.ts: order", message: `"${m.id}" is in order, but no slide has that id and there is no demo folder for it.`, fix: `Looked in ${m.looked}.`, docs: docsUrl("build") }))] };
  }
  tamper?.(deck);
  setFacts(deck, { input, settings: resolveSettings(input.config), missing: ready.missing, badSplits: ready.badSplits, slideFiles, memo: new Map() });
  const ctx: RuleContext = { root, deck, strict };
  const found = await runRules(ctx, allRules);
  return { findings: only ? inScope(found, deck, ctx, only) : found };
}

/**
 * Every rule against the deck at `root`, read-only apart from `.live-ish/deck.gen.ts`, which is how
 * the deck's modules load. Meters and support are computed live, so a deck that has never been built
 * checks clean, and a bad `web-features` id reaches the author as a finding, not a crash.
 *
 * Throws a `DeckError` only when there is no deck to check. A wrong config comes back as findings.
 */
export async function runChecks({ root, strict = false, only }: CheckOptions): Promise<CheckResult> {
  let loaded: Awaited<ReturnType<typeof loadInput>>;
  try {
    loaded = await loadInput(root);
  } catch (e) {
    if (isDeckConfigError(e)) return { findings: e.issues.map((i) => ({ rule: "config", severity: "error", where: `deck.config.ts: ${i.path}`, message: i.message, ...(i.fix ? { fix: i.fix } : {}), docs: docsUrl("config") })) };
    throw e;
  }
  return checkInput({ root, input: loaded.input, slideFiles: loaded.slideFiles, strict, only });
}

const PAGES = fileURLToPath(new URL("../../../rules/", import.meta.url));

/** A rule's docs page, for `live-ish explain`; null for an id with no page. */
export function rulePage(id: string): string | null {
  const file = path.join(PAGES, `${id}.md`);
  return /^[a-z0-9-]+$/.test(id) && existsSync(file) ? readFileSync(file, "utf8") : null;
}
