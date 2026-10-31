import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { notesPlain } from "../../notes";
import { defineRule, facts, framePages, wherePage } from "../context";
import { isTodo, sentences, words, writingFields } from "../copy";
import type { Rule, RuleContext } from "../types";

const ENGINE_SLIDES_CSS = fileURLToPath(new URL("../../../../styles/components/slides-glass.css", import.meta.url));

/** Labels that start with a tool or element name keep its lower case. */
const LOWERCASE_LABEL = /^(pnpm|npm|popover|dialog|select)\b/;

const lowered = (text: string) => ` ${text.toLowerCase().replace(/[^a-z' ]+/g, " ")} `;

/** The stylesheets that draw copy slides: the engine's and the one a deck extends. */
function slideCss(ctx: RuleContext): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  if (existsSync(ENGINE_SLIDES_CSS)) out.push({ file: "slide styles", text: readFileSync(ENGINE_SLIDES_CSS, "utf8") });
  const custom = facts(ctx).input.config.theme?.extends;
  if (custom && custom !== "default" && existsSync(path.join(ctx.root, custom))) out.push({ file: custom, text: readFileSync(path.join(ctx.root, custom), "utf8") });
  return out;
}

/** House style. Off by default; `writing.preset: "plain"` or `writing.rules` turns these on. */
export const rules: Rule[] = [
  defineRule("dash", "No em or en dashes.", (ctx, add) => {
    for (const f of writingFields(ctx)) if (/[–—]/.test(f.text)) add(f.where, `${f.field} has an en or em dash.`, { fix: "Use a comma, a colon or two sentences." });
  }),

  defineRule("exclaim", "No exclamation marks.", (ctx, add) => {
    for (const f of writingFields(ctx)) if (f.text.includes("!")) add(f.where, `${f.field} has an exclamation mark.`);
  }),

  defineRule("case", "Labels start with a capital and stay in sentence case.", (ctx, add) => {
    for (const f of writingFields(ctx)) {
      if (f.label && /^[a-z]/.test(f.text) && !LOWERCASE_LABEL.test(f.text)) add(f.where, `${f.field} "${f.text}" should start with a capital.`);
    }
  }),

  defineRule("banned", "No words from the banned list.", (ctx, add) => {
    const { banned } = facts(ctx).settings;
    for (const f of writingFields(ctx)) {
      const text = lowered(f.text);
      for (const w of banned) if (text.includes(` ${w} `)) add(f.where, `${f.field} uses "${w}".`, { severity: f.spoken ? "warning" : "error" });
    }
  }),

  defineRule("sentence", "Sentences stay short. Spoken notes only warn.", (ctx, add) => {
    const limit = facts(ctx).settings.sentence;
    for (const f of writingFields(ctx)) {
      if (f.noSentence) continue;
      for (const s of sentences(f.text)) {
        const n = words(s);
        const quote = `"${s.slice(0, 60)}…"`;
        if (n > limit.error) add(f.where, `${f.field}: a sentence of ${n} words, and the limit is ${limit.error}: ${quote}`, { severity: f.spoken ? "warning" : "error" });
        else if (n > limit.warn) add(f.where, `${f.field}: a sentence of ${n} words. Aim for ${limit.warn}: ${quote}`, { severity: "warning" });
      }
    }
  }),

  defineRule("x-not-y", 'Warns on "X, not Y".', (ctx, add) => {
    for (const f of writingFields(ctx)) {
      // Spoken notes get the once-per-page count below.
      if (!f.spoken && /, not /.test(f.text)) add(f.where, `${f.field} "${f.text.slice(0, 70)}" uses "X, not Y".`, { severity: "warning" });
    }
    for (const demo of ctx.deck.demos) {
      for (const page of framePages(demo)) {
        const spoken = [page.notes, ...page.steps.flatMap((s) => s.notes)].filter((t) => !isTodo(t)).map(notesPlain).join(" ");
        const n = spoken.match(/, not /g)?.length ?? 0;
        if (n > 1) add(wherePage(demo, page, "notes"), `"X, not Y" appears ${n} times.`, { fix: "Aim for once per page.", severity: "warning" });
      }
    }
  }),

  defineRule("slide-case", "No uppercase or tracked text in the slide CSS.", (ctx, add) => {
    for (const { file, text } of slideCss(ctx)) {
      if (/text-transform:\s*uppercase/i.test(text)) add(file, "It sets text-transform: uppercase.");
      for (const m of text.matchAll(/letter-spacing:\s*([^;]+);/g)) {
        if (!/^(0|normal|-|var\()/.test(m[1].trim())) add(file, `It sets letter-spacing: ${m[1].trim()}, which tracks the text.`);
      }
    }
  }),
];
