"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { FramePage, Step } from "../../schema/demo";
import type { Mode } from "../../lib/mode";
import { FrameHandle, type StepResult } from "../../lib/engine/frame";
import { installInputRelay, withInput } from "../../lib/engine/input-relay";
import { flagsAt, replaySteps, segments, selectorsFor } from "../../lib/engine/steps";
import { blockedFault, runtimeFault } from "../../lib/engine/faults";
import { frameQuery, frameUrl, glassFlags, presenterOriginFor } from "../../lib/frames/origins";
import { useStage } from "../../lib/stage-context";
import { DevFault } from "./DevFault";
import { Overlay } from "./Overlay";

interface Props {
  page: FramePage;
  /** The frame's sandbox attribute comes from the build manifest. */
  sandbox: string;
  mode: Mode;
  /** Slot size in canvas pixels. */
  slot: { width: number; height: number };
  onStatus?: (status: "loading" | "ready" | "error") => void;
  onStepResult?: (stepId: string, result: StepResult) => void;
  /** The current step's captured poster, shown under the slot until the first document is. */
  poster?: string | null;
}

/** Faults show on the slide in `dev` only. A production build has none of this. */
const DEV = process.env.NODE_ENV !== "production";

/** What `dev` can say about a frame that never answered. Each mode's rules stay in origins.ts. */
function silentFrame(route: string) {
  const { origin } = frameUrl(route);
  const app = /^\/@([\w-]+)/.exec(route)?.[1] ?? null;
  return blockedFault({ origin, app, allowed: !app && origin ? presenterOriginFor(origin) : null }, window.location.origin);
}

/** How long the code highlight shows before a step's playback starts. */
const CODE_LEAD_MS = 400;

function documentUrl(page: FramePage, flags: Record<string, boolean>): { origin: string; url: string } {
  const route = page.frame!.route;
  const { origin, url } = frameUrl(route.endsWith("/") ? `${route}index.html` : route.includes(".") ? route : `${route}/index.html`);
  return { origin, url: `${url}${frameQuery(route, glassFlags(flags))}` };
}

/**
 * The live frame of a demo page and its player. Next from the
 * previous step plays the step animated in the active document; any other move mounts a fresh
 * document beneath, replays `s0..sN` instantly and swaps. Reloading toggles split a step.
 */
export function PageFrame({ page, sandbox, mode, slot, onStatus, onStepResult, poster }: Props) {
  const { stepIndex, handsOn, live, reloadToken, rehearsal, registerPlayback, dispatchKey, reportPlaying } = useStage();
  const slotRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState<FrameHandle | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  /** The last error the frame reported, for the `dev` overlay. */
  const [frameError, setFrameError] = useState<Parameters<typeof runtimeFault>[0] | null>(null);
  /** A document has been shown; until then the step's poster fills the slot. */
  const [shown, setShown] = useState(false);
  const posterRef = useRef<HTMLImageElement>(null);
  const [viewportWidth, setViewportWidth] = useState<number | null>(null);
  const [viewportMs, setViewportMs] = useState(0);
  /** The step whose playback (animated or replayed) has finished; spotlights wait for it. */
  const [doneStep, setDoneStep] = useState<{ index: number } | null>(null);
  const current = useRef<{ handle: FrameHandle; stepIndex: number; flags: Record<string, boolean> } | null>(null);
  const generation = useRef(0);
  /**
   * The step run Next talks to. `gen` is the entry that owns it, `handle` the
   * document it plays in (null while the code lead runs), and `leading` marks the 400 ms lead: a
   * press then cancels the lead and plays the step to its end at once, as a press during playback
   * does.
   */
  const run = useRef<{ gen: number; handle: FrameHandle | null; leading: boolean; finish: () => void; cancel: () => void; playing: () => boolean } | null>(null);
  const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const frame = page.frame!;
  // The card has a 1 px border: the frame fills its content box.
  const scale = Math.min((slot.width - 2) / frame.viewport.width, (slot.height - 2) / frame.viewport.height);
  const narrowed = viewportWidth !== null && viewportWidth < frame.viewport.width;
  const step: Step | undefined = page.steps[stepIndex];

  const report = useCallback(
    (s: "loading" | "ready" | "error") => {
      setStatus(s);
      onStatus?.(s);
    },
    [onStatus],
  );

  /** Mounts a fresh document with `flags`; hidden until shown. */
  const mount = useCallback(
    (flags: Record<string, boolean>, visible: boolean): FrameHandle => {
      const { origin, url } = documentUrl(page, flags);
      const iframe = document.createElement("iframe");
      iframe.className = "page-frame__iframe";
      iframe.title = `Live demo: ${page.title}`;
      iframe.setAttribute("sandbox", sandbox);
      iframe.setAttribute("allow", "");
      iframe.referrerPolicy = "no-referrer";
      iframe.dataset.visible = String(visible);
      // The audience frame never joins the tab order (the clicker's keys). In reader mode the frame
      // is out of it too unless hands-on is on, so Tab passes the demo; `h` from
      // the stage gives it the keyboard.
      iframe.tabIndex = mode === "audience" || (mode === "reader" && !handsOn) ? -1 : 0;
      // The address is set before the frame is inserted, so its first document is the demo, never
      // an about:blank that WebKit records in the presenter's session history: a later Back in
      // this frame would restore that blank page instead of the frame's entry page.
      iframe.src = url;
      slotRef.current?.appendChild(iframe);
      const h = new FrameHandle(iframe, { expectedOrigin: origin, handsOn, reducedMotion, flags });
      h.onViewport(({ inlineSize, ms }) => {
        setViewportMs(ms);
        setViewportWidth(Number.parseFloat(inlineSize));
      });
      h.onKey((k) => dispatchKey(k.key, k.shift));
      if (DEV) h.onError(setFrameError);
      return h;
    },
    [page, sandbox, mode, handsOn, reducedMotion, dispatchKey],
  );

  const show = useCallback(
    (h: FrameHandle, idx: number, flags: Record<string, boolean>) => {
      const old = current.current?.handle;
      // Reader hands-on: turning it on replaces the document the keyboard
      // was just handed to; the replacement takes focus, so it never falls to <body>.
      const refocus = mode === "reader" && handsOn && (document.activeElement === document.body || (old !== undefined && document.activeElement === old.iframe));
      h.iframe.dataset.visible = "true";
      // The poster leaves in the task that reveals the first document, so no frame shows both
      // and none shows neither (a narrowed frame would show the poster beside it).
      if (posterRef.current) posterRef.current.style.display = "none";
      setShown(true);
      current.current = { handle: h, stepIndex: idx, flags };
      setHandle(h);
      if (old && old !== h) {
        // The swap is atomic: the outgoing document is hidden in this task, so when the step
        // reports done exactly one frame is shown (the walk's route check reads it), and removed
        // on the next frame, once the incoming one has painted over it.
        old.iframe.dataset.visible = "false";
        requestAnimationFrame(() => old.dispose());
      }
      if (mode === "audience" && !handsOn) h.focus();
      if (refocus) h.focus();
    },
    [mode, handsOn],
  );

  useEffect(() => installInputRelay(), []);

  // Reader text view: while the stage is hidden, no frame mounts, so a phone in
  // text view downloads no demo. The first time the frame gets a box (the text view turned off, a
  // wider window), it mounts and replays the step. Other windows mount at once, as before.
  const [stageShown, setStageShown] = useState(mode !== "reader");
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (stageShown || !el) return;
    const check = () => {
      if (typeof el.checkVisibility === "function" ? el.checkVisibility() : el.getClientRects().length > 0) setStageShown(true);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stageShown]);

  // Enter the step: animate from the previous one, or reset and replay.
  useEffect(() => {
    if (!stageShown) return;
    const gen = ++generation.current;
    const target = step;
    // Spotlights for this entry wait until its playback has finished.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDoneStep(null);
    if (DEV) setFrameError(null);
    if (!target) return;
    const cur = current.current;
    const watchList = selectorsFor(target);
    const animate = cur !== null && cur.stepIndex === stepIndex - 1 && !handsOn && cur.handle.supports !== null;

    if (animate && cur) {
      // Play forward in the active document; reloading toggles split the step.
      const segs = segments(target, cur.flags);
      cur.handle.watch(watchList, true);
      reportPlaying(true);
      // Only this entry's run is cleared: a newer entry owns `run.current` once it has started.
      const release = () => {
        if (run.current?.gen === gen) run.current = null;
      };
      void (async () => {
        let h = cur.handle;
        let last: StepResult | null = null;
        // The code highlight leads the playback by 400 ms, so the room reads the cause first.
        // The lead is a run of its own: a press during it plays the step to its end at once, where
        // it used to find nothing playing and skip the step.
        let finishNow = false;
        if (target.code && !reducedMotion) {
          await new Promise<void>((resolve) => {
            const t = window.setTimeout(resolve, CODE_LEAD_MS);
            const stop = () => {
              window.clearTimeout(t);
              resolve();
            };
            run.current = {
              gen,
              handle: null,
              leading: true,
              playing: () => true,
              finish: () => {
                finishNow = true;
                stop();
              },
              cancel: stop,
            };
          });
        }
        if (gen !== generation.current) return release();
        for (const [i, seg] of segs.entries()) {
          if (gen !== generation.current) return release();
          if (seg.reload) {
            const fresh = mount(seg.flags, false);
            fresh.watch(watchList, true);
            await fresh.ready;
            if (gen !== generation.current) {
              fresh.dispose();
              return release();
            }
            show(fresh, stepIndex, seg.flags);
            h = fresh;
          }
          const stepRun = h.runStep({ ...target, actions: target.actions }, "animated", seg.startAt);
          const runHandle = h;
          run.current = {
            gen,
            handle: runHandle,
            leading: false,
            playing: () => stepRun.playing,
            finish: () => {
              finishNow = true;
              stepRun.finish();
            },
            cancel: stepRun.cancel,
          };
          // A press during the lead, or during an earlier segment, finishes this segment too.
          if (finishNow) stepRun.finish();
          last = await stepRun.done;
          if (i === segs.length - 1 && gen === generation.current) current.current = { handle: h, stepIndex, flags: seg.flags };
        }
        release();
        if (gen === generation.current) {
          reportPlaying(false);
          setDoneStep({ index: stepIndex });
        }
        if (last && gen === generation.current) onStepResult?.(target.id, last);
      })();
      return;
    }

    // Reset and replay: a fresh document with the flags accumulated up to this step. Every
    // document mounts hidden and shows once replayed; the first one has the poster above it, and
    // later ones the document they replace.
    run.current?.cancel();
    run.current = null;
    const flags = flagsAt(page, stepIndex);
    // A fresh document starts at its authored viewport; replayed resizes set it again.
    setViewportWidth(null);
    setViewportMs(0);
    const fresh = mount(flags, false);
    fresh.watch(watchList, false);
    reportPlaying(true);
    report(cur === null ? "loading" : status);
    const timeout = window.setTimeout(() => {
      if (gen === generation.current && !current.current) report("error");
    }, 1500);
    void fresh.ready.then(async () => {
      window.clearTimeout(timeout);
      if (gen !== generation.current) {
        fresh.dispose();
        return;
      }
      // The replaying document takes focus first, and the replay is posted from a task carrying the
      // presenter's press: WebKit 26.0 ignores programmatic focus in a cross-origin frame outside
      // such a task, so focus asserts and focus returns would replay differently (input-relay.ts).
      const result = await new Promise<StepResult | null>((resolve) =>
        withInput(() => {
          if (gen !== generation.current) return resolve(null);
          if (mode === "audience" && !handsOn) fresh.focus();
          void fresh.replayTo(replaySteps(page, stepIndex)).then(resolve);
        }),
      );
      if (gen !== generation.current || !result) {
        fresh.dispose();
        return;
      }
      show(fresh, stepIndex, flags);
      report("ready");
      reportPlaying(false);
      setDoneStep({ index: stepIndex });
      onStepResult?.(target.id, result);
    });
    return () => window.clearTimeout(timeout);
    // `status` is read for the report only; it must not retrigger entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, stepIndex, handsOn, reloadToken, mount, show, report, onStepResult, reportPlaying, stageShown]);

  // Terminal pages: `l` hides the recording for a real terminal.
  useEffect(() => {
    current.current?.handle.setLive(live);
  }, [live, handle]);

  // Hands-on mode: tell the runtime and give the frame the keyboard.
  useEffect(() => {
    const h = current.current?.handle;
    if (!h) return;
    h.setMode(handsOn);
    if (mode === "reader") h.setTabbable(handsOn);
    if (handsOn) h.focus();
  }, [handsOn, mode]);

  // Next while playing finishes the step instead of advancing. A run counts as playing only while
  // it belongs to the current entry and plays in the shown document: a run left behind by a
  // replaced entry or a disposed document can never finish, and once it swallowed every Next
  //. The stage's watchdog covers anything else that stops reporting done.
  useEffect(() => {
    const live = () => {
      const r = run.current;
      if (!r) return null;
      const shown = current.current?.handle ?? null;
      const stale = r.gen !== generation.current || (r.handle !== null && (r.handle !== shown || r.handle.isDisposed));
      if (stale || !r.playing()) {
        if (stale) {
          r.cancel();
          run.current = null;
        }
        return null;
      }
      return r;
    };
    registerPlayback({
      isPlaying: () => live() !== null,
      finish: () => live()?.finish(),
    });
    return () => registerPlayback(null);
  }, [registerPlayback]);

  // Fault injection for ``live-ish walk` --advance`, under automation only: dispose the
  // shown document mid-run, and the next press must still advance.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.webdriver) return;
    const w = window as unknown as { __disposeShownFrame?: () => boolean };
    const fn = () => {
      const h = current.current?.handle;
      if (!h) return false;
      h.dispose();
      return true;
    };
    w.__disposeShownFrame = fn;
    return () => {
      if (w.__disposeShownFrame === fn) delete w.__disposeShownFrame;
    };
  }, []);

  // Unmount: drop every frame.
  useLayoutEffect(() => {
    const el = slotRef.current;
    const gen = generation;
    const cur = current;
    return () => {
      gen.current++;
      cur.current?.handle.dispose();
      cur.current = null;
      if (el) el.replaceChildren();
    };
  }, []);

  const frameStyle = {
    "--frame-scale": scale,
    "--frame-width": `${viewportWidth ?? frame.viewport.width}px`,
    "--frame-height": `${frame.viewport.height}px`,
    "--frame-resize-ms": `${viewportMs}ms`,
  } as CSSProperties;

  return (
    <div className="page-frame" ref={rootRef} data-status={status} data-build={page.beat} data-kind={frame.kind} style={frameStyle}>
      <div className="page-frame__scaled">
        {/* Decoration under the slot: the iframe's title names the demo. A static file from public/. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {poster && !shown ? <img ref={posterRef} className="page-frame__poster" src={poster} alt="" decoding="sync" fetchPriority="high" /> : null}
        <div className="page-frame__slot" ref={slotRef} />
        <Overlay handle={handle} step={step} ready={doneStep !== null && doneStep.index === stepIndex} handsOn={handsOn} reducedMotion={reducedMotion} rehearsal={rehearsal} clipBottom={frame.spotlightClip?.bottom} keycap={frame.keycap} />
      </div>
      {narrowed ? <div className="page-frame__edge" style={{ left: `calc(${viewportWidth}px * ${scale})` }} aria-hidden="true" /> : null}
      {status === "loading" && !(poster && !shown) ? <p className="page-frame__status">Loading demo…</p> : null}
      {status === "error" ? <p className="page-frame__status">The demo frame did not answer. Press r to reload it.</p> : null}
      {DEV && status === "error" ? <DevFault fault={silentFrame(frame.route)} /> : null}
      {DEV && frameError ? <DevFault fault={runtimeFault(frameError, step?.id)} /> : null}
    </div>
  );
}
