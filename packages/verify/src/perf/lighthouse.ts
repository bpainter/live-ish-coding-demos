import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { EnvironmentError } from "../lib/args";
import type { Report } from "../lib/report";
import { round, table } from "../lib/stats";
import { loadUrls } from "./load";
import { writeResult, type PerfContext } from "./lib";

/**
 * Lighthouse performance and accessibility for the sampled pages, desktop and mobile. It runs through
 * `pnpm dlx`, on Playwright's Chromium, so nothing is added to a deck's dependencies, and it is the
 * one task that needs the network.
 */

const LIGHTHOUSE = "lighthouse@12.8.2";

interface Lhr {
  categories: Record<string, { score: number | null }>;
  audits: Record<string, { numericValue?: number; details?: { items?: { node?: { selector?: string } }[] } }>;
}

export async function run({ deck, args, P }: PerfContext, report: Report): Promise<void> {
  const form = args.opt("form") ?? "both";
  const pages = args.opt("only") ? [args.opt("only")!] : loadUrls(deck);
  const forms = form === "both" ? ["desktop", "mobile"] : [form];
  const chrome = chromium.executablePath();
  const dir = mkdtempSync(path.join(tmpdir(), "perf-lh-"));
  const rows: (string | number | null)[][] = [];
  const raw: unknown[] = [];
  let failed = 0;
  try {
    for (const f of forms) {
      for (const p of pages) {
        const out = path.join(dir, "report.json");
        const cli = ["dlx", LIGHTHOUSE, P + p, "--quiet", "--output=json", `--output-path=${out}`, "--only-categories=performance,accessibility", `--chrome-path=${chrome}`, "--chrome-flags=--headless=new", ...(f === "desktop" ? ["--preset=desktop"] : [])];
        const r = spawnSync("pnpm", cli, { stdio: ["ignore", "ignore", "inherit"] });
        if (r.error) throw new EnvironmentError(`Could not run ${LIGHTHOUSE}: ${r.error.message}.`);
        if (r.status !== 0) {
          failed++;
          rows.push([f, p, "failed", null, null, null, null, null, null]);
          continue;
        }
        const lhr = JSON.parse(readFileSync(out, "utf8")) as Lhr;
        const a = (id: string) => lhr.audits[id]?.numericValue;
        const rec = { form: f, page: p, performance: Math.round((lhr.categories.performance?.score ?? 0) * 100), accessibility: Math.round((lhr.categories.accessibility?.score ?? 0) * 100), fcp: round(a("first-contentful-paint")), lcp: round(a("largest-contentful-paint")), tbt: round(a("total-blocking-time")), cls: a("cumulative-layout-shift")?.toFixed(3) ?? null, ttfb: round(a("server-response-time")), bytes: round((a("total-byte-weight") ?? 0) / 1024), lcpElement: lhr.audits["largest-contentful-paint-element"]?.details?.items?.[0]?.node?.selector ?? null };
        raw.push(rec);
        rows.push([f, p, rec.performance, rec.accessibility, rec.fcp, rec.lcp, rec.tbt, rec.cls, rec.bytes]);
        report.log(`${f} ${p.padEnd(26)} perf ${rec.performance} a11y ${rec.accessibility} LCP ${rec.lcp} CLS ${rec.cls} ${rec.bytes} KB`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const file = writeResult(deck.root, "lighthouse", args.opt("label"), { task: "lighthouse", origin: P, lighthouse: LIGHTHOUSE, rows: raw });
  report.log("\n" + table(["Form", "Page", "Performance", "Accessibility", "FCP", "LCP", "TBT", "CLS", "KB"], rows));
  if (failed) report.fail("lighthouse", `${failed} run(s) failed`);
  else report.pass(`${raw.length} Lighthouse run(s); wrote ${file}`);
}
