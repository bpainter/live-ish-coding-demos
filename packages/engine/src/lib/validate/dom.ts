import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import { beatDir } from "../../schema/assemble";
import type { Demo, FramePage } from "../../schema/demo";
import { readRecording, terminalBody } from "../frames/terminal";
import { SHELLS } from "../frames/shells";
import { beatConfig, memo } from "./context";
import { rankByDistance } from "./nearest";
import type { RuleContext } from "./types";

/**
 * What a frame's selectors run against: the beat's own files, parsed with `linkedom` and with the
 * frame shell around them, the way the composer serves them. No browser, so a selector a script
 * creates has to be listed in `runtimeSelectors`.
 */

export interface FrameDocument {
  /** "after/index.html". */
  label: string;
  document: Document;
}

const FOUND_MAX = 6;

function parse(label: string, body: string, demo: Demo, page: FramePage): FrameDocument {
  const html = `<!doctype html><html lang="en" data-demo="${demo.id}" data-build="${page.beat}" data-kind="${page.frame.kind}"><head></head><body>${body}</body></html>`;
  return { label, document: parseHTML(html).document as unknown as Document };
}

/** The documents of a beat, or none when the frame is served from elsewhere. */
export function frameDocuments(ctx: RuleContext, demo: Demo, page: FramePage): FrameDocument[] {
  return memo(ctx, `docs:${page.id}`, () => {
    const config = beatConfig(ctx, demo, page);
    const shell = config?.shell ?? (page.frame.kind === "terminal" ? { id: "terminal-window" } : undefined);
    const wrap = (body: string) => {
      const def = shell ? SHELLS[shell.id] : undefined;
      if (!def) return body;
      const r = def.render({ build: page.beat, demo: demo.id, window: { title: "", cwd: "" } });
      return `${r.before}<div class="wrap-shown" data-shown>${body}</div>${r.after}`;
    };
    if (page.frame.kind === "server") return [];
    if (page.frame.kind === "terminal") {
      const recording = config?.recording ?? "session";
      const rec = readRecording(path.join(ctx.root, demo.folder, "recordings", `${recording}.json`));
      return rec ? [parse(`recordings/${recording}.json`, wrap(terminalBody(rec)), demo, page)] : [];
    }
    const dir = path.join(ctx.root, beatDir(demo.folder, page.frame.kind, page.beat));
    return ["index.html", ...(config?.pages ?? [])].flatMap((file) => {
      const abs = path.join(dir, file.split("?")[0]);
      return existsSync(abs) ? [parse(`${page.beat}/${file}`, wrap(readFileSync(abs, "utf8")), demo, page)] : [];
    });
  });
}

const PSEUDO = /::?[a-zA-Z-]+(\((?:[^()]|\([^()]*\))*\))?/g;

/**
 * Does the selector match in this document? `linkedom` knows the static selectors. A state a
 * document only has in a browser (`:popover-open`, `::backdrop`) is dropped, so the element it
 * qualifies is still looked up.
 */
function matches(document: Document, selector: string): boolean {
  try {
    return document.querySelector(selector) !== null;
  } catch {
    const plain = selector.replace(PSEUDO, "").trim().replace(/[>+~,]\s*$/, "").trim();
    if (!plain) return true;
    try {
      return document.querySelector(plain) !== null;
    } catch {
      return false;
    }
  }
}

export interface SelectorMiss {
  /** The token that fails: "#q9". */
  token: string;
  /** What the documents have instead, nearest first. */
  found: string[];
  /** "ids", "classes", "attributes". */
  kind: string;
}

function inventory(documents: FrameDocument[]) {
  const ids: string[] = [];
  const classes: string[] = [];
  const attrs: string[] = [];
  const add = (list: string[], value: string) => {
    if (value && !list.includes(value)) list.push(value);
  };
  for (const { document } of documents) {
    for (const el of document.querySelectorAll("body *")) {
      add(ids, el.id);
      for (const c of (el.getAttribute("class") ?? "").split(/\s+/)) add(classes, c);
      for (const a of Array.from(el.attributes)) if (a.name !== "id" && a.name !== "class") add(attrs, a.name);
    }
  }
  return { ids, classes, attrs };
}

/** Null when the selector matches somewhere; otherwise what fails and what is there instead. */
export function selectorMiss(documents: FrameDocument[], selector: string): SelectorMiss | null {
  if (documents.some(({ document }) => matches(document, selector))) return null;
  const { ids, classes, attrs } = inventory(documents);
  const missing = (re: RegExp, known: string[]) => [...selector.matchAll(re)].map((m) => m[1]).find((t) => !known.includes(t));
  const id = missing(/#([\w-]+)/g, ids);
  if (id) return { token: `#${id}`, found: rankByDistance(id, ids).slice(0, FOUND_MAX).map((t) => `#${t}`), kind: "ids" };
  const cls = missing(/\.([\w-]+)/g, classes);
  if (cls) return { token: `.${cls}`, found: rankByDistance(cls, classes).slice(0, FOUND_MAX).map((t) => `.${t}`), kind: "classes" };
  const attr = missing(/\[([\w-]+)/g, attrs);
  if (attr) return { token: `[${attr}]`, found: rankByDistance(attr, attrs).slice(0, FOUND_MAX).map((t) => `[${t}]`), kind: "attributes" };
  // Each part exists, but not in this arrangement.
  return { token: selector, found: ids.slice(0, FOUND_MAX).map((t) => `#${t}`), kind: "ids" };
}

/** Is `token` named by one of the beat's scripts? Then a script likely creates it. */
export function namedInScript(ctx: RuleContext, demo: Demo, page: FramePage, token: string): boolean {
  const name = token.replace(/^[#.[]/, "").replace(/\]$/, "");
  return beatScripts(ctx, demo, page).some(({ text }) => text.includes(name));
}

// --------------------------------------------------------------- hooks

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** The text of the first `{ ... }` from `open`, skipping strings. */
function braced(source: string, open: number): string {
  let depth = 0;
  let quote = "";
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return source.slice(open + 1, i);
  }
  return source.slice(open + 1);
}

/** The top-level keys of an object body, and whether a spread or computed key hides others. */
function objectKeys(body: string): { names: string[]; complete: boolean } {
  const names: string[] = [];
  let complete = true;
  let depth = 0;
  let quote = "";
  let atKey = true;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
      continue;
    }
    if (depth === 0 && atKey) {
      if (/[\s,]/.test(c)) continue;
      const m = /^(?:async\s+)?(?:\*\s*)?(?:(\w+)|"([^"]+)"|'([^']+)')\s*(?=[:(,}]|$)/.exec(body.slice(i));
      if (m) {
        names.push(m[1] ?? m[2] ?? m[3]);
        i += m[0].length - 1;
      } else complete = false;
      atKey = false;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) atKey = true;
  }
  return { names, complete };
}

/**
 * The hook names one script defines, read without running it: `window.demoHooks = { ... }`,
 * `Object.assign(window.demoHooks, { ... })` and `window.demoHooks.name = ...`. `complete` is false
 * when the script touches `demoHooks` in a way that cannot be read, so a miss proves nothing.
 */
export function hookNames(source: string): { names: string[]; complete: boolean } {
  const text = stripComments(source);
  const names: string[] = [];
  let complete = true;
  let seen = 0;
  for (const m of text.matchAll(/(?:window\.)?demoHooks\s*=\s*(\{)|Object\.assign\(\s*(?:window\.)?demoHooks\s*,\s*(\{)/g)) {
    seen++;
    const found = objectKeys(braced(text, m.index + m[0].length - 1));
    names.push(...found.names);
    complete &&= found.complete;
  }
  for (const m of text.matchAll(/(?:window\.)?demoHooks(?:\.(\w+)|\[\s*["'](\w+)["']\s*\])\s*=[^=]/g)) {
    seen++;
    names.push(m[1] ?? m[2]);
  }
  if (!seen && /demoHooks/.test(text)) complete = false;
  return { names: [...new Set(names)], complete };
}

/** The scripts a frame loads: the shared `hooks.js`, the beat's own files and its inline scripts. */
export function beatScripts(ctx: RuleContext, demo: Demo, page: FramePage): { label: string; text: string }[] {
  return memo(ctx, `scripts:${page.id}`, () => {
    const out: { label: string; text: string }[] = [];
    const hooks = path.join(ctx.root, demo.folder, "hooks.js");
    if (existsSync(hooks)) out.push({ label: "hooks.js", text: readFileSync(hooks, "utf8") });
    const dir = path.join(ctx.root, beatDir(demo.folder, page.frame.kind, page.beat));
    if (page.frame.kind !== "terminal" && existsSync(dir)) {
      for (const f of readdirSync(dir).filter((n) => /\.m?js$/.test(n))) out.push({ label: `${page.beat}/${f}`, text: readFileSync(path.join(dir, f), "utf8") });
    }
    for (const doc of frameDocuments(ctx, demo, page)) {
      for (const el of doc.document.querySelectorAll("script:not([src])")) out.push({ label: doc.label, text: el.textContent ?? "" });
    }
    return out;
  });
}

const PLAYER = fileURLToPath(new URL("../../../assets/terminal/player.js", import.meta.url));

/** The hooks a frame has by reading its scripts. Terminal frames get theirs from the engine's player. */
export function frameHooks(ctx: RuleContext, demo: Demo, page: FramePage): { names: string[]; complete: boolean; files: string[] } {
  const scripts = page.frame.kind === "terminal" ? [{ label: "the terminal player", text: readFileSync(PLAYER, "utf8") }] : beatScripts(ctx, demo, page);
  const read = scripts.map((s) => ({ label: s.label, ...hookNames(s.text) }));
  // A script loaded from outside the beat's folder could define hooks this read never sees.
  const unread = page.frame.kind !== "terminal" && frameDocuments(ctx, demo, page).some(({ document }) => Array.from(document.querySelectorAll("script[src]")).some((s) => !/^(\.\/)?[\w.-]+\.m?js$/.test(s.getAttribute("src") ?? "")));
  return { names: [...new Set(read.flatMap((r) => r.names))], complete: !unread && read.every((r) => r.complete), files: scripts.filter((s) => /demoHooks/.test(s.text)).map((s) => s.label) };
}
