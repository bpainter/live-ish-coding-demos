import type { Browser, Demo, SupportSource } from "../schema/demo";

/**
 * Browser and tool support for the intro slides. Every version and date comes from the installed
 * `web-features` package, or for tools from the npm registry at authoring time; nothing here is
 * typed by hand. `prepareDeck` writes the result to `.live-ish/support.json`, the only file the
 * intro slide reads.
 */

export const BROWSERS: { id: Browser; name: string }[] = [
  { id: "chrome", name: "Chrome" },
  { id: "edge", name: "Edge" },
  { id: "firefox", name: "Firefox" },
  { id: "safari", name: "Safari" },
];

export interface WebFeaturesData {
  browsers: Record<string, { name: string; releases: { version: string; date: string }[] }>;
  features: Record<string, { kind?: string; name?: string; status?: FeatureStatus & { by_compat_key?: Record<string, FeatureStatus> } }>;
}

export interface FeatureStatus {
  baseline: "high" | "low" | false;
  baseline_low_date?: string;
  support: Record<string, string>;
}

/** Numeric order of two web-features versions ("≤" ignored): "129" > "125", "26.2" > "26". */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^≤/, "").split(".").map(Number);
  const pb = b.replace(/^≤/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * The status the tiles read: the feature's own, or with
 * `compatKeys`, one built from those keys. A browser's version is the highest across the keys (it
 * supports all of them from then on) and is missing when any key lacks it; Baseline is the weakest
 * of the keys; the low date is their latest.
 */
export function effectiveStatus(featureId: string, status: NonNullable<WebFeaturesData["features"][string]["status"]>, compatKeys?: string[]): FeatureStatus {
  if (!compatKeys?.length) return status;
  const keys = compatKeys.map((k) => {
    const s = status.by_compat_key?.[k];
    if (!s) throw new Error(`web-features ${featureId} has no compat key "${k}"`);
    return s;
  });
  const support: Record<string, string> = {};
  for (const b of BROWSERS.map((x) => x.id)) {
    const versions = keys.map((k) => k.support[b]);
    if (versions.some((v) => !v)) continue;
    support[b] = versions.reduce((hi, v) => (compareVersions(v!, hi!) > 0 ? v : hi))!;
  }
  const baseline = keys.some((k) => !k.baseline) ? false : keys.some((k) => k.baseline === "low") ? "low" : "high";
  const lows = keys.map((k) => k.baseline_low_date).filter((d): d is string => Boolean(d));
  return { baseline, support, ...(baseline && lows.length === keys.length ? { baseline_low_date: lows.sort().pop()! } : {}) };
}

export interface SupportTile {
  /** Browser id or npm package name. */
  id: string;
  name: string;
  /** First supporting version as web-features gives it ("≤" kept), or null for "Not yet". */
  version: string | null;
  /** Release date of that version (YYYY-MM-DD), when known. */
  date: string | null;
}

export interface SupportEntry {
  kind: "web-features" | "tooling";
  /** Primary web-features id (web-features sections). */
  id?: string;
  /** The feature's web-features name. */
  name?: string;
  baseline?: "high" | "low" | false;
  baselineLowDate?: string | null;
  tiles: SupportTile[];
  /** The generated sentence(s) after the author's description. */
  since: string;
  /** "This demo also uses ..." or null. */
  alsoUses: string | null;
}

export interface SupportFile {
  package: "web-features";
  version: string;
  /** Tool release dates, keyed "<npm>@<version>". */
  toolDates: Record<string, string>;
  demos: Record<string, SupportEntry>;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2022-03-14" -> "March 2022". */
export function monthYear(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** "a, b and c". */
export function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function releaseDate(data: WebFeaturesData, browser: string, version: string): string | null {
  const v = version.replace(/^≤/, "");
  return data.browsers[browser]?.releases.find((r) => r.version === v)?.date ?? null;
}

/** The web-features name of a feature, for sentences: "<dialog>" reads as "Dialog". */
export function spokenName(name: string): string {
  const plain = name.replace(/<([\w-]+)>/g, "$1");
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

export function webFeaturesEntry(data: WebFeaturesData, source: Extract<SupportSource, { kind: "web-features" }>): SupportEntry {
  const feature = data.features[source.id];
  if (!feature?.status) throw new Error(`web-features has no feature "${source.id}"`);
  const status = effectiveStatus(source.id, feature.status, source.compatKeys);
  const support = status.support;
  const tiles: SupportTile[] = BROWSERS.map((b) => {
    const version = support[b.id] ?? null;
    return { id: b.id, name: b.name, version, date: version ? releaseDate(data, b.id, version) : null };
  });
  let since: string;
  if (status.baseline && status.baseline_low_date) {
    since = `It has been available in all four browsers since ${monthYear(status.baseline_low_date)}.`;
  } else {
    const listed = tiles.filter((t) => t.version);
    const latest = listed.map((t) => t.date ?? "").sort().pop() ?? "";
    const missing = tiles.filter((t) => !t.version);
    since = `It has been available in ${joinAnd(listed.map((t) => t.name))} since ${monthYear(latest)}.`;
    if (missing.length) {
      const fallback = source.fallback?.text;
      if (!fallback) throw new Error(`${source.id}: not Baseline and missing in ${missing.map((m) => m.name).join(", ")}, but support.fallback is not set`);
      since += ` ${joinAnd(missing.map((m) => m.name))} ${missing.length > 1 ? "show" : "shows"} ${fallback}.`;
    }
  }
  let alsoUses: string | null = null;
  if (source.alsoUses?.length) {
    const parts = source.alsoUses.map((id) => {
      const f = data.features[id];
      if (!f?.status) throw new Error(`web-features has no feature "${id}"`);
      const when = f.status.baseline_low_date ? ` (${monthYear(f.status.baseline_low_date)})` : "";
      return `${spokenName(f.name ?? id)}${when}`;
    });
    alsoUses = `This demo also uses ${joinAnd(parts)}.`;
  }
  return { kind: "web-features", id: source.id, name: feature.name, baseline: status.baseline, baselineLowDate: status.baseline_low_date ?? null, tiles, since, alsoUses };
}

/** npm version for a tile's version: "16" -> "16.0.0", "12.11" -> "12.11.0". */
export function fullVersion(version: string): string {
  const parts = version.split(".");
  while (parts.length < 3) parts.push("0");
  return parts.join(".");
}

export function toolingEntry(source: Extract<SupportSource, { kind: "tooling" }>, toolDates: Record<string, string>): SupportEntry {
  const tiles: SupportTile[] = source.packages.map((p) => ({ id: p.npm, name: p.name, version: p.version, date: toolDates[`${p.npm}@${fullVersion(p.version)}`] ?? null }));
  const dated = tiles.filter((t) => t.date);
  const since = dated.length
    ? dated.length === 1
      ? `${dated[0].name} ${dated[0].version} came out in ${monthYear(dated[0].date!)}.`
      : `${joinAnd(dated.map((t, i) => (i === 0 ? `${t.name} ${t.version} came out in ${monthYear(t.date!)}` : `${t.name} ${t.version} in ${monthYear(t.date!)}`)))}.`
    : "";
  return { kind: "tooling", tiles, since, alsoUses: null };
}

/** Every demo with an intro page and a support source, computed from the data. */
export function computeSupport(demos: Demo[], data: WebFeaturesData, version: string, toolDates: Record<string, string>): SupportFile {
  const out: SupportFile = { package: "web-features", version, toolDates, demos: {} };
  for (const s of demos) {
    if (!s.support || !s.pages.some((p) => p.beat === "intro")) continue;
    out.demos[s.id] = s.support.kind === "web-features" ? webFeaturesEntry(data, s.support) : toolingEntry(s.support, toolDates);
  }
  return out;
}
