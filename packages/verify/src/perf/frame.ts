import { budgets } from "../lib/budgets";
import { liveFrames } from "../lib/deck";
import type { Report } from "../lib/report";
import { kb, median, percentile, table } from "../lib/stats";
import { cdpProfile, launch, netlog, summarize, writeResult, type PerfContext } from "./lib";

/** Step Back replays, where a fresh document replays s0..sN, and the requests one mount makes. */

const HOOK = `(() => { const w = window; w.__steps = []; let seq; Object.defineProperty(w, '__stepSeq', { configurable: true, get() { return seq; }, set(v) { seq = v; w.__steps.push(performance.now()); } }); })();`;

interface Rec {
  id: string;
  label: string;
  replayMs: number;
  demoRequests: number;
  documents: number;
  notModified: number;
  fromCache: number;
  kb: number;
  statuses: string[];
}

export async function run({ deck, args, P, D, profile }: PerfContext, report: Report): Promise<void> {
  // Pages with three steps or more, or the ones asked for: two forward steps, then Back twice.
  const pages = args.opt("pages")?.split(",") ?? liveFrames(deck).filter((t) => t.page.steps.length >= 3).slice(0, 4).map((t) => t.page.id);
  if (!pages.length) return report.note("no page has three steps: nothing to replay");
  const browser = await launch(deck);
  const out: Rec[] = [];
  for (const id of pages) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await ctx.addInitScript(HOOK);
    const page = await ctx.newPage();
    const net = await netlog(page);
    await cdpProfile(net.cdp, profile);
    await page.goto(`${P}/present?s=${id}`, { waitUntil: "load" });
    await page.waitForFunction("window.__steps.length > 0", null, { timeout: 15000 });
    await page.waitForTimeout(1500);
    const count = () => page.evaluate("window.__steps.length") as Promise<number>;
    const waitStep = (n: number) => page.waitForFunction(`window.__steps.length > ${n}`, null, { timeout: 20000 });
    for (let i = 0; i < 2; i++) {
      const n = await count();
      await page.keyboard.press("ArrowRight");
      await waitStep(n);
      await page.waitForTimeout(800);
    }
    for (const label of ["back-1", "back-2"]) {
      net.reset();
      const n = await count();
      const t0 = (await page.evaluate("performance.now()")) as number;
      await page.keyboard.press("ArrowLeft");
      await waitStep(n);
      const t1 = (await page.evaluate(`window.__steps[${n}]`)) as number;
      await page.waitForTimeout(800);
      const list = net.list().filter((r) => r.url.startsWith(D));
      const s = summarize(list, D, D);
      const rec: Rec = {
        id,
        label,
        replayMs: Math.round(t1 - t0),
        demoRequests: s.requests,
        documents: list.filter((r) => r.type === "Document").length,
        notModified: s.notModified,
        fromCache: s.fromCache,
        kb: kb(s.bytes),
        statuses: list.map((r) => `${r.status}${r.disk || r.memCache ? " (cache)" : ""} ${r.cdn ?? ""} ${r.cacheControl ?? ""} ${r.url.replace(D, "")}`),
      };
      out.push(rec);
      report.log(`${profile} ${id} ${label}: replay=${rec.replayMs}ms demo requests=${rec.demoRequests} (network ${rec.demoRequests - rec.fromCache}) 304=${rec.notModified} ${rec.kb}KB`);
    }
    await ctx.close();
  }
  await browser.close();
  const file = writeResult(deck.root, `frame-${profile}`, args.opt("label"), { task: "frame", origin: P, demo: D, profile, rows: out });
  report.log("\n" + table(["Page", "Replay med", "Replay max", "Demo requests", "From cache", "304s", "KB"], pages.map((id) => {
    const sel = out.filter((r) => r.id === id);
    return [id, median(sel.map((r) => r.replayMs)), Math.max(...sel.map((r) => r.replayMs)), median(sel.map((r) => r.demoRequests)), median(sel.map((r) => r.fromCache)), median(sel.map((r) => r.notModified)), median(sel.map((r) => r.kb))];
  })));
  const med = median(out.map((r) => r.replayMs));
  const p90 = percentile(out.map((r) => r.replayMs), 0.9);
  report.data.replay = { median: med, p90 };
  report.pass(`Back replay median ${med} ms, p90 ${p90} ms, target ${budgets.frame.backReplayMedianMs.limit} and ${budgets.frame.backReplayP90Ms.limit}; wrote ${file}`);
}
