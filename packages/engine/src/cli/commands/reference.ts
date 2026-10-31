import { nearest, UsageError } from "../args";
import { EXIT, printJson, type Ctx, type ExitCode } from "../io";
import type { Action } from "../../schema/demo";

export async function explain(ctx: Ctx): Promise<ExitCode> {
  const [id] = ctx.positionals;
  if (!id) throw new UsageError("Name a rule: live-ish explain terminal-range.");
  const { allRules, rulePage } = await import("../../lib/validate");
  const rule = allRules.find((r) => r.id === id);
  if (!rule) {
    const hint = nearest(id, allRules.map((r) => r.id));
    throw new UsageError(`No rule "${id}".${hint ? ` Did you mean "${hint}"?` : ""}`);
  }
  const page = rulePage(id)?.trim() ?? null;
  const url = `https://live-ish.dev/errors/${id}`;
  if (ctx.json) printJson({ id, tier: rule.tier, summary: rule.summary, docs: url, text: page });
  else {
    ctx.log(page ?? `${rule.id} (${rule.tier})\n\n${rule.summary}`);
    ctx.log(`\n${url}`);
  }
  return EXIT.ok;
}

/** A compile error names any action type missing here, so this list cannot fall behind the schema. */
const ACTIONS: Record<Action["type"], { fields: string; summary: string }> = {
  pointer: { fields: "to", summary: "The ghost cursor glides to an element." },
  click: { fields: "target", summary: "Clicks an element, with a ripple on the ghost cursor." },
  key: { fields: "key, target?, via", summary: "Shows a keycap. `via` names the DOM API that produces the same effect, since synthetic key events are untrusted." },
  focus: { fields: "target, visible?", summary: "Focuses an element, with a visible ring on request." },
  type: { fields: "target, text", summary: "Types one character at a time, firing input events." },
  paste: { fields: "target, text", summary: "Sets the value and fires one input event, with a Paste keycap." },
  resize: { fields: "target, inlineSize", summary: "Animates a container's inline size." },
  toggle: { fields: "flag, on", summary: "Turns an enhancement flag on or off." },
  navigate: { fields: "url?, history?", summary: "A real navigation, or history back or forward." },
  network: { fields: "profile", summary: "Sets the frame's network profile: fast or slow." },
  hook: { fields: "name, args?", summary: "Calls a function on window.demoHooks." },
  terminal: { fields: "lines", summary: "Reveals an inclusive range of recorded lines." },
  reveal: { fields: "target", summary: "Shows a hidden element." },
  wait: { fields: "ms", summary: "Pauses. Skipped during instant replay." },
  assert: { fields: "target, expect", summary: "Checks the frame during rehearsal and tests. Prints nothing on stage." },
};

/** What `expect` accepts, read from the runtime's `evaluate`. Prefix any form with `!` to negate it. */
const ASSERT_GRAMMAR = [
  { form: ":<pseudo-class>", example: ":popover-open", meaning: "The element matches the selector." },
  { form: "visible", example: "visible", meaning: "The element has a box and is not hidden." },
  { form: "hidden", example: "hidden", meaning: "The element is missing or not visible." },
  { form: "focused", example: "focused", meaning: "The element is the active element." },
  { form: "count=<n>", example: "count=3", meaning: "The selector matches exactly n elements." },
  { form: "value-length<op><n>", example: "value-length>400", meaning: "The value length compares to n, with <, > or =." },
  { form: "inline-size<op><n>px", example: "inline-size<640px", meaning: "The rendered width compares to n." },
  { form: "text~=<text>", example: "text~=Saved", meaning: "The element's text holds this text. `contains:` is the same." },
  { form: "attr:<name>[=<value>]", example: "attr:open", meaning: "The attribute is present, with this value if given." },
  { form: "no-attr:<name>", example: "no-attr:open", meaning: "The element exists without the attribute." },
  { form: "url=<path>", example: "url=/orders?id=1", meaning: "The frame's path and query equal this." },
  { form: "style:<property>=<value>", example: "style:display=grid", meaning: "The computed value equals this." },
  { form: "style:block-size=<n>lh", example: "style:block-size=2lh", meaning: "The block size is n line heights, within 2 px." },
  { form: "columns=<n>", example: "columns=3", meaning: "The grid has n computed columns." },
];

export async function actions(ctx: Ctx): Promise<ExitCode> {
  const list = Object.entries(ACTIONS).map(([type, a]) => ({ type, fields: a.fields.split(", "), summary: a.summary }));
  if (ctx.json) {
    printJson({ actions: list, assert: { negate: "!", forms: ASSERT_GRAMMAR } });
    return EXIT.ok;
  }
  const width = Math.max(...list.map((a) => a.type.length));
  for (const a of list) ctx.log(`${a.type.padEnd(width)}  ${a.fields.join(", ").padEnd(18)}  ${a.summary}`);
  ctx.log("\nassert expect, with ! in front to negate:");
  for (const g of ASSERT_GRAMMAR) ctx.log(`  ${g.form.padEnd(26)}${g.meaning}`);
  return EXIT.ok;
}
