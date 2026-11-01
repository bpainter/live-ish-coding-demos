import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Frame, Page } from "@playwright/test";
import { flagsQuery } from "@live-ish/engine/verify";
import { parseArgs } from "./lib/args";
import { liveFrames, loadDeck, matches, pick, runningServers, stepKey, type DeckData, type Target } from "./lib/deck";
import { Report } from "./lib/report";
import { BROWSER_FLAGS, BROWSER_VALUES, sessionOptions, withSession, type Session, type SessionOptions } from "./lib/session";
import { FRAME_VISIBLE, waitForResult } from "./lib/watch";

/**
 * Accessibility scans. `axe` runs every frame document at its first step, every other document a
 * step ends on, then every framed page at its last step, replayed by the audience window, because a
 * step can leave a state axe would otherwise never see. `axe --presenter` runs the presenter's own
 * pages. A violation in a frame names the demo, so an author can tell the engine's from their own.
 */

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

type AxeNode = { target: string[]; failureSummary?: string };
type AxeResult = { violations: { id: string; impact: string; help: string; nodes: AxeNode[] }[] };

function record(report: Report, where: string, result: AxeResult) {
  if (result.violations.length === 0) return report.pass(`${where}: no violations`);
  for (const v of result.violations) report.fail(where, `${v.id} (${v.impact}) ${v.help}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(", ")}. ${v.nodes[0]?.failureSummary?.split("\n").at(-1)?.trim() ?? ""}`);
}

/**
 * Pages the presenter serves, derived from the deck: what a reader meets and what a speaker uses.
 * Every copy slide, not one per layout, because one layout looks different by variant: a dark grid
 * and a portrait grid fail contrast and alt text on their own.
 */
export function presenterTargets(deck: DeckData): { where: string; kind: "reader" | "speaker"; id: string; viewport?: { width: number; height: number }; drawer?: boolean }[] {
  const first = deck.slides[0];
  const last = deck.slides.at(-1)!;
  const demoPage = deck.demos[0]?.pages[0]?.id ?? first.id;
  const framed = liveFrames(deck)[0]?.page.id ?? demoPage;
  const speaker = { width: 1440, height: 900 };
  const readers = new Set([first.id, ...deck.slides.filter((s) => !s.page).map((s) => s.id), last.id, demoPage]);
  return [
    ...[...readers].map((id) => ({ where: `/s/${id}`, kind: "reader" as const, id })),
    { where: `/s/${demoPage}, drawer open`, kind: "reader", id: demoPage, drawer: true },
    { where: "/speaker, drawer open", kind: "speaker", id: demoPage, viewport: speaker, drawer: true },
    { where: `/speaker on ${framed}`, kind: "speaker", id: framed, viewport: speaker },
  ];
}

async function scanPresenter(session: Session) {
  const { report, deck } = session;
  const context = await session.context({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  const targets = presenterTargets(deck);
  for (const t of targets) {
    await page.setViewportSize(t.viewport ?? { width: 1600, height: 900 });
    await page.goto(t.kind === "reader" ? session.reader(t.id) : session.speaker(t.id));
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(800);
    if (t.drawer) {
      await page.locator(".nav-drawer-trigger").first().click();
      await page.waitForFunction(`document.querySelector("#deck-nav")?.open === true`, null, { timeout: 5000 });
      // The drawer's entry transition settles before the scan.
      await page.waitForTimeout(400);
    }
    // The live demo frames are scanned on their own. Here, only the presenter's page.
    await page.evaluate(axeSource);
    const result = (await page.evaluate(`axe.run({ exclude: [["iframe.page-frame__iframe"]] }, { runOnly: { type: "tag", values: ${JSON.stringify([...TAGS, "best-practice"])} }, rules: { "region": { enabled: true } } })`)) as AxeResult;
    record(report, t.where, result);
  }
  await context.close();
  report.data.layouts = [...new Set(deck.slides.filter((s) => targets.some((t) => t.id === s.id)).map((s) => s.layout))];
  report.log(`\n${targets.length} presenter page(s) scanned`);
}

/** The document of a route on the frames origin: the path a frame loads, with flags and no glass. */
function frameDocument(session: Session, t: Target, route: string): string {
  const flags = flagsQuery({ ...(t.page.frame.flags ?? {}), glass: false });
  const path = route.startsWith("/demos/") && !/\.\w+(\?|$)/.test(route) ? `${route}/index.html` : route;
  const query = t.page.frame.kind === "terminal" ? `flags=${flags}&chrome=${session.options.chrome ?? t.page.chrome}` : `flags=${flags}`;
  return `${session.frames}${path}${path.includes("?") ? "&" : "?"}${query}`;
}

async function scanFirstSteps(session: Session, targets: Target[], page: Page): Promise<number> {
  const { report } = session;
  const seen = new Set<string>();
  let n = 0;
  for (const t of targets) {
    const scan = async (where: string, url: string) => {
      if (seen.has(url)) return;
      seen.add(url);
      n++;
      await page.setViewportSize(t.page.frame.viewport);
      await page.goto(url);
      await page.waitForTimeout(500);
      await page.evaluate(axeSource);
      record(report, where, (await page.evaluate(`axe.run(document, { runOnly: { type: "tag", values: ${JSON.stringify(TAGS)} } })`)) as AxeResult);
    };
    await scan(t.page.id, frameDocument(session, t, t.page.frame.route));
    // Multi-page builds: every other document a step ends on.
    const dir = t.page.frame.route.replace(/\/?$/, "/");
    for (const step of t.page.steps) {
      if (!step.route || step.route === "index.html") continue;
      await scan(`${t.page.id} ${step.id} (${step.route})`, frameDocument(session, t, `${dir}${step.route}`));
    }
  }
  return n;
}

/** Frames with an inner document scan it too, because axe follows same-origin frames from inside. */
async function scanLastStep(session: Session, t: Target): Promise<boolean> {
  const { report } = session;
  const last = t.page.steps.at(-1)!;
  const where = `${t.page.id} at ${last.id} (last step)`;
  // A fresh context per page: the audience window takes ?s= and ?step= only on a navigate load.
  const ctx = await session.context({ viewport: { width: 1920, height: 1080 } });
  try {
    const deck = await ctx.newPage();
    await deck.goto(session.present(t.page.id, t.page.steps.length - 1, { glass: "off" }));
    const done = await waitForResult(deck, stepKey(t.page, last), 0, 30000);
    const handle = await deck.$(FRAME_VISIBLE);
    const frame: Frame | null | undefined = await handle?.contentFrame();
    if (!done || !frame) {
      report.fail(where, "the frame did not reach its last step");
      return false;
    }
    await frame.evaluate(axeSource);
    record(report, where, (await frame.evaluate(`axe.run(document, { runOnly: { type: "tag", values: ${JSON.stringify(TAGS)} } })`)) as AxeResult);
    return true;
  } finally {
    await ctx.close();
  }
}

export async function axe(argv: string[], context: { root: string; deck?: DeckData; report?: Report; sabotage?: SessionOptions["sabotage"] }): Promise<number> {
  const args = parseArgs(argv, { values: BROWSER_VALUES, flags: [...BROWSER_FLAGS, "presenter"] });
  const id = args.words[0];
  const report = context.report ?? new Report(args.flag("presenter") ? "axe --presenter" : "axe", args.flag("json"));
  const deck = context.deck ?? (await loadDeck(context.root));
  return withSession(deck, { ...sessionOptions(args), sabotage: context.sabotage }, report, async (session) => {
    report.log(`axe at ${session.origin}${session.options.chrome ? `, theme ${session.options.chrome}` : ""}`);
    if (args.flag("presenter")) {
      await scanPresenter(session);
      return report.finish("axe --presenter");
    }
    const up = await runningServers(deck);
    const targets = pick(liveFrames(deck, up), id, deck);
    // A frame document's CSP refuses injected scripts, so the first-step scans run with it off.
    const ctx = await session.context({ bypassCSP: true, viewport: { width: 640, height: 628 } });
    const page = await ctx.newPage();
    const frames = await scanFirstSteps(session, targets.filter((t) => matches(id, t.demo, t.page)), page);
    await ctx.close();
    let lastPages = 0;
    for (const t of targets) if (t.page.steps.length >= 2 && (await scanLastStep(session, t))) lastPages++;
    report.data.frames = frames;
    report.data.lastSteps = lastPages;
    report.log(`\n${frames} frame(s) at their first step, ${lastPages} page(s) at their last step`);
    return report.finish("axe");
  });
}
