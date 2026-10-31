import type { Action, Step } from "../../schema/demo";
import { notePress, withInput } from "./input-relay";
import { DEFAULT_PACE, parseFromRuntime, type AssertResult, type Cursor, type Cue, type Flags, type FromRuntime, type Layer, type Rect, type RunMode, type ToRuntime } from "./protocol";

export interface StepResult {
  asserts: AssertResult[];
  digest: string;
  ms: number;
  finished: boolean;
}

export interface StepRun {
  runId: number;
  readonly playing: boolean;
  finish(): void;
  cancel(): void;
  done: Promise<StepResult>;
}

export interface RectsMessage {
  rects: Record<string, Rect[]>;
  focus: Rect | null;
  focusVisibleNative: boolean;
  viewport: { w: number; h: number };
  /** A finite animation or transition is running in the document. */
  animating: boolean;
  /** Top-layer elements, in opening order; empty from a runtime that does not report them. */
  layers: Layer[];
}

type Listener<T> = (value: T) => void;

let nextFrameId = 1;
let nextRunId = 1;

/** Handles keyed by the iframe's WindowProxy, which survives in-frame navigations. */
const bySource = new Map<Window, FrameHandle>();
/**
 * Handles keyed by frame id: a message posted while a document unloads (`unloading` from
 * `pagehide`) is delivered after its window is gone, with a null `source`, so it is routed by the
 * id the runtime stamps on every message after `init`.
 */
const byId = new Map<string, FrameHandle>();
let routerInstalled = false;

function installRouter() {
  if (routerInstalled || typeof window === "undefined") return;
  routerInstalled = true;
  window.addEventListener("message", (e) => {
    const msg = parseFromRuntime(e.data);
    if (!msg) return;
    let frame = e.source ? bySource.get(e.source as Window) : undefined;
    if (!frame && !e.source && msg.frameId) frame = byId.get(msg.frameId);
    if (!frame || e.origin !== frame.expectedOrigin) return;
    if (msg.frameId !== null && msg.frameId !== frame.id) return;
    frame.receive(msg);
  });
}

export interface FrameHandleOptions {
  expectedOrigin: string;
  handsOn: boolean;
  reducedMotion: boolean;
  flags: Flags;
}

/**
 * One iframe instance and its runtime. The handle sends `init` on every `ready`
 * (the document may navigate), tracks the current run, and resumes it after an unload.
 */
export class FrameHandle {
  readonly id = `f${nextFrameId++}`;
  readonly expectedOrigin: string;
  readonly iframe: HTMLIFrameElement;
  private opts: FrameHandleOptions;
  private readyResolvers: Array<() => void> = [];
  private isReady = false;
  private run: { runId: number; stepId: string; mode: RunMode; actions: Action[]; resolve: (r: StepResult) => void; playing: boolean; steps?: { stepId: string; actions: Action[] }[] } | null = null;
  /** The handle is gone: no run on it can play again. */
  private disposed = false;
  private pendingResume: { kind: "run" | "replay"; cursor: Cursor } | null = null;
  private watched: string[] = [];
  private live = false;
  supports: Record<string, boolean> = {};
  hooks: string[] = [];
  lastRects: RectsMessage | null = null;
  private rectListeners = new Set<Listener<RectsMessage>>();
  private cueListeners = new Set<Listener<Cue>>();
  private errorListeners = new Set<Listener<Extract<FromRuntime, { type: "error" }>>>();
  private keyListeners = new Set<Listener<Extract<FromRuntime, { type: "key" }>>>();
  private viewportListeners = new Set<Listener<{ inlineSize: string; ms: number }>>();
  private readyListeners = new Set<Listener<void>>();

  constructor(iframe: HTMLIFrameElement, opts: FrameHandleOptions) {
    this.iframe = iframe;
    this.opts = opts;
    this.expectedOrigin = opts.expectedOrigin;
    installRouter();
    byId.set(this.id, this);
    if (iframe.contentWindow) bySource.set(iframe.contentWindow, this);
    iframe.addEventListener("load", () => {
      if (iframe.contentWindow) bySource.set(iframe.contentWindow, this);
    });
  }

  get ready(): Promise<void> {
    if (this.isReady) return Promise.resolve();
    return new Promise((resolve) => this.readyResolvers.push(resolve));
  }

  private post(msg: ToRuntime) {
    this.iframe.contentWindow?.postMessage(msg, this.expectedOrigin);
  }

  receive(msg: FromRuntime) {
    switch (msg.type) {
      case "ready": {
        this.supports = msg.supports;
        this.hooks = msg.hooks;
        this.post({ v: 2, type: "init", frameId: this.id, handsOn: this.opts.handsOn, reducedMotion: this.opts.reducedMotion, pace: DEFAULT_PACE, flags: this.opts.flags });
        if (this.watched.length) this.post({ v: 2, type: "watch", frameId: this.id, selectors: this.watched, live: this.live });
        this.isReady = true;
        this.readyResolvers.splice(0).forEach((r) => r());
        this.readyListeners.forEach((l) => l());
        // A document that navigated mid-run continues where the old one stopped.
        if (this.pendingResume && this.run) {
          const resume = this.pendingResume;
          this.pendingResume = null;
          if (resume.kind === "run") this.post({ v: 2, type: "run-step", frameId: this.id, runId: this.run.runId, stepId: this.run.stepId, actions: this.run.actions, mode: this.run.mode, startAt: resume.cursor.action });
          else this.post({ v: 2, type: "replay-to", frameId: this.id, runId: this.run.runId, steps: this.run.steps ?? [], from: resume.cursor });
        }
        return;
      }
      case "rects":
        this.lastRects = { rects: msg.rects, focus: msg.focus, focusVisibleNative: msg.focusVisibleNative, viewport: msg.viewport, animating: msg.animating, layers: msg.layers ?? [] };
        this.rectListeners.forEach((l) => l(this.lastRects!));
        return;
      case "cue":
        if (this.run && msg.runId === this.run.runId) this.cueListeners.forEach((l) => l(msg.cue));
        return;
      case "unloading":
        if (this.run && msg.runId === this.run.runId) {
          this.pendingResume = { kind: this.run.steps ? "replay" : "run", cursor: msg.cursor };
          this.isReady = false;
        }
        return;
      case "step-done":
        if (this.run && msg.runId === this.run.runId) {
          const r = this.run;
          this.run = null;
          r.playing = false;
          r.resolve({ asserts: msg.asserts, digest: msg.digest, ms: msg.ms, finished: msg.finished });
        }
        return;
      case "error":
        this.errorListeners.forEach((l) => l(msg));
        return;
      case "key":
        // The frame forwards a real press; keep it for a fresh document's replay (input-relay.ts).
        // Tab and Escape come up too in scripted mode; the stage decides what they do.
        notePress();
        this.keyListeners.forEach((l) => l(msg));
        return;
      case "resize-viewport":
        this.viewportListeners.forEach((l) => l({ inlineSize: msg.inlineSize, ms: msg.ms }));
        return;
      case "focus-request":
        // A focus() the page made after a fetch did not take in WebKit. The grant
        // goes out on the press's timer chain while it is open, so the runtime's second try carries
        // the press; without one it goes now and the try fails as the first did.
        withInput(() => {
          if (!this.disposed) this.post({ v: 2, type: "focus-grant", frameId: this.id });
        });
        return;
    }
  }

  /**
   * A run this handle no longer tracks can never hear its `step-done`: settle it, so nothing waits
   * on it or reports it playing.
   */
  private settle(run: NonNullable<FrameHandle["run"]> | null) {
    if (!run) return;
    run.playing = false;
    run.resolve({ asserts: [], digest: "", ms: 0, finished: false });
  }

  /** Plays one step; animated or instant. Resolves on `step-done`. */
  runStep(step: Step, mode: RunMode, startAt = 0): StepRun {
    const runId = nextRunId++;
    let resolve!: (r: StepResult) => void;
    const done = new Promise<StepResult>((r) => (resolve = r));
    const run = { runId, stepId: step.id, mode, actions: step.actions, resolve, playing: !this.disposed };
    if (this.disposed) {
      resolve({ asserts: [], digest: "", ms: 0, finished: false });
    } else {
      if (this.run) this.settle(this.run);
      this.run = run;
    }
    // A finish asked for before the run reached the frame (a press during the code lead, or while
    // the document loads) is posted right after the run, never ahead of it: the runtime drops a
    // finish for a run it has not started.
    let posted = false;
    let finishAsked = false;
    const postFinish = () => this.post({ v: 2, type: "finish", frameId: this.id, runId });
    void this.ready.then(() => {
      if (this.run !== run) return;
      this.post({ v: 2, type: "run-step", frameId: this.id, runId, stepId: step.id, actions: step.actions, mode, startAt });
      posted = true;
      if (finishAsked) postFinish();
    });
    return {
      runId,
      get playing() {
        return run.playing;
      },
      finish: () => {
        finishAsked = true;
        if (posted) postFinish();
      },
      cancel: () => {
        if (this.run === run) this.run = null;
        run.playing = false;
        resolve({ asserts: [], digest: "", ms: 0, finished: false });
      },
      done,
    };
  }

  /** Replays `steps` instantly from a fresh document. */
  replayTo(steps: Step[], from: Cursor = { step: 0, action: 0 }): Promise<StepResult> {
    const runId = nextRunId++;
    return new Promise<StepResult>((resolve) => {
      const list = steps.map((s) => ({ stepId: s.id, actions: s.actions }));
      if (this.disposed) return resolve({ asserts: [], digest: "", ms: 0, finished: false });
      if (this.run) this.settle(this.run);
      this.run = { runId, stepId: steps[steps.length - 1]?.id ?? "s0", mode: "instant", actions: [], resolve, playing: true, steps: list };
      // Posted in the caller's task when the frame is ready, so a press it carries reaches the frame.
      const post = () => {
        if (!this.run || this.run.runId !== runId) return;
        this.post({ v: 2, type: "replay-to", frameId: this.id, runId, steps: list, from });
      };
      if (this.isReady) post();
      else void this.ready.then(post);
    });
  }

  setFlag(flag: string, on: boolean) {
    this.post({ v: 2, type: "set-flag", frameId: this.id, flag, on });
  }
  setMode(handsOn: boolean) {
    this.opts.handsOn = handsOn;
    this.post({ v: 2, type: "set-mode", frameId: this.id, handsOn });
  }
  reset() {
    this.post({ v: 2, type: "reset", frameId: this.id });
  }
  setLive(on: boolean) {
    this.post({ v: 2, type: "set-live", frameId: this.id, on });
  }
  watch(selectors: string[], live: boolean) {
    this.watched = selectors;
    this.live = live;
    if (this.isReady) this.post({ v: 2, type: "watch", frameId: this.id, selectors, live });
  }
  /** In or out of the window's tab order. */
  setTabbable(on: boolean) {
    this.iframe.tabIndex = on ? 0 : -1;
  }
  focus() {
    this.iframe.focus();
    try {
      this.iframe.contentWindow?.focus();
    } catch {
      /* cross-origin focus is still allowed, but be safe */
    }
  }

  onRects(cb: Listener<RectsMessage>) {
    this.rectListeners.add(cb);
    return () => this.rectListeners.delete(cb);
  }
  onCue(cb: Listener<Cue>) {
    this.cueListeners.add(cb);
    return () => this.cueListeners.delete(cb);
  }
  onError(cb: Listener<Extract<FromRuntime, { type: "error" }>>) {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }
  onKey(cb: Listener<Extract<FromRuntime, { type: "key" }>>) {
    this.keyListeners.add(cb);
    return () => this.keyListeners.delete(cb);
  }
  onViewport(cb: Listener<{ inlineSize: string; ms: number }>) {
    this.viewportListeners.add(cb);
    return () => this.viewportListeners.delete(cb);
  }
  onReady(cb: Listener<void>) {
    this.readyListeners.add(cb);
    return () => this.readyListeners.delete(cb);
  }

  /** True once the handle's frame is removed. */
  get isDisposed() {
    return this.disposed;
  }

  dispose() {
    this.disposed = true;
    byId.delete(this.id);
    if (this.iframe.contentWindow) bySource.delete(this.iframe.contentWindow);
    // `playing` turns false before the run resolves: a disposed run reported playing forever, and
    // every Next then asked it to finish.
    const run = this.run;
    this.run = null;
    this.settle(run);
    this.iframe.remove();
  }
}
