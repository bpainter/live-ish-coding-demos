import { hasFrame } from "../../schema/demo";
import type { Slide } from "../../schema/slide";
import { notesPlain } from "../notes";
import { copySlides, memo, whereDeck, whereDemo, wherePage, whereSlide, whereStep } from "./context";
import type { RuleContext } from "./types";

/** One piece of copy the writing rules read. */
export interface CopyField {
  where: string;
  field: string;
  text: string;
  /** A short label: sentence case, and never "X, not Y". */
  label?: boolean;
  /** The speaker's notes, read as plain text. Banned words and long sentences only warn here. */
  spoken?: boolean;
  /** Short text that is not a sentence. */
  noSentence?: boolean;
}

/** Words of `s`. */
export function words(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

/**
 * Sentences end at ".", "?" or "!" followed by space (decimals and file names like "app.js" stay
 * whole), also after a closing quote or markup (`."`, `.”`, `.*`), and at every line break, so a
 * note's paragraphs and list items never run together.
 */
export function sentences(s: string): string[] {
  return s
    .split(/(?<=[.?!]["”’)*`]*)[ \t]+|\s*\n\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export const isTodo = (s: string | undefined) => Boolean(s && /\bTODO\b/.test(s));

function slideFields(ctx: RuleContext, s: Slide): CopyField[] {
  const out: CopyField[] = [];
  const add = (field: string, text: string | undefined, opts: Partial<CopyField> = {}) => {
    if (text) out.push({ where: whereSlide(ctx, s, field), field, text, ...opts });
  };
  add("title", s.title, { label: true });
  add("eyebrow", s.eyebrow, { label: true });
  add("description", s.description);
  s.body?.forEach((t, i) => add(`body ${i + 1}`, t));
  s.items?.forEach((item, i) => {
    add(`item ${i + 1}`, item.label, { label: true, noSentence: true });
    add(`item ${i + 1} detail`, item.detail);
  });
  add("image.alt", s.image?.alt);
  s.stats?.forEach((stat, i) => add(`stat ${i + 1}`, stat.label, { label: true }));
  s.tableColumns?.forEach((t, i) => add(`column ${i + 1}`, t, { label: true, noSentence: true }));
  s.tableRows?.forEach((row, r) => row.cells.forEach((t, c) => add(`row ${r + 1}, cell ${c + 1}`, t, { noSentence: true })));
  const g = s.copy;
  if (g?.kind === "title") {
    add("eyebrow", g.eyebrow, { label: true });
    g.lines.forEach((t, i) => add(`line ${i + 1}`, t));
  }
  if (g?.kind === "grid") {
    add("eyebrow", g.eyebrow, { label: true });
    add("title", g.title, { label: true });
    add("display", g.display, { label: true });
    add("lede", g.lede);
    add("cards eyebrow", g.cardsEyebrow, { label: true });
    g.cards.forEach((c, i) => {
      add(`card ${i + 1} title`, c.title, { label: true });
      add(`card ${i + 1} body`, c.body);
      add(`card ${i + 1} question`, c.question);
    });
  }
  if (g?.kind === "quotes") {
    add("title", g.title, { label: true });
    g.quotes.forEach((q, i) => {
      add(`quote ${i + 1}`, q.text);
      add(`quote ${i + 1} cite`, q.cite);
    });
  }
  if (g?.kind === "statement") g.lines.forEach((t, i) => add(`line ${i + 1}`, t));
  if (g?.kind === "people") {
    add("title", g.title, { label: true });
    g.people.forEach((p, i) => add(`person ${i + 1}`, `${p.name}, ${p.role}`, { noSentence: true }));
  }
  if (g?.kind === "closing") {
    add("eyebrow", g.eyebrow, { label: true });
    add("caption", g.caption, { label: true });
  }
  if (s.notes) add("notes", notesPlain(s.notes), { spoken: true });
  return out;
}

/** Every piece of copy in the deck, in reading order. Memoized for the run. */
export function copyFields(ctx: RuleContext): CopyField[] {
  return memo(ctx, "copy", () => {
    const out: CopyField[] = [];
    const { deck, demos } = ctx.deck;
    out.push({ where: whereDeck("title"), field: "title", text: deck.title, label: true });
    if (deck.description !== deck.title) out.push({ where: whereDeck("description"), field: "description", text: deck.description });
    for (const s of copySlides(ctx)) {
      const seen = new Set<string>();
      for (const f of slideFields(ctx, s)) {
        // A title slide's line falls back to its title: read it once.
        const key = `${f.spoken}:${f.text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(f);
      }
    }
    for (const demo of demos) {
      out.push({ where: whereDemo(demo, "title"), field: "title", text: demo.title, label: true });
      out.push({ where: whereDemo(demo, "scenario"), field: "scenario", text: demo.scenario });
      demo.cautions.forEach((c, i) => out.push({ where: whereDemo(demo, `caution ${i + 1}`), field: `caution ${i + 1}`, text: c }));
      for (const page of demo.pages) {
        if (page.notes) out.push({ where: wherePage(demo, page, "notes"), field: "notes", text: notesPlain(page.notes), spoken: true });
        if (page.beat === "intro") {
          out.push({ where: wherePage(demo, page, "description"), field: "description", text: page.description });
          if (page.visual) out.push({ where: wherePage(demo, page, "visual.alt"), field: "visual.alt", text: page.visual.alt });
        }
        if (!hasFrame(page)) continue;
        if (page.beat === "single") {
          if (page.title !== demo.title) out.push({ where: wherePage(demo, page, "title"), field: "title", text: page.title, label: true });
          if (page.badge) out.push({ where: wherePage(demo, page, "badge"), field: "badge", text: page.badge.text, label: true, noSentence: true });
        }
        for (const step of page.steps) {
          const at = (field: string) => whereStep(demo, page, step, field);
          out.push({ where: at("label"), field: "label", text: step.label, label: true });
          step.notes.forEach((n, i) => out.push({ where: at(`note ${i + 1}`), field: `note ${i + 1}`, text: notesPlain(n), spoken: true }));
          if (step.ifKeyboard) out.push({ where: at("ifKeyboard"), field: "ifKeyboard", text: step.ifKeyboard });
          if (step.proof) out.push({ where: at("proof"), field: "proof", text: step.proof, noSentence: true });
          step.callouts?.forEach((c, i) => out.push({ where: at(`callout ${i + 1}`), field: `callout ${i + 1}`, text: c.text, label: true, noSentence: true }));
        }
      }
    }
    return out;
  });
}

/** Copy the writing rules read: TODO text is reported once by `todo` and not checked further. */
export const writingFields = (ctx: RuleContext) => copyFields(ctx).filter((f) => !isTodo(f.text));
