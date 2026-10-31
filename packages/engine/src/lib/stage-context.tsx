"use client";

import { createContext, useContext } from "react";
import type { StepResult } from "./engine/frame";

export type DemoStatus = "loading" | "ready" | "error";

export interface Playback {
  isPlaying: () => boolean;
  finish: () => void;
}

export interface StageState {
  stepIndex: number;
  stepCount: number;
  /** Steps stop playing; the speaker's keyboard and pointer reach the demo. */
  handsOn: boolean;
  /** Terminal pages: the recording is hidden for a real terminal. */
  live: boolean;
  /** Increments on `r`; the page frame remounts and replays the current step. */
  reloadToken: number;
  rehearsal: boolean;
  demoStatus: Record<string, DemoStatus>;
  /** Last step result per page id, from the frame runtime. */
  stepResults: Record<string, { stepId: string; result: StepResult }>;
  setStepIndex: (n: number) => void;
  setDemoStatus: (pageId: string, status: DemoStatus) => void;
  setStepResult: (pageId: string, stepId: string, result: StepResult) => void;
  /** The page frame reports when a step starts and stops playing (the speaker's Playing / Ready). */
  reportPlaying: (playing: boolean) => void;
  /** The page frame registers its playback so Next can finish a running step. */
  registerPlayback: (p: Playback | null) => void;
  /** Keys forwarded from inside a frame. */
  dispatchKey: (key: string, shiftKey: boolean) => void;
  focusStage: () => void;
  /** The audience theme on show, with any `?chrome=` preview applied. */
  chrome?: string;
}

export const StageContext = createContext<StageState | null>(null);

export function useStage(): StageState {
  const ctx = useContext(StageContext);
  if (!ctx) throw new Error("useStage must be used inside <Stage>");
  return ctx;
}
