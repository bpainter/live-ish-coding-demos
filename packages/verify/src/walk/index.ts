import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { UsageError, numberOpt, parseArgs } from "../lib/args";
import { budgets } from "../lib/budgets";
import { hasFrame, type DemoPage } from "@live-ish/engine/verify";
import { fixturePage, isBlocked, liveFrames, loadDeck, matches, runningServers, type DeckData } from "../lib/deck";
import { Report } from "../lib/report";
import { BROWSER_FLAGS, BROWSER_VALUES, profileOf, sessionOptions, withSession, type Session, type SessionOptions } from "../lib/session";
import { walkA11y } from "./a11y";
import { walkAdvance } from "./advance";
import { checkDistinct, walkDeck } from "./deck";
import { walkFocus } from "./focus";
import { walkKeys } from "./keys";
import { walkDrawer, walkLinks, walkTransitions } from "./nav";
import { stoppedPages, walkServersDown } from "./servers";
import { walkFixture } from "./spotlight";
import { openStepWalk, walkPage } from "./steps";
import { walkTheme } from "./theme";
import { walkUnderlay } from "./underlay";

export const MODES = ["advance", "drawer", "links", "keys", "focus", "underlay", "a11y", "transitions", "fixtures", "deck", "theme", "servers"] as const;
export type Mode = (typeof MODES)[number];

export const WALK_SPEC = {
  values: [...BROWSER_VALUES, "mode", "profile", "runs", "min-arrivals", "holds", "delays"],
  flags: [...BROWSER_FLAGS, "no-speaker", "capture", "no-reader", "serial"],
};

/** A blocked frame: "Demo frame did not answer" after 1500 ms, and Next still leaves the page. */
async function checkBlocked(session: Session) {
  const { report, deck } = session;
  const blocked = deck.demos.flatMap((d) => d.pages.flatMap((p) => (hasFrame(p) && isBlocked(p) ? [p] : [])));
  if (!blocked.length) return;
  const ctx = await session.context({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  for (const p of blocked) {
    report.section(`${p.id} (a blocked frame)`);
    await page.goto(session.present(p.id));
    const said = await page
      .waitForFunction(`/did not answer/.test(document.querySelector("#stage .page-frame__status")?.textContent ?? "")`, null, { timeout: 4000 })
      .then(() => true)
      .catch(() => false);
    if (!said) report.fail(p.id, 'no "did not answer" status on a blocked frame');
    else report.pass(`${p.id}: the page says the frame did not answer`);
    const next = deck.ids[deck.ids.indexOf(p.id) + 1];
    if (next) {
      for (let i = 0; i < p.steps.length; i++) await page.keyboard.press("ArrowRight");
      const left = await page
        .waitForFunction((id) => new URLSearchParams(location.search).get("s") === id, next, { timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      if (!left) report.fail(p.id, "Next did not leave a blocked frame");
      else report.pass(`${p.id}: Next leaves for ${next}`);
    }
  }
  await ctx.close();
}


async function runMode(session: Session, mode: Mode | undefined, id: string | undefined, args: ReturnType<typeof parseArgs>) {
  const { report, deck } = session;
  const serversUp = await runningServers(deck);
  for (const app of Object.keys(deck.deck.hosts.external)) if (!serversUp.has(app)) report.note(`app ${app} is not running: its pages get the stopped-app checks, and no steps`);
  switch (mode) {
    case "advance":
      return walkAdvance(session, id, serversUp);
    case "drawer":
      return walkDrawer(session);
    case "links":
      return walkLinks(session);
    case "transitions":
      return walkTransitions(session);
    case "fixtures":
      return walkFixture(session);
    case "deck": {
      await walkDeck(session);
      const stats = path.join(deck.root, ".live-ish", "backgrounds.json");
      if (existsSync(stats)) checkDistinct(JSON.parse(readFileSync(stats, "utf8")) as Record<string, { thumb: number[][] }>, report);
      return;
    }
    case "keys":
      return walkKeys(session, serversUp);
    case "a11y":
      return walkA11y(session, serversUp);
    case "theme":
      return walkTheme(session, serversUp);
    case "servers":
      return walkServersDown(session, serversUp, id);
    case "focus": {
      const list = (name: string, fallback: string) => (args.opt(name) ?? fallback).split(",").map(Number);
      return walkFocus(session, id, list("holds", "0,1500,3000"), list("delays", "300,600,900,1250,2500,4000"), args.flag("serial"), serversUp);
    }
    case "underlay":
      return walkUnderlay(session, {
        only: id,
        // Network conditions go through CDP, which only Chromium has.
        profile: session.browserName === "chromium" ? profileOf(args.opt("profile"), budgets.reference.profile) : "none",
        noReader: args.flag("no-reader"),
        runs: numberOpt(args, "runs", budgets.reference.runs),
        min: numberOpt(args, "min-arrivals", id ? 0 : budgets.underlay.minArrivalsPerWindow),
        serversUp,
      });
    default:
      break;
  }
  // No mode: the fixture, the deck, the drawer and links, then every step.
  if (!id) {
    if (fixturePage(deck)) await walkFixture(session);
    await walkDeck(session);
    await walkDrawer(session);
    await walkLinks(session);
    await checkBlocked(session);
  }
  const w = await openStepWalk(session, args.flag("capture"), !args.flag("no-speaker"));
  const live = new Set(liveFrames(deck, serversUp).map((t) => t.page.id));
  const pages = deck.demos.flatMap((demo) => demo.pages.filter((p) => matches(id, demo, p) && (!hasFrame(p) || live.has(p.id))).map((page) => ({ demo, page })));
  const stopped = stoppedPages(deck, serversUp, id);
  if (id && !pages.length && !stopped.length) throw new UsageError(`No page or demo "${id}" in this deck.`);
  for (const { demo, page } of pages) {
    try {
      await walkPage(w, demo, page);
    } catch (err) {
      report.fail(page.id, `walk threw: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
    }
  }
  await w.context.close();
  if (stopped.length) await walkServersDown(session, serversUp, id);
}

/** Mode from `--mode`, or from the first word when it names one: `walk underlay faq`. */
export function modeAndId(words: string[], given: string | undefined): { mode: Mode | undefined; id: string | undefined } {
  const rest = [...words];
  let mode = given as Mode | undefined;
  if (!mode && rest.length && (MODES as readonly string[]).includes(rest[0])) mode = rest.shift() as Mode;
  if (mode && !(MODES as readonly string[]).includes(mode)) throw new UsageError(`Unknown walk mode "${mode}". Modes: ${MODES.join(", ")}.`);
  if (rest.length > 1) throw new UsageError(`walk takes one id, found ${rest.join(", ")}.`);
  return { mode, id: rest[0] };
}

export interface WalkContext {
  root: string;
  /** Test only: see `SessionOptions.sabotage`. */
  sabotage?: SessionOptions["sabotage"];
  deck?: DeckData;
  report?: Report;
}

export async function walk(argv: string[], context: WalkContext): Promise<number> {
  const args = parseArgs(argv, WALK_SPEC);
  const { mode, id } = modeAndId(args.words, args.opt("mode"));
  const options = { ...sessionOptions(args), sabotage: context.sabotage };
  // A network profile has to reach every frame, and that takes one process.
  if (profileOf(args.opt("profile"), mode === "underlay" ? budgets.reference.profile : "none") !== "none") options.isolationOff = true;
  const report = context.report ?? new Report(`walk${mode ? ` ${mode}` : ""}`, args.flag("json"));
  const deck = context.deck ?? (await loadDeck(context.root));
  const code = await withSession(deck, options, report, async (session) => {
    report.log(`walk${mode ? ` ${mode}` : ""}${id ? ` ${id}` : ""} in ${options.browser} at ${options.origin}${options.chrome ? `, theme ${options.chrome}` : ""}, ${session.health.server ?? "unknown"} server`);
    report.data.browser = options.browser;
    report.data.origin = options.origin;
    report.data.chrome = options.chrome ?? null;
    if (options.without.length) report.log(`  without ${options.without.join(", ")}`);
    await runMode(session, mode, id, args);
    if (options.localOnly) {
      report.data.externalRequests = session.external.length;
      if (session.external.length) report.fail("local-only", `${session.external.length} request(s) left the two local origins: ${session.external.slice(0, 5).join(", ")}`);
      else report.pass("local-only: 0 external requests");
    }
    return report.finish(`${options.browser}${mode ? ` ${mode}` : ""}`);
  });
  return code;
}
