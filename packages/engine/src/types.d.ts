/** Resolved to the deck's generated module by `withDeck()`. */
declare module "@live-ish/deck" {
  import type { DeckInput } from "./schema/assemble";
  const input: DeckInput;
  export default input;
}

/** The deck's `analytics.script` as a lazy import, or null. Resolved by `withDeck()`. */
declare module "@live-ish/analytics" {
  export const load: (() => Promise<{ default?: () => void }>) | null;
}
