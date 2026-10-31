"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Step } from "../../schema/demo";
import type { Cue, Layer, Radii, Rect } from "../../lib/engine/protocol";
import type { FrameHandle, RectsMessage } from "../../lib/engine/frame";
import { MAX_HOLD_MS, SpotlightGate, type GateView } from "../../lib/engine/settle";

interface Props {
  handle: FrameHandle | null;
  step: Step | undefined;
  /** The step's playback has finished (or there was none): boxes may appear. */
  ready: boolean;
  /** Hands-on mode hides the ghost cursor and keycaps. */
  handsOn: boolean;
  reducedMotion: boolean;
  /** Rehearsal mode logs a forced spotlight. */
  rehearsal?: boolean;
  /** Clip spotlights above this frame y (a docked drawer). */
  clipBottom?: number;
  /** Keycap placement: at the frame's foot, or above a docked drawer. */
  keycap?: "above-drawer";
}

interface CursorState {
  at: Rect | null;
  visible: boolean;
}

type Side = "top" | "right" | "bottom" | "left";
interface Spot {
  r: Rect;
  inset: boolean;
  /** Top-layer elements above this box's target: the box does not paint over them. */
  holes: Rect[];
}
interface Callout {
  target: string;
  text: string;
  side: Side;
  r: Rect;
  holes: Rect[];
}
/** Everything the gate shows and hides together: spotlights, callouts and the focus ring. */
interface Geometry {
  spots: Spot[];
  callouts: Callout[];
  focus: { r: Rect; holes: Rect[] } | null;
  /** The frame's top-layer elements, gated with the boxes so a hole never lags its layer. */
  layers: Rect[];
  viewport: { w: number; h: number };
}

declare global {
  interface Window {
    __spotlightForced?: { stepId: string | null; at: number }[];
  }
}

/**
 * Presenter chrome drawn above the frame inside the scaled wrapper: ghost
 * cursor, ripple, keycaps and captions, spotlights, callouts and the focus ring. Coordinates are
 * frame CSS pixels because the wrapper carries the scale. Spotlights, callouts and the focus ring
 * pass through the settle gate (lib/engine/settle.ts): they fade out while their targets move and
 * fade back in at the latest geometry once the rects settle. The cursor, ripple and keycaps are
 * not gated.
 */
export function Overlay({ handle, step, ready, handsOn, reducedMotion, rehearsal = false, clipBottom, keycap }: Props) {
  const [cursor, setCursor] = useState<CursorState>({ at: null, visible: false });
  const [ripple, setRipple] = useState<{ at: Rect; key: number } | null>(null);
  const [cap, setCap] = useState<{ text: string; key: number } | null>(null);
  const [view, setView] = useState<GateView<Geometry>>({ shown: false, payload: null, nextAt: null, forced: false });
  const gate = useRef<SpotlightGate<Geometry> | null>(null);
  const timer = useRef(0);
  const again = useRef<() => void>(() => {});
  const stepRef = useRef(step);
  const handsOnRef = useRef(handsOn);
  const rehearsalRef = useRef(rehearsal);
  const clipRef = useRef(clipBottom);
  useEffect(() => {
    stepRef.current = step;
    handsOnRef.current = handsOn;
    rehearsalRef.current = rehearsal;
    clipRef.current = clipBottom;
  }, [step, handsOn, rehearsal, clipBottom]);

  const evaluate = useCallback(() => {
    const g = gate.current;
    if (!g) return;
    window.clearTimeout(timer.current);
    const v = g.view();
    if (v.forced) {
      const stepId = stepRef.current?.id ?? null;
      (window.__spotlightForced ??= []).push({ stepId, at: Date.now() });
      if (rehearsalRef.current) console.warn(`Spotlight forced after ${MAX_HOLD_MS} ms`, stepId);
    }
    setView(v);
    if (v.nextAt !== null) timer.current = window.setTimeout(() => again.current(), Math.max(0, v.nextAt - performance.now()) + 1);
  }, []);
  useEffect(() => {
    again.current = evaluate;
  }, [evaluate]);

  const feed = useCallback(
    (msg: RectsMessage | null) => {
      const g = gate.current;
      if (!g || !msg) return;
      const geo = geometryOf(msg, stepRef.current, handsOnRef.current, clipRef.current);
      g.update(geo, flatten(geo), msg.animating);
      evaluate();
    },
    [evaluate],
  );

  // One gate for the overlay's life; a new document or a new step resets it (hidden until ready).
  useEffect(() => {
    gate.current = new SpotlightGate<Geometry>(() => performance.now());
    return () => window.clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (!handle) return;
    gate.current?.reset();
    feed(handle.lastRects);
    const offRects = handle.onRects(feed);
    const offViewport = handle.onViewport(() => {
      gate.current?.disturb();
      evaluate();
    });
    let hideTimer = 0;
    const offCue = handle.onCue((cue: Cue) => {
      if (cue.kind === "cursor") {
        setCursor({ at: cue.to, visible: true });
        window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => setCursor((c) => ({ ...c, visible: false })), cue.ms + 1500);
      } else if (cue.kind === "ripple") {
        setCursor({ at: cue.at, visible: true });
        setRipple({ at: cue.at, key: Date.now() });
        window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => setCursor((c) => ({ ...c, visible: false })), 1500);
      } else if (cue.kind === "keycap" || cue.kind === "caption") {
        // The last keycap of a step stays up until the next step, so the speaker can point at it
        // while saying the bullet; the next cue replaces it.
        const text = cue.kind === "keycap" ? cue.label : cue.text;
        setCap({ text, key: Date.now() });
      }
    });
    return () => {
      offRects();
      offViewport();
      offCue();
      window.clearTimeout(hideTimer);
    };
  }, [handle, feed, evaluate]);

  // A new step: the previous step's boxes fade out, the held keycap clears, and the new step's
  // boxes wait for `ready` and the first settle after it.
  const stepId = step?.id;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCap(null);
    gate.current?.reset();
    feed(handle?.lastRects ?? null);
    evaluate();
  }, [stepId, handle, feed, evaluate]);

  useEffect(() => {
    gate.current?.setReady(ready);
    evaluate();
  }, [ready, stepId, handle, evaluate]);

  const geo = view.payload;
  const state = view.shown ? "shown" : "hidden";
  const viewport = geo?.viewport ?? { w: 0, h: 0 };

  return (
    <div className="overlay" aria-hidden="true" data-reduced={reducedMotion} data-hands-on={handsOn} data-motion={view.shown ? "settled" : "moving"} data-keycap={keycap}>
      {geo?.spots.map((s, i) => (
        <div className="overlay__layer" key={`spot:${i}`} style={holeMask(s.holes, viewport)}>
          <div className="overlay__spotlight" data-state={state} data-mode={s.inset ? "inset" : "ring"} style={boxStyle(s.r, s.inset)} />
        </div>
      ))}
      {geo?.focus ? (
        <div className="overlay__layer" style={holeMask(geo.focus.holes, viewport)}>
          <div className="overlay__focus" data-state={state} style={boxStyle(geo.focus.r, false)} />
        </div>
      ) : null}
      {geo?.callouts.map((c) => {
        const placed = placeCallout(c.side, c.r, viewport, c.text);
        return (
          <div className="overlay__layer" key={`${c.target}:${c.text}`} style={holeMask(c.holes, viewport)}>
            <div className="overlay__callout" data-side={placed.side} data-align={placed.align} data-state={state} style={placed.style}>
              <span className="overlay__callout-text">{c.text}</span>
            </div>
          </div>
        );
      })}
      {ripple ? <div className="overlay__ripple" key={ripple.key} style={aim(ripple.at)} /> : null}
      {!handsOn ? (
        <div className="overlay__cursor" data-visible={cursor.visible} style={cursor.at ? aim(cursor.at) : undefined}>
          <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
            <path d="M4 2 L4 22 L9.5 17.5 L13 26 L17 24.4 L13.6 16 L21 16 Z" fill="#000" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        </div>
      ) : null}
      {cap && !handsOn ? (
        <p className="overlay__keycap" key={cap.key}>
          {cap.text}
        </p>
      ) : null}
    </div>
  );
}

const ZERO: Radii = [0, 0, 0, 0];
/** The ring's full extent outside the target; closer to an edge than this, it insets. */
const RING_EXTENT = 9;

function geometryOf(msg: RectsMessage, step: Step | undefined, handsOn: boolean, clipBottom?: number): Geometry {
  const vp = msg.viewport;
  const layers = msg.layers ?? [];
  // A docked drawer ends the spotlight area: the ring is clipped and drawn inside above it.
  const area = clipBottom ? { w: vp.w, h: Math.min(vp.h, clipBottom) } : vp;
  const sourced = (step?.spotlight ?? []).flatMap((sel) => (msg.rects[sel] ?? []).map((r) => ({ r, sels: [sel] })));
  const spots = mergeRects(sourced).map(({ r, sels }) => {
    const spot = clipBottom && r.y >= clipBottom ? { r, inset: false } : fitToViewport(r, area);
    return { ...spot, holes: holesAbove(layers, ownLayer(layers, (l) => sels.some((s) => l.owns.includes(s))), spot.r) };
  });
  const callouts = (step?.callouts ?? []).flatMap((c) => {
    const r = msg.rects[c.target]?.[0];
    return r ? [{ target: c.target, text: c.text, side: c.side, r, holes: holesAbove(layers, ownLayer(layers, (l) => l.owns.includes(c.target))) }] : [];
  });
  const focus = msg.focus && !msg.focusVisibleNative && !handsOn ? { r: msg.focus, holes: holesAbove(layers, ownLayer(layers, (l) => l.focus), msg.focus) } : null;
  return { spots, callouts, focus, layers: layers.map(({ x, y, w, h, radii }) => ({ x, y, w, h, radii })), viewport: vp };
}

function flatten(g: Geometry): Rect[] {
  return [...g.spots.map((s) => s.r), ...g.callouts.map((c) => c.r), ...(g.focus ? [g.focus.r] : []), ...g.layers];
}

/**
 * Top-layer occlusion. A box belongs to the highest layer that holds its target
 * (or -1, the page); every layer opened above that paints over the box, as it paints over the
 * target, so the box gets a hole there. A box that marks a popover or something inside it is
 * never cut by that popover.
 */
function ownLayer(layers: Layer[], holds: (l: Layer) => boolean): number {
  return layers.reduce((z, l) => (holds(l) && l.z > z ? l.z : z), -1);
}
function holesAbove(layers: Layer[], z: number, near?: Rect): Rect[] {
  return layers
    .filter((l) => l.z > z && (!near || (l.x < near.x + near.w + RING_EXTENT && near.x - RING_EXTENT < l.x + l.w && l.y < near.y + near.h + RING_EXTENT && near.y - RING_EXTENT < l.y + l.h)))
    .map(({ x, y, w, h, radii }) => ({ x, y, w, h, radii }));
}

/** How far the hole mask reaches past the frame on each side, in frame px. */
const MASK_BLEED = 64;

/**
 * A mask for a box's wrapper that is opaque everywhere except the holes (each with its layer's
 * four radii). The wrapper covers the overlay, so the box keeps its coordinates and its opacity
 * fade; the mask only changes while the gate holds the boxes hidden.
 */
function holeMask(holes: Rect[], vp: { w: number; h: number }): React.CSSProperties | undefined {
  if (!holes.length || !vp.w || !vp.h) return undefined;
  const m = MASK_BLEED;
  const w = vp.w + 2 * m;
  const h = vp.h + 2 * m;
  const d = holes.map(roundedRectPath).join(" ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${-m} ${-m} ${w} ${h}"><defs><mask id="m" maskUnits="userSpaceOnUse" x="${-m}" y="${-m}" width="${w}" height="${h}"><rect x="${-m}" y="${-m}" width="${w}" height="${h}" fill="#fff"/><path d="${d}" fill="#000"/></mask></defs><rect x="${-m}" y="${-m}" width="${w}" height="${h}" fill="#fff" mask="url(#m)"/></svg>`;
  const image = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return { maskImage: image, maskSize: `${w}px ${h}px`, maskPosition: `${-m}px ${-m}px`, maskRepeat: "no-repeat" };
}

function roundedRectPath(r: Rect): string {
  const [tl, tr, br, bl] = r.radii ?? ZERO;
  const { x, y, w, h } = r;
  const n = (v: number) => Math.round(v * 100) / 100;
  return [
    `M${n(x + tl)} ${n(y)}`,
    `H${n(x + w - tr)}`,
    tr ? `A${n(tr)} ${n(tr)} 0 0 1 ${n(x + w)} ${n(y + tr)}` : "",
    `V${n(y + h - br)}`,
    br ? `A${n(br)} ${n(br)} 0 0 1 ${n(x + w - br)} ${n(y + h)}` : "",
    `H${n(x + bl)}`,
    bl ? `A${n(bl)} ${n(bl)} 0 0 1 ${n(x)} ${n(y + h - bl)}` : "",
    `V${n(y + tl)}`,
    tl ? `A${n(tl)} ${n(tl)} 0 0 1 ${n(x + tl)} ${n(y)}` : "",
    "Z",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Inset mode: a ring that would cross the frame's edge is clipped to the viewport and
 * drawn inside the target; clipped sides get square corners.
 */
function fitToViewport(r: Rect, vp: { w: number; h: number }): Omit<Spot, "holes"> {
  if (!vp.w || !vp.h) return { r, inset: false };
  const near = r.x < RING_EXTENT || r.y < RING_EXTENT || r.x + r.w > vp.w - RING_EXTENT || r.y + r.h > vp.h - RING_EXTENT;
  if (!near) return { r, inset: false };
  const x = Math.max(r.x, 0);
  const y = Math.max(r.y, 0);
  const w = Math.max(Math.min(r.x + r.w, vp.w) - x, 0);
  const h = Math.max(Math.min(r.y + r.h, vp.h) - y, 0);
  const [tl, tr, br, bl] = r.radii ?? ZERO;
  const top = r.y < 0;
  const bottom = r.y + r.h > vp.h;
  const left = r.x < 0;
  const right = r.x + r.w > vp.w;
  const radii: Radii = [top || left ? 0 : tl, top || right ? 0 : tr, bottom || right ? 0 : br, bottom || left ? 0 : bl];
  return { r: { x, y, w, h, radii }, inset: true };
}

/** Left, top, size and the per-corner radii of the box, its ring and its halo. */
function boxStyle(r: Rect, inset: boolean): React.CSSProperties {
  const radii = r.radii ?? ZERO;
  const names = ["tl", "tr", "br", "bl"] as const;
  const style: Record<string, string | number> = { left: r.x, top: r.y, width: r.w, height: r.h };
  names.forEach((n, i) => {
    const v = radii[i];
    style[`--r-${n}`] = `${v}px`;
    style[`--halo-${n}`] = inset ? `${Math.max(v - 3, 0)}px` : `${v ? v + 4 : 0}px`;
    style[`--ring-${n}`] = inset ? `${v}px` : `${v ? v + 7 : 0}px`;
    style[`--focus-${n}`] = `${v ? v + 4 : 0}px`;
  });
  return style as React.CSSProperties;
}

/** The cursor tip lands near the bottom right of a target, not on its label. */
function aim(r: Rect): React.CSSProperties {
  return { left: r.x + Math.max(r.w - 12, r.w / 2), top: r.y + Math.max(r.h - 8, r.h / 2) };
}

/**
 * Spotlights within 12 frame px of each other merge into one box; the union
 * takes the radii of its largest member by area.
 */
function mergeRects(list: { r: Rect; sels: string[] }[]): { r: Rect; sels: string[] }[] {
  const out: { r: Rect; area: number; sels: string[] }[] = [];
  for (const { r, sels } of list) {
    const near = out.findIndex(({ r: o }) => r.x <= o.x + o.w + 12 && o.x <= r.x + r.w + 12 && r.y <= o.y + o.h + 12 && o.y <= r.y + r.h + 12);
    const area = r.w * r.h;
    if (near === -1) {
      out.push({ r: { ...r, radii: r.radii ?? ZERO }, area, sels });
      continue;
    }
    const o = out[near];
    const x = Math.min(o.r.x, r.x);
    const y = Math.min(o.r.y, r.y);
    const radii = area > o.area ? (r.radii ?? ZERO) : o.r.radii;
    out[near] = { r: { x, y, w: Math.max(o.r.x + o.r.w, r.x + r.w) - x, h: Math.max(o.r.y + o.r.h, r.y + r.h) - y, radii }, area: Math.max(area, o.area), sels: [...o.sels, ...sels] };
  }
  return out.map(({ r, sels }) => ({ r, sels }));
}

type CalloutSide = "top" | "right" | "bottom" | "left";

/**
 * Places a callout on the side it asks for, or the first side where it fits (then above, below,
 * the opposite side), and clamps it inside the frame viewport with an 8 px margin, so no callout
 * ever leaves the frame. Its size is estimated from the text: 19 px bold, padding
 * 6 by 12. Above or below a side target, it aligns with that edge so the leader points at it.
 */
function placeCallout(side: CalloutSide, r: Rect, vp: { w: number; h: number }, text: string): { side: CalloutSide; align: "center" | "start" | "end"; style: React.CSSProperties } {
  const gap = 28;
  const m = 8;
  const W = Math.round(text.length * 10.6 + 24);
  const H = 35;
  const vw = vp.w || 10000;
  const vh = vp.h || 10000;
  const fits = (s: CalloutSide) =>
    s === "right" ? r.x + r.w + gap + W <= vw - m : s === "left" ? r.x - gap - W >= m : s === "top" ? r.y - gap - H >= m : r.y + r.h + gap + H <= vh - m;
  const opposite: Record<CalloutSide, CalloutSide> = { top: "bottom", bottom: "top", left: "right", right: "left" };
  const order: CalloutSide[] = [side, "top", "bottom", opposite[side]];
  const chosen = order.find(fits) ?? side;
  const clampX = (x: number) => Math.min(Math.max(x, m), vw - m - W);
  const clampY = (y: number) => Math.min(Math.max(y, m), vh - m - H);
  let left: number;
  let top: number;
  let align: "center" | "start" | "end" = "center";
  if (chosen === "top" || chosen === "bottom") {
    top = chosen === "top" ? r.y - gap - H : r.y + r.h + gap;
    // A callout that wanted the right or left side keeps to that edge of the target.
    if (side === "right") {
      left = r.x + r.w - W;
      align = "end";
    } else if (side === "left") {
      left = r.x;
      align = "start";
    } else left = r.x + r.w / 2 - W / 2;
  } else {
    left = chosen === "right" ? r.x + r.w + gap : r.x - gap - W;
    top = r.y + r.h / 2 - H / 2;
  }
  return { side: chosen, align, style: { left: clampX(left), top: clampY(top), minWidth: W, boxSizing: "border-box", textAlign: "center" } };
}
