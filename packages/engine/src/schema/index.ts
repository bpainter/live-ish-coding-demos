import type { DeckConfig, DemoConfig, ShownFile } from "./config";
import type { SlideConfig } from "./slide";

export type { DeckConfig, DeckEventConfig, DemoConfig, IntroConfig, ShownFile, StepConfig } from "./config";
export type { Action, Beat, Browser, DemoCodeLang, Frame, FrameKind, Key, SplitRatio, Step, SupportSource } from "./demo";
export type { Background, TextZone } from "./backgrounds";
export type { Citation, CopyLayout, GridCard, SlideConfig, SlideImage, SlideItem } from "./slide";
export type { ServerRoute } from "../lib/frames/routes";

/** The deck. `deck.config.ts` default-exports this. */
export function defineDeck(config: DeckConfig): DeckConfig {
  return config;
}

/** A copy slide. Each file under `slides/` default-exports one. */
export function defineSlide(config: SlideConfig): SlideConfig {
  return config;
}

/** A demo. `demos/<id>/demo.ts` default-exports one, and the rest derives from it and its folder. */
export function defineDemo(config: DemoConfig): DemoConfig {
  return config;
}

/**
 * A whole file on the code panel, shown as it runs. The path is relative to the beat's folder
 * (`before/`, `after/`), or to the demo's folder on a terminal page.
 */
export function shown(file: string): ShownFile {
  return { file };
}

/**
 * Part of a file on the code panel: the ranges joined by generated elision lines. `code.lines` then
 * counts shown lines, so shown line 2 can be source line 14.
 */
export function excerpt(file: string, ranges: [number, number][]): ShownFile {
  return { file, ranges };
}
