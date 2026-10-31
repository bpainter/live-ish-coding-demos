import { existsSync } from "node:fs";
import path from "node:path";
import { ceilingMs, nominalMs } from "../../engine/steps";
import { notesPlain } from "../../notes";
import { defineRule, demoConfig, eachStep, framePages, whereDemo, wherePage, whereStep } from "../context";
import { isTodo, sentences, words } from "../copy";
import { LAYOUT } from "../layout";
import { STYLE_LIMITS } from "../presets";
import type { Rule } from "../types";

/** Demo shape and pacing: the rules that keep a page playable and sayable in its time. */
export const rules: Rule[] = [
  defineRule("page-order", "A demo is intro, before, after, or one single page.", (ctx, add) => {
    for (const demo of ctx.deck.demos) {
      const beats = demo.pages.map((p) => p.beat).join(",");
      if (!/^(intro,)?(before,after|single)$/.test(beats)) add(whereDemo(demo), `The pages are ${beats}.`, { fix: "Use intro, before and after, or one single page. The intro is optional." });
    }
  }),

  defineRule("step-cap", "Steps run s0, s1 and so on, with a cap per beat.", (ctx, add) => {
    for (const demo of ctx.deck.demos) {
      for (const page of framePages(demo)) {
        if (page.steps.length === 0) add(wherePage(demo, page), "The page has no steps.", { fix: "Add a step s0, the entry state." });
        else if (page.steps[0].id !== "s0") add(wherePage(demo, page), `The first step is ${page.steps[0].id}.`, { fix: "The first step must be s0." });
        page.steps.forEach((s, i) => {
          if (i > 0 && s.id !== `s${i}`) add(whereStep(demo, page, s), `Step ids must run s0, s1 and so on.`, { fix: `Rename it s${i}.` });
        });
        const counted = page.steps.slice(1).filter((s) => !isTodo(s.label)).length;
        const cap = LAYOUT.stepCap[page.beat];
        if (counted > cap) add(wherePage(demo, page), `${counted} steps after s0, and ${page.beat} pages hold ${cap}.`, { fix: "Merge steps, or split the demo." });
      }
    }
  }),

  defineRule("bullets", "Each step has the notes paragraphs its beat allows.", (ctx, add) => {
    for (const { demo, page, step, index } of eachStep(ctx)) {
      if (step.notes.some(isTodo)) continue;
      const [lo, hi] = index === 0 ? [0, LAYOUT.s0Bullets] : LAYOUT.bullets[page.beat];
      const n = step.notes.length;
      if (n < lo || n > hi) add(whereStep(demo, page, step, "notes"), `${n} notes, and ${index === 0 ? "s0 takes" : `${page.beat} steps take`} ${lo} to ${hi}.`);
    }
  }),

  defineRule("bullet-length", "A notes paragraph stays short enough to say.", (ctx, add) => {
    for (const { demo, page, step } of eachStep(ctx)) {
      step.notes.forEach((note, i) => {
        if (!isTodo(note) && words(note) > STYLE_LIMITS.bulletWords) add(whereStep(demo, page, step, `note ${i + 1}`), `${words(note)} words, and a paragraph holds ${STYLE_LIMITS.bulletWords}.`);
      });
    }
  }),

  defineRule("step-words", "A step's notes stay within a word budget.", (ctx, add) => {
    for (const { demo, page, step, index } of eachStep(ctx)) {
      if (index === 0 || step.notes.some(isTodo)) continue;
      const n = step.notes.reduce((t, b) => t + words(b), 0);
      if (n > STYLE_LIMITS.stepWords) add(whereStep(demo, page, step, "notes"), `${n} words of notes, and a step holds ${STYLE_LIMITS.stepWords}.`);
    }
  }),

  defineRule("budget", "A page's notes fit the minutes it is given.", (ctx, add) => {
    for (const demo of ctx.deck.demos) {
      for (const page of demo.pages) {
        const intro = notesPlain(page.notes);
        if (!isTodo(page.notes) && words(intro) > STYLE_LIMITS.introWords) add(wherePage(demo, page, "notes"), `${words(intro)} words, and opening notes hold ${STYLE_LIMITS.introWords}.`);
        const all = [page.notes, ...page.steps.flatMap((s) => s.notes)];
        if (page.beat === "intro" || all.some(isTodo)) continue;
        const total = all.reduce((n, t) => n + words(t), 0);
        const budget = Math.round(STYLE_LIMITS.wordsPerMinute * page.timing.minutes);
        if (total > budget) add(wherePage(demo, page), `${total} words of notes, and ${page.timing.minutes} minutes holds ${budget}.`, { severity: "warning" });
        if (page.beat === "after" && total > STYLE_LIMITS.afterPageWords) add(wherePage(demo, page), `${total} words of notes, and an after page holds ${STYLE_LIMITS.afterPageWords}.`, { severity: "warning" });
      }
    }
  }),

  defineRule("proof", "A page keeps its proof steps few.", (ctx, add) => {
    for (const demo of ctx.deck.demos) {
      for (const page of framePages(demo)) {
        const proofs = page.steps.filter((s) => s.proof).length;
        if (proofs > LAYOUT.proofs) add(wherePage(demo, page), `${proofs} proof steps, and a page holds ${LAYOUT.proofs}.`);
      }
    }
  }),

  defineRule("key-step", "Each walk page marks one key step.", (ctx, add) => {
    for (const demo of ctx.deck.demos) {
      for (const page of framePages(demo)) {
        const keys = page.steps.filter((s) => s.key).length;
        if (keys > 1) add(wherePage(demo, page), `${keys} key steps.`, { fix: "Mark exactly one." });
        if (keys === 0 && page.beat !== "single") add(wherePage(demo, page), "No key step.", { fix: "Mark the one point to emphasise with key: true." });
      }
    }
  }),

  defineRule("label", "A step has a short label for the speaker window.", (ctx, add) => {
    for (const { demo, page, step } of eachStep(ctx)) {
      if (isTodo(step.label)) continue;
      if (!step.label.trim()) add(whereStep(demo, page, step, "label"), "The label is empty.");
      else if (words(step.label) > LAYOUT.labelWords) add(whereStep(demo, page, step, "label"), `"${step.label}" has ${words(step.label)} words, and the step rail holds ${LAYOUT.labelWords}.`, { fix: "Aim for 2 to 4 words." });
    }
  }),

  defineRule("keyboard", "A key action tells the speaker what to press by hand.", (ctx, add) => {
    for (const { demo, page, step } of eachStep(ctx)) {
      if (step.actions.some((a) => a.type === "key") && !step.ifKeyboard) add(whereStep(demo, page, step), "A key action has no ifKeyboard note.", { fix: "Say what to press in hands-on mode." });
    }
  }),

  defineRule("frame-change", "Every step after s0 changes something in the frame.", (ctx, add) => {
    for (const { demo, page, step, index } of eachStep(ctx)) {
      if (index > 0 && !step.actions.some((a) => a.type !== "assert" && a.type !== "wait")) add(whereStep(demo, page, step), "The step changes nothing in the frame.", { fix: "Merge it into a neighbour." });
    }
  }),

  defineRule("duration", "A step's playback stays under its ceiling.", (ctx, add) => {
    for (const { demo, page, step } of eachStep(ctx)) {
      const nominal = nominalMs(step);
      const ceiling = ceilingMs(step);
      if (nominal > ceiling) add(whereStep(demo, page, step), `The step plays for ${nominal} ms, and the ceiling is ${ceiling} ms.`, { fix: "Split the step, or cut its waits." });
    }
  }),

  defineRule("intro", "An intro page has support, a short description and a real still.", (ctx, add) => {
    for (const demo of ctx.deck.demos) {
      for (const page of demo.pages) {
        if (page.beat !== "intro") continue;
        const at = (field?: string) => wherePage(demo, page, field);
        if (!demo.support) add(at(), "An intro page needs support, so it can show where the feature works.", { fix: 'Add support: { kind: "web-features", id: "..." }. Run live-ish support <query> to find the id.' });
        if (!isTodo(page.description)) {
          const n = sentences(page.description).length;
          if (n < 1 || n > LAYOUT.description.sentences) add(at("description"), `${n} sentences, and the slide holds ${LAYOUT.description.sentences}.`);
          if (words(page.description) > LAYOUT.description.words) add(at("description"), `${words(page.description)} words, and the slide holds ${LAYOUT.description.words}.`);
          if (/\d/.test(page.description)) add(at("description"), "The description has a number.", { fix: "Versions and dates come from the support data.", severity: "warning" });
          if (/\bBaseline\b/.test(page.description)) add(at("description"), "The description says Baseline.", { fix: "The room may not know the term.", severity: "warning" });
        }
        const visual = demoConfig(ctx, demo)?.intro?.visual;
        // A still the deck has not captured yet is a neutral state. A path the author typed is not.
        if (visual?.src && !existsSync(path.join(ctx.root, "public", visual.src))) add(at("visual.src"), `${visual.src} does not exist under public/.`);
        const capture = page.visual?.capture;
        if (capture) {
          const target = framePages(demo).find((p) => p.id === capture.pageId || `${demo.id}-${p.beat}` === capture.pageId);
          if (!target?.steps.some((s) => s.id === capture.stepId)) add(at("visual.capture"), `It names ${capture.pageId} ${capture.stepId}, which does not exist.`);
        }
      }
    }
  }),

  defineRule("intro-sentences", "Opening notes run a few sentences.", (ctx, add) => {
    const [lo, hi] = STYLE_LIMITS.introSentences;
    for (const demo of ctx.deck.demos) {
      for (const page of demo.pages) {
        if (!page.notes || isTodo(page.notes)) continue;
        const n = sentences(notesPlain(page.notes)).length;
        if (n < lo || n > hi) add(wherePage(demo, page, "notes"), `${n} sentences of opening notes. Write ${lo} to ${hi}.`);
      }
    }
  }),

  defineRule("eyebrow", "The demo's title fits the eyebrow line above each walk page.", (ctx, add) => {
    for (const demo of ctx.deck.demos) {
      if (!demo.support && !demo.pages.some((p) => p.beat === "intro")) continue;
      for (const page of demo.pages) {
        if (page.beat !== "before" && page.beat !== "after") continue;
        if (!page.eyebrow.trim()) add(wherePage(demo, page, "eyebrow"), "The demo's title is empty, so the page has no eyebrow.");
        else if (page.eyebrow.length > LAYOUT.eyebrowChars) add(wherePage(demo, page, "eyebrow"), `The demo's title is ${page.eyebrow.length} characters, and the eyebrow line holds ${LAYOUT.eyebrowChars}.`);
      }
    }
  }),

  defineRule("cautions", "A demo keeps its cautions few and short.", (ctx, add) => {
    for (const demo of ctx.deck.demos) {
      if (demo.cautions.length > STYLE_LIMITS.cautions.count) add(whereDemo(demo, "cautions"), `${demo.cautions.length} cautions, and a demo holds ${STYLE_LIMITS.cautions.count}.`);
      demo.cautions.forEach((c, i) => {
        if (!isTodo(c) && words(c) > STYLE_LIMITS.cautions.words) add(whereDemo(demo, `caution ${i + 1}`), `${words(c)} words, and a caution holds ${STYLE_LIMITS.cautions.words}.`);
      });
    }
  }),

  defineRule("callouts", "Callouts sit on after pages, one per step, in a few words.", (ctx, add) => {
    for (const { demo, page, step } of eachStep(ctx)) {
      if (!step.callouts?.length) continue;
      if (page.beat !== "after") add(whereStep(demo, page, step, "callouts"), `No callouts on ${page.beat} pages.`);
      else if (step.callouts.length > LAYOUT.callouts.perStep) add(whereStep(demo, page, step, "callouts"), `${step.callouts.length} callouts, and a step holds ${LAYOUT.callouts.perStep}.`);
      for (const c of step.callouts) {
        if (words(c.text) > LAYOUT.callouts.words) add(whereStep(demo, page, step, "callouts"), `"${c.text}" has ${words(c.text)} words, and a callout holds ${LAYOUT.callouts.words}.`);
      }
    }
  }),
];
