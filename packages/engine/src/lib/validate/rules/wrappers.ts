import { existsSync, readFileSync } from "node:fs";
import { SHELLS } from "../../frames/shells";
import type { ShellRender } from "../../frames/shells";
import { engineAsset } from "../assets";
import { beatConfig, defineRule, framePages, memo, publicPath, shownSource, wherePage } from "../context";
import { frameDocuments } from "../dom";
import { lintShellCss } from "../theme";
import type { Rule, RuleContext } from "../types";

interface UsedShell {
  id: string;
  pages: string[];
  render: ShellRender;
}

/** Each shell the deck uses, rendered once. */
function usedShells(ctx: RuleContext): UsedShell[] {
  return memo(ctx, "shells", () => {
    const used = new Map<string, UsedShell>();
    for (const demo of ctx.deck.demos) {
      for (const page of framePages(demo)) {
        const id = beatConfig(ctx, demo, page)?.shell?.id ?? (page.frame.kind === "terminal" ? "terminal-window" : undefined);
        const def = id ? SHELLS[id] : undefined;
        if (!id || !def) continue;
        const entry = used.get(id) ?? { id, pages: [], render: def.render({ build: page.beat, demo: demo.id, window: { title: "", cwd: "" } }) };
        entry.pages.push(page.id);
        used.set(id, entry);
      }
    }
    return [...used.values()];
  });
}

/** A shell file: under the deck's public/, or the engine's own. */
function shellFile(ctx: RuleContext, href: string): string | null {
  for (const abs of [publicPath(ctx, href), engineAsset(href)]) if (existsSync(abs)) return readFileSync(abs, "utf8");
  return null;
}

/** Frame shells: context around the shown block. The ids keep `wrapper-`, the class prefix shells use. */
export const rules: Rule[] = [
  defineRule("wrapper-unknown", "A page's shell is one the engine knows.", (ctx, add) => {
    for (const demo of ctx.deck.demos) {
      for (const page of framePages(demo)) {
        const id = beatConfig(ctx, demo, page)?.shell?.id;
        if (id && !SHELLS[id]) add(wherePage(demo, page, "shell"), `Shell "${id}" is not registered.`, { fix: `Known shells: ${Object.keys(SHELLS).join(", ")}.` });
      }
    }
  }),

  defineRule("wrapper-missing", "An id a shell lifts out exists in the shown markup.", (ctx, add) => {
    for (const demo of ctx.deck.demos) {
      for (const page of framePages(demo)) {
        const outside = beatConfig(ctx, demo, page)?.shell?.outside ?? [];
        const docs = frameDocuments(ctx, demo, page);
        for (const id of outside) {
          if (docs.length && !docs.some((d) => d.document.getElementById(id))) add(wherePage(demo, page, "shell.outside"), `No element with id "${id}" to place outside the shown block.`);
        }
      }
    }
  }),

  defineRule("wrapper-markup", "A shell adds no links, controls or headings.", (ctx, add) => {
    for (const { id, render } of usedShells(ctx)) {
      const m = render.before + render.after;
      const where = `shell ${id}`;
      if (/\bhref\s*=/i.test(m)) add(where, "A shell element has an href, and shells never navigate.");
      for (const t of m.matchAll(/\btabindex\s*=\s*"?(-?\d+)/gi)) if (Number(t[1]) >= 0) add(where, `tabindex="${t[1]}" makes a shell element focusable.`);
      if (/<(a|button|input|select|textarea|option|details|summary|label)\b/i.test(m)) add(where, "The shell holds a link, button or form control.");
      if (/<h1\b/i.test(m)) add(where, "The shell holds an h1.");
      if (/<main\b/i.test(m)) add(where, "The shell adds a main beside the shown one.");
      for (const cls of m.matchAll(/\bclass\s*=\s*"([^"]*)"/g)) {
        const bad = cls[1].split(/\s+/).filter((c) => c && !c.startsWith("wrap"));
        if (bad.length) add(where, `Class "${bad[0]}" lacks the wrap- prefix.`);
      }
    }
  }),

  defineRule("wrapper-lint", "Shell CSS stays in its layer and uses tokens.", (ctx, add) => {
    for (const { id, render } of usedShells(ctx)) {
      for (const href of render.styles) {
        const text = shellFile(ctx, href);
        if (text === null) continue;
        for (const l of lintShellCss(text, SHELLS[id].banned)) add(`shell ${id}, ${href}:${l.line}`, l.message);
      }
    }
  }),

  defineRule("wrapper-banned", "A shell uses nothing it is meant to keep away from.", (ctx, add) => {
    for (const { id, render } of usedShells(ctx)) {
      const banned = SHELLS[id].banned;
      for (const x of banned) {
        if (x.pattern.test(render.before + render.after)) add(`shell ${id}`, `The markup uses ${x.name}.`);
        for (const href of render.scripts) {
          const text = shellFile(ctx, href);
          if (text !== null && x.pattern.test(text)) add(`shell ${id}, ${href}`, `The script uses ${x.name}.`);
        }
      }
    }
  }),

  defineRule("wrapper-shown", "Shown code does not use the wrap- prefix.", (ctx, add) => {
    for (const demo of ctx.deck.demos) {
      for (const page of framePages(demo)) {
        for (const f of page.files) {
          const source = shownSource(f);
          if (source !== null && /\bwrap-[a-z]/.test(source)) add(wherePage(demo, page, `files, ${f.file}`), "A shown file uses the wrap- prefix, which belongs to frame shells.");
        }
      }
    }
  }),
];
