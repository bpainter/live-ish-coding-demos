import type { Page } from "@playwright/test";
import { hasFrame, type FramePage } from "@live-ish/engine/verify";
import { EnvironmentError } from "../lib/args";
import { isBlocked, matches, serverApp, type DeckData } from "../lib/deck";
import type { Session } from "../lib/session";

/**
 * A server frame whose app is stopped, or has no origin in this build: the page shows its poster and
 * a note, mounts no frame, and the steps still move. Nothing asks the dead origin, because the deck's
 * own server answers for it, so no request fails in the console. Only a stopped app reaches this: a
 * walk leaves the apps as it finds them, so a deck whose apps all answer has nothing to read here.
 */

export function stoppedPages(deck: DeckData, serversUp: Set<string>, id?: string): FramePage[] {
  return deck.demos.flatMap((demo) => demo.pages.filter(hasFrame).filter((p) => matches(id, demo, p) && p.frame.kind === "server" && !isBlocked(p) && !serversUp.has(serverApp(p) ?? "")));
}

/** Console errors, failed requests and requests to an app, from here on. */
function watch(page: Page, origins: string[]) {
  const out = { errors: [] as string[], toApp: [] as string[] };
  page.on("console", (m) => {
    if (m.type() === "error") out.errors.push(m.text());
  });
  page.on("pageerror", (e) => out.errors.push(String(e)));
  // A load cancels what its document had open, which no console reports.
  page.on("requestfailed", (r) => {
    const reason = r.failure()?.errorText ?? "";
    if (reason !== "net::ERR_ABORTED") out.errors.push(`${reason}: ${r.url()}`);
  });
  page.on("request", (r) => {
    if (origins.some((o) => r.url().startsWith(o))) out.toApp.push(r.url());
  });
  return out;
}

async function checkPage(session: Session, page: Page, p: FramePage, window: "audience" | "reader") {
  const { report } = session;
  const where = `stopped ${window} ${p.id}`;
  const seen = watch(page, Object.values(session.deck.deck.hosts.external));
  await page.goto(window === "audience" ? session.present(p.id) : session.reader(p.id));
  const note = await page.waitForSelector("#stage .page__poster-note", { timeout: 10000 }).catch(() => null);
  if (!note) return report.fail(where, "no note where the frame would be");
  const said = (await note.textContent()) ?? "";
  if (!/^Captured still\. /.test(said)) report.fail(where, `the note reads ${JSON.stringify(said)}`);
  else report.pass(`${where}: the note says "${said}"`);
  if (await page.locator("#stage .page-frame__iframe").count()) report.fail(where, "a frame mounted");
  else report.pass(`${where}: no frame mounts`);
  const drawn = (await page.evaluate(`(async () => { const i = document.querySelector("#stage .page__poster-image"); if (!i) return false; await i.decode().catch(() => {}); return i.naturalWidth > 0; })()`)) as boolean;
  if (!drawn) report.fail(where, "no poster shows: run capture with the app up, then rebuild");
  else report.pass(`${where}: the poster shows`);
  if (window === "audience" && p.steps.length > 1) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    if (await page.locator("#stage .page__poster-note").count()) report.pass(`${where}: the steps move with the note up`);
    else report.fail(where, "the note left when a step moved");
  }
  await page.waitForTimeout(400);
  if (seen.toApp.length) report.fail(where, `${seen.toApp.length} request(s) went to the stopped app: ${seen.toApp.slice(0, 2).join(", ")}`);
  else report.pass(`${where}: nothing asked the stopped app`);
  if (seen.errors.length) report.fail(where, `the console shows ${[...new Set(seen.errors)].slice(0, 2).join(" | ")}`);
  else report.pass(`${where}: no console error and no failed request`);
}

export async function walkServersDown(session: Session, serversUp: Set<string>, id?: string) {
  const { report } = session;
  const pages = stoppedPages(session.deck, serversUp, id);
  // Nothing was read, so this says it did not run rather than passing on nothing.
  if (!pages.length) throw new EnvironmentError("walk servers did not run: no server frame in this deck has a stopped app. Stop one, then walk again.");
  report.section("stopped apps");
  for (const window of ["audience", "reader"] as const) {
    if (window === "reader" && !session.deck.deck.reader.enabled) continue;
    for (const p of pages) {
      // A context per page: each load must start with an empty console.
      const ctx = await session.context({ viewport: { width: 1920, height: 1080 } });
      await checkPage(session, await ctx.newPage(), p, window);
      await ctx.close();
    }
  }
}
