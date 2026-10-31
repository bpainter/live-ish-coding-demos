import "server-only";
import { createElement, type ReactNode } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { createHighlighter, type Highlighter } from "shiki";
import type { Element, ElementContent, Root } from "hast";
import type { DemoCodeFile, DemoCodeLang } from "../schema/demo";
import { CODE_COLORS } from "./highlight-colors";

const LANGS: Record<DemoCodeLang, string> = { html: "html", css: "css", js: "javascript", ts: "typescript", tsx: "tsx", bash: "bash", http: "http", yaml: "yaml", json: "json", text: "text" };
/**
 * Every code color meets 7:1 on --chrome-code-surface (the contrast test checks it). Keep in step
 * with the --chrome-code-* tokens in assets/theme.css.
 */
const THEME = "chrome-code";
const CHROME_THEME = {
  name: THEME,
  type: "light" as const,
  colors: { "editor.background": "#ffffff", "editor.foreground": CODE_COLORS.ink },
  tokenColors: [
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: CODE_COLORS.comment, fontStyle: "italic" } },
    { scope: ["keyword", "storage", "storage.type", "storage.modifier", "constant.language", "entity.name.tag", "support.type.primitive", "variable.language", "keyword.control"], settings: { foreground: CODE_COLORS.keyword } },
    { scope: ["string", "string.quoted", "string.template", "punctuation.definition.string", "string.unquoted"], settings: { foreground: CODE_COLORS.string } },
    { scope: ["constant.numeric", "keyword.other.unit", "constant.other.color", "constant.character"], settings: { foreground: CODE_COLORS.number } },
    { scope: ["entity.other.attribute-name", "support.type.property-name", "meta.property-name", "variable.other.property", "entity.name.function", "support.function", "entity.other.attribute-name.class.css", "entity.other.attribute-name.id.css", "entity.other.attribute-name.pseudo-class.css", "meta.object-literal.key", "entity.name.tag.yaml"], settings: { foreground: CODE_COLORS.property } },
  ],
};

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
  const root = h.codeToHast(file.source, { lang: LANGS[file.lang], theme: THEME });
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
