import { readFileSync } from "node:fs";
import type { DemoCodeFile, DemoCodeLang } from "../schema/demo";
import { excerptSource } from "./excerpt";
import { fromDeck } from "./paths";

/**
 * Code panel files. `source` is a getter: the file is read when the page renders, not when the
 * deck module loads, so an edit shows on the next request in development with no restart.
 * Production reads it at prerender, and at request time from the traced `demos/**`.
 */
function readShown(relPath: string): string {
  return readFileSync(/*turbopackIgnore: true*/ fromDeck(relPath), "utf8").replace(/\n$/, "");
}

/** A whole file, shown as it runs. `relPath` is relative to the deck root. */
export function shownFile(relPath: string, lang: DemoCodeLang, file: string): DemoCodeFile {
  const entry = { file, lang } as DemoCodeFile;
  Object.defineProperty(entry, "source", { enumerable: true, get: () => readShown(relPath) });
  return entry;
}

/** Part of a file: `source` joins `ranges` with generated elision lines. */
export function excerptFile(relPath: string, lang: DemoCodeLang, ranges: [number, number][], file: string): DemoCodeFile {
  const entry = { file, lang, excerptOf: { path: relPath, ranges } } as DemoCodeFile;
  Object.defineProperty(entry, "source", {
    enumerable: true,
    get: () => excerptSource(readFileSync(/*turbopackIgnore: true*/ fromDeck(relPath), "utf8"), ranges, lang),
  });
  return entry;
}
