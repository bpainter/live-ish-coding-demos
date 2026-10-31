import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { DemoConfig } from "../../schema/config";
import type { AssembledDeck, DeckInput } from "../../schema/assemble";
import type { Demo, DemoCodeFile, DemoPage, FramePage, Step } from "../../schema/demo";
import { hasFrame } from "../../schema/demo";
import type { Slide } from "../../schema/slide";
import { docsUrl, tierOf } from "./catalog";
import type { Settings } from "./presets";
import type { Finding, Rule, RuleContext, Severity } from "./types";

/**
 * What rules need beyond the assembled deck: the author's own config, which assembly does not
 * carry through (writing and checks settings, a beat's pages and shell). Kept beside the deck, not
 * in it, because the assembled deck reaches the client.
 */
export interface DeckFacts {
  input: DeckInput;
  settings: Settings;
  /** Ids in `order` with no slide or demo behind them. */
  missing: { id: string; looked: string; hint?: string }[];
  /** `split` values no layout has: the page's field and the value. */
  badSplits: { demo: string; beat: string; split: string }[];
  /** "title" to "slides/01-title.ts". */
  slideFiles: Map<string, string>;
  /** Per-run memo, so rules share parsed documents and computed data. */
  memo: Map<string, unknown>;
}

const FACTS = new WeakMap<AssembledDeck, DeckFacts>();

export function setFacts(deck: AssembledDeck, facts: DeckFacts) {
  FACTS.set(deck, facts);
}

export function facts(ctx: RuleContext): DeckFacts {
  const f = FACTS.get(ctx.deck);
  if (!f) throw new Error("This deck was not loaded through runChecks.");
  return f;
}

export function memo<T>(ctx: RuleContext, key: string, compute: () => T): T {
  const cache = facts(ctx).memo;
  if (!cache.has(key)) cache.set(key, compute());
  return cache.get(key) as T;
}

export interface Report {
  (where: string, message: string, options?: { fix?: string; severity?: Severity }): void;
}

/** A rule whose tier comes from the catalog. `body` reports what it finds. */
export function defineRule(id: string, summary: string, body: (ctx: RuleContext, add: Report) => void | Promise<void>, tier = tierOf(id)): Rule {
  if (!tier) throw new Error(`Rule "${id}" is not in the catalog.`);
  return {
    id,
    tier,
    summary,
    async run(ctx) {
      const found: Finding[] = [];
      await body(ctx, (where, message, options = {}) => found.push({ rule: id, severity: options.severity ?? "error", where, message, ...(options.fix ? { fix: options.fix } : {}), docs: docsUrl(id) }));
      return found;
    },
  };
}

// --------------------------------------------------------------- where

export const demoFile = (demo: Pick<Demo, "folder">) => `${demo.folder}/demo.ts`;

export function whereDemo(demo: Pick<Demo, "folder">, field?: string): string {
  return field ? `${demoFile(demo)}: ${field}` : demoFile(demo);
}

export function wherePage(demo: Pick<Demo, "folder">, page: DemoPage, field?: string): string {
  return `${demoFile(demo)}: ${page.beat}${field ? `, ${field}` : ""}`;
}

export function whereStep(demo: Pick<Demo, "folder">, page: DemoPage, step: Step, field?: string): string {
  return `${demoFile(demo)}: ${page.beat}, step ${step.id}${field ? `, ${field}` : ""}`;
}

export function whereSlide(ctx: RuleContext, slide: Pick<Slide, "id">, field?: string): string {
  const file = facts(ctx).slideFiles.get(slide.id) ?? `slide ${slide.id}`;
  return field ? `${file}: ${field}` : file;
}

export const whereDeck = (field: string) => `deck.config.ts: ${field}`;

// --------------------------------------------------------------- walking the deck

export function framePages(demo: Demo): FramePage[] {
  return demo.pages.filter(hasFrame);
}

/** Every step on a frame page, with its demo and page. */
export function* eachStep(ctx: RuleContext): Generator<{ demo: Demo; page: FramePage; step: Step; index: number }> {
  for (const demo of ctx.deck.demos) for (const page of framePages(demo)) for (const [index, step] of page.steps.entries()) yield { demo, page, step, index };
}

/** The slides an author wrote, not the pages a demo expands to. */
export const copySlides = (ctx: RuleContext) => ctx.deck.slides.filter((s) => s.layout !== "demo-page");

/** The author's own config of one demo. */
export function demoConfig(ctx: RuleContext, demo: Demo): DemoConfig | undefined {
  return facts(ctx).input.demos.find((d) => d.demo.id === demo.id)?.demo;
}

export function beatConfig(ctx: RuleContext, demo: Demo, page: FramePage) {
  return demoConfig(ctx, demo)?.[page.beat];
}

/** A shown file's text, or null when the file behind it is gone. */
export function shownSource(file: DemoCodeFile): string | null {
  try {
    return file.source;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------- the deck folder

export const readJson = <T>(file: string): T | null => {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
};

/** A file under `.live-ish/`. */
export const genPath = (ctx: RuleContext, name: string) => path.join(ctx.root, ".live-ish", name);

/** A root-relative URL's file under the deck's `public/`. */
export const publicPath = (ctx: RuleContext, url: string) => path.join(ctx.root, "public", url.split("?")[0]);

export const publicExists = (ctx: RuleContext, url: string) => existsSync(publicPath(ctx, url));
