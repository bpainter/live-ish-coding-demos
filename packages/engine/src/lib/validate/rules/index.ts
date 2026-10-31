import { facts, defineRule } from "../context";
import { docsUrl } from "../catalog";
import { validateDeckConfig } from "../config";
import type { Finding, Rule } from "../types";
import { rules as assets } from "./assets";
import { rules as backgrounds } from "./backgrounds";
import { rules as code } from "./code";
import { rules as deck } from "./deck";
import { rules as frames } from "./frames";
import { rules as seo } from "./seo";
import { rules as shape } from "./shape";
import { rules as support } from "./support";
import { rules as terminal } from "./terminal";
import { rules as wrappers } from "./wrappers";
import { rules as writing } from "./writing";

/** `deck.config.ts` as findings, for a config that reached the runner some other way than `defineDeck()`. */
export function configFindings(config: unknown): Finding[] {
  return validateDeckConfig(config).map((i) => ({ rule: "config", severity: "error", where: `deck.config.ts: ${i.path}`, message: i.message, ...(i.fix ? { fix: i.fix } : {}), docs: docsUrl("config") }));
}

const config: Rule[] = [
  defineRule("config", "deck.config.ts has the right fields and types.", (ctx, add) => {
    for (const f of configFindings(facts(ctx).input.config)) add(f.where, f.message, { fix: f.fix });
  }),
];

/** Every group. `rules/chrome.ts` joins this list as its workstream lands. */
export const groups: Rule[][] = [config, shape, code, frames, support, writing, seo, assets, deck, wrappers, backgrounds, terminal];

export const allRules: Rule[] = groups.flat();
