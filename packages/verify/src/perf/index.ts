import { UsageError, parseArgs } from "../lib/args";
import { loadDeck } from "../lib/deck";
import { Report } from "../lib/report";
import { profileOf } from "../lib/session";
import { origins } from "./lib";

/**
 * Seven measurements on a running deck. Each writes a result file under `.live-ish/perf/` and prints
 * a table. Common options: --origin=<presenter>, --demo=<frames>, --profile=none|venue|poor, --label.
 *
 *   perf load        first load, cold and warm: TTFB, FCP, LCP, CLS, hydration, requests, bytes
 *   perf nav         key to paint, background, still and frame
 *   perf frame       Back replays and requests per frame mount
 *   perf walk        whole-deck bytes, requests and 304s, cold then warm, `--offline`
 *   perf headers     caching rules, both origins
 *   perf lighthouse  desktop and mobile
 *   perf functions   traced size per route of the last build
 */
export const TASKS = ["load", "nav", "frame", "walk", "headers", "lighthouse", "functions"] as const;
export type Task = (typeof TASKS)[number];

const SPEC = {
  values: ["origin", "demo", "profile", "label", "runs", "only", "mode", "variant", "dwell", "pages", "form", "dist", "root", "top", "chrome"],
  flags: ["json", "offline", "dev", "rebaseline"],
};

export async function perf(argv: string[], context: { root: string }): Promise<number> {
  const args = parseArgs(argv, SPEC);
  const task = args.words[0] as Task | undefined;
  if (!task || !TASKS.includes(task)) throw new UsageError(`perf needs a task: ${TASKS.join(", ")}.`);
  const report = new Report(`perf ${task}`, args.flag("json"));
  const deck = await loadDeck(context.root);
  const { P, D } = origins(args, deck);
  const ctx = { deck, args, P, D, profile: profileOf(args.opt("profile")) };
  const mod = (await import(`./${task}.ts`)) as { run(c: typeof ctx, r: Report): Promise<void> };
  await mod.run(ctx, report);
  return report.finish(`perf ${task}`);
}
