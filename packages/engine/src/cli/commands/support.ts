import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { UsageError } from "../args";
import { BROWSERS, computeSupport, fullVersion, type SupportFile, type WebFeaturesData } from "../../lib/support-data";
import { installedWebFeatures } from "../../lib/web-features";
import { prepareDeck } from "../../prepare";
import { EXIT, environment, printJson, requireDeck, type Ctx, type ExitCode } from "../io";

export interface SupportHit {
  id: string;
  name: string;
  baseline: "high" | "low" | false | null;
  baselineLowDate: string | null;
  support: Record<string, string | null>;
}

/** Features whose id or name holds every word of the query, ids that match first. */
export function searchFeatures(data: WebFeaturesData, query: string): SupportHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits: SupportHit[] = [];
  for (const [id, feature] of Object.entries(data.features)) {
    if (!feature.status) continue;
    const name = feature.name ?? id;
    const haystack = `${id} ${name}`.toLowerCase();
    if (!words.every((w) => haystack.includes(w))) continue;
    const { baseline, baseline_low_date, support } = feature.status;
    hits.push({ id, name, baseline: baseline ?? null, baselineLowDate: baseline_low_date ?? null, support: Object.fromEntries(BROWSERS.map((b) => [b.id, support[b.id] ?? null])) });
  }
  const q = words.join("-");
  const rank = (h: SupportHit) => (h.id === q ? 0 : h.id.startsWith(q) ? 1 : h.id.includes(q) ? 2 : 3);
  return hits.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}

const baselineWord = (h: SupportHit) => (h.baseline === "high" ? "Baseline" : h.baseline === "low" ? "Baseline, newly available" : "Not Baseline");

/** The only step here that needs a network: release dates of the tools a deck names. */
async function fetchToolDates(root: string, ctx: Ctx): Promise<ExitCode> {
  const { demos } = await prepareDeck(root);
  const toolDates: Record<string, string> = {};
  for (const demo of demos) {
    if (demo.support?.kind !== "tooling") continue;
    for (const p of demo.support.packages) {
      const version = fullVersion(p.version);
      const key = `${p.npm}@${version}`;
      let times: Record<string, string>;
      try {
        const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(p.npm).replace("%40", "@")}`, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new Error(`the registry answered ${res.status}`);
        times = ((await res.json()) as { time: Record<string, string> }).time;
      } catch (error) {
        throw environment(`Could not read ${p.npm} from the npm registry: ${(error as Error).message}.`, "Check the network. `support --tools` is the one authoring step that needs it.");
      }
      if (!times[version]) throw new UsageError(`npm has no ${key}. Fix the version in demos/${demo.id}/demo.ts.`);
      toolDates[key] = times[version].slice(0, 10);
      ctx.log(`${key}: ${toolDates[key]}`);
    }
  }
  const { version, data } = installedWebFeatures();
  const file = path.join(root, ".live-ish", "support.json");
  const previous = JSON.parse(readFileSync(file, "utf8")) as SupportFile;
  writeFileSync(file, `${JSON.stringify(computeSupport(demos, data, version, { ...previous.toolDates, ...toolDates }), null, 2)}\n`);
  if (ctx.json) printJson({ ok: true, toolDates });
  else ctx.log(`${Object.keys(toolDates).length} tool date(s) in .live-ish/support.json.`);
  return EXIT.ok;
}

export async function support(ctx: Ctx): Promise<ExitCode> {
  if (ctx.flags.tools === true) return fetchToolDates(requireDeck(ctx), ctx);
  const query = ctx.positionals.join(" ").trim();
  if (!query) throw new UsageError('Name a feature: live-ish support "details", or --tools for tool release dates.');
  const { version, data } = installedWebFeatures();
  const results = searchFeatures(data, query);
  if (ctx.json) {
    printJson({ package: "web-features", packageVersion: version, query, results });
    return EXIT.ok;
  }
  if (results.length === 0) {
    ctx.log(`No feature in web-features ${version} matches "${query}".`);
    return EXIT.ok;
  }
  for (const h of results.slice(0, 20)) {
    const versions = BROWSERS.map((b) => `${b.name} ${h.support[b.id] ?? "no"}`).join(", ");
    ctx.log(`${h.id}: ${h.name}. ${baselineWord(h)}${h.baselineLowDate ? ` since ${h.baselineLowDate}` : ""}.`);
    ctx.log(`  ${versions}`);
  }
  if (results.length > 20) ctx.log(`${results.length - 20} more. Narrow the query or use --json.`);
  ctx.log(`From web-features ${version}.`);
  return EXIT.ok;
}
