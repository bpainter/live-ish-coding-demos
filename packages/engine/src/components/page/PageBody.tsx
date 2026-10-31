"use client";

import { useCallback, useEffect, useRef } from "react";
import type { FramePage } from "../../schema/demo";
import type { Mode } from "../../lib/mode";
import type { RenderedFile } from "../../lib/highlight";

export type PanelFile = RenderedFile & { elisions: number[] };
import type { StepResult } from "../../lib/engine/frame";
import { useStage } from "../../lib/stage-context";
import { frameLive, offlineNote } from "../../lib/frames/origins";
import { announce, ensureAnnouncer } from "../../lib/announce";
import { stepAnnouncement, stepCodeSentence } from "../../lib/code-description";
import { PageFrame } from "./PageFrame";
import { PageCodePanel } from "./PageCodePanel";

interface Props {
  page: FramePage;
  files: PanelFile[];
  sandbox: string;
  mode: Mode;
  slot: { width: number; height: number };
  /** Computed meter values by step id. */
  meters: Record<string, string | null>;
  /** Poster path per step id, null when the file is not in public/. */
  posters: Record<string, string | null>;
}

/** The body of a demo page: frame, meter, and the code panel. */
export function PageBody({ page, files, sandbox, mode, slot, meters, posters }: Props) {
  const { stepIndex, setDemoStatus, setStepResult } = useStage();
  const step = page.steps[stepIndex];
  // The meter shows from its step to the end of the page, at the top right of the title row.
  const meterStep = page.steps
    .slice(0, stepIndex + 1)
    .reverse()
    .find((s) => s.meter);
  const meter = meterStep?.meter;
  const onStatus = useCallback((s: "loading" | "ready" | "error") => setDemoStatus(page.id, s === "ready" ? "ready" : s === "error" ? "error" : "loading"), [page.id, setDemoStatus]);
  const onStepResult = useCallback((stepId: string, result: StepResult) => setStepResult(page.id, stepId, result), [page.id, setStepResult]);

  // Reader mode: a step the reader moves to is announced once, with what the code highlights. The
  // step a page opens on (`?step=`, or Back landing on the last
  // step) is not: Next's route announcer has just read the page's title.
  const announcedStep = useRef<number | null>(null);
  useEffect(() => {
    if (mode !== "reader") return;
    ensureAnnouncer();
    const count = page.steps.length;
    if (announcedStep.current === null) {
      const raw = new URLSearchParams(window.location.search).get("step");
      const n = raw === "last" ? count - 1 : Number.parseInt(raw ?? "0", 10);
      // The stage restores this step from the URL right after mount; that move is not announced.
      announcedStep.current = Number.isFinite(n) ? Math.min(Math.max(n, 0), Math.max(count - 1, 0)) : 0;
      return;
    }
    if (announcedStep.current === stepIndex) return;
    announcedStep.current = stepIndex;
    const s = page.steps[stepIndex];
    if (!s || count < 2) return;
    const shown = files.find((f) => f.file === s.code?.file);
    announce(stepAnnouncement(stepIndex, count, s.label, stepCodeSentence(s.code, shown?.elisions)));
  }, [mode, stepIndex, page.steps, files]);

  const preview = mode === "speaker-preview";
  const poster = step ? posters[step.id] : null;
  // A frame whose origin is not configured (a server app on a deployment without it) shows the
  // step's captured poster instead of loading a dead address.
  const offline = Boolean(page.frame) && !preview && !frameLive(page.frame.route);

  return (
    <div className="page__body">
      <div className="page__frame">
        {!page.frame ? null : preview || offline ? (
          <div className="page__poster" data-has-poster={Boolean(poster)} data-offline={offline || undefined}>
            {/* A static poster, served from public/; next/image adds nothing for a preview. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {poster ? <img className="page__poster-image" src={poster} alt={offline ? `Captured still of the live demo: ${step ? step.label : page.title}` : ""} /> : null}
            {offline ? <p className="page__poster-note">{offlineNote()}</p> : <p className="page__poster-label">{step ? step.label : page.title}</p>}
          </div>
        ) : (
          // The step's poster sits under the frame until its document has replayed, unless the step
          // says it differs from the live document too much to swap unseen.
          <PageFrame page={page} sandbox={sandbox} mode={mode} slot={slot} onStatus={onStatus} onStepResult={onStepResult} poster={step?.posterUnderlay === false ? null : poster} />
        )}
      </div>
      {page.steps.length > 1 ? (
        <div className="page__steps" aria-hidden="true">
          <span>
            Step {stepIndex + 1} of {page.steps.length}
          </span>
          <span className="page__steps-bar">
            {page.steps.map((s, i) => (
              <span key={s.id} className="page__steps-seg" data-state={i < stepIndex ? "done" : i === stepIndex ? "current" : "future"} />
            ))}
          </span>
        </div>
      ) : null}
      {meter && meterStep ? (
        <p className="page__meter" aria-live="polite">
          <span className="page__meter-label">{meter.label}</span>
          <span className="page__meter-value">{meters[meterStep.id] ?? meter.value}</span>
        </p>
      ) : null}
      {files.length > 0 ? (
        <section className="page__code" aria-label="Code">
          <PageCodePanel files={files} code={step?.code} mode={mode} />
        </section>
      ) : null}
    </div>
  );
}
