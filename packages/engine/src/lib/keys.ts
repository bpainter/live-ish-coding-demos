import type { Mode } from "./mode";

/** Keyboard map plus the deck's own navigation keys. */
export type KeyAction =
  | { type: "advance" }
  | { type: "retreat" }
  | { type: "next-slide" }
  | { type: "prev-slide" }
  | { type: "first-slide" }
  | { type: "last-slide" }
  | { type: "toggle-blank" }
  | { type: "toggle-fullscreen" }
  | { type: "toggle-hands-on" }
  | { type: "toggle-live" }
  | { type: "reset-step" }
  | { type: "toggle-timer" }
  | { type: "toggle-rehearsal" }
  | { type: "open-demo" }
  | { type: "open-other-window" }
  | { type: "goto" }
  | { type: "escape" }
  | { type: "help" }
  | { type: "noop" };

/**
 * Actions only the presenter windows have: reader mode maps no key to
 * them, and `perform` ignores them there even when called.
 */
export const PRESENTER_ONLY: ReadonlySet<KeyAction["type"]> = new Set(["open-other-window", "toggle-timer", "toggle-blank", "toggle-rehearsal", "goto"]);

/**
 * The key map. Reader mode (`/s/<id>` and `/`) gets the deck map without the presenter-only keys
 * (`s`, `t`, `b`, `.`, `d`, `g`); the audience and speaker windows keep the full map.
 */
export function actionForKey(e: Pick<KeyboardEvent, "key" | "shiftKey" | "metaKey" | "ctrlKey" | "altKey">, mode?: Mode): KeyAction | null {
  const action = presenterMap(e);
  if (action && mode === "reader" && PRESENTER_ONLY.has(action.type)) return null;
  return action;
}

function presenterMap(e: Pick<KeyboardEvent, "key" | "shiftKey" | "metaKey" | "ctrlKey" | "altKey">): KeyAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  switch (e.key) {
    case "ArrowRight":
    case "PageDown":
      return e.shiftKey ? { type: "next-slide" } : { type: "advance" };
    case " ":
    case "Space":
      return { type: "advance" };
    case "ArrowLeft":
    case "PageUp":
      return e.shiftKey ? { type: "prev-slide" } : { type: "retreat" };
    case "Backspace":
      return { type: "retreat" };
    case "Home":
      return { type: "first-slide" };
    case "End":
      return { type: "last-slide" };
    case "b":
    case ".":
      return { type: "toggle-blank" };
    case "f":
      return { type: "toggle-fullscreen" };
    case "h":
      return { type: "toggle-hands-on" };
    case "l":
      return { type: "toggle-live" };
    case "r":
      return { type: "reset-step" };
    case "t":
      return { type: "toggle-timer" };
    case "d":
      return { type: "toggle-rehearsal" };
    case "o":
      return { type: "open-demo" };
    case "s":
      return { type: "open-other-window" };
    case "g":
      return { type: "goto" };
    case "Escape":
      return { type: "escape" };
    case "?":
      return { type: "help" };
    case "F5":
      return { type: "noop" };
    default:
      return null;
  }
}

/**
 * A character key shortcut (WCAG 2.1.4): one printable character, not Space. In reader mode these
 * act only from the stage or the page itself.
 */
export function isCharacterKey(key: string): boolean {
  return key.length === 1 && key !== " ";
}

/** True when the key event originated in a form control the stage should leave alone. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * True when Space or Enter on the target should press it rather than move the deck: buttons, links, tabs, summaries, focusable code, and anything inside an open
 * dialog. The reader and speaker windows return early on these; the audience window does not, so
 * the clicker's Space always advances there. Key handlers in the speaker window call this instead
 * of handling Space themselves.
 */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("dialog[open]")) return true;
  return target.matches('button, a[href], [role="tab"], summary, pre[tabindex]');
}

/** Where a help row applies: the presenter windows (audience and speaker), reader mode, or both. */
export type KeyHelpMode = "presenter" | "reader";

export const KEY_HELP: { keys: string[]; action: string; modes: KeyHelpMode[] }[] = [
  { keys: ["→", "PageDown", "Space"], action: "Next: plays the next step, then the next page", modes: ["presenter", "reader"] },
  { keys: ["←", "PageUp", "Backspace"], action: "Previous: back one step (reset and replay), then the previous page", modes: ["presenter", "reader"] },
  { keys: ["Shift", "→"], action: "Next page, step 0", modes: ["presenter", "reader"] },
  { keys: ["Shift", "←"], action: "Previous page, step 0", modes: ["presenter", "reader"] },
  { keys: ["h"], action: "Hands-on mode: steps stop playing; your keyboard and pointer reach the demo", modes: ["presenter", "reader"] },
  { keys: ["r"], action: "Reset and replay the current step", modes: ["presenter", "reader"] },
  { keys: ["l"], action: "Terminal page: hide the recording for a live terminal", modes: ["presenter", "reader"] },
  { keys: ["d"], action: "Rehearsal overlay", modes: ["presenter"] },
  { keys: ["Home", "End"], action: "First or last slide", modes: ["presenter", "reader"] },
  { keys: ["o"], action: "Open the frame standalone in a new tab", modes: ["presenter", "reader"] },
  { keys: ["b", "."], action: "Blank the audience window", modes: ["presenter"] },
  { keys: ["t"], action: "Start or pause the talk timer", modes: ["presenter"] },
  { keys: ["s"], action: "Open or focus the other window", modes: ["presenter"] },
  { keys: ["g"], action: "Speaker window: go to a slide number", modes: ["presenter"] },
  { keys: ["f"], action: "Toggle fullscreen", modes: ["presenter", "reader"] },
  { keys: ["Tab"], action: "Move past the demo", modes: ["reader"] },
  { keys: ["?"], action: "This help", modes: ["presenter", "reader"] },
];

/** The help rows for a window. */
export function keyHelpFor(mode: KeyHelpMode) {
  return KEY_HELP.filter((row) => row.modes.includes(mode));
}
