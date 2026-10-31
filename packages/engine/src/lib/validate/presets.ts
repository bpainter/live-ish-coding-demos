import type { DeckConfig } from "../../schema/config";
import type { Severity, Tier } from "./types";

/**
 * Writing presets. `plain` is one person's house style, kept because the validator is worth having
 * and left off by default because a stranger's deck should not fail on a dash.
 */

export const BANNED = ["seamless", "seamlessly", "leverage", "robust", "powerful", "magic", "simply", "just", "easily", "unlock", "game changer", "under the hood", "out of the box", "basically", "actually", "obviously", "of course", "as you can see", "for free", "plumbing"];

export type Level = "off" | "warn" | "error";
export type RuleSetting = Level | { warn?: number; error?: number };

export interface WritingPreset {
  rules: Record<string, RuleSetting>;
  banned: readonly string[];
}

export const PRESETS: Record<"none" | "plain", WritingPreset> = {
  none: { rules: {}, banned: [] },
  plain: {
    rules: {
      dash: "error",
      exclaim: "error",
      case: "error",
      // Spoken notes warn only, whatever the limit: a speaker's verified wording stands.
      sentence: { warn: 15, error: 20 },
      banned: "error",
      "x-not-y": "warn",
      "slide-case": "error",
    },
    banned: BANNED,
  },
};

/** The numbers behind Style rules that no preset turns on; `checks.rules` turns them on by id. */
export const STYLE_LIMITS = {
  sentence: { warn: 15, error: 20 },
  /** One paragraph of spoken notes. */
  bulletWords: 45,
  /** A page's opening notes. */
  introWords: 70,
  introSentences: [2, 8] as [number, number],
  wordsPerMinute: 130,
  stepWords: 70,
  /** An `after` page, opening notes plus every step. */
  afterPageWords: 220,
  cautions: { count: 3, words: 20 },
  /** A slide description, the length search and share cards show. */
  descriptionChars: 160,
};

export interface Settings {
  /** The level a rule runs at, before `--strict`. */
  level(id: string, tier: Tier): Level;
  /** True when `checks.rules` names this rule, which `--strict` then leaves alone. */
  explicit(id: string): boolean;
  sentence: { warn: number; error: number };
  banned: string[];
}

/** What a deck's `writing` and `checks` add up to. `checks.rules` wins, then `writing.rules`, then the preset. */
export function resolveSettings(config: Pick<DeckConfig, "writing" | "checks">): Settings {
  const preset = PRESETS[config.writing?.preset ?? "none"];
  const writing = (config.writing?.rules ?? {}) as Record<string, RuleSetting>;
  const checks = (config.checks?.rules ?? {}) as Record<string, Level>;
  const extra = config.writing?.banned ?? [];
  const setting = (id: string): RuleSetting | undefined => writing[id] ?? preset.rules[id];
  const sentence = setting("sentence");
  return {
    level(id, tier) {
      if (tier === "integrity") return "error";
      if (checks[id]) return checks[id];
      if (tier === "fit") return config.checks?.fit ?? "warn";
      if (tier === "support") return "error";
      const value = setting(id);
      if (value === undefined) return id === "banned" && extra.length ? "error" : "off";
      return typeof value === "string" ? value : "error";
    },
    explicit: (id) => checks[id] !== undefined,
    sentence: { ...STYLE_LIMITS.sentence, ...(typeof sentence === "object" ? sentence : {}) },
    banned: [...preset.banned, ...extra.map((w) => w.toLowerCase())],
  };
}

/**
 * The severity a finding ends on. Integrity is always an error. A Fit finding takes its rule's
 * level, and `--strict` raises it unless the deck relaxed that rule by name. Elsewhere the finding
 * can only go down: spoken notes stay warnings under any preset.
 */
export function finalSeverity(tier: Tier, level: Exclude<Level, "off">, emitted: Severity, strict: boolean, explicit: boolean): Severity {
  if (tier === "integrity") return "error";
  if (tier === "fit") return strict && !explicit ? "error" : level === "error" ? "error" : "warning";
  return level === "error" ? emitted : "warning";
}
