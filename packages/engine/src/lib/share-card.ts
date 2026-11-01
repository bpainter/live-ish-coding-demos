import { createHash } from "node:crypto";
import type { Deck } from "../schema/assemble";
import { DECK_PALETTE, type DeckToken } from "./palettes";

/**
 * The default share card: what a link preview shows on a deck with no `live-ish og` capture. It
 * needs no browser, so a person with one slide and no Playwright still gets a card.
 *
 * This file is the data only. `share-card-image.tsx` draws it, and stays apart so that `check` and
 * every page's metadata can name the card without loading the image renderer.
 */

export const SHARE_CARD = {
  /** Under `/live-ish`, so `reserved-route` keeps demos off it. `robots.txt` lets preview bots in. */
  path: "/live-ish/og/card.png",
  width: 1200,
  height: 630,
  type: "image/png",
} as const;

/**
 * What the card's font draws, read from its cmap. A character outside this list sends `next/og` to
 * Google Fonts for a glyph, with the deck's text in the address. That is a network call from a build
 * that must pass offline, and on the emoji path a failed call stops the build. A test renders every
 * character here with `fetch` trapped, so a new font in Next fails there.
 */
const DRAWN = /[^ -~ -¬®-ēĖ-īĮ-ķĹ-ľŁ-ňŊ-ōŐ-žЀ-џẠ-ỹ–—‘-‚“-„†-•…‰′″‹›€™←-↙]/gu;

/**
 * Text as the card can draw it. An emoji or a symbol just leaves. A line that would lose a letter or
 * a digit goes whole, because half a title reads as a different title. `og:title` and the image's
 * alt text still carry it in full.
 */
export function drawable(text: string): string {
  const clean = text.normalize("NFC").replace(/\s+/g, " ");
  const missing = clean.match(DRAWN) ?? [];
  if (missing.some((c) => /[\p{L}\p{N}]/u.test(c))) return "";
  return clean.replace(DRAWN, "").replace(/ {2,}/g, " ").trim();
}

/** A token as a plain hex color. The renderer has no `var()` and throws on what it can't parse. */
function color(deck: Deck, token: DeckToken): string {
  const value = deck.theme.tokens[token];
  return value && /^#[0-9a-f]{3,8}$/i.test(value) ? value : DECK_PALETTE[token];
}

export interface ShareCardFacts {
  title: string;
  byline: string;
  paper: string;
  ink: string;
  soft: string;
  accent: string;
}

/** Everything the card shows, so its version can't miss an input. */
export function shareCardFacts(deck: Deck): ShareCardFacts {
  return {
    title: drawable(deck.title),
    byline: drawable([deck.speaker.name, deck.role, deck.event?.label].filter(Boolean).join(", ")),
    paper: color(deck, "--deck-paper"),
    ink: color(deck, "--deck-ink"),
    soft: color(deck, "--deck-ink-soft"),
    accent: color(deck, "--deck-accent"),
  };
}

/** Changes with what the card shows, because social networks cache an image by its address. */
export function shareCardVersion(deck: Deck): string {
  return createHash("sha256").update(JSON.stringify(shareCardFacts(deck))).digest("hex").slice(0, 8);
}
