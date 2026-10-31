/**
 * Names of everything a deck keeps in the browser. Scoped by deck, because `localhost:3000` serves
 * whichever deck ran last, and a frame on the presenter's own origin shares its storage. `withDeck()`
 * inlines the deck's id, a slug of its title.
 */
const DECK = process.env.NEXT_PUBLIC_LIVE_ISH_DECK ?? "deck";

export function deckKey(name: string): string {
  return `live-ish:${DECK}:${name}`;
}

/**
 * On one origin a demo's `localStorage.clear()` also clears the presenter's keys. What the windows
 * hold is in memory, so this puts `key` back from `read` whenever another document clears it. The
 * `storage` event never fires in the document that made the change, so a frame's call reaches here.
 */
export function restoreOnClear(key: string, read: () => string | null): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.storageArea !== localStorage || (e.key !== null && e.key !== key) || e.newValue !== null) return;
    const value = read();
    if (value === null) return;
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private window or quota; the value stays in memory */
    }
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
