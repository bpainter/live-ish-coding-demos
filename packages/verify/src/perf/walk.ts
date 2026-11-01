import { numberOpt } from "../lib/args";
import { budgets } from "../lib/budgets";
import type { Report } from "../lib/report";
import { kb, table } from "../lib/stats";
import { cdpProfile, kind, launch, netlog, summarize, writeResult, type PerfContext, type Req } from "./lib";

/**
 * The whole deck slide by slide, cold then warm in one context, with bytes, requests and 304s by
 * origin and kind. `--offline` cuts the network after the warm pass and asks the HTTP cache for every
 * image, font and stylesheet the walk loaded from the presenter origin: all should come back.
 */
export async function run({ deck, args, P, D, profile }: PerfContext, report: Report): Promise<void> {
  const mode = args.opt("mode") ?? "audience";
  const dwell = numberOpt(args, "dwell", 1800);
  const first = deck.ids[0];
  const browser = await launch(deck);
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const net = await netlog(page);
  await cdpProfile(net.cdp, profile);
  const passes: Record<string, unknown> = {};
  const rows: (string | number)[][] = [];
  let slidesWalked = 0;
  let warmRevalidated = 0;
  for (const pass of ["cold", "warm"] as const) {
    net.reset();
    await page.goto(mode === "audience" ? `${P}/present?s=${first}` : `${P}/s/${first}`, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    // Shift+ArrowRight skips steps, and the walk stops when the address stops changing.
    let last = page.url();
    slidesWalked = 1;
    for (let i = 0; i < deck.slides.length + 2; i++) {
      await page.keyboard.press("Shift+ArrowRight");
      await page.waitForTimeout(dwell);
      const url = page.url();
      if (url === last) break;
      last = url;
      slidesWalked++;
    }
    await page.waitForTimeout(2000);
    const list = net.list();
    const s = summarize(list, P, D);
    const byOriginKind: Record<string, { n: number; bytes: number; notModified: number }> = {};
    for (const r of list) {
      const o = D !== P && r.url.startsWith(D) ? "demo" : r.url.startsWith(P) ? "presenter" : "other";
      const k = `${o}:${kind(r)}`;
      byOriginKind[k] ??= { n: 0, bytes: 0, notModified: 0 };
      byOriginKind[k].n++;
      byOriginKind[k].bytes += r.bytes ?? 0;
      if (r.status === 304) byOriginKind[k].notModified++;
    }
    const imgs = list.filter((r: Req) => kind(r) === "img" && !r.disk && !r.memCache);
    const largest = imgs.sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0))[0];
    const revalidated = list.filter((r) => r.status === 304).map((r) => r.url.replace(P, "").replace(D, "[frames]"));
    if (pass === "warm") warmRevalidated = revalidated.length;
    passes[pass] = { summary: s, byOriginKind, largestImage: largest ? { url: largest.url, bytes: largest.bytes } : null, revalidated };
    rows.push([pass, s.requests, s.requests - s.fromCache, kb(s.bytes), s.notModified, largest ? `${kb(largest.bytes)} KB ${largest.url.replace(P, "").replace(D, "[frames]")}` : ""]);
    report.log(`${mode} ${pass}: ${slidesWalked} slides, requests ${s.requests}, ${kb(s.bytes)} KB, 304 ${s.notModified}`);
  }
  let offline: { files: number; served: number; failed: string[] } | undefined;
  if (args.flag("offline")) {
    const files = [...new Set(net.list().filter((r) => r.url.startsWith(P) && r.status === 200 && /^(img|font|css)$/.test(kind(r)) && !r.url.includes("/_next/")).map((r) => r.url))];
    await page.goto(`${P}/_health`, { waitUntil: "load" });
    await ctx.setOffline(true);
    const failed = (await page.evaluate(`Promise.all(${JSON.stringify(files)}.map((u) => fetch(u).then((r) => (r.ok ? null : u), () => u))).then((a) => a.filter(Boolean))`)) as string[];
    await ctx.setOffline(false);
    offline = { files: files.length, served: files.length - failed.length, failed };
    report.log(`\nOffline after the warm walk: ${offline.served} of ${offline.files} presenter images, fonts and stylesheets served from the HTTP cache`);
    for (const f of failed.slice(0, 10)) report.log(`  missing ${f.replace(P, "")}`);
  }
  await browser.close();
  const file = writeResult(deck.root, `walk-${mode}-${profile}`, args.opt("label"), { task: "walk", origin: P, demo: D, mode, profile, slidesWalked, passes, offline });
  report.log("\n" + table(["Pass", "Requests", "Over the network", "KB", "304s", "Largest image"], rows));
  report.data.warmRevalidated = warmRevalidated;
  const target = budgets.walk.warmRevalidations.limit;
  const warm = (passes.warm as { revalidated: string[] }).revalidated;
  // A target is tracked and reported, not blocked on, so a miss names its files and stays a note.
  if (warmRevalidated > target) report.note(`${warmRevalidated} 304(s) on the warm pass, over the target of ${target}: ${[...new Set(warm)].join(", ")}`);
  else report.pass(`${warmRevalidated} 304(s) on the warm pass, target ${target}`);
  report.pass(`${slidesWalked} of ${deck.slides.length} slides walked; wrote ${file}`);
  if (slidesWalked !== deck.slides.length) report.fail("walk", `walked ${slidesWalked} of ${deck.slides.length} slides`);
}
