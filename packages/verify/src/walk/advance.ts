import type { BrowserContext, Page } from "@playwright/test";
import { hasFrame, type FramePage, type Slide } from "@live-ish/engine/verify";
import { around, pick, liveFrames, stepKey, type DeckData } from "../lib/deck";
import type { Session } from "../lib/session";
import { FRAME_VISIBLE, lastSeq, waitForResult } from "../lib/watch";

/**
 * Next after playback on every framed page leaves the page within 1500 ms: by key with focus in the
 * frame, by the reader's Next button and by the speaker's. Also a press 200 ms into the code lead, one
 * mid-playback, Back from the next slide landing on the last step, and a press after the shown
 * document is disposed mid-run.
 */

/** A page that hangs fails after this long, and the walk goes on with fresh windows. */
const PAGE_LIMIT_MS = 180_000;

/**
 * ms until a press moved the deck to slide `id`, or -1 after `timeout`. In the presenter windows the
 * press is the shared state naming the slide, and the window must then land on it within 10 s. Reader
 * mode has no store, so the address changing is the arrival.
 */
export async function arrives(page: Page, deck: DeckData, id: string, timeout = 1500): Promise<number> {
  const t = Date.now();
  const reader = new URL(page.url()).pathname.startsWith("/s/");
  const ok = await page
    .waitForFunction(
      ([want, r, key]) => {
        if (new URLSearchParams(location.search).get("s") === want || location.pathname === `/s/${want}`) return true;
        if (r) return false;
        try {
          return JSON.parse(localStorage.getItem(key as string) || "null")?.slideId === want;
        } catch {
          return false;
        }
      },
      [id, reader, deck.stateKey] as const,
      { timeout: reader ? Math.max(timeout, 4000) : timeout, polling: 20 },
    )
    .then(() => true)
    .catch(() => false);
  if (!ok) return -1;
  const ms = Date.now() - t;
  await page.waitForFunction((want) => new URLSearchParams(location.search).get("s") === want || location.pathname === `/s/${want}`, id, { timeout: 10000 }).catch(() => null);
  return ms;
}

type Windows = { ctx: BrowserContext; speaker: Page; audience: Page; reader: Page };

async function claim(session: Session, audience: Page, id: string, step: number) {
  await audience.goto(session.present(id, step));
  await audience.waitForSelector(FRAME_VISIBLE, { timeout: 15000 }).catch(() => null);
}

async function open(session: Session): Promise<Windows> {
  const ctx = await session.context({ viewport: { width: 1600, height: 900 } });
  // Speaker first, so the audience's typed URL claims both windows on its first hello.
  const speaker = await ctx.newPage();
  await speaker.setViewportSize({ width: 1440, height: 900 });
  await speaker.goto(session.speaker());
  const audience = await ctx.newPage();
  const reader = await ctx.newPage();
  await audience.bringToFront();
  return { ctx, speaker, audience, reader };
}

async function onePage(session: Session, p: FramePage, next: Slide, where: string, w: Windows): Promise<void> {
  const { report, deck } = session;
  const { speaker, audience, reader } = w;
  const n = p.steps.length;
  const last = p.steps[n - 1];
  const key = stepKey(p, last);
  const near = (ms: number) => (ms >= 0 ? `${ms} ms` : "never");
  try {
    // A. Last step, focus in the frame, ArrowRight.
    await claim(session, audience, p.id, n - 1);
    if (!(await audience.$(".page-frame__iframe"))) return report.pass(`${p.id}: no live frame here (a poster); skipped`);
    await waitForResult(audience, key, 0, 15000);
    await audience.waitForTimeout(400);
    await audience.focus(FRAME_VISIBLE).catch(() => {});
    const inFrame = (await audience.evaluate(`document.activeElement?.tagName`)) === "IFRAME";
    await audience.keyboard.press("ArrowRight");
    let ms = await arrives(audience, deck, next.id);
    if (ms < 0) report.fail(where, `last step, ArrowRight${inFrame ? " with focus in the frame" : ""}: still on ${p.id} after 1500 ms`);
    else report.pass(`last step, ArrowRight${inFrame ? " (focus in the frame)" : ""}: on ${next.id} in ${near(ms)}`);

    // B. Back from the next slide lands on the last step.
    if (ms >= 0) {
      await audience.waitForTimeout(next.page && hasFrame(next.page) ? 1200 : 600);
      await audience.keyboard.press("ArrowLeft");
      // The shared state is what the press decides. The address mirrors it, throttled, and WebKit
      // rate-limits the history API over a long run, so a late mirror is a note and not a failure.
      const back = await audience
        .waitForFunction(
          ([id, step, k]) => {
            try {
              const st = JSON.parse(localStorage.getItem(k as string) || "null");
              return st?.slideId === id && st?.stepIndex === step;
            } catch {
              return false;
            }
          },
          [p.id, n - 1, deck.stateKey] as const,
          { timeout: 3000 },
        )
        .then(() => true)
        .catch(() => false);
      const urlOk = await audience
        .waitForFunction(([id, step]) => { const q = new URLSearchParams(location.search); return q.get("s") === id && (q.get("step") ?? "0") === step; }, [p.id, String(n - 1)] as const, { timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      const st = (await audience.evaluate(`(() => { try { const s = JSON.parse(localStorage.getItem(${JSON.stringify(deck.stateKey)})); return s.slideId + " step " + s.stepIndex; } catch { return "no state"; } })()`).catch(() => "?")) as string;
      if (!back) report.fail(where, `ArrowLeft from ${next.id}: the deck is on ${st}, want ${p.id} step ${n - 1}`);
      else report.pass(`ArrowLeft from ${next.id}: ${p.id} step ${n - 1}${urlOk ? `, ?step=${n - 1}` : " (the address mirror lagged)"}`);
      // C. The speaker's Next button, from the last step.
      if (back) {
        await waitForResult(audience, key, 0, 10000);
        await speaker.waitForURL(new RegExp(`s=${p.id}(&|$)`), { timeout: 5000 }).catch(() => null);
        await audience.waitForTimeout(600);
        await speaker.locator(".speaker__controls button", { hasText: /^Next$/ }).click();
        ms = await arrives(audience, deck, next.id);
        if (ms < 0) report.fail(where, `last step, the speaker's Next button: still on ${p.id} after 1500 ms`);
        else report.pass(`last step, the speaker's Next button: on ${next.id} in ${near(ms)}`);
      }
    }

    // D and E. A press 200 ms into the code lead, then a press mid-playback.
    if (n >= 2) {
      const before = stepKey(p, p.steps[n - 2]);
      for (const [label, delay] of [["200 ms into the code lead", 200], ["mid-playback", 700]] as const) {
        await claim(session, audience, p.id, n - 2);
        await waitForResult(audience, before, 0, 15000);
        await audience.waitForTimeout(500);
        const s = await lastSeq(audience);
        await audience.keyboard.press("ArrowRight");
        await audience.waitForTimeout(delay);
        await audience.keyboard.press("ArrowRight");
        const left = await arrives(audience, deck, next.id, 300);
        // With no code on the step there is no lead to press into, so the first press may be done.
        if (left >= 0 && label.startsWith("200") && last.code) {
          report.fail(where, `a press ${label} skipped ${last.id} and left the page`);
          continue;
        }
        if (left < 0) {
          const r = await waitForResult(audience, key, s, 10000);
          if (!r) report.fail(where, `a press ${label}: ${last.id} never finished`);
          await audience.waitForTimeout(150);
          await audience.keyboard.press("ArrowRight");
          ms = await arrives(audience, deck, next.id);
          if (ms < 0) report.fail(where, `after a press ${label}: Next stayed on ${p.id} for 1500 ms`);
          else report.pass(`after a press ${label}: ${last.id} ${r?.finished ? "finished at once" : "done"}, then Next on ${next.id} in ${near(ms)}`);
        } else report.pass(`a press ${label}: ${last.id} had already finished; on ${next.id}`);
      }

      // F. Fault injection: dispose the shown document mid-run.
      await claim(session, audience, p.id, n - 2);
      await waitForResult(audience, before, 0, 15000);
      await audience.waitForTimeout(500);
      await audience.keyboard.press("ArrowRight");
      await audience.waitForTimeout(600);
      const disposed = (await audience.evaluate(`typeof window.__disposeShownFrame === "function" ? window.__disposeShownFrame() : null`)) as boolean | null;
      if (disposed === null) report.fail(where, "fault injection: window.__disposeShownFrame is missing");
      else {
        await audience.waitForTimeout(200);
        await audience.keyboard.press("ArrowRight");
        ms = await arrives(audience, deck, next.id);
        if (ms < 0) {
          // The watchdog: a second press 1500 ms after the first finish request advances anyway.
          await audience.waitForTimeout(1600);
          await audience.keyboard.press("ArrowRight");
          ms = await arrives(audience, deck, next.id);
          if (ms < 0) report.fail(where, "fault injection: after the shown document was disposed mid-run, Next never left the page");
          else report.pass(`fault injection: on ${next.id} after the watchdog's second press`);
        } else report.pass(`fault injection: disposed mid-run, Next on ${next.id} in ${near(ms)}`);
      }
    }

    // G. Reader mode: key with focus in the frame, then the Next button.
    if (deck.deck.reader.enabled) {
      for (const how of ["key", "button"] as const) {
        await reader.goto(session.reader(p.id, n - 1));
        await reader.waitForSelector(FRAME_VISIBLE, { timeout: 15000 }).catch(() => null);
        await waitForResult(reader, key, 0, 15000);
        await reader.waitForTimeout(400);
        if (how === "key") {
          await reader.focus(FRAME_VISIBLE).catch(() => {});
          await reader.keyboard.press("ArrowRight");
        } else {
          // Let the pill fade first, with the pointer resting over the frame, then move to Next as a
          // person does: the move wakes the pill, and the press must reach it.
          const frameBox = await reader.locator(FRAME_VISIBLE).boundingBox();
          if (frameBox) await reader.mouse.move(frameBox.x + frameBox.width / 2, frameBox.y + frameBox.height / 2);
          await reader.waitForTimeout(2800);
          const btn = await reader.locator('.reader-controls button[aria-label="Next"]').boundingBox();
          if (!btn) throw new Error("no reader Next button");
          await reader.mouse.move(btn.x + btn.width / 2, btn.y + btn.height / 2, { steps: 8 });
          await reader.waitForTimeout(250);
          await reader.mouse.click(btn.x + btn.width / 2, btn.y + btn.height / 2);
        }
        ms = await arrives(reader, deck, next.id);
        if (ms < 0) report.fail(where, `reader, last step, ${how === "key" ? "ArrowRight with focus in the frame" : "the Next button"}: still on ${p.id} after 1500 ms`);
        else report.pass(`reader, last step, ${how === "key" ? "ArrowRight in the frame" : "the Next button"}: on ${next.id} in ${near(ms)}`);
      }
    }
    const stuck = (await audience.evaluate(`window.__stuckPlayback ?? []`).catch(() => [])) as string[];
    if (stuck.length) report.fail(where, `the watchdog fired: ${stuck.join(", ")}`);
    await audience.bringToFront();
  } catch (err) {
    report.fail(where, `threw: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
  }
}

export async function walkAdvance(session: Session, only: string | undefined, serversUp: Set<string>) {
  const { report, deck } = session;
  const targets = pick(liveFrames(deck, serversUp), only, deck);
  let windows = await open(session);
  for (const { page: p } of targets) {
    const { next } = around(deck, p.id);
    if (!next) continue;
    const where = `${p.id} advance`;
    report.section(`${p.id} advance (${session.browserName}, ${p.steps.length} steps, next ${next.id})`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<"timeout">((r) => (timer = setTimeout(() => r("timeout"), PAGE_LIMIT_MS)));
    const outcome = await Promise.race([onePage(session, p, next, where, windows), limit]);
    clearTimeout(timer);
    if (outcome === "timeout") {
      // Fresh windows. The hung run keeps the old ones, which close under it.
      report.fail(where, `the checks did not finish in ${PAGE_LIMIT_MS / 1000} s`);
      const old = windows;
      windows = await open(session);
      await old.ctx.close().catch(() => {});
    }
  }
  await windows.ctx.close();
}
