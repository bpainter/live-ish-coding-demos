import { computeSupport, webFeaturesEntry, type SupportFile, type WebFeaturesData } from "../../support-data";
import { installedWebFeatures } from "../../web-features";
import { defineRule, genPath, memo, readJson, whereDemo } from "../context";
import { copyFields, isTodo } from "../copy";
import { rankByDistance } from "../nearest";
import type { Rule, RuleContext } from "../types";

const webFeatures = (ctx: RuleContext) => memo(ctx, "web-features", installedWebFeatures);

/** The ids a demo can name: moved and split features have no status of their own. */
const liveIds = (data: WebFeaturesData) => Object.keys(data.features).filter((id) => data.features[id].status);

/** What the installed data says, for the demos it can answer for. */
function computedSupport(ctx: RuleContext): SupportFile | null {
  return memo(ctx, "support", () => {
    const { data, version } = webFeatures(ctx);
    const known = ctx.deck.demos.filter((d) => {
      if (d.support?.kind !== "web-features") return Boolean(d.support);
      try {
        webFeaturesEntry(data, d.support);
        return true;
      } catch {
        return false;
      }
    });
    return computeSupport(known, data, version, readJson<SupportFile>(genPath(ctx, "support.json"))?.toolDates ?? {});
  });
}

/** The `schemaVersion` this engine reads. */
const ENGINE_SCHEMA = 1;

/** Claims that need a source. There is no field for a version; the data is the only place one comes from. */
const CLAIMS: RegExp[] = [/\b(?:works?|runs?|supported|available|ships?)\s+(?:in|on|by|across)\s+(?:all|every)\s+(?:the\s+)?(?:four\s+|major\s+|modern\s+|current\s+)?browsers?\b/i, /\ball\s+(?:the\s+)?(?:major|modern)\s+browsers\b/i, /\bevery\s+(?:major\s+|modern\s+)?browser\b/i, /\buniversal(?:ly)?\s+(?:browser\s+)?support(?:ed)?\b/i, /\bfull\s+browser\s+support\b/i];
const VERSION = /\b(Chrome|Edge|Firefox|Safari)\s+(?:version\s+|v)?(\d+(?:\.\d+)?)\b/gi;

export const rules: Rule[] = [
  defineRule("support", "Support ids exist in web-features, and the generated data is current.", (ctx, add) => {
    const demos = ctx.deck.demos.filter((d) => d.support);
    if (!demos.length) return;
    const { data, version } = webFeatures(ctx);
    const ids = liveIds(data);
    for (const demo of demos) {
      const s = demo.support!;
      if (s.kind !== "web-features") continue;
      const bad = [s.id, ...(s.alsoUses ?? [])].filter((id) => !data.features[id]?.status);
      for (const id of bad) add(whereDemo(demo, "support"), `web-features ${version} has no feature "${id}".`, { fix: `Close ids: ${rankByDistance(id, ids).slice(0, 4).join(", ")}.` });
      if ((s.alsoUses?.length ?? 0) > 2) add(whereDemo(demo, "support.alsoUses"), `${s.alsoUses!.length} features, and the slide names 2.`);
      if (bad.length) continue;
      try {
        webFeaturesEntry(data, s);
      } catch (e) {
        add(whereDemo(demo, "support"), `${(e as Error).message}.`, { fix: "Set support.fallback to say what the room sees instead." });
      }
    }
    // `.live-ish/` is rewritten on every dev and build, so a missing file is only a deck not run yet.
    const file = readJson<SupportFile>(genPath(ctx, "support.json"));
    const expected = computedSupport(ctx);
    if (!file?.version || !expected) return;
    if (file.version !== version) add(".live-ish/support.json", `It was generated from web-features ${file.version}, but ${version} is installed.`, { fix: "Run live-ish dev or live-ish build." });
    else {
      const stale = Object.keys(expected.demos).filter((id) => JSON.stringify(file.demos[id]) !== JSON.stringify(expected.demos[id]));
      if (stale.length) add(".live-ish/support.json", `It is out of date for ${stale.join(", ")}.`, { fix: "Run live-ish dev or live-ish build." });
    }
  }),

  defineRule("support-claim", "Copy and notes make no browser claim the data cannot back.", (ctx, add) => {
    const fields = copyFields(ctx).filter((f) => !isTodo(f.text));
    const quoted: { where: string; text: string }[] = fields.flatMap((f) => (CLAIMS.some((re) => re.test(f.text)) ? [{ where: f.where, text: f.text }] : []));
    for (const q of quoted) add(q.where, `"${q.text.slice(0, 70)}${q.text.length > 70 ? "…" : ""}" makes a browser claim with no source.`, { fix: "Name a web-features id in support, and let the intro slide say where it works." });
    const versions = fields.flatMap((f) => [...f.text.matchAll(VERSION)].map((m) => ({ where: f.where, browser: m[1], version: m[2] })));
    if (!versions.length) return;
    const data = computedSupport(ctx);
    const known = new Set(Object.values(data?.demos ?? {}).flatMap((e) => e.tiles.flatMap((t) => (t.version ? [`${t.name.toLowerCase()} ${t.version.replace(/^≤/, "")}`] : []))));
    for (const v of versions) {
      if (!known.has(`${v.browser.toLowerCase()} ${v.version}`)) add(v.where, `It names ${v.browser} ${v.version}, which is not in the generated support data.`, { fix: "Run live-ish support <query> for the real version, or drop the number." });
    }
  }),

  defineRule("skills-stale", "Agent skills target the schema this engine uses.", (ctx, add) => {
    const lock = readJson<{ schema?: number; schemaVersion?: number }>(genPath(ctx, "skills.lock"));
    if (!lock) return;
    const target = lock.schema ?? lock.schemaVersion;
    if (typeof target === "number" && target < ENGINE_SCHEMA) add(".live-ish/skills.lock", `Skills target schema ${target}, and this engine uses schema ${ENGINE_SCHEMA}.`, { fix: "Run live-ish upgrade." });
  }),
];
