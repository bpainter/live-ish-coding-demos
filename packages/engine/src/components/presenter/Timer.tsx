"use client";

import { useEffect, useState } from "react";
import { Pause, Play, TimerReset } from "lucide-react";
import type { PresenterState } from "../../lib/presenter/types";

interface Props {
  state: PresenterState;
  /** Target elapsed time at the end of the current slide, in minutes. */
  cumulativeMinutes: number;
  /** Start, pause or resume: the same as `t`. */
  onToggle: () => void;
  /** Back to "0:00", not started. Offered only while paused. */
  onReset: () => void;
}

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function formatClock(ms: number): string {
  const sign = ms < 0 ? "-" : "";
  const total = Math.round(Math.abs(ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${sign}${m}:${String(s).padStart(2, "0")}`;
}

export function elapsedMs(state: PresenterState, now: number): number {
  if (state.startedAt === null) return 0;
  return (state.pausedAt ?? now) - state.startedAt;
}

const ICON = { size: 18, strokeWidth: 1.75, "aria-hidden": true } as const;

/**
 * The speaker footer's timer pill: elapsed, the pace against the
 * current slide's target, start or pause, and reset while paused. Not a live region: it ticks
 * every 500 ms and would talk over the speaker's screen reader.
 */
export function SpeakerTimer({ state, cumulativeMinutes, onToggle, onReset }: Props) {
  const now = useNow();
  const elapsed = elapsedMs(state, now);
  const delta = elapsed - cumulativeMinutes * 60_000;
  const started = state.startedAt !== null;
  const paused = started && state.pausedAt !== null;
  const running = started && !paused;
  const pace = !started ? "none" : delta > 0 ? "over" : "under";
  const paceText = !started ? "Not started" : `${paused ? "Paused, " : ""}${delta > 0 ? `${formatClock(delta)} over` : `${formatClock(-delta)} under`}`;
  return (
    <div className="speaker__timer" role="group" aria-label="Timer" data-running={running} data-paused={paused} data-pace={pace}>
      <time className="speaker__elapsed" dateTime={`PT${Math.round(elapsed / 1000)}S`}>
        {formatClock(elapsed)}
      </time>
      <span className="speaker__pace">{paceText}</span>
      <button type="button" className={started ? "speaker__icon-button" : "speaker__icon-button speaker__icon-button--primary"} onClick={onToggle} aria-label={running ? "Pause timer" : started ? "Resume timer" : "Start timer"}>
        {running ? <Pause {...ICON} /> : <Play {...ICON} />}
      </button>
      {paused ? (
        <button type="button" className="speaker__icon-button" onClick={onReset} aria-label="Reset timer">
          <TimerReset {...ICON} />
        </button>
      ) : null}
    </div>
  );
}
