"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import type { Slide } from "../../schema/slide";
import { hasFrame, type Action, type Demo, type DemoPage, type Step } from "../../schema/demo";
import { AArrowDown, AArrowUp, ChevronLeft, ChevronRight, Download, ExternalLink, EyeOff, Hand, Menu, MonitorUp, RotateCcw } from "lucide-react";
import { usePresenter } from "../../lib/presenter/context";
import { speakerSlideName } from "../../lib/presenter/titles";
import { frameUrl } from "../../lib/frames/origins";
import { deckKey, restoreOnClear } from "../../lib/deck-keys";
import { BUILD_ID } from "../../lib/presenter/types";
import { SpeakerTimer } from "./Timer";
import { NavTrigger, isNavOpen } from "../chrome/NavDrawer";
import { NotesInlineText, NotesText } from "./NotesText";

const NOTES_KEY = deckKey("notes-size");
const NOTES_MIN = 28;
const NOTES_MAX = 56;
const LOG_KEY = deckKey("rehearsal-log");
/** The rehearsal log as last written, so a store a frame cleared keeps it. */
let logInMemory: string | null = null;

interface Props {
  slide: Slide;
  next?: Slide;
  total: number;
  current: ReactNode;
  nextPreview: ReactNode | null;
  /** This page's demo among the deck's demos (1-based), and the count. */
  demoPosition?: { n: number; of: number };
}

/** What the shell's footer needs about each slide; the layout passes the whole deck once. */
export interface SpeakerSlideInfo {
  id: string;
  /** Target elapsed time at the end of the slide, in minutes. */
  cumulative: number;
  hasPage: boolean;
  /** The page frame's route, for Open frame. */
  frameRoute: string | null;
}

/** The speaker window's state that outlasts a slide move (the shell owns it; the page reads it). */
interface SpeakerShellState {
  rehearse: boolean;
  notesSize: number;
  changeNotes: (delta: number) => void;
  showActions: boolean;
  toast: { text: string; shown: boolean } | null;
}

const SpeakerShellContext = createContext<SpeakerShellState | null>(null);

/** "Click Actions; Esc via hidePopover()". */
function summarize(actions: Action[]): string {
  const parts: string[] = [];
  for (const a of actions) {
    switch (a.type) {
      case "click":
        parts.push(`Click ${a.target}`);
        break;
      case "key":
        parts.push(`${a.key} via ${a.via.split(/[;(]/)[0].trim()}${a.via.includes("(") ? "()" : ""}`);
        break;
      case "type":
        parts.push(`Type "${a.text.slice(0, 24)}${a.text.length > 24 ? "…" : ""}"`);
        break;
      case "paste":
        parts.push("Paste");
        break;
      case "resize":
        parts.push(`Resize ${a.target} to ${a.inlineSize}`);
        break;
      case "toggle":
        parts.push(`${a.flag} ${a.on ? "on" : "off"}`);
        break;
      case "navigate":
        parts.push(a.history ? `History ${a.history}` : `Go to ${a.url}`);
        break;
      case "network":
        parts.push(`${a.profile} network`);
        break;
      case "hook":
        parts.push(`Hook ${a.name}`);
        break;
      case "terminal":
        parts.push(`Lines ${a.lines[0]} to ${a.lines[1]}`);
        break;
      case "reveal":
        parts.push(`Reveal ${a.target}`);
        break;
      default:
        break;
    }
  }
  return parts.join("; ");
}

const ICON = { size: 18, strokeWidth: 1.75, "aria-hidden": true } as const;

type Status = { key: "offline" | "error" | "fallback" | "loading" | "playing" | "ready"; text: string };

/** Why two windows are not syncing, when the reason is that they run different builds. */
function buildNote(other: string | null): string | undefined {
  return other ? `This window runs build ${BUILD_ID}. Another window runs build ${other}, so they cannot sync. Reload both.` : undefined;
}

/** One status pill for a framed page: first match wins. */
function frameStatus(audienceConnected: boolean | null, health: string | undefined, playing: boolean): Status {
  if (audienceConnected === false) return { key: "offline", text: "No audience" };
  if (health === "error") return { key: "error", text: "Frame error" };
  if (health === "fallback") return { key: "fallback", text: "Poster shown" };
  if (health === "loading") return { key: "loading", text: "Loading" };
  // Playing while the audience frame runs this step; Ready once it has finished.
  if (playing) return { key: "playing", text: "Playing" };
  return { key: "ready", text: "Ready" };
}


/**
 * The speaker window's shell, rendered by
 * `app/speaker/layout.presenter.tsx` above the prerendered `[id]` pages, so a slide move swaps only the page
 *. It holds what must outlast the move: the `.speaker` grid, the
 * footer (the controls keep focus after Next or Previous), the notes text size, the `d` action
 * summaries, the "Timer started" toast, and `?rehearse=1`, read here in the browser because the
 * pages are prerendered. The page fills the grid's left column and `main` (`SpeakerView`).
 */
export function SpeakerShell({ slides, children }: { slides: SpeakerSlideInfo[]; children: ReactNode }) {
  const presenter = usePresenter();
  const params = useParams<{ id?: string }>();
  const info = slides.find((s) => s.id === params?.id) ?? slides[0];
  const [rehearse, setRehearse] = useState(false);
  const [notesSize, setNotesSize] = useState(40);
  const [showActions, setShowActions] = useState(false);
  // Kept mounted with data-shown="false" for 400 ms after it hides, so the 160 ms fade-out can
  // run, then removed. Fade-in comes from @starting-style when it mounts.
  const [toast, setToast] = useState<{ text: string; shown: boolean } | null>(null);
  const timerSeen = useRef<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRehearse(new URLSearchParams(window.location.search).get("rehearse") === "1");
    try {
      const saved = Number.parseInt(localStorage.getItem(NOTES_KEY) ?? "", 10);
      if (saved >= NOTES_MIN && saved <= NOTES_MAX) setNotesSize(saved);
      logInMemory ??= localStorage.getItem(LOG_KEY);
    } catch {
      /* no storage */
    }
  }, []);
  const changeNotes = useCallback((delta: number) => {
    setNotesSize((size) => {
      const n = Math.min(NOTES_MAX, Math.max(NOTES_MIN, size + delta));
      try {
        localStorage.setItem(NOTES_KEY, String(n));
      } catch {
        /* no storage */
      }
      return n;
    });
  }, []);

  const startedAt = presenter?.state.startedAt ?? null;
  useEffect(() => {
    if (startedAt !== null && timerSeen.current === null) {
      setToast({ text: "Timer started", shown: true });
    }
    timerSeen.current = startedAt;
  }, [startedAt]);
  const toastShown = toast?.shown ?? false;
  const toastMounted = toast !== null;
  useEffect(() => {
    if (!toastMounted) return;
    const t = toastShown ? window.setTimeout(() => setToast((x) => (x ? { ...x, shown: false } : x)), 2500) : window.setTimeout(() => setToast((x) => (x && !x.shown ? null : x)), 400);
    return () => window.clearTimeout(t);
  }, [toastShown, toastMounted]);

  // Rehearsal (`d`): the next step's scripted actions also show under the next-step hint.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "d" && !isNavOpen() && !e.metaKey && !e.ctrlKey && !e.altKey && !(e.target instanceof HTMLInputElement)) setShowActions((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Both live in memory here, so a frame's localStorage.clear() on one origin loses neither.
  const notesSizeRef = useRef(notesSize);
  useEffect(() => {
    notesSizeRef.current = notesSize;
  }, [notesSize]);
  useEffect(() => {
    const stopSize = restoreOnClear(NOTES_KEY, () => String(notesSizeRef.current));
    const stopLog = restoreOnClear(LOG_KEY, () => logInMemory);
    return () => {
      stopSize();
      stopLog();
    };
  }, []);

  const shell = useMemo<SpeakerShellState>(() => ({ rehearse, notesSize, changeNotes, showActions, toast }), [rehearse, notesSize, changeNotes, showActions, toast]);

  if (!presenter) return null;
  const { state, audienceConnected, update, perform } = presenter;
  const framed = info.frameRoute !== null;
  const offline = audienceConnected === false;
  const openAudience = () => window.open("/present", "deck-audience");
  const openFrame = () => {
    if (info.frameRoute) window.open(frameUrl(info.frameRoute).url, "_blank", "noopener");
  };
  const exportLog = () => {
    const blob = new Blob([localStorage.getItem(LOG_KEY) ?? logInMemory ?? "[]"], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "rehearsal-log.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <SpeakerShellContext.Provider value={shell}>
      <div className="speaker" data-rehearse={rehearse} data-blank={state.blank} data-hands-on={state.handsOn}>
        {children}
        <footer className="speaker__bottom">
          <nav className="speaker__controls" aria-label="Presenter controls">
            {/* The drawer; the current preview's stage renders the dialog it opens. */}
            <NavTrigger className="speaker__button">
              <Menu {...ICON} />
              Slides
            </NavTrigger>
            <span className="speaker__divider" aria-hidden="true" />
            <button type="button" className="speaker__button speaker__button--primary" onClick={() => perform({ type: "retreat" })}>
              <ChevronLeft {...ICON} />
              Previous
            </button>
            <button type="button" className="speaker__button speaker__button--primary" onClick={() => perform({ type: "advance" })}>
              Next
              <ChevronRight {...ICON} />
            </button>
            <span className="speaker__divider" aria-hidden="true" />
            <button type="button" className="speaker__button" onClick={() => perform({ type: "toggle-blank" })} aria-pressed={state.blank}>
              <EyeOff {...ICON} />
              Blank
            </button>
            <button type="button" className="speaker__button" onClick={() => perform({ type: "toggle-hands-on" })} aria-pressed={state.handsOn}>
              <Hand {...ICON} />
              Hands-on
            </button>
            <button type="button" className="speaker__button" onClick={() => perform({ type: "reset-step" })} disabled={!info.hasPage}>
              <RotateCcw {...ICON} />
              Reset step
            </button>
            <span className="speaker__divider" aria-hidden="true" />
            {/* The name starts with the visible label (2.5.3). An aria-label, not hidden text: an
                out-of-flow span would put a space before the comma. */}
            <button type="button" className="speaker__button" onClick={openAudience} title={buildNote(presenter.otherBuild) ?? "Open or focus the audience window"} data-connected={offline ? "false" : undefined} aria-label={offline ? "Audience, not connected" : undefined}>
              <MonitorUp {...ICON} />
              Audience
            </button>
            <button type="button" className="speaker__button" onClick={openFrame} disabled={!framed}>
              <ExternalLink {...ICON} />
              Open frame
            </button>
            {rehearse ? (
              <>
                <span className="speaker__divider" aria-hidden="true" />
                <button type="button" className="speaker__button" onClick={exportLog}>
                  <Download {...ICON} />
                  Export log
                </button>
              </>
            ) : null}
          </nav>
          <SpeakerTimer state={state} cumulativeMinutes={info.cumulative} onToggle={() => perform({ type: "toggle-timer" })} onReset={() => update({ startedAt: null, pausedAt: null })} />
        </footer>
      </div>
    </SpeakerShellContext.Provider>
  );
}

/**
 * Speaker window in dark glass, the per-slide part: the
 * current and next slides on the left; the title and steps block over the notes on the right. The
 * footer, with the controls and the timer, is the shell's (`SpeakerShell`). The window title is
 * the route's metadata (`speakerWindowTitle`).
 */
export function SpeakerView({ slide, next, total, current, nextPreview, demoPosition }: Props) {
  const presenter = usePresenter();
  const shell = useContext(SpeakerShellContext);
  const rehearse = shell?.rehearse ?? false;
  const notesSize = shell?.notesSize ?? 40;
  const showActions = shell?.showActions ?? false;
  const toast = shell?.toast ?? null;
  const notesBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rehearse) return;
    const entered = Date.now();
    return () => {
      try {
        const log = JSON.parse(localStorage.getItem(LOG_KEY) ?? logInMemory ?? "[]") as { slideId: string; seconds: number; at: number }[];
        log.push({ slideId: slide.id, seconds: Math.round((Date.now() - entered) / 1000), at: entered });
        logInMemory = JSON.stringify(log);
        localStorage.setItem(LOG_KEY, logInMemory);
      } catch {
        /* no storage */
      }
    };
  }, [rehearse, slide.id]);

  // Every step change brings the current step's notes into view.
  const currentStep = presenter?.state.stepIndex;
  useEffect(() => {
    notesBodyRef.current?.scrollTo({ top: 0 });
  }, [slide.id, currentStep]);

  const page: DemoPage | undefined = slide.page;
  const demo: Omit<Demo, "routes"> | undefined = slide.demo;
  const heading = page && demo ? (hasFrame(page) && page.beat !== "single" ? { eyebrow: page.eyebrow, title: page.title } : { eyebrow: page.beat === "intro" ? "Intro slide" : null, title: page.beat === "intro" ? demo.title : page.title }) : null;

  if (!presenter) return null;
  const { state, demoHealth, audienceConnected, update } = presenter;
  const steps: Step[] = page?.steps ?? [];
  const stepIndex = state.stepIndex < 0 ? Math.max(steps.length - 1, 0) : Math.min(state.stepIndex, Math.max(steps.length - 1, 0));
  const step = steps[stepIndex];
  const last = steps.length > 0 && stepIndex === steps.length - 1;
  const nextStep = steps[stepIndex + 1];
  const showCautions = last && page?.beat === "after";
  const nextPageName = next ? speakerSlideName(next) : null;
  const nextDesc = next?.page ? next.demo?.scenario : undefined;
  const framed = Boolean(page && hasFrame(page));
  const pb = presenter.playback;
  // Matched on the slide, not the step: the audience stage reports a step's start with the step it
  // was on before the press (its playState ref updates after the frame's effect), so a step match
  // would never show Playing. The finish message carries the right step and clears it.
  const playing = Boolean(pb && pb.playing && pb.slideId === slide.id);
  const status = framed && page ? frameStatus(audienceConnected, demoHealth[page.id], playing) : null;
  const supportLine = demo?.support ? (demo.support.kind === "tooling" ? `Tools: ${demo.support.packages.map((p) => `${p.name} ${p.version}`).join(", ")}.` : `web-features: ${demo.support.id}${demo.support.alsoUses?.length ? `; also uses ${demo.support.alsoUses.join(", ")}` : ""}.`) : null;
  const hasSupport = Boolean(supportLine || step?.proof);
  // Demo pages carry their demo's citations; copy slides carry their own.
  const citations = slide.citations;
  const hasCitations = citations.length > 0;
  const hasReferences = Boolean(step) || hasSupport || hasCitations;

  return (
    <>
      <section className="speaker__slides" aria-label="Slide previews">
        <div className="speaker__current" data-blank={state.blank}>
          {state.blank ? (
            <p className="speaker__flag" data-flag="blank">
              Blank
            </p>
          ) : null}
          {state.handsOn ? (
            <p className="speaker__flag" data-flag="hands-on">
              Hands-on
            </p>
          ) : null}
          {current}
        </div>
        <section className="speaker__next" aria-labelledby="speaker-next-label">
          <h2 className="speaker__label" id="speaker-next-label">
            Next slide
          </h2>
          {next ? (
            <div className="speaker__next-row">
              {/* Out of the tree and the tab order: its h1 and regions would repeat the current slide's. */}
              <div className="speaker__next-preview" inert aria-hidden="true">
                {nextPreview}
              </div>
              <div className="speaker__next-meta">
                <p className="speaker__next-title">
                  {next.index} · {nextPageName}
                </p>
                {nextDesc ? <p className="speaker__next-desc">{nextDesc}</p> : null}
              </div>
            </div>
          ) : (
            <p className="speaker__next-title">End of deck</p>
          )}
        </section>
      </section>

      <main className="speaker__main" aria-labelledby="speaker-title">
        <header className="speaker__heading notes__header">
          <div className="speaker__meta">
            <p className="speaker__position">
              <b>{slide.index}</b>
              <span className="visually-hidden"> of </span>
              <span className="speaker__total">{total}</span>
              {page && demoPosition ? ` · Demo ${demoPosition.n} of ${demoPosition.of}` : null}
            </p>
            <div className="speaker__size" role="group" aria-label="Notes text size">
              <button type="button" className="speaker__icon-button" onClick={() => shell?.changeNotes(-4)} disabled={notesSize <= NOTES_MIN} aria-label="Smaller notes text">
                <AArrowDown {...ICON} />
              </button>
              <button type="button" className="speaker__icon-button" onClick={() => shell?.changeNotes(4)} disabled={notesSize >= NOTES_MAX} aria-label="Larger notes text">
                <AArrowUp {...ICON} />
              </button>
            </div>
          </div>
          <h2 className="speaker__title" id="speaker-title">
            {heading ? (
              <>
                {heading.eyebrow ? <b className="notes__eyebrow">{heading.eyebrow}:</b> : null}
                {heading.eyebrow ? " " : null}
                {heading.title}
              </>
            ) : (
              <b className="notes__eyebrow">{slide.title}</b>
            )}
          </h2>
          {page && step ? (
            <>
              <div className="speaker__step-row">
                <p className="notes__step">
                  Step {stepIndex + 1} of {steps.length}: {step.label}
                  {step.key ? <span className="notes__chip notes__chip--key">Key point</span> : null}
                  {step.proof ? <span className="notes__chip">Proof</span> : null}
                </p>
                {status ? (
                  <p className="notes__play" role="status" data-status={status.key} title={buildNote(presenter.otherBuild)}>
                    {status.text}
                  </p>
                ) : null}
              </div>
              {steps.length >= 2 ? (
                <ol className="speaker__progress" aria-hidden="true">
                  {steps.map((s, i) => (
                    <li key={s.id} data-state={i < stepIndex ? "done" : i === stepIndex ? "current" : "upcoming"} />
                  ))}
                </ol>
              ) : null}
              {nextStep ? (
                <p className="notes__then">
                  <b>Next step:</b> {nextStep.label}
                  {showActions ? <span className="notes__then-actions">{summarize(nextStep.actions) || "no actions"}</span> : null}
                </p>
              ) : null}
            </>
          ) : null}
        </header>

        <section className="speaker__notes" aria-label="Notes" style={{ "--notes-size": `${notesSize}px` } as React.CSSProperties}>
          <div className="speaker__notes-body" ref={notesBodyRef}>
            {page && step ? (
              <>
                {state.handsOn && step.ifKeyboard ? <p className="notes__hands-on">{step.ifKeyboard}</p> : null}
                {stepIndex === 0 && page.notes ? <NotesText text={page.notes} paragraph="notes__intro" quote="notes__quote" list="notes__list" /> : null}
                {step.notes.length ? (
                  <ul className="notes__bullets" data-key={step.key || undefined}>
                    {step.notes.map((b, i) => (
                      <li key={b} className="notes__bullet" data-key={(step.key && i === step.notes.length - 1) || undefined}>
                        <NotesInlineText text={b} />
                      </li>
                    ))}
                  </ul>
                ) : null}
                {showCautions && demo && demo.cautions.length ? (
                  <section className="notes__cautions" aria-label="Cautions">
                    <p className="notes__cautions-label">Cautions</p>
                    <ul>
                      {demo.cautions.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </>
            ) : (
              <NotesText text={slide.notes} paragraph="notes__intro" quote="notes__quote" list="notes__list" />
            )}
            {hasReferences ? (
              // Keyed by slide, so it is closed again on every slide change (8.4).
              <details className="notes__reference" key={slide.id}>
                <summary>
                  <ChevronRight {...ICON} />
                  References
                </summary>
                <div className="notes__reference-body">
                  {hasSupport ? (
                    <div className="notes__group">
                      <p className="notes__group-label">Support</p>
                      {supportLine ? <p className="notes__support">{supportLine}</p> : null}
                      {step?.proof ? <p className="notes__support">Proof item: {step.proof}</p> : null}
                    </div>
                  ) : null}
                  {hasCitations ? (
                    <div className="notes__group">
                      <p className="notes__group-label">Sources</p>
                      <ul className="notes__citations">
                        {citations.map((c) => (
                          <li key={c.url + c.text}>
                            <a href={c.url} target="_blank" rel="noopener">
                              {c.text}
                              <span className="visually-hidden">, opens in a new tab</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {step ? (
                    <>
                      <div className="notes__group">
                        <p className="notes__group-label">Jump to step</p>
                        <ol className="speaker__steps">
                          {steps.map((s, i) => (
                            <li key={s.id}>
                              <button type="button" className="speaker__step-button" aria-current={i === stepIndex ? "step" : undefined} onClick={() => update({ stepIndex: i })}>
                                {i + 1}. {s.label}
                              </button>
                            </li>
                          ))}
                        </ol>
                      </div>
                      <div className="notes__group">
                        <p className="notes__group-label">Actions</p>
                        <p className="notes__actions">This step: {summarize(step.actions) || "no actions"}</p>
                        {nextStep ? <p className="notes__actions">Next step: {summarize(nextStep.actions) || "no actions"}</p> : null}
                      </div>
                    </>
                  ) : null}
                </div>
              </details>
            ) : null}
          </div>
        </section>

        {toast ? (
          <p className="speaker__toast" role="status" data-shown={toast.shown}>
            {toast.text}
          </p>
        ) : null}
      </main>
    </>
  );
}
