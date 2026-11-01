import { deckKey } from "../deck-keys";

export type DemoHealth = "loading" | "ready" | "error" | "fallback";

/** Shared state of the two presenter windows, plus the demo view and cell. */
export interface PresenterState {
  seq: number; // monotonic, incremented by whoever writes
  writer: string; // random id of the window that produced this state
  slideId: string;
  stepIndex: number; // 0-based; -1 means "the last step of this slide", resolved by the stage
  blank: boolean;
  handsOn: boolean; // steps stop playing; the speaker's keyboard and pointer reach the demo
  live: boolean; // terminal pages: recording hidden for a real terminal
  startedAt: number | null; // epoch ms when the timer was started
  pausedAt: number | null; // epoch ms when paused, else null
  resetSeq?: number; // bumped by `r` and Reset step in either window: every stage on the slide replays its frame
}

export type SyncMessage =
  | { type: "state"; state: PresenterState }
  | { type: "hello"; writer: string }
  | { type: "demo-health"; demoId: string; status: DemoHealth; writer: string }
  /** The audience window reports whether a step is playing, so the speaker waits for Ready. */
  | { type: "playback"; slideId: string; stepIndex: number; playing: boolean; writer: string }
  /** Every window says it is still here every 2 s, so the speaker sees a lost audience window. */
  | { type: "presence"; writer: string; mode: "audience" | "speaker" };

export interface Playback {
  slideId: string;
  stepIndex: number;
  playing: boolean;
}

export const STORAGE_KEY = deckKey("state");

export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

/** The build in the name keeps two windows on different deployments from driving each other. */
export function channelName(): string {
  return deckKey(`sync:${BUILD_ID}`);
}

/** Every build of a deck shares this one, only to say which build it is. */
export function buildsChannelName(): string {
  return deckKey("builds");
}

/** A window's own message on the builds channel. */
export interface BuildNotice {
  build: string;
}

export function newWriterId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Accept an incoming state only if it is newer; ties go to the lexically greater writer so both windows converge. */
export function isNewer(incoming: PresenterState, current: PresenterState | null): boolean {
  if (!current) return true;
  if (incoming.seq !== current.seq) return incoming.seq > current.seq;
  return incoming.writer > current.writer;
}
