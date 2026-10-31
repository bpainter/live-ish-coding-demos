import path from "node:path";

/**
 * One module roots everything at the deck, so nothing else asks where it runs. `next dev`, `next
 * build` and `next start` run with the deck as their working directory; the CLI and the tests set
 * LIVE_ISH_DECK_ROOT. The turbopackIgnore marker keeps file tracing out of these joins: the files
 * the server reads at request time reach a deployment through `outputFileTracingIncludes` in
 * `withDeck()`, and a plain `path.join(process.cwd(), ...)` would trace the whole deck.
 */
export function deckRoot(): string {
  return process.env.LIVE_ISH_DECK_ROOT ?? process.cwd();
}

/** An absolute path inside the deck. */
export function fromDeck(...parts: string[]): string {
  return path.join(/*turbopackIgnore: true*/ deckRoot(), ...parts);
}

/** A generated file under `.live-ish/`. */
export function generated(name: string): string {
  return fromDeck(".live-ish", name);
}

/** A file under the deck's `public/`. */
export function publicFile(url: string): string {
  return fromDeck("public", url);
}
