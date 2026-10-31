import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AssembledDeck } from "../../schema/assemble";
import { isBackgroundFile } from "../../schema/backgrounds";

/**
 * The Open Graph image against the hash of the inputs it was captured from. `live-ish og` writes
 * the image with the same `ogInputs`, so the two can never disagree.
 */

export const OG_IMAGE_FILE = path.join("public", "live-ish", "og", "cover.jpg");
export const OG_META_FILE = "og.json";

export interface OgMeta {
  hash: string;
  width: number;
  height: number;
  imageSha256: string;
  inputs: Record<string, string>;
}

const ENGINE = fileURLToPath(new URL("../../../", import.meta.url));
const COPY_SLIDE = path.join("src", "components", "layouts", "CopySlide.tsx");
const ENGINE_CSS = path.join("dist", "engine.css");

const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

/** Leaf rules of a stylesheet: the selector (with any at-rule preludes around it) and the body. */
export function cssRules(css: string): { selector: string; context: string[]; body: string }[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: { selector: string; context: string[]; body: string }[] = [];
  const stack: { prelude: string; start: number; nested: boolean }[] = [];
  let last = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "{") {
      if (stack.length) stack[stack.length - 1].nested = true;
      stack.push({ prelude: text.slice(last, i).trim(), start: i + 1, nested: false });
      last = i + 1;
    } else if (c === "}") {
      const top = stack.pop();
      if (top && !top.nested) out.push({ selector: top.prelude, context: stack.map((s) => s.prelude), body: text.slice(top.start, i).replace(/\s+/g, " ").trim() });
      last = i + 1;
    } else if (c === ";") {
      // A declaration (or a statement at-rule) ends: the next prelude starts after it.
      last = i + 1;
    }
  }
  return out;
}

/**
 * The `case "title":` branch of a slide component, and every component it renders: defined in the
 * same file, or imported from a sibling module (`import { Wordmark } from "./Wordmark"`), whose
 * whole file is included.
 */
export function titleBranch(source: string, readSibling: (rel: string) => string | null = () => null): string {
  const start = source.indexOf('case "title":');
  if (start < 0) return "";
  const end = source.indexOf('case "', start + 1);
  const branch = source.slice(start, end < 0 ? undefined : end);
  const parts = [branch];
  for (const name of new Set([...branch.matchAll(/<([A-Z]\w*)/g)].map((m) => m[1]))) {
    const at = source.search(new RegExp(`function ${name}\\s*\\(`));
    if (at >= 0) {
      const close = source.indexOf("\n}\n", at);
      parts.push(source.slice(at, close < 0 ? undefined : close + 2));
      continue;
    }
    const imp = new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*"(\\.[^"]+)"`).exec(source);
    const text = imp ? readSibling(imp[1]) : null;
    if (text !== null) parts.push(`// ${imp![1]}\n${text}`);
  }
  return parts.join("\n");
}

/** The cover's class names (`sg`, `sg--title`, `sg-eyebrow`...), read from the title branch and its components. */
function coverClasses(branch: string): string[] {
  const names = new Set<string>(["sg--title"]);
  // Every sg-prefixed token: className attributes, template literals and default props alike.
  for (const m of branch.matchAll(/(?<![\w.$-])sg(?:-[\w-]*)?(?![\w-])/g)) names.add(m[0]);
  return [...names];
}

/**
 * The CSS that draws the cover: rules that name `.sg--title`, and rules for the cover's classes
 * that are not scoped to another slide kind (`.sg--grid .sg-title` is not the cover's).
 */
export function coverCss(css: string, classes: string[]): string {
  const has = (sel: string, c: string) => new RegExp(`\\.${c.replace(/[-]/g, "\\-")}(?![\\w-])`).test(sel);
  return cssRules(css)
    .filter(({ selector }) => {
      if (/^@/.test(selector)) return false;
      if (has(selector, "sg--title")) return true;
      const otherKind = [...selector.matchAll(/\.sg--([\w-]+)/g)].some((m) => m[1] !== "title");
      return !otherKind && classes.some((c) => has(selector, c));
    })
    .map((r) => `${r.context.join(" / ")}${r.context.length ? " / " : ""}${r.selector} { ${r.body} }`)
    .join("\n");
}

/**
 * What the Open Graph image is captured from: the title slide's data, the speaker, the event and
 * the deck theme, the title background, the cover's CSS and component, and the deck's fonts. Each
 * input is hashed on its own, so `live-ish check` can name what changed.
 */
export function ogInputs(root: string, { deck, slides }: AssembledDeck, fonts: string[] = []): Record<string, string> {
  const title = slides.find((s) => s.layout === "title");
  const deckFile = (p: string) => (existsSync(path.join(root, p)) ? readFileSync(path.join(root, p)) : Buffer.from(""));
  const engineFile = (p: string) => (existsSync(path.join(ENGINE, p)) ? readFileSync(path.join(ENGINE, p)) : Buffer.from(""));
  const source = engineFile(COPY_SLIDE).toString("utf8");
  const sibling = (rel: string) => {
    const base = path.join(path.dirname(COPY_SLIDE), rel);
    const file = [`${base}.tsx`, `${base}.ts`].find((f) => existsSync(path.join(ENGINE, f)));
    return file ? engineFile(file).toString("utf8") : null;
  };
  const branch = titleBranch(source, sibling);
  const background = title?.background && isBackgroundFile(title.background) && title.background.startsWith("/") ? path.join("public", title.background) : null;
  return {
    "title slide": sha(JSON.stringify(title ? { id: title.id, layout: title.layout, title: title.title, copy: title.copy, background: title.background } : null)),
    speaker: sha(JSON.stringify(deck.speaker)),
    event: sha(JSON.stringify(deck.event ?? null)),
    theme: sha(JSON.stringify(deck.theme)),
    ...(background ? { [background]: sha(deckFile(background)) } : {}),
    "cover rules": sha(coverCss(engineFile(ENGINE_CSS).toString("utf8"), coverClasses(branch))),
    "cover component": sha(branch),
    ...Object.fromEntries(fonts.map((f) => [path.join("public", f), sha(deckFile(path.join("public", f)))])),
  };
}

export function ogHash(inputs: Record<string, string>): string {
  return sha(JSON.stringify(Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b))));
}
