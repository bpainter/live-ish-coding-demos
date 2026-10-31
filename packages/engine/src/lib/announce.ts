/**
 * One persistent polite live region for the deck. It is appended to
 * `body` once, outside React and outside the stage that remounts per slide, and reused, so screen
 * readers keep listening to the same node across slide changes. A region created and filled in
 * the same moment is announced unreliably (NVDA, JAWS), which is why `ensureAnnouncer()` runs on
 * arrival, well before the first message.
 *
 * Slide titles are not announced here: Next's route announcer reads the new page's title on every
 * navigation. This region carries step changes in reader mode.
 */

const ID = "deck-announcer";

export function ensureAnnouncer(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let el = document.getElementById(ID);
  if (!el) {
    el = document.createElement("div");
    el.id = ID;
    el.className = "visually-hidden";
    el.setAttribute("aria-live", "polite");
    el.setAttribute("aria-atomic", "true");
    document.body.append(el);
  }
  return el;
}

let pending = 0;

/**
 * Replaces the region's text with `message`. The text is cleared first and set in a later task, so
 * the same sentence twice in a row (Back, then Next) is still announced.
 */
export function announce(message: string) {
  const el = ensureAnnouncer();
  if (!el) return;
  window.clearTimeout(pending);
  el.textContent = "";
  pending = window.setTimeout(() => {
    el.textContent = message;
    // The walk counts writes (`live-ish walk` a11y).
    const w = window as unknown as { __announcements?: string[] };
    w.__announcements = [...(w.__announcements ?? []), message];
  }, 100);
}
