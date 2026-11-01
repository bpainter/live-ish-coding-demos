import type { PresenterMode } from "./context";

const WINDOWS = {
  audience: { path: "/present", name: "deck-audience" },
  speaker: { path: "/speaker", name: "deck-speaker" },
} as const;

/** The window `s` reaches from this one: each presenter window opens the other. */
export function otherWindow(mode: PresenterMode) {
  return WINDOWS[mode === "speaker" ? "audience" : "speaker"];
}

/**
 * Opens the other presenter window, or brings it forward if it is already open. Asking for the name
 * with no address finds the window and leaves it where it is. With an address, the browser would
 * navigate it, and a press on stage would reload the demo in front of the room. This window takes
 * its own name first: `live-ish present` and a typed address open a window with none, and the other
 * window could not find it on the way back.
 */
export function openOtherWindow(mode: PresenterMode) {
  window.name = WINDOWS[mode].name;
  const { path, name } = otherWindow(mode);
  const found = window.open("", name);
  if (!found) return;
  let blank = false;
  try {
    blank = found.location.href === "about:blank";
  } catch {
    // The window went to another site, so it is not ours to read. Leave it there and focus it.
  }
  if (blank) found.location.href = path;
  else found.focus();
}
