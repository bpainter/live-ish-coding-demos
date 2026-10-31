export type Tier = "integrity" | "fit" | "support" | "style";
export type Severity = "error" | "warning";

export interface Finding {
  rule: string;      // the rule id, such as "selector"
  severity: Severity;
  where: string;     // "demos/faq/demo.ts: after, step s2, spotlight"
  message: string;   // what is wrong, in words
  fix?: string;      // one line naming the fix
  docs: string;      // https://live-ish.dev/errors/<rule>
}

export interface Rule {
  id: string;
  tier: Tier;
  summary: string;   // one line, printed by `live-ish explain`
  run(ctx: RuleContext): Finding[] | Promise<Finding[]>;
}

export interface RuleContext {
  root: string;      // the deck folder
  deck: import("../../schema/assemble").AssembledDeck;
  strict: boolean;
}
