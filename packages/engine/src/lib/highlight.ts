import "server-only";
import { createElement, type ReactNode } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { createHighlighter, type Highlighter } from "shiki";
import type { Element, ElementContent, Root } from "hast";
import type { DemoCodeFile, DemoCodeLang } from "../schema/demo";

const LANGS: Record<DemoCodeLang, string> = { html: "html", css: "css", js: "javascript", ts: "typescript", tsx: "tsx", bash: "bash", http: "http", yaml: "yaml", json: "json", text: "text" };

/**
 * Syntax colors are theme tokens. Shiki needs real colors in a theme, so each token gets a sentinel,
 * and `colorReplacements` turns the sentinels into var(--chrome-code-*) in the output. Every span
 * carries the variable, so a theme file reaches the colors with no second render, and the output
 * stays server-rendered. The sentinels land only on the outer <pre>, which `renderCodeFile` discards.
 */
const S = { ink: "#000001", keyword: "#000002", string: "#000003", comment: "#000004", number: "#000005", property: "#000006" } as const;
const THEME = "chrome-code";
const CHROME_THEME = {
  name: THEME,
  type: "light" as const,
  colors: { "editor.background": "#ffffff", "editor.foreground": S.ink },
  tokenColors: [
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: S.comment, fontStyle: "italic" } },
    { scope: ["keyword", "storage", "storage.type", "storage.modifier", "constant.language", "entity.name.tag", "support.type.primitive", "variable.language", "keyword.control"], settings: { foreground: S.keyword } },
    { scope: ["string", "string.quoted", "string.template", "punctuation.definition.string", "string.unquoted"], settings: { foreground: S.string } },
    { scope: ["constant.numeric", "keyword.other.unit", "constant.other.color", "constant.character"], settings: { foreground: S.number } },
    { scope: ["entity.other.attribute-name", "support.type.property-name", "meta.property-name", "variable.other.property", "entity.name.function", "support.function", "entity.other.attribute-name.class.css", "entity.other.attribute-name.id.css", "entity.other.attribute-name.pseudo-class.css", "meta.object-literal.key", "entity.name.tag.yaml"], settings: { foreground: S.property } },
  ],
};
const COLOR_REPLACEMENTS = Object.fromEntries(Object.entries(S).map(([token, sentinel]) => [sentinel, `var(--chrome-code-${token})`]));

let highlighterPromise: Promise<Highlighter> | undefined;
function highlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({ themes: [CHROME_THEME], langs: Object.values(LANGS).filter((l) => l !== "text") });
  return highlighterPromise;
}

export interface RenderedFile {
  file: string;
  lang: DemoCodeLang;
  /** One React node per source line, tokens already coloured. No raw HTML strings. */
  lines: ReactNode[];
}

function isElement(n: ElementContent): n is Element {
  return n.type === "element";
}

/** Shiki -> hast -> React elements, split per line so the panel can mark highlighted lines. */
export async function renderCodeFile(file: Pick<DemoCodeFile, "file" | "lang" | "source">): Promise<RenderedFile> {
  const h = await highlighter();
  const root = h.codeToHast(file.source, { lang: LANGS[file.lang], theme: THEME, colorReplacements: COLOR_REPLACEMENTS });
  const pre = root.children.find((n): n is Element => n.type === "element" && n.tagName === "pre");
  const code = pre?.children.find((n): n is Element => n.type === "element" && n.tagName === "code");
  // Shiki 4 emits `class`, older versions `className`; accept either.
  const lineEls = (code?.children ?? []).filter(isElement).filter((el) => {
    const cls = el.properties?.className ?? el.properties?.class;
    const list = Array.isArray(cls) ? cls.map(String) : String(cls ?? "").split(/\s+/);
    return list.includes("line");
  });
  const lines = lineEls.map((el, i) => {
    const lineRoot: Root = { type: "root", children: el.children };
    return createElement(Fragment, { key: `l${i + 1}` }, toJsxRuntime(lineRoot, { Fragment, jsx, jsxs }));
  });
  return { file: file.file, lang: file.lang, lines };
}

export async function renderCodeFiles(files: Pick<DemoCodeFile, "file" | "lang" | "source">[]): Promise<RenderedFile[]> {
  return Promise.all(files.map(renderCodeFile));
}
