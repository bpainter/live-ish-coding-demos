import type { Tier } from "./types";

/**
 * Every rule id and its tier, as data with no imports, because `defineDeck()` reads it to validate
 * `checks.rules` and that code reaches the client bundle. The rule modules take their tier from
 * here, so a rule and the config check cannot disagree.
 *
 * - Integrity: always on, always errors, cannot be turned off. The demo breaks on stage without them.
 * - Fit: warnings, errors under `--strict`. The layout overflows, a claim has no source, or a
 *   generated file is stale.
 * - Support: runs only when a demo uses `support` or an intro.
 * - Style: off until a preset or a rule setting turns it on. Taste, not a defect.
 */
export const TIERS: Record<Tier, readonly string[]> = {
  integrity: ["config", "build", "code", "files", "excerpt", "selector", "hook", "flags", "via", "viewport", "label", "page-order", "frame-change", "duration", "nav", "group", "deck-links", "theme", "wrapper-markup", "wrapper-unknown", "wrapper-missing", "wrapper-shown", "terminal-range", "terminal-token", "reserved-route", "bg-missing", "bg-unknown", "bg-file"],
  fit: ["file-size", "storage-clear", "presenter-public", "third-party-script", "callouts", "step-cap", "bullets", "key-step", "keyboard", "proof", "meter", "todo", "images", "public-files", "fonts", "poster-fresh", "og-stale", "og-image", "jsonld", "seo-title", "event-date", "theme-lint", "theme-contrast", "wrapper-lint", "wrapper-banned", "support-claim", "skills-stale", "timing", "bg-unused", "bg-shared", "bg-size", "bg-bytes", "bg-duplicate", "bg-stats"],
  support: ["support", "intro", "eyebrow"],
  // `seo-description` is here for its taste checks; its length check stays Fit (rules/seo.ts).
  style: ["dash", "exclaim", "case", "slide-case", "banned", "sentence", "x-not-y", "intro-sentences", "bullet-length", "step-words", "budget", "cautions", "seo-description"],
};

/** Gone from v1. Named here only so a config that sets one hears why. */
export const REMOVED_RULES: readonly string[] = ["v3-field", "tailwind", "qr", "grain", "theme-hash", "title", "bg-adjacent", "bg-frame", "bg-glass", "bg-leftover"];

/** The rules another module registers: `rules/chrome.ts` and `rules/terminal.ts`. */
export const EXTERNAL_RULES: readonly string[] = ["terminal-range", "terminal-token"];

export const RULE_IDS: readonly string[] = Object.values(TIERS).flat();

const TIER_BY_ID = new Map(Object.entries(TIERS).flatMap(([tier, ids]) => ids.map((id) => [id, tier as Tier] as const)));

export function tierOf(id: string): Tier | undefined {
  return TIER_BY_ID.get(id);
}

export const docsUrl = (rule: string) => `https://live-ish.dev/errors/${rule}`;
