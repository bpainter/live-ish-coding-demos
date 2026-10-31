"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, ViewTransition, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { PrefetchOptions } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PRESENTER_ONLY, actionForKey, isCharacterKey, isEditableTarget, isInteractiveTarget, type KeyAction } from "../../lib/keys";
import { chromePreview } from "../../lib/chrome-preview";
import { CHROME_THEME_IDS } from "../../lib/chrome-themes.generated";
import type { Mode } from "../../lib/mode";
import type { NavGroup } from "../../lib/nav";
import type { Field } from "../../schema/slide";
import { usePresenter } from "../../lib/presenter/context";
import { readerHref, slideHref } from "../../lib/presenter/url";
import { frameLive, frameUrl } from "../../lib/frames/origins";
import { rememberPillFocus, restorePillFocus } from "../../lib/focus-restore";
import type { StepResult } from "../../lib/engine/frame";
import { StageContext, type DemoStatus, type Playback, type StageState } from "../../lib/stage-context";
import { ReaderControls } from "../chrome/ReaderControls";
import { KeyboardHelp } from "../chrome/KeyboardHelp";
import { GotoDialog } from "../chrome/GotoDialog";
import { NavDrawer, isNavOpen } from "../chrome/NavDrawer";

const CANVAS = { width: 1920, height: 1080 };

/**
 * A full prefetch. `PrefetchKind` is internal to Next: the default ("auto", PPR)
 * fetches almost nothing for a `force-dynamic` page, and only "full" fetches the whole payload
 * (next/dist/client/components/segment-cache/prefetch.js `prefetchRoute`; the enum lives in
 * next/dist/client/components/router-reducer/router-reducer-types.js).
 */
const FULL_PREFETCH = { kind: "full" } as unknown as PrefetchOptions;

/** After Next asks a playing step to finish, a press this much later advances anyway. */
const STUCK_PLAYBACK_MS = 1500;

/**
 * The slide crossfade runs in the audience window and reader mode, never under
 * automation or capture, so walks, visuals and captures stay as they were. `?fade=0` turns it off;
 * `?fade=1` forces it on for the walk that tests it. Decided once per window, on the first client
 * render: `<ViewTransition>` renders no element, so the server's markup hydrates either way, and a
 * stable answer never remounts the canvas.
 */
let fadeDecision: boolean | null = null;
function fadeAllowed(): boolean {
  if (typeof window === "undefined") return false;
  if (fadeDecision === null) {
    const q = new URLSearchParams(window.location.search);
    const forced = q.get("fade");
    const automated = navigator.webdriver || q.get("capture") === "1" || document.documentElement.dataset.capture === "1";
    fadeDecision = forced === "1" ? true : forced === "0" ? false : !automated;
  }
  return fadeDecision;
}

/**
 * The last scale each kind of stage measured in this window. A stage that mounts on a slide change
 * starts at it, so its first paint is already scaled: the crossfade snapshots the new slide in that
 * paint, and an unscaled first frame would zoom for the length of the fade.
 * The first stage of a window writes no scale until it has measured, so the server's markup paints
 * at the CSS estimate in stage.css, and it measures before paint.
 */
const lastScale = new Map<string, number>();

/** The `?chrome=` preview this window found, so a stage that mounts on a slide change starts with it. */
let lastPreview: string | null = null;

/** Keys the page keeps for scrolling while the reader's text view replaces the stage. */
const TEXT_VIEW_SCROLL_KEYS = new Set([" ", "PageUp", "PageDown", "Home", "End"]);

/** Set by a drawer jump: the stage that mounts next takes focus. */
let focusOnArrival = false;

/** Elements sequential focus navigation can reach, in document order (frames excluded by the caller). */
function tabbables(): HTMLElement[] {
  const sel = 'a[href], area[href], button, input, select, textarea, iframe, summary, [tabindex], [contenteditable="true"]';
  return [...document.querySelectorAll<HTMLElement>(sel)].filter((el) => {
    if (el.tabIndex < 0 || (el as HTMLButtonElement).disabled || el.closest("[inert], dialog:not([open])")) return false;
    return typeof el.checkVisibility === "function" ? el.checkVisibility({ visibilityProperty: true }) : el.getClientRects().length > 0;
  });
}

/**
 * Reader mode, a Tab the frame forwarded: focus moves to the next tabbable element
 * after the frame in document order, or with Shift to the previous one before it, so the frame is
 * one tab stop. With nothing on that side, the stage takes focus.
 */
function focusPastFrame(frame: Element | null, back: boolean, fallback: () => void) {
  if (!frame) return fallback();
  const list = tabbables().filter((el) => el !== frame && !el.classList.contains("frame-warm"));
  const target = back ? list.filter((el) => frame.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING).at(-1) : list.find((el) => frame.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  if (!target) return fallback();
  // A keyboard move: the ring shows where the browser supports the option.
  target.focus({ preventScroll: true, focusVisible: true } as FocusOptions);
}

const decoded = new Map<string, Promise<void>>();
/** Fetches and decodes an image once per window: backgrounds, stills, posters. */
function decodeBackground(src: string): Promise<void> {
  let p = decoded.get(src);
  if (!p) {
    const img = new Image();
    img.src = src;
    p = img.decode().catch(() => {});
    decoded.set(src, p);
    // Merged, so a module reload in development never drops what this window already decoded.
    const w = window as unknown as { __decodedBackgrounds?: string[] };
    w.__decodedBackgrounds = [...new Set([...(w.__decodedBackgrounds ?? []), ...decoded.keys()])];
  }
  return p;
}

interface Props {
  slideId: string;
  slideIndex: number;
  total: number;
  prevId?: string;
  nextId?: string;
  firstId: string;
  lastId: string;
  slideIds: string[];
  /** Step count per slide, in `slideIds` order: a press during a slide change counts from the target. */
  slideSteps?: number[];
  /** The slide's background file, drawn by the stage under the slide. Optional, as every background is. */
  background?: string;
  /** The background as a CSS image (lib/assets.ts); `background` is the file the walk and the decode read. */
  backgroundCss?: string;
  /** A copy slide's field: the surfaces and ink its layout reads. */
  field?: Field;
  /** A demo slide's audience theme. Copy slides have none, and read --deck-* instead. */
  chrome?: string;
  /** `theme.grain`. The audience window draws it; other windows never do. */
  grain?: boolean;
  /** Font shorthands the neighbouring slides' themes use, fetched ahead so a slide change fetches nothing. */
  neighbourFonts?: string[];
  /** The previous and next slides' backgrounds, decoded ahead so no slide arrives without one. */
  neighbourBackgrounds: string[];
  /** Intro stills and posters the window shows after the next press. */
  neighbourAssets?: string[];
  /** The previous slide has more than one step, so Back lands on its last step. */
  prevHasSteps?: boolean;
  /** The navigation drawer's list and current link; null where no drawer renders. */
  nav?: { groups: NavGroup[]; currentId: string | null } | null;
  /** The page's steps (labels only), empty on other slides. */
  steps: { label: string }[];
  /** The page frame's route, for `o`. */
  frameRoute?: string;
  mode: Mode;
  canonicalPath?: string;
  embedded?: boolean;
  passive?: boolean;
  children: ReactNode;
}

interface LocalState {
  stepIndex: number;
  blank: boolean;
  handsOn: boolean;
  live: boolean;
}

function stepFromUrl(stepCount: number): number {
  const raw = new URLSearchParams(window.location.search).get("step");
  if (raw === null || stepCount === 0) return 0;
  if (raw === "last") return stepCount - 1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), stepCount - 1) : 0;
}

/**
 * Stage controller: canvas scaling, the keyboard map, step and mode state, URL
 * sync and announcements. In the presenter windows the state lives in the shared store instead of
 * here. Remounted per slide (keyed on slide id).
 */
export function Stage(props: Props) {
  const { slideId, slideIndex, total, prevId, nextId, prevHasSteps, firstId, lastId, slideIds, slideSteps = [], background, backgroundCss, field, chrome, grain: grainOn = true, neighbourFonts = [], neighbourBackgrounds, neighbourAssets = [], nav, steps, frameRoute, mode, canonicalPath, embedded, passive, children } = props;
  const router = useRouter();
  const presenter = usePresenter();
  const shared = Boolean(presenter) && !passive;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const touched = useRef(false);
  const playback = useRef<Playback | null>(null);
  const scaleKey = `${mode}:${embedded ? "embedded" : "full"}:${passive ? "passive" : "live"}`;
  const [scale, setScale] = useState<number | null>(() => lastScale.get(scaleKey) ?? null);
  const [local, setLocal] = useState<LocalState>({ stepIndex: 0, blank: false, handsOn: false, live: false });
  const localRef = useRef(local);
  const [reloadToken, setReloadToken] = useState(0);
  const [rehearsal, setRehearsal] = useState(false);
  const [demoStatus, setDemoStatusState] = useState<Record<string, DemoStatus>>({});
  const [stepResults, setStepResults] = useState<Record<string, { stepId: string; result: StepResult }>>({});
  const [helpOpen, setHelpOpen] = useState(false);
  const [gotoOpen, setGotoOpen] = useState(false);
  const [idle, setIdle] = useState(false);
  // `?chrome=<id>`. Pages are prerendered, so the query is read here, before paint on a client move.
  const [preview, setPreview] = useState<string | null>(lastPreview);
  useLayoutEffect(() => {
    const asked = chromePreview();
    lastPreview = asked && (CHROME_THEME_IDS as readonly string[]).includes(asked) ? asked : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreview(lastPreview);
  }, []);
  const theme = chrome ? (preview ?? chrome) : undefined;
  // Stable handles for callbacks the page frame depends on: the presenter object and `perform`
  // change on every store update, and a changed callback would remount the frame.
  const presenterRef = useRef(presenter);
  const performRef = useRef<(a: KeyAction) => void>(() => {});
  useEffect(() => {
    presenterRef.current = presenter;
  }, [presenter]);

  // ----- state source: shared store in presenter windows, local otherwise -----
  const stepCount = steps.length;
  const rawStep = shared ? presenter!.state.stepIndex : local.stepIndex;
  const stepIndex = rawStep < 0 ? Math.max(stepCount - 1, 0) : Math.min(rawStep, Math.max(stepCount - 1, 0));
  const blank = shared ? presenter!.state.blank : local.blank;
  const handsOn = shared ? presenter!.state.handsOn : local.handsOn;
  const live = shared ? presenter!.state.live : local.live;
  const stepsFirst = stepCount > 0;

  const patch = useCallback(
    (p: Partial<LocalState>) => {
      touched.current = true;
      if (shared) presenter!.update(p);
      else {
        localRef.current = { ...localRef.current, ...p };
        setLocal((l) => ({ ...l, ...p }));
      }
    },
    [shared, presenter],
  );
  const current = useCallback(() => {
    const s = shared ? presenter!.getState() : localRef.current;
    const idx = s.stepIndex < 0 ? Math.max(stepCount - 1, 0) : Math.min(s.stepIndex, Math.max(stepCount - 1, 0));
    return { stepIndex: idx, stepCount };
  }, [shared, presenter, stepCount]);
  const setStepIndex = useCallback((n: number) => patch({ stepIndex: Math.min(Math.max(n, 0), Math.max(stepCount - 1, 0)) }), [patch, stepCount]);
  const setDemoStatus = useCallback(
    (id: string, status: DemoStatus) => {
      setDemoStatusState((s) => (s[id] === status ? s : { ...s, [id]: status }));
      if (shared && mode === "audience") presenterRef.current?.reportHealth(id, status);
    },
    [shared, mode],
  );
  const setStepResult = useCallback((pageId: string, stepId: string, result: StepResult) => {
    setStepResults((s) => ({ ...s, [pageId]: { stepId, result } }));
    // Rehearsal tooling and the walk read the latest result here.
    const w = window as unknown as { __stepResults?: Record<string, unknown>; __stepSeq?: number };
    w.__stepSeq = (w.__stepSeq ?? 0) + 1;
    w.__stepResults = { ...(w.__stepResults ?? {}), [`${pageId}:${stepId}`]: { ...result, seq: w.__stepSeq } };
  }, []);
  const playState = useRef({ slideId, stepIndex });
  // A layout effect: it runs before the page frame's entry effect reports the step playing, so
  // the speaker hears the new step's index, not the previous one's.
  useLayoutEffect(() => {
    playState.current = { slideId, stepIndex };
  }, [slideId, stepIndex]);
  /** When Next first asked the playing step to finish, for the stuck-playback watchdog. */
  const finishAsked = useRef<{ stepIndex: number; at: number } | null>(null);
  const reportPlaying = useCallback(
    (playing: boolean) => {
      if (!playing) finishAsked.current = null;
      if (shared && mode === "audience") presenterRef.current?.reportPlayback({ ...playState.current, playing });
    },
    [shared, mode],
  );
  const registerPlayback = useCallback((p: Playback | null) => {
    playback.current = p;
  }, []);

  // A shared "-1" step means "land on the last step"; resolve it once the step count is known. Only
  // the stage that shows the target slide resolves it: the outgoing stage still renders while the
  // next one loads, and its step count is the wrong one.
  const sharedSlideId = shared ? presenter!.state.slideId : null;
  const sharedStep = shared ? presenter!.state.stepIndex : null;
  useEffect(() => {
    if (shared && sharedStep === -1 && sharedSlideId === slideId) presenterRef.current!.update({ stepIndex: Math.max(stepCount - 1, 0) });
  }, [shared, sharedStep, sharedSlideId, slideId, stepCount]);

  // A reset written to the shared state (`r` or Reset step in either window) replays this stage's
  // frame once, when it shows the slide the reset was made on. A stage mounting later ignores the
  // value it starts with.
  const sharedReset = shared ? (presenter!.state.resetSeq ?? 0) : 0;
  const seenReset = useRef(sharedReset);
  useEffect(() => {
    if (!shared || sharedReset === seenReset.current) return;
    seenReset.current = sharedReset;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (sharedSlideId === slideId) setReloadToken((n) => n + 1);
  }, [shared, sharedReset, sharedSlideId, slideId]);

  // ----- rehearsal: 95th percentile frame time -----
  const [p95, setP95] = useState<number | null>(null);
  useEffect(() => {
    if (!rehearsal) return;
    const deltas: number[] = [];
    let last = performance.now();
    let raf = 0;
    let n = 0;
    const tick = (t: number) => {
      deltas.push(t - last);
      last = t;
      if (deltas.length > 600) deltas.shift();
      if (++n % 30 === 0 && deltas.length > 30) {
        const sorted = [...deltas].sort((a, b) => a - b);
        setP95(Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rehearsal]);

  // ----- canvas scaling -----
  // Measured before paint, and remembered for the next stage of the same kind (see `lastScale`).
  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      const next = Math.min(r.width / CANVAS.width, r.height / CANVAS.height);
      if (next > 0) lastScale.set(scaleKey, next);
      setScale(next);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    document.addEventListener("fullscreenchange", update);
    return () => {
      ro.disconnect();
      document.removeEventListener("fullscreenchange", update);
    };
  }, [scaleKey]);

  // ----- reader mode: restore step from the URL, canonicalise `/` -----
  useEffect(() => {
    if (shared || passive) return;
    const restored = stepFromUrl(stepCount);
    localRef.current = { ...localRef.current, stepIndex: restored };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocal((l) => ({ ...l, stepIndex: restored }));
    const url = new URL(window.location.href);
    if (canonicalPath && url.pathname !== canonicalPath) url.pathname = canonicalPath;
    if (restored > 0) url.searchParams.set("step", String(restored));
    else url.searchParams.delete("step");
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
  }, [shared, passive, canonicalPath, stepCount]);

  // Tell the presenter store which slide this page rendered.
  useEffect(() => {
    if (shared) presenter!.setRenderedSlide(slideId);
  }, [shared, presenter, slideId]);

  // Reader mode: keep `?step=` in the URL after a user change.
  useEffect(() => {
    if (passive || !touched.current || shared) return;
    const url = new URL(window.location.href);
    if (stepIndex > 0) url.searchParams.set("step", String(stepIndex));
    else url.searchParams.delete("step");
    window.history.replaceState(null, "", url);
  }, [passive, shared, stepIndex]);

  // Reader controls fade out after a short idle period. Keys a frame forwards and the pointer
  // reaching the pill wake them too: events inside a frame never reach this window.
  const wakeRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (mode !== "reader") return;
    let timer = window.setTimeout(() => setIdle(true), 2500);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), 2500);
    };
    wakeRef.current = wake;
    window.addEventListener("pointermove", wake);
    window.addEventListener("keydown", wake);
    return () => {
      wakeRef.current = () => {};
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [mode]);
  const wake = useCallback(() => wakeRef.current(), []);

  // Prefetch the neighbours in full, at the exact URLs a press navigates to, so the
  // press starts no page or RSC request. The presenter windows keep their other parameters.
  useEffect(() => {
    if (passive) return;
    const hrefs = shared ? [prevId, nextId].flatMap((id) => (id ? [slideHref(id)] : [])) : [...(prevId ? [readerHref(prevId, { last: prevHasSteps })] : []), ...(nextId ? [readerHref(nextId)] : [])];
    for (const href of hrefs) router.prefetch(href, FULL_PREFETCH);
  }, [passive, shared, router, prevId, nextId, prevHasSteps]);

  const go = useCallback(
    (id: string | undefined, step?: "last") => {
      if (!id) return;
      touched.current = true;
      if (shared) {
        const p = presenter!;
        const startTimer = slideIndex === 1 && p.state.startedAt === null && id === nextId;
        p.update({ slideId: id, stepIndex: step === "last" ? -1 : 0, ...(startTimer ? { startedAt: Date.now(), pausedAt: null } : {}) });
      } else {
        // Back lands on the last step; a slide with one step has no other, and the bare URL is the prefetched one.
        // The pill button that had focus gets it back on the next slide.
        rememberPillFocus();
        router.push(readerHref(id, { last: step === "last" && (id !== prevId || prevHasSteps) }));
      }
    },
    [shared, presenter, router, slideIndex, nextId, prevId, prevHasSteps],
  );

  const toggleTimer = useCallback(() => {
    if (!shared) return;
    const { startedAt, pausedAt } = presenter!.state;
    const now = Date.now();
    if (startedAt === null) presenter!.update({ startedAt: now, pausedAt: null });
    else if (pausedAt !== null) presenter!.update({ startedAt: startedAt + (now - pausedAt), pausedAt: null });
    else presenter!.update({ pausedAt: now });
  }, [shared, presenter]);

  const perform = useCallback(
    (action: KeyAction) => {
      // The presenter's tools do nothing for a reader, even when called.
      if (mode === "reader" && PRESENTER_ONLY.has(action.type)) return;
      // A press while the previous press's slide is still on its way counts from that slide, not
      // from the one this stage shows, so two quick presses land two slides on.
      const pending = shared ? presenter!.getState() : null;
      if (pending && pending.slideId !== slideId && (action.type === "advance" || action.type === "retreat" || action.type === "next-slide" || action.type === "prev-slide")) {
        const i = slideIds.indexOf(pending.slideId);
        if (i >= 0) {
          const count = slideSteps[i] ?? 0;
          const at = pending.stepIndex < 0 ? Math.max(count - 1, 0) : pending.stepIndex;
          if (action.type === "advance" && at < count - 1) presenter!.update({ stepIndex: at + 1 });
          else if (action.type === "retreat" && at > 0) presenter!.update({ stepIndex: at - 1 });
          else if (action.type === "advance" || action.type === "next-slide") go(slideIds[i + 1]);
          else go(slideIds[i - 1], action.type === "retreat" ? "last" : undefined);
          return;
        }
      }
      switch (action.type) {
        case "advance": {
          // Next during playback completes the step; a second press advances.
          const c = current();
          if (playback.current?.isPlaying()) {
            // Watchdog: a run that still reports playing 1500 ms after it was asked to
            // finish is stuck, and this press advances anyway.
            const asked = finishAsked.current;
            const now = performance.now();
            if (!asked || asked.stepIndex !== c.stepIndex) finishAsked.current = { stepIndex: c.stepIndex, at: now };
            if (!asked || asked.stepIndex !== c.stepIndex || now - asked.at < STUCK_PLAYBACK_MS) {
              playback.current.finish();
              break;
            }
            finishAsked.current = null;
            const w = window as unknown as { __stuckPlayback?: string[] };
            w.__stuckPlayback = [...(w.__stuckPlayback ?? []), `${slideId} s${c.stepIndex}`];
            if (rehearsal || new URLSearchParams(window.location.search).get("rehearse") === "1") console.warn(`Stuck playback on ${slideId} s${c.stepIndex}`);
          } else finishAsked.current = null;
          if (stepsFirst && c.stepIndex < c.stepCount - 1) setStepIndex(c.stepIndex + 1);
          else go(nextId);
          break;
        }
        case "retreat": {
          const c = current();
          if (stepsFirst && c.stepIndex > 0) setStepIndex(c.stepIndex - 1);
          else go(prevId, "last");
          break;
        }
        case "next-slide":
          go(nextId);
          break;
        case "prev-slide":
          go(prevId);
          break;
        case "first-slide":
          go(firstId);
          break;
        case "last-slide":
          go(lastId);
          break;
        case "toggle-blank":
          patch({ blank: !blank });
          break;
        case "toggle-fullscreen":
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen();
          break;
        case "toggle-hands-on":
          patch({ handsOn: !handsOn });
          break;
        case "toggle-live":
          patch({ live: !live });
          break;
        case "reset-step":
          // In the presenter windows the reset goes through the shared state, so a reset from the
          // speaker window replays the audience frame too (each stage bumps its own token below).
          if (shared) presenter!.update({ resetSeq: (presenter!.getState().resetSeq ?? 0) + 1 });
          else setReloadToken((n) => n + 1);
          break;
        case "toggle-rehearsal":
          setRehearsal((r) => !r);
          break;
        case "open-demo":
          if (frameRoute) window.open(frameUrl(frameRoute).url, "_blank", "noopener");
          break;
        case "toggle-timer":
          toggleTimer();
          break;
        case "open-speaker":
          window.open("/speaker", "deck-speaker");
          break;
        case "goto":
          if (presenter?.mode === "speaker") setGotoOpen(true);
          break;
        case "escape":
          if (helpOpen) setHelpOpen(false);
          if (gotoOpen) setGotoOpen(false);
          break;
        case "help":
          if (mode !== "audience") setHelpOpen((o) => !o);
          break;
        case "noop":
          break;
      }
    },
    [mode, shared, slideIds, slideSteps, stepsFirst, current, setStepIndex, patch, go, nextId, prevId, firstId, lastId, blank, handsOn, live, frameRoute, helpOpen, gotoOpen, presenter, toggleTimer, slideId, rehearsal],
  );

  useEffect(() => {
    performRef.current = perform;
  }, [perform]);

  // The speaker window's controls drive the stage through the presenter store.
  useEffect(() => {
    if (!shared) return;
    presenter!.registerPerform(perform);
    return () => presenter!.registerPerform(null);
  }, [shared, presenter, perform]);

  // ----- keyboard -----
  useEffect(() => {
    if (passive) return;
    const speakerWindow = presenter?.mode === "speaker";
    const onKey = (e: KeyboardEvent) => {
      // The drawer owns every key while it is open: Escape is its own, PageUp and
      // PageDown close it (NavDrawer), and nothing moves the deck.
      if (isNavOpen()) return;
      if (isEditableTarget(e.target) || (gotoOpen && e.key !== "Escape")) return;
      // The keyboard help owns every key but Escape while it is open, as the drawer does.
      if (e.key !== "Escape" && document.querySelector("dialog.keyboard-help[open]")) return;
      // Reader and speaker windows: Space and Enter press the focused control. The audience window keeps Space for the clicker wherever focus is.
      if ((mode === "reader" || speakerWindow) && (e.key === " " || e.key === "Enter") && isInteractiveTarget(e.target)) return;
      // Reader mode: character shortcuts act only from the stage or the page itself (WCAG 2.1.4,
      // a11y H2). Arrows, PageUp, PageDown, Space, Backspace, Home and End work from anywhere.
      if (mode === "reader" && isCharacterKey(e.key) && e.target !== document.body && e.target !== canvasRef.current) return;
      // Reader text view: the stage is hidden and the page scrolls, so the keys
      // that scroll a page do that; the arrows still move the deck.
      if (mode === "reader" && TEXT_VIEW_SCROLL_KEYS.has(e.key) && canvasRef.current?.checkVisibility?.() === false) return;
      const action = actionForKey(e, mode);
      if (!action) return;
      e.preventDefault();
      perform(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [passive, perform, gotoOpen, mode, presenter?.mode]);

  const focusStage = useCallback(() => canvasRef.current?.focus({ preventScroll: true }), []);

  const dispatchKey = useCallback(
    (key: string, shiftKey: boolean) => {
      // Every key a frame forwards wakes the pill.
      wake();
      if (isNavOpen()) return;
      // Tab and Escape come up from scripted frames. In reader mode the frame is
      // one tab stop and Escape hands the keyboard to the stage. The audience and speaker windows
      // ignore them: focus stays in the frame, so the clicker keeps working through forwarding.
      if (key === "Tab" || key === "Escape") {
        if (mode !== "reader") return;
        if (key === "Escape") focusStage();
        else focusPastFrame(document.activeElement instanceof HTMLIFrameElement ? document.activeElement : document.querySelector('#stage .page-frame__iframe[data-visible="true"]'), shiftKey, focusStage);
        return;
      }
      const k = key === "Space" ? " " : key;
      // Reader mode: letters from inside a frame never act (WCAG 2.1.4); navigation keys do.
      if (mode === "reader" && isCharacterKey(k)) return;
      const action = actionForKey({ key: k, shiftKey, metaKey: false, ctrlKey: false, altKey: false }, mode);
      if (action) performRef.current(action);
    },
    [wake, mode, focusStage],
  );

  // A drawer jump hands the keyboard to the stage that shows the target slide.
  useEffect(() => {
    if (passive) return;
    // A move from a pill button refocuses the same button in this stage's pill.
    if (mode === "reader" && restorePillFocus(() => canvasRef.current?.focus({ preventScroll: true }))) return;
    if (!focusOnArrival) return;
    focusOnArrival = false;
    canvasRef.current?.focus({ preventScroll: true });
  }, [passive, mode]);
  const jump = useCallback(
    (id: string) => {
      if (id !== slideId) focusOnArrival = true;
      focusStage();
      go(id);
    },
    [slideId, focusStage, go],
  );

  // Links on the slides. In the audience window a click opens the link and the stage
  // takes the keyboard back, so the clicker keeps working. A speaker preview is a picture.
  const onCanvasClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!link) return;
      if (embedded || passive) {
        e.preventDefault();
        return;
      }
      if (mode === "audience") window.setTimeout(focusStage, 0);
    },
    [embedded, passive, mode, focusStage],
  );

  // The audience keyboard belongs to the stage on arrival. When the focused frame of the previous
  // slide is removed, the browser can hand focus to another iframe (the hidden warming frame of an
  // intro slide), where the clicker's keys would be lost. A page frame takes focus again when its
  // document is shown, so claiming it here is safe on every slide. After arrival, any move of focus
  // to nowhere or into a frame that is not the demo (a warming document, a page that focuses on
  // load) is taken back in the next task, for the life of the stage: the window
  // blurs when a frame takes focus, and a focusin covers the rest.
  useEffect(() => {
    if (mode !== "audience" || passive) return;
    const claim = () => {
      const a = document.activeElement;
      const lost = !a || a === document.body || (a instanceof HTMLIFrameElement && !a.classList.contains("page-frame__iframe"));
      if (lost) canvasRef.current?.focus({ preventScroll: true });
    };
    claim();
    const t = window.setTimeout(claim, 450);
    const t2 = window.setTimeout(claim, 1200);
    let pending = 0;
    const schedule = () => {
      if (!pending)
        pending = window.setTimeout(() => {
          pending = 0;
          claim();
        }, 0);
    };
    window.addEventListener("blur", schedule);
    document.addEventListener("focusin", schedule);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
      window.clearTimeout(pending);
      window.removeEventListener("blur", schedule);
      document.removeEventListener("focusin", schedule);
    };
  }, [mode, passive]);

  const ctx = useMemo<StageState>(
    () => ({ stepIndex, stepCount, handsOn, live, reloadToken, rehearsal, demoStatus, stepResults, setStepIndex, setDemoStatus, setStepResult, reportPlaying, registerPlayback, dispatchKey, focusStage, chrome: theme }),
    [stepIndex, stepCount, handsOn, live, reloadToken, rehearsal, demoStatus, stepResults, setStepIndex, setDemoStatus, setStepResult, reportPlaying, registerPlayback, dispatchKey, focusStage, theme],
  );

  // Device pixels per CSS pixel, so the grain tile maps one tile pixel to one device pixel.
  const [dpr, setDpr] = useState(1);
  useEffect(() => {
    const update = () => setDpr(window.devicePixelRatio || 1);
    update();
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    mq.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      mq.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  // Decode the neighbours' backgrounds ahead of time, in the audience window and in
  // reader mode. Kept in a module cache so a decoded image is never
  // fetched twice.
  const neighbourKey = neighbourBackgrounds.join("|");
  useEffect(() => {
    if ((mode !== "audience" && mode !== "reader") || passive) return;
    for (const src of neighbourKey.split("|").filter(Boolean)) decodeBackground(src);
  }, [neighbourKey, mode, passive]);
  // The next slide's still or first poster and the poster Back lands on (audience and reader), or
  // the posters the speaker's previews show after the next press. Once the slide has
  // settled, so they never compete with it.
  const assetKey = neighbourAssets.join("|");
  useEffect(() => {
    if (passive || !assetKey) return;
    const t = window.setTimeout(() => {
      for (const src of assetKey.split("|")) decodeBackground(src);
    }, 300);
    return () => window.clearTimeout(t);
  }, [assetKey, passive]);

  const fontKey = neighbourFonts.join("|");
  useEffect(() => {
    if (passive || !fontKey) return;
    const t = window.setTimeout(() => {
      for (const font of fontKey.split("|")) void document.fonts.load(font).catch(() => {});
    }, 300);
    return () => window.clearTimeout(t);
  }, [fontKey, passive]);

  // No inline scale until the first measurement: the server's markup paints at stage.css's estimate.
  const style = { ...(scale === null ? {} : { "--stage-scale": scale }), "--dpr": dpr } as CSSProperties;
  const canvasStyle = (backgroundCss ? { "--slide-bg-image": backgroundCss } : {}) as CSSProperties;
  // The grain is the audience window's alone: previews and other modes draw none.
  const grain = grainOn && mode === "audience" && !embedded && !passive;
  const showBlank = blank && mode === "audience";
  const last = stepResults[slideId]?.result;
  // The crossfade wraps the canvas only, so the pill and dialogs never fade.
  const fade = (mode === "audience" || mode === "reader") && !embedded && !passive && fadeAllowed();
  const canvas = (
    <div className="stage__canvas" id={passive ? undefined : "stage"} ref={canvasRef} tabIndex={-1} style={canvasStyle} data-background={background} data-field={field} data-chrome={theme} onClick={onCanvasClick}>
      <div className="stage__bg" aria-hidden="true" />
      {grain ? <div className="stage__grain" aria-hidden="true" /> : null}
      {/* The slide is the page's main landmark (axe `region`); a speaker preview sits inside the speaker's own layout. */}
      <div className="stage__slide" role={embedded || passive ? undefined : "main"}>
        {children}
      </div>
    </div>
  );

  return (
    <StageContext.Provider value={ctx}>
      <div className={embedded ? "stage stage--embedded" : "stage"} ref={wrapperRef} data-blank={showBlank} data-mode={mode} data-idle={idle} data-hands-on={handsOn} style={style}>
        {/* A preview of a theme the deck does not use: its file is on the host, just not linked. */}
        {theme && theme !== chrome ? <link rel="stylesheet" href={`/live-ish/chrome/${theme}.css`} precedence="high" /> : null}
        {fade ? (
          <ViewTransition name="deck-slide" share="deck-fade" enter="none" exit="none" update="none" default="none">
            {canvas}
          </ViewTransition>
        ) : (
          canvas
        )}
        {rehearsal && !passive ? (
          <p className="stage__rehearsal">
            {slideId} · step {stepIndex + 1}/{Math.max(stepCount, 1)} · {last?.digest ?? "no digest"} · {last?.ms ?? 0}ms · {last?.asserts.filter((a) => !a.pass).length ?? 0} failed assert(s) · p95 frame {p95 ?? "…"} ms{p95 !== null && p95 > 20 ? " (over 20)" : ""}
          </p>
        ) : null}
      </div>
      {mode === "reader" ? (
        <ReaderControls slideIndex={slideIndex} total={total} hasPrev={Boolean(prevId)} hasNext={Boolean(nextId)} onPrev={() => perform({ type: "retreat" })} onNext={() => perform({ type: "advance" })} onHelp={() => setHelpOpen(true)} onWake={wake} demo={frameRoute && frameLive(frameRoute) ? { on: handsOn, toggle: () => perform({ type: "toggle-hands-on" }) } : undefined} />
      ) : null}
      {/* One drawer per window, outside the canvas and the pill, so no capture includes it. */}
      {nav && !passive ? <NavDrawer groups={nav.groups} currentId={nav.currentId} onJump={jump} focusStage={focusStage} returnFocusToStage={mode === "audience"} /> : null}
      {mode !== "audience" && !passive ? <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} mode={mode} /> : null}
      {presenter?.mode === "speaker" && !passive ? <GotoDialog open={gotoOpen} total={total} onGo={(n) => go(slideIds[n - 1])} onClose={() => setGotoOpen(false)} /> : null}
    </StageContext.Provider>
  );
}
