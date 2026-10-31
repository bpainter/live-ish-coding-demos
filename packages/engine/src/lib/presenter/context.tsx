"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import type { KeyAction } from "../keys";
import { createSync, type Sync, type Transport } from "./transport";
import { slideHref, slideHrefWithStep } from "./url";
import { isNewer, newWriterId, type DemoHealth, type Playback, type PresenterState, type SyncMessage } from "./types";

export type PresenterMode = "audience" | "speaker";

export interface Presenter {
  mode: PresenterMode;
  state: PresenterState;
  writer: string;
  transport: Transport;
  /** Windows heard from (any message, presence every 2 s) in the last 5 s, including this one. */
  peers: number;
  /**
   * Whether an audience window is connected: null until 5 s after mount
   * or under the storage transport, then true if one was heard within 5 s, else false.
   */
  audienceConnected: boolean | null;
  demoHealth: Record<string, DemoHealth>;
  update: (patch: Partial<Omit<PresenterState, "seq" | "writer">>) => void;
  /** The latest state, synchronously (ahead of the render that `state` reflects). */
  getState: () => PresenterState;
  reportHealth: (demoId: string, status: DemoHealth) => void;
  /** The audience window's playback: a step is playing, or the frame is ready for the next press. */
  playback: Playback | null;
  reportPlayback: (p: Playback) => void;
  /** The mounted stage registers its action handler so speaker controls can drive it. */
  registerPerform: (fn: ((action: KeyAction) => void) | null) => void;
  perform: (action: KeyAction) => void;
  /** Slide id the current page rendered; the provider navigates when state points elsewhere. */
  setRenderedSlide: (id: string) => void;
}

const PresenterContext = createContext<Presenter | null>(null);

export function usePresenter(): Presenter | null {
  return useContext(PresenterContext);
}

function stateFromUrl(writer: string, fallbackSlideId: string): PresenterState {
  const q = new URLSearchParams(window.location.search);
  const step = Number.parseInt(q.get("step") ?? "0", 10);
  return {
    seq: 0,
    writer,
    slideId: q.get("s") ?? fallbackSlideId,
    stepIndex: Number.isFinite(step) ? step : 0,
    blank: false,
    handsOn: false,
    live: false,
    startedAt: null,
    pausedAt: null,
  };
}

interface Props {
  mode: PresenterMode;
  /** Every slide id, in order. An `[id]` the deck does not have renders the first slide. */
  slideIds: string[];
  children: ReactNode;
}

/**
 * Two windows, one state. Owns the sync transport, the hello handshake
 * and URL mirroring; the stage and speaker view read and write through `update`.
 *
 * Rendered by the window's layout (`app/present/layout.tsx`, `app/speaker/layout.tsx`), above the
 * prerendered `[id]` pages: a slide move swaps the page and keeps this provider, its state and its
 * transport. Inside a page it would remount on every move, as a
 * new window that has lost the shared step. The first slide comes from the route's `[id]`.
 */
export function PresenterProvider({ mode, slideIds, children }: Props) {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const [initialSlideId] = useState(() => (params?.id && slideIds.includes(params.id) ? params.id : slideIds[0]));
  const writer = useMemo(() => newWriterId(), []);
  const [state, setState] = useState<PresenterState>(() => ({
    seq: 0,
    writer,
    slideId: initialSlideId,
    stepIndex: 0,
    blank: false,
    handsOn: false,
    live: false,
    startedAt: null,
    pausedAt: null,
  }));
  const stateRef = useRef(state);
  const [transport, setTransport] = useState<Transport>("broadcast");
  const [demoHealth, setDemoHealth] = useState<Record<string, DemoHealth>>({});
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [audienceConnected, setAudienceConnected] = useState<boolean | null>(null);
  // Last time each window was heard from, and the last time an audience window was (presence, 8.6).
  const peerSeen = useRef<Record<string, number>>({});
  const audienceSeen = useRef(0);
  const healthRef = useRef<Record<string, DemoHealth>>({});
  const playbackRef = useRef<Playback | null>(null);
  const modeRef = useRef(mode);
  const [rendered, setRendered] = useState(initialSlideId);
  const syncRef = useRef<Sync | null>(null);
  const performRef = useRef<((action: KeyAction) => void) | null>(null);
  // The provider survives slide navigations (it sits in the layout); the transport must start once.
  const firstSlideRef = useRef(initialSlideId);
  const urlAtMount = useRef<{ state: PresenterState; urlSlide: string | null; urlWins: boolean } | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    healthRef.current = demoHealth;
  }, [demoHealth]);
  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);

  // Transport, hello handshake, and the first state (sync > storage > URL). Runs once per window.
  useEffect(() => {
    const initialSlide = firstSlideRef.current;
    let settled = false;
    // A URL the presenter typed, followed or opened names the slide to show (`?s=`), and wins over
    // whatever the other window holds. A reload or back/forward carries the mirrored URL of the
    // state it had, so the live state wins there and the window resumes.
    // Read the URL once, at mount: the mirror effect below rewrites it (adding `s=`, dropping
    // `step=`), and Strict Mode runs this effect twice, so a second read would see the mirror's URL
    // and mistake it for one the presenter typed.
    if (!urlAtMount.current) {
      const navType = (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type;
      const slide = new URLSearchParams(window.location.search).get("s");
      urlAtMount.current = { state: stateFromUrl(writer, initialSlide), urlSlide: slide, urlWins: navType === "navigate" && slide !== null };
    }
    const { state: fromUrlAtMount, urlSlide, urlWins } = urlAtMount.current;
    let claimed = false;
    const accept = (incoming: PresenterState) => {
      if (urlWins && !claimed && urlSlide) {
        // Take the peer's timer and counters, but move both windows to the URL's slide. This
        // claims even when the peer's state is not newer: both windows start at seq 0, and the
        // writer-id tie-break would otherwise drop the claim half the time.
        claimed = true;
        settled = true;
        const next: PresenterState = { ...incoming, slideId: urlSlide, stepIndex: fromUrlAtMount.stepIndex, seq: Math.max(incoming.seq, stateRef.current.seq) + 1, writer };
        stateRef.current = next;
        setState(next);
        sync.send({ type: "state", state: next });
        return;
      }
      if (!isNewer(incoming, stateRef.current)) return;
      settled = true;
      claimed = true;
      stateRef.current = incoming;
      setState(incoming);
    };
    const seen = (id: string, audience = false) => {
      if (id === writer) return;
      const now = Date.now();
      peerSeen.current[id] = now;
      if (audience) {
        audienceSeen.current = now;
        setAudienceConnected(true);
      }
    };
    const sync = createSync((msg: SyncMessage) => {
      if (msg.type === "state") {
        accept(msg.state);
        seen(msg.state.writer);
      } else if (msg.type === "hello") {
        seen(msg.writer);
        // The current holder answers with its state.
        sync.send({ type: "state", state: stateRef.current });
        // The audience window also replays its frame health and playback, so a speaker window
        // opened or reloaded later does not wait for the next change to hear them (8.6).
        if (modeRef.current === "audience") {
          for (const [demoId, status] of Object.entries(healthRef.current)) sync.send({ type: "demo-health", demoId, status, writer });
          if (playbackRef.current) sync.send({ type: "playback", ...playbackRef.current, writer });
        }
      } else if (msg.type === "presence") {
        seen(msg.writer, msg.mode === "audience");
      } else if (msg.type === "playback") {
        seen(msg.writer, true);
        setPlayback({ slideId: msg.slideId, stepIndex: msg.stepIndex, playing: msg.playing });
      } else if (msg.type === "demo-health") {
        seen(msg.writer, true);
        setDemoHealth((h) => (h[msg.demoId] === msg.status ? h : { ...h, [msg.demoId]: msg.status }));
      }
    });
    syncRef.current = sync;
    setTransport(sync.transport);
    sync.send({ type: "hello", writer });
    // Still here (8.6): a window only sends state on a change, so presence is what keeps an idle
    // audience window counted.
    const presence = () => sync.send({ type: "presence", writer, mode: modeRef.current });
    presence();
    const beat = window.setInterval(presence, 2000);
    const t = window.setTimeout(() => {
      // The URL's claim is spent once the fallback fires: a window opened later must not have its
      // first press reverted by this window snapping back to the URL's slide.
      claimed = true;
      // A peer answered, or this window already wrote state (a press before the fallback fired).
      if (settled || stateRef.current.seq > 0) return;
      const stored = sync.readStored();
      const fromUrl = { ...fromUrlAtMount, writer };
      // No other window answered: a typed URL wins; a reload resumes the last stored state.
      const initial = stored && !urlWins ? { ...stored, writer } : fromUrl;
      stateRef.current = initial;
      setState(initial);
    }, 300);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(beat);
      sync.close();
      syncRef.current = null;
    };
  }, [writer]);

  // Mirror state into the URL, and navigate when the state names a slide this page did not render.
  // The navigation goes to `slideHref`, the URL the stage prefetched in full, with no
  // step: the step lives in the shared state, and the mirror adds it once the slide is shown.
  // The step mirror is throttled to one write per 250 ms (leading, then trailing): WebKit and
  // Firefox rate-limit the history API per page, and a clicker burst would otherwise trip it.
  const lastMirror = useRef(0);
  useEffect(() => {
    if (state.slideId !== rendered) {
      router.replace(slideHref(state.slideId));
      return;
    }
    const url = new URL(slideHrefWithStep(state.slideId, state.stepIndex), window.location.href);
    if (url.href === window.location.href) return;
    const write = () => {
      lastMirror.current = Date.now();
      try {
        window.history.replaceState(null, "", url);
      } catch {
        /* rate limited: the next change catches up */
      }
    };
    const wait = 250 - (Date.now() - lastMirror.current);
    if (wait <= 0) {
      write();
      return;
    }
    const t = window.setTimeout(write, wait);
    return () => window.clearTimeout(t);
  }, [state.slideId, state.stepIndex, rendered, router]);

  const update = useCallback<Presenter["update"]>(
    (patch) => {
      const next: PresenterState = { ...stateRef.current, ...patch, seq: stateRef.current.seq + 1, writer };
      stateRef.current = next;
      setState(next);
      syncRef.current?.send({ type: "state", state: next });
    },
    [writer],
  );

  const reportHealth = useCallback<Presenter["reportHealth"]>(
    (demoId, status) => {
      setDemoHealth((h) => (h[demoId] === status ? h : { ...h, [demoId]: status }));
      syncRef.current?.send({ type: "demo-health", demoId, status, writer });
    },
    [writer],
  );

  const reportPlayback = useCallback<Presenter["reportPlayback"]>(
    (p) => {
      setPlayback(p);
      syncRef.current?.send({ type: "playback", ...p, writer });
    },
    [writer],
  );

  const getState = useCallback(() => stateRef.current, []);

  const registerPerform = useCallback<Presenter["registerPerform"]>((fn) => {
    performRef.current = fn;
  }, []);
  const perform = useCallback<Presenter["perform"]>((action) => performRef.current?.(action), []);

  // Windows heard from in the last 5 seconds, re-counted on a timer so stale peers age out. The
  // audience is "not connected" once none has been heard for 5 s, and not before this window has
  // been up for 5 s. Presence rides the BroadcastChannel only, so the storage fallback says nothing.
  const [peers, setPeers] = useState(1);
  useEffect(() => {
    const mounted = Date.now();
    const count = () => {
      const now = Date.now();
      const cutoff = now - 5000;
      setPeers(1 + Object.values(peerSeen.current).filter((t) => t > cutoff).length);
      if (transport !== "broadcast") setAudienceConnected(null);
      else if (audienceSeen.current > cutoff) setAudienceConnected(true);
      else setAudienceConnected(now - mounted >= 5000 ? false : null);
    };
    const id = window.setInterval(count, 1000);
    return () => window.clearInterval(id);
  }, [transport]);

  const value = useMemo<Presenter>(
    () => ({ mode, state, writer, transport, peers, audienceConnected, demoHealth, update, getState, reportHealth, playback, reportPlayback, registerPerform, perform, setRenderedSlide: setRendered }),
    [mode, state, writer, transport, peers, audienceConnected, demoHealth, update, getState, reportHealth, playback, reportPlayback, registerPerform, perform],
  );

  return <PresenterContext.Provider value={value}>{children}</PresenterContext.Provider>;
}
