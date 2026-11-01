import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface Budget {
  limit: number;
  tier: "guarantee" | "target";
  /** A proposed number, moved by a rebaseline with its reason recorded in `rebaseline`. */
  proposed?: boolean;
}

export interface Budgets {
  reference: { server: string; browser: string; profile: "venue"; deck: string; runs: number; statistic: string };
  underlay: { minArrivalsPerWindow: number; audienceP90Ms: Budget; readerP90Ms: Budget; loadingWithPoster: Budget; posterSwap: Budget };
  focus: { lostPresses: Budget };
  advance: { leaveFramedPageMs: Budget };
  load: { engineJsBytes: Budget; engineCssBytes: Budget; themeCssBytes: Budget; demoFontBytes: Budget; cls: Budget };
  nav: { keyToPaintP90Ms: Budget };
  frame: { backReplayMedianMs: Budget; backReplayP90Ms: Budget };
  walk: { warmRevalidations: Budget };
  theme: { frameDifference: Budget; reducedMotionMs: Budget };
}

/** The one file every check reads. */
export const budgets = JSON.parse(readFileSync(fileURLToPath(new URL("../../budgets.json", import.meta.url)), "utf8")) as Budgets;

/** What a dev server prints, and why it exits 0. A dev server number says nothing about the stage. */
export const DEV_SERVER_LINE = "dev server: budget not applied";
