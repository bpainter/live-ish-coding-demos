/** Resolved to the deck's generated module by `withDeck()`. */
declare module "@live-ish/deck" {
  import type { DeckInput } from "./schema/assemble";
  const input: DeckInput;
  export default input;
}
