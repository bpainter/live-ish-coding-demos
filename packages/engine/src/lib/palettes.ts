/**
 * The two fixed palettes, as data, so the stylesheets and the contrast checks read one source.
 * `pnpm --filter @live-ish/engine gen:themes` writes them to styles/deck/palette.generated.css and
 * styles/speaker/palette.generated.css.
 *
 * Deck: copy slides read like a galley proof. Newsprint paper and carbon ink, one proofing vermilion,
 * chosen by contrast first. Every text pair here clears 4.5:1 on its field.
 */
export const DECK_PALETTE = {
  // The light field
  "--deck-paper": "#f4efe4",
  "--deck-ink": "#1d1b17",
  "--deck-ink-soft": "#54504a",
  "--deck-accent": "#b1321a",
  "--deck-rule": "#c9c0ae",
  // The dark field
  "--deck-carbon": "#1b1a17",
  "--deck-on-carbon": "#f4efe4",
  "--deck-on-carbon-soft": "#c9c2b4",
  "--deck-accent-on-carbon": "#ff9d7e",
  "--deck-rule-on-carbon": "#4a463e",
  // The accent field
  "--deck-on-accent": "#fff8ee",
  // Panels and plates
  "--deck-panel": "#ebe4d5",
  "--deck-plate": "#ffffff",
} as const;

export type DeckToken = keyof typeof DECK_PALETTE;

/** Every pair a copy layout draws: [text, surface, floor]. `theme-contrast` runs these with `theme.tokens`. */
export const DECK_PAIRS: [DeckToken, DeckToken, number][] = [
  ["--deck-ink", "--deck-paper", 7],
  ["--deck-ink-soft", "--deck-paper", 4.5],
  ["--deck-accent", "--deck-paper", 4.5],
  ["--deck-ink", "--deck-panel", 7],
  ["--deck-ink-soft", "--deck-panel", 4.5],
  ["--deck-accent", "--deck-panel", 4.5],
  ["--deck-on-carbon", "--deck-carbon", 7],
  ["--deck-on-carbon-soft", "--deck-carbon", 4.5],
  ["--deck-accent-on-carbon", "--deck-carbon", 4.5],
  ["--deck-on-accent", "--deck-accent", 4.5],
  ["--deck-rule", "--deck-carbon", 3],
];

/**
 * Presenter chrome: the house lights are down, and a stage manager's cue light is the only warm thing
 * in the room. Fixed: no theme reaches these (they sit on :root, and theme-lint refuses the prefix).
 * Floors are the same as before: text 4.5:1 on every surface, rings 3:1.
 */
export const SPEAKER_PALETTE = {
  "--speaker-bg": "#0e0f0d",
  "--speaker-solid": "#23251f",
  "--speaker-ink": "#ffffff",
  "--speaker-ink-body": "#dcdccf",
  "--speaker-ink-soft": "#bcbcae",
  // "You are here": the current step, links, the focus ring.
  "--speaker-here": "#ffcb6b",
  // Hands-on and key points.
  "--speaker-cue": "#a5e27a",
  // Blank, over time, errors.
  "--speaker-alert": "#ff9180",
  "--speaker-over": "#ffa899",
  "--speaker-primary": "#2c6e49",
  "--speaker-primary-hover": "#245a3c",
  "--speaker-on-flag": "#14150f",
  "--speaker-glow-warm": "rgb(255 203 107 / 0.08)",
  "--speaker-glow-green": "rgb(165 226 122 / 0.05)",
  "--speaker-panel": "rgb(255 255 255 / 0.05)",
  "--speaker-panel-strong": "rgb(255 255 255 / 0.08)",
  "--speaker-card": "rgb(255 255 255 / 0.04)",
  "--speaker-hover": "rgb(255 255 255 / 0.1)",
  "--speaker-rule": "rgb(255 255 255 / 0.12)",
  "--speaker-edge": "rgb(255 255 255 / 0.16)",
  "--speaker-pill": "rgb(35 37 31 / 0.88)",
  "--speaker-tint-here": "rgb(255 203 107 / 0.16)",
  "--speaker-tint-cue": "rgb(165 226 122 / 0.16)",
  "--speaker-tint-alert": "rgb(255 145 128 / 0.18)",
  "--speaker-tint-neutral": "rgb(255 255 255 / 0.08)",
  "--speaker-scrim": "rgb(14 15 13 / 0.56)",
  "--speaker-clear-tint": "rgb(35 37 31 / 0.3)",
  "--speaker-shadow-color": "rgb(0 0 0 / 0.42)",
} as const;
