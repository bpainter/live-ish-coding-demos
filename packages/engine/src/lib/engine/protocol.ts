import type { Action } from "../../schema/demo";

/** Protocol version. Both directions carry it; any other version is rejected. */
export const PROTOCOL_VERSION = 2;

/** Corner radii in frame px, clockwise from the top left. */
export type Radii = [tl: number, tr: number, br: number, bl: number];
/** Rectangles are frame CSS pixels. */
export type Rect = { x: number; y: number; w: number; h: number; radii: Radii };
/**
 * A top-layer element (open popover, modal dialog, fullscreen) in the frame. `z` is its opening
 * order, `owns` the watched selectors that match it or a descendant, `focus` whether it holds the
 * focused element. The overlay keeps boxes from drawing over a layer above their own target.
 */
export type Layer = Rect & { z: number; owns: string[]; focus: boolean };
export type Flags = Record<string, boolean>;
export type RunMode = "animated" | "instant";
export type Cursor = { step: number; action: number };

export interface Pace {
  glideMs: number;
  rippleMs: number;
  charMs: number;
  resizeMs: number;
  revealMs: number;
}
export const DEFAULT_PACE: Pace = { glideMs: 420, rippleMs: 260, charMs: 45, resizeMs: 700, revealMs: 250 };

export interface AssertResult {
  stepId: string;
  index: number;
  target: string;
  expect: string;
  pass: boolean;
  actual: string;
}

export type ErrorCode = "selector-not-found" | "via-unsupported" | "hook-missing" | "assert-failed" | "exception" | "timeout" | "flag-unknown";

export type Cue =
  | { kind: "cursor"; to: Rect; ms: number }
  | { kind: "ripple"; at: Rect }
  | { kind: "keycap"; label: string; ms: number }
  | { kind: "caption"; text: string; ms: number };

export type ToRuntime =
  | { v: 2; type: "init"; frameId: string; handsOn: boolean; reducedMotion: boolean; pace: Pace; flags: Flags }
  | { v: 2; type: "run-step"; frameId: string; runId: number; stepId: string; actions: Action[]; mode: RunMode; startAt: number }
  | { v: 2; type: "replay-to"; frameId: string; runId: number; steps: { stepId: string; actions: Action[] }[]; from: Cursor }
  | { v: 2; type: "finish"; frameId: string; runId: number }
  | { v: 2; type: "reset"; frameId: string }
  | { v: 2; type: "set-flag"; frameId: string; flag: string; on: boolean }
  | { v: 2; type: "set-mode"; frameId: string; handsOn: boolean }
  | { v: 2; type: "set-live"; frameId: string; on: boolean }
  | { v: 2; type: "watch"; frameId: string; selectors: string[]; live: boolean }
  /** Answers `focus-request`, posted from a task carrying the presenter's press (input-relay.ts). */
  | { v: 2; type: "focus-grant"; frameId: string };

export type FromRuntime =
  | { v: 2; type: "ready"; frameId: string | null; build: string; url: string; title: string; supports: Record<string, boolean>; hooks: string[]; flags: Flags }
  | { v: 2; type: "rects"; frameId: string; seq: number; viewport: { w: number; h: number }; rects: Record<string, Rect[]>; focus: Rect | null; focusVisibleNative: boolean; animating: boolean; layers?: Layer[] }
  | { v: 2; type: "cue"; frameId: string; runId: number; index: number; cue: Cue }
  | { v: 2; type: "unloading"; frameId: string; runId: number; cursor: Cursor }
  | { v: 2; type: "step-done"; frameId: string; runId: number; stepId: string; asserts: AssertResult[]; digest: string; ms: number; finished: boolean }
  | { v: 2; type: "error"; frameId: string; runId?: number; code: ErrorCode; message: string; action?: number; selector?: string; ids?: string[] }
  | { v: 2; type: "key"; frameId: string; key: string; shift: boolean; alt: boolean; meta: boolean; ctrl: boolean }
  | { v: 2; type: "resize-viewport"; frameId: string; inlineSize: string; ms: number }
  /** A focus() in the frame did not take during a run. */
  | { v: 2; type: "focus-request"; frameId: string; runId?: number };

let warnedVersion = false;
const FROM_TYPES = new Set(["ready", "rects", "cue", "unloading", "step-done", "error", "key", "resize-viewport", "focus-request"]);

/**
 * Strict enough for a trusted-origin message: version 2, a known type, and a string or null frame
 * id. A version 1 message (a stale cached runtime) is rejected and logged once, so it fails loudly.
 */
export function parseFromRuntime(data: unknown): FromRuntime | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.type !== "string" || !FROM_TYPES.has(d.type)) return null;
  if (d.v !== PROTOCOL_VERSION) {
    if (typeof d.v === "number" && !warnedVersion) {
      warnedVersion = true;
      console.error(`Frame runtime speaks protocol v${String(d.v)}; the presenter needs v${PROTOCOL_VERSION}. Reload the frame to fetch the current runtime.`);
    }
    return null;
  }
  if (!(typeof d.frameId === "string" || d.frameId === null)) return null;
  return d as unknown as FromRuntime;
}
