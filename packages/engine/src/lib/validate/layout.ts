import { SPLITS } from "../../schema/demo";

/**
 * Limits that come from the 1920 by 1080 stage, not from taste. Fit rules read these, and an author
 * can only relax a Fit rule's severity, never its number: changing one means changing the layout.
 */

/** The code card at 60/40, the narrower of the two splits. */
export const CODE_CARD_PX = SPLITS["60/40"].code;
export const CODE_FONT_PX = 24;

export const LAYOUT = {
  /** What fits the narrowest code card at the code font, so a page can change split freely. */
  columns: 44,
  /** The panel's visible lines at the code font. */
  fileLines: 40,
  /** Highlighted lines at once. */
  highlight: 12,
  /** The highlighted range, gaps included: the panel shows 21 lines, so both ends stay on screen with one to spare. */
  highlightSpan: 20,
  /** Tabs that fit the code card's title row. */
  tabs: { before: 4, after: 3 } as Record<string, number>,
  /** Steps after s0 that the stage's pacing and step rail hold. */
  stepCap: { intro: 0, before: 3, after: 5, single: 5 } as Record<string, number>,
  /** Notes paragraphs per step, each one a beat the speaker window can show at once. */
  bullets: { intro: [0, 0], before: [1, 3], after: [1, 3], single: [1, 3] } as Record<string, [number, number]>,
  s0Bullets: 3,
  proofs: 2,
  callouts: { perStep: 1, words: 3 },
  /** Words a step label can hold in the speaker's step rail. */
  labelWords: 5,
  /** The intro's description, under the title on one slide. */
  description: { words: 20, sentences: 2 },
  /** The demo's title as the eyebrow above a walk page's heading: one line. */
  eyebrowChars: 60,
} as const;

/** Open Graph card size and weight. */
export const OG = { width: 1200, height: 630, maxBytes: 300 * 1024 };

/** Background files fill the stage, so they carry its size. */
export const BACKGROUND = { width: 1920, height: 1080, warnBytes: 900 * 1024, maxBytes: 1.5 * 1024 * 1024 };
