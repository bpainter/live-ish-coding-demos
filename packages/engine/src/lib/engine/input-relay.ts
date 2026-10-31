/**
 * Carries the presenter's key or pointer press to a frame that loads after it. WebKit 26.0 ignores element.focus() in a cross-origin frame without user activation,
 * and it forwards activation to a frame only through a postMessage made in a task that descends
 * from the input (a timer started during the event). A fresh document's `ready` arrives as a
 * message event, which carries none, so a reset and replay would restore no focus.
 *
 * A press in this window, or a key the focused frame forwards, opens a one second window with a timer chain started inside the event; `withInput`
 * runs its callback on the next tick of that chain, so the replay is posted from a task that
 * still carries the press. Without a press (the speaker window drove the step) it runs at once.
 * Other engines need none of this and behave the same either way.
 *
 * The limit: WebKit honours the press only while the frame handles the message and in timers it
 * starts. Focus a page moves later, after a fetch or an animation frame, has no press behind it in
 * a fresh document, so WebKit 26.0 keeps it on the previous element. The runtime then asks again
 * (`focus-request`), and the handle answers with `focus-grant` through `withInput`, so the second
 * try carries the press while its window is open. A forward run has the real key
 * press inside the frame and restores focus as authored.
 */
const WINDOW_MS = 1000;
const TICK_MS = 16;

let openUntil = 0;
let ticking = false;
/** The chain of the latest press. Older chains stop at their next tick. */
let chain = 0;
const queue: Array<() => void> = [];

function tick(gen: number) {
  if (gen !== chain) return;
  while (queue.length) queue.shift()!();
  if (performance.now() < openUntil) window.setTimeout(() => tick(gen), TICK_MS);
  else ticking = false;
}

/**
 * Opens the window; call it inside the press, or inside a frame's forwarded-key message event
 * (WebKit forwards the frame's activation with the message). Every press starts a chain of its
 * own: WebKit carries a press through timers for one second from that press, so a chain kept from
 * an earlier press stops carrying anything a second after it, even while a later press keeps the
 * window open. Two Backs under a second apart posted the second replay without a press, and the
 * replay restored no focus.
 */
export function notePress() {
  openUntil = performance.now() + WINDOW_MS;
  ticking = true;
  const gen = ++chain;
  window.setTimeout(() => tick(gen), TICK_MS);
}

let installed = false;

/** Listens for presses in this window; safe to call more than once. */
export function installInputRelay() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("keydown", notePress, true);
  window.addEventListener("pointerdown", notePress, true);
}

/** Runs `fn` in a task descending from the latest press while its window is open, else now. */
export function withInput(fn: () => void) {
  if (ticking && performance.now() < openUntil) queue.push(fn);
  else fn();
}
