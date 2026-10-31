import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { contrastReport, customThemeFiles, deckContrastReport, lintThemeFile, resolveTheme, ThemeError, type ThemeFile } from "../../chrome-themes";
import type { Finding, Rule, RuleContext } from "../types";

const docs = (rule: string) => `https://live-ish.dev/errors/${rule}`;

/** Every theme the deck resolves to: the default, the beats, and each demo and page. */
function themesInUse({ deck }: RuleContext): Set<string> {
  return new Set([deck.deck.chrome.theme, ...Object.values(deck.deck.chrome.beats).flatMap((id) => (id ? [id] : [])), ...deck.slides.flatMap((s) => (s.chrome ? [s.chrome] : []))]);
}

const themeContrast: Rule = {
  id: "theme-contrast",
  tier: "fit",
  summary: "Every pair a theme or `theme.tokens` draws meets its contrast floor.",
  run(ctx) {
    const severity = ctx.strict ? "error" : "warning";
    const findings: Finding[] = [];
    const custom = ctx.deck.deck.chrome.custom;
    for (const id of themesInUse(ctx)) {
      try {
        for (const row of contrastReport(resolveTheme(id, custom, ctx.root))) {
          if (row.pass) continue;
          findings.push({ rule: "theme-contrast", severity, where: `chrome theme "${id}": ${row.pair}`, message: `${row.tokens} is ${row.ratio}:1. The floor is ${row.floor}:1.`, fix: "Change one of the two colors in the theme file until the pair clears the floor.", docs: docs("theme-contrast") });
        }
      } catch (error) {
        // An unknown id or an unreadable color is the lint's to report, with its own wording.
        if (!(error instanceof ThemeError)) throw error;
      }
    }
    for (const row of deckContrastReport(ctx.deck.deck.theme.tokens)) {
      if (row.pass) continue;
      findings.push({ rule: "theme-contrast", severity, where: "deck.config.ts: theme.tokens", message: `${row.tokens} is ${row.ratio}:1. The floor is ${row.floor}:1.`, fix: "Change the token in theme.tokens until the pair clears the floor.", docs: docs("theme-contrast") });
    }
    return findings;
  },
};

const themeLint: Rule = {
  id: "theme-lint",
  tier: "fit",
  summary: "A theme file is data: contract tokens only, no selectors, raw CSS or scripts, and fonts with a license.",
  run(ctx) {
    const findings: Finding[] = [];
    const bad = (where: string, message: string, fix?: string) => findings.push({ rule: "theme-lint", severity: "error", where, message, fix, docs: docs("theme-lint") });
    const custom = ctx.deck.deck.chrome.custom;
    for (const entry of custom) {
      const file = path.resolve(ctx.root, entry);
      if (!existsSync(file)) {
        bad(`deck.config.ts: chrome.custom`, `${entry} does not exist.`, "Run `live-ish theme new <id>`, or fix the path.");
        continue;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        bad(entry, "This is not valid JSON.");
        continue;
      }
      for (const problem of lintThemeFile(raw)) bad(`${entry}: ${problem.field}`, problem.message);
      for (const slot of ["sans", "mono"] as const) {
        const font = (raw as ThemeFile).fonts?.[slot];
        if (typeof font !== "object" || font === null) continue;
        for (const f of font.files ?? []) if (f.src?.startsWith("/fonts/") && !existsSync(path.join(ctx.root, "public", f.src))) bad(`${entry}: fonts.${slot}`, `${f.src} is not under public/.`);
      }
    }
    const known = customThemeFiles(custom, ctx.root);
    for (const id of themesInUse(ctx)) {
      try {
        resolveTheme(id, [...known.values()].length ? custom : [], ctx.root);
      } catch (error) {
        if (error instanceof ThemeError) bad(`chrome theme "${id}"`, error.message, "Use a built-in id, or list the theme's file in chrome.custom.");
        else throw error;
      }
    }
    return findings;
  },
};

export const rules: Rule[] = [themeContrast, themeLint];
