import type { Rect } from "./protocol";

/**
 * The spotlight gate. Boxes fade out while anything they mark moves and fade back in
 * once the rects have been quiet for SETTLE_MS. A pure state machine with an injectable clock: the
 * overlay feeds it rects, viewport changes and step progress, renders what `view()` returns and
 * calls `view()` again at `nextAt`.
 */
export const EPSILON = 0.5;
export const SETTLE_MS = 120;
export const FADE_OUT_MS = 100;
export const FADE_IN_MS = 160;
export const MAX_HOLD_MS = 2000;

export interface GateView<P> {
  /** Boxes are shown (fading in or fully in); false while hidden or fading out. */
  shown: boolean;
  /** The geometry to draw: frozen while hidden, swapped to the latest just before showing. */
  payload: P | null;
  /** When to evaluate again (clock time), or null when nothing is pending. */
  nextAt: number | null;
  /** True once, on the evaluation that forced the boxes in after MAX_HOLD_MS. */
  forced: boolean;
}

function moved(a: Rect[], b: Rect[]): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = b[i];
    if (Math.abs(p.x - q.x) > EPSILON || Math.abs(p.y - q.y) > EPSILON || Math.abs(p.w - q.w) > EPSILON || Math.abs(p.h - q.h) > EPSILON) return true;
    for (let k = 0; k < 4; k++) if (Math.abs((p.radii?.[k] ?? 0) - (q.radii?.[k] ?? 0)) > EPSILON) return true;
  }
  return false;
}

export class SpotlightGate<P> {
  private now: () => number;
  private latest: P | null = null;
  private latestRects: Rect[] = [];
  private shownPayload: P | null = null;
  private shown = false;
  /** The step's playback has finished (or there was none), so boxes may appear. */
  private ready = false;
  private animating = false;
  private lastChange: number;
  /** When the current hidden stretch started counting toward the fail-safe. */
  private holdStart: number;
  /** After a forced show the boxes stay in and follow the latest geometry until the next step. */
  private following = false;

  constructor(now: () => number) {
    this.now = now;
    this.lastChange = now();
    this.holdStart = now();
  }

  /** A new step or a new document: hide until the next settle (readiness is set apart). */
  reset(): void {
    this.shown = false;
    this.following = false;
    this.lastChange = this.now();
    this.holdStart = this.now();
  }

  /** Playback finished (true), or a step started playing (false). */
  setReady(ready: boolean): void {
    if (ready === this.ready) return;
    this.ready = ready;
    if (!ready) {
      this.shown = false;
      this.following = false;
    } else {
      this.holdStart = this.now();
    }
  }

  /** A rects message: `rects` is every gated rect, flattened in a stable order. */
  update(payload: P, rects: Rect[], animating: boolean): void {
    const t = this.now();
    const changed = moved(this.latestRects, rects) || (animating && !this.animating) || (!animating && this.animating);
    this.latest = payload;
    this.latestRects = rects;
    this.animating = animating;
    if (this.following) {
      this.shownPayload = payload;
      return;
    }
    if (changed) this.disturbAt(t);
  }

  /** Movement the rects do not show yet, such as a `resize-viewport` message. */
  disturb(): void {
    if (this.following) return;
    this.disturbAt(this.now());
  }

  private disturbAt(t: number): void {
    this.lastChange = t;
    if (this.shown) {
      this.shown = false;
      this.holdStart = t;
    }
  }

  view(): GateView<P> {
    const t = this.now();
    let forced = false;
    if (!this.shown && this.ready && this.latest !== null) {
      const quiet = !this.animating && t - this.lastChange >= SETTLE_MS;
      if (quiet) {
        this.shown = true;
        this.shownPayload = this.latest;
      } else if (t - this.holdStart >= MAX_HOLD_MS) {
        this.shown = true;
        this.following = true;
        this.shownPayload = this.latest;
        forced = true;
      }
    }
    let nextAt: number | null = null;
    if (!this.shown && this.ready && this.latest !== null) {
      const settleAt = this.animating ? Number.POSITIVE_INFINITY : this.lastChange + SETTLE_MS;
      nextAt = Math.min(settleAt, this.holdStart + MAX_HOLD_MS);
    }
    return { shown: this.shown, payload: this.shownPayload, nextAt, forced };
  }
}
