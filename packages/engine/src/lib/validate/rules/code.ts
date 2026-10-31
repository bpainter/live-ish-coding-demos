import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beatDir } from "../../../schema/assemble";
import { SPLITS, VIA_VOCABULARY, type DemoCodeFile, type Key } from "../../../schema/demo";
import { elisionLines, excerptLayout, lineSet } from "../../excerpt";
import { meterKey } from "../../meters";
import { computeMeters } from "../../../prepare";
import { beatConfig, defineRule, eachStep, facts, framePages, memo, shownSource, wherePage, whereStep } from "../context";
import { copyFields, isTodo } from "../copy";
import { CODE_CARD_PX, CODE_FONT_PX, LAYOUT } from "../layout";
import type { Rule, RuleContext } from "../types";

/** The DOM call that really produces each key's effect, since a synthetic key event is untrusted. */
const KEY_VIA: Partial<Record<Key, RegExp>> = {
  Escape: /requestClose|hidePopover|dispatch|hook:/,
  Tab: /focus\(|dispatch|hook:/,
  "Shift+Tab": /focus\(|dispatch|hook:/,
  Enter: /click\(\)|requestSubmit|dispatch|hook:/,
  Space: /click\(\)|dispatch|hook:/,
  ArrowDown: /selectedIndex|\.next\(\)|dispatch|hook:/,
  ArrowUp: /selectedIndex|\.prev\(\)|dispatch|hook:/,
  "Alt+ArrowLeft": /navigation\.back|history\.back|dispatch|hook:/,
  "Alt+ArrowRight": /navigation\.forward|history\.forward|dispatch|hook:/,
};

/** `localStorage.clear()` on one origin wipes the presenter's own keys too. */

/** Problems with an excerpt against its source file: bad ranges, then the first line that drifted. */
export function excerptIssues(file: DemoCodeFile, full: string): { message: string; fix?: string }[] {
  const out: { message: string; fix?: string }[] = [];
  const excerpt = file.excerptOf!;
  const src = full.replace(/\n$/, "").split("\n");
  let prev = 0;
  for (const [a, b] of excerpt.ranges) {
    if (a > b || a <= prev || a < 1 || b > src.length) out.push({ message: `${file.file}: range [${a}, ${b}] is out of order or outside 1..${src.length}.`, fix: "Ranges are inclusive, ascending and in the file's own line numbers." });
    prev = b;
  }
  if (out.length) return out;
  const lines = file.source.split("\n");
  const layout = excerptLayout(excerpt.ranges, src.length);
  for (const [i, l] of layout.entries()) {
    if (l.kind === "source" && lines[i] !== src[l.line - 1]) {
      out.push({ message: `${file.file}: shown line ${i + 1} differs from ${excerpt.path}:${l.line}.`, fix: `Shown: ${JSON.stringify(lines[i])}. Source: ${JSON.stringify(src[l.line - 1])}.` });
      break;
    }
  }
  if (layout.length !== lines.length) out.push({ message: `${file.file}: ${lines.length} shown lines, but the excerpt has ${layout.length}.` });
  return out;
}

const computed = (ctx: RuleContext) => memo(ctx, "meters", () => computeMeters(ctx.root, ctx.deck));

/** Code panel files, the frame's settings and the actions that drive it. */
export const rules: Rule[] = [
  defineRule("code", "A step's highlight names a real file and lines the panel can show.", (ctx, add) => {
    for (const { demo, page, step } of eachStep(ctx)) {
      const at = whereStep(demo, page, step, "code");
      if (page.beat !== "single" && page.files.length > 0 && !step.code) {
        add(at, "Every step on a before or after page needs code.", { fix: `Add code: { file: "${page.files[0].file}", lines: [] }.` });
        continue;
      }
      if (!step.code || isTodo(step.code.file)) continue;
      const file = page.files.find((f) => f.file === step.code!.file);
      if (!file) {
        add(at, `code.file "${step.code.file}" is not in this page's files.`, { fix: `Files: ${page.files.map((f) => f.file).join(", ") || "none"}.` });
        continue;
      }
      const source = shownSource(file);
      if (source === null) continue;
      const count = source.split("\n").length;
      const set = lineSet(step.code.lines);
      for (const l of step.code.lines) {
        const [a, b] = Array.isArray(l) ? l : [l, l];
        if (a < 1 || b > count || a > b) {
          add(at, `code.lines ${JSON.stringify(l)} is outside ${file.file}, which shows ${count} lines.`, { fix: file.excerptOf ? "code.lines counts shown lines. An excerpt joins its ranges with elision lines, so shown line 2 can be source line 14." : `Use lines 1 to ${count}.` });
        }
      }
      if (set.size > LAYOUT.highlight) add(at, `It highlights ${set.size} lines, and a step holds ${LAYOUT.highlight}.`);
      // The highlighted range, gaps included, must fit the panel's visible lines with one to spare,
      // so the first and last highlighted lines are on screen together.
      if (set.size) {
        const first = Math.min(...set);
        const last = Math.max(...set);
        if (last - first + 1 > LAYOUT.highlightSpan) add(at, `It highlights lines ${first} to ${last} of ${file.file}, a span of ${last - first + 1}.`, { fix: `Keep the span to ${LAYOUT.highlightSpan}, so both ends are on screen.` });
      }
      if (file.excerptOf) {
        const full = existsSync(path.join(ctx.root, file.excerptOf.path)) ? readFileSync(path.join(ctx.root, file.excerptOf.path), "utf8") : "";
        for (const n of elisionLines(file.excerptOf.ranges, full.replace(/\n$/, "").split("\n").length)) {
          if (set.has(n)) add(at, `It highlights line ${n} of ${file.file}, an elision line.`, { fix: "An elision stands for hidden code, so it cannot be highlighted." });
        }
      }
      if (step.code.off && step.code.lines.length) add(at, "An off step dims the whole file.", { fix: "Leave lines empty." });
    }
  }),

  defineRule("files", "Shown files exist, and a page has the tabs to hold them.", (ctx, add) => {
    for (const demo of ctx.deck.demos) {
      for (const page of framePages(demo)) {
        const cap = LAYOUT.tabs[page.beat];
        if (cap && page.files.length > cap) add(wherePage(demo, page, "files"), `${page.files.length} files, and ${page.beat} pages hold ${cap} tabs.`);
        const dir = beatDir(demo.folder, page.frame.kind, page.beat);
        (beatConfig(ctx, demo, page)?.files ?? []).forEach((f) => {
          if (!f.ranges && !existsSync(path.join(ctx.root, dir, f.file))) add(wherePage(demo, page, "files"), `${f.file} does not exist.`, { fix: `Looked in ${dir}/.` });
        });
      }
    }
  }),

  defineRule("file-size", "Shown code fits the code card.", (ctx, add) => {
    for (const demo of ctx.deck.demos) {
      for (const page of framePages(demo)) {
        for (const f of page.files) {
          const source = shownSource(f);
          if (source === null) continue;
          const lines = source.split("\n");
          const at = wherePage(demo, page, `files, ${f.file}`);
          if (lines.length > LAYOUT.fileLines) add(at, `${f.file} shows ${lines.length} lines, and the panel holds ${LAYOUT.fileLines}.`, { fix: "Show part of it with excerpt()." });
          lines.forEach((l, i) => {
            if (l.length > LAYOUT.columns) add(at, `${f.file}:${i + 1} is ${l.length} columns wide, and the code card holds ${LAYOUT.columns}.`, { fix: `Wrap it to ${LAYOUT.columns} columns, which fits the 60/40 split's ${CODE_CARD_PX} px code card at ${CODE_FONT_PX} px.` });
          });
        }
      }
    }
  }),

  defineRule("excerpt", "An excerpt's ranges are valid and match its source file.", (ctx, add) => {
    for (const demo of ctx.deck.demos) {
      for (const page of framePages(demo)) {
        for (const f of page.files) {
          if (!f.excerptOf) continue;
          const at = wherePage(demo, page, `files, ${f.file}`);
          const abs = path.join(ctx.root, f.excerptOf.path);
          if (!existsSync(abs)) {
            add(at, `${f.excerptOf.path} does not exist.`);
            continue;
          }
          for (const { message, fix } of excerptIssues(f, readFileSync(abs, "utf8"))) add(at, message, { fix });
        }
      }
    }
  }),

  defineRule("via", "A key action names the DOM call that produces its effect.", (ctx, add) => {
    for (const { demo, page, step } of eachStep(ctx)) {
      step.actions.forEach((a, i) => {
        if (a.type !== "key") return;
        const at = whereStep(demo, page, step, `action ${i} (key)`);
        const known = VIA_VOCABULARY.some((v) => a.via.includes(v.replace(/\(.*$/, ""))) || /hook:|dispatch|requestClose|hidePopover|click\(\)|focus\(|requestSubmit|selectedIndex|navigation\.|history\./.test(a.via);
        if (!known) add(at, `via "${a.via}" is outside the vocabulary.`, { fix: `Use one of: ${VIA_VOCABULARY.join(", ")}.` });
        const expected = KEY_VIA[a.key];
        if (known && expected && !expected.test(a.via)) add(at, `via "${a.via}" does not produce ${a.key}.`);
        if (/dispatch/.test(a.via) && page.beat !== "before") add(at, "dispatch(keydown) is for before pages only.", { fix: "On the platform build, name the DOM call the browser makes." });
      });
    }
  }),

  defineRule("flags", "A toggle names a flag the page declares.", (ctx, add) => {
    for (const { demo, page, step } of eachStep(ctx)) {
      const flags = Object.keys(page.frame.flags ?? {});
      step.actions.forEach((a, i) => {
        if (a.type === "toggle" && !flags.includes(a.flag)) add(whereStep(demo, page, step, `action ${i} (toggle)`), `It toggles "${a.flag}", which this page does not declare.`, { fix: `Add it to ${page.beat}.flags. Declared: ${flags.join(", ") || "none"}.` });
      });
    }
  }),

  defineRule("viewport", "A page's split is a real layout, on a page with a code panel.", (ctx, add) => {
    for (const bad of facts(ctx).badSplits) add(`demos/${bad.demo}/demo.ts: ${bad.beat}, split`, `"${bad.split}" is not a split.`, { fix: `Use ${Object.keys(SPLITS).join(" or ")}. The viewport follows from it.` });
    for (const demo of ctx.deck.demos) {
      for (const page of framePages(demo)) {
        const split = beatConfig(ctx, demo, page)?.split;
        if (split && page.files.length === 0) add(wherePage(demo, page, "split"), `split "${split}" has no effect, because the page has no code panel and takes the full viewport.`, { fix: "Add files, or remove the split." });
      }
    }
  }),

  defineRule("meter", "A meter sits on the right step and matches the computed count.", (ctx, add) => {
    for (const demo of ctx.deck.demos) {
      for (const page of framePages(demo)) {
        const steps = page.steps.filter((s) => s.meter);
        if (steps.length > 1) add(wherePage(demo, page), `${steps.length} meters, and a page holds one.`);
        for (const s of steps) {
          const at = whereStep(demo, page, s, "meter");
          if (page.beat === "before" && s !== page.steps[page.steps.length - 1]) add(at, "The before meter goes on the last step.");
          if (page.beat === "single") add(at, "No meter on single pages.");
          const value = computed(ctx)[meterKey(demo.id, s.meter!.source)];
          if (value !== undefined && value !== s.meter!.value) add(at, `meter.value is "${s.meter!.value}", and the computed value is "${value}".`, { fix: `Set value: "${value}".` });
        }
      }
    }
  }),

  defineRule("todo", "No TODO reaches the stage.", (ctx, add) => {
    for (const f of copyFields(ctx)) if (isTodo(f.text)) add(f.where, `It still has a TODO: "${f.text.slice(0, 70)}${f.text.length > 70 ? "…" : ""}"`);
    for (const { demo, page, step } of eachStep(ctx)) if (isTodo(step.code?.file)) add(whereStep(demo, page, step, "code"), "code.file is still TODO.");
  }),

];
