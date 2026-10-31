import { DeckConfigError, type ConfigIssue } from "../../schema/errors";
import { REMOVED_RULES, RULE_IDS, TIERS, tierOf } from "./catalog";
import { closeTo } from "./nearest";

/**
 * Validates `deck.config.ts` by shape, so a wrong field fails with its path, the expected type and
 * the nearest valid name, and never as a blank frame on stage. Runs inside `defineDeck()`, which
 * reaches the client bundle, so this module keeps to pure data and no `node:` imports.
 */

type Spec =
  | { kind: "string" | "number" | "boolean" }
  | { kind: "literal"; values: readonly (string | number)[] }
  | { kind: "array"; of: Spec }
  | { kind: "record"; of: Spec }
  | { kind: "object"; fields: Record<string, Spec>; required?: readonly string[] }
  | { kind: "rules"; check: (key: string, value: unknown, path: string, out: ConfigIssue[]) => void };

const string: Spec = { kind: "string" };
const number: Spec = { kind: "number" };
const boolean: Spec = { kind: "boolean" };
const strings: Spec = { kind: "array", of: string };
const literal = (...values: (string | number)[]): Spec => ({ kind: "literal", values });
const object = (fields: Record<string, Spec>, required: readonly string[] = []): Spec => ({ kind: "object", fields, required });
const record = (of: Spec): Spec => ({ kind: "record", of });

const SEVERITY = ["off", "warn", "error"] as const;
const showSeverity = SEVERITY.map((s) => `"${s}"`).join(" | ");

function unknownRule(key: string, path: string, valid: readonly string[], out: ConfigIssue[]) {
  if (REMOVED_RULES.includes(key)) {
    out.push({ path, message: `"${key}" was removed from Live-ish, so it has no setting.`, fix: "Delete this line." });
    return;
  }
  const near = closeTo(key, [...valid]);
  out.push({ path, message: `"${key}" is not a rule id.`, fix: near ? `Did you mean "${near}"?` : `Run live-ish explain <rule> for a rule's id.` });
}

/** `writing.rules`: the Style tier, by severity, and `sentence` by its two word limits. */
function checkWritingRule(key: string, value: unknown, path: string, out: ConfigIssue[]) {
  if (!TIERS.style.includes(key)) return unknownRule(key, path, TIERS.style, out);
  if (key === "sentence" && typeof value === "object" && value !== null) {
    for (const [limit, words] of Object.entries(value)) {
      if (limit !== "warn" && limit !== "error") out.push({ path: `${path}.${limit}`, message: "is not a field. Expected a number of words.", fix: `Did you mean "${closeTo(limit, ["warn", "error"]) ?? "warn"}"?` });
      else if (typeof words !== "number") out.push({ path: `${path}.${limit}`, message: `Expected a number of words, found ${describe(words)}.` });
    }
    return;
  }
  if (!SEVERITY.includes(value as (typeof SEVERITY)[number])) out.push({ path, message: `Expected ${showSeverity}${key === "sentence" ? " or { warn, error }" : ""}, found ${describe(value)}.` });
}

/**
 * `checks.rules`: Integrity rules cannot be set at all, Fit rules can only relax (their limits are
 * tied to the layout, so a number is no use), and Support and Style rules take any severity.
 */
function checkRule(key: string, value: unknown, path: string, out: ConfigIssue[]) {
  const tier = tierOf(key);
  if (!tier) return unknownRule(key, path, RULE_IDS, out);
  if (tier === "integrity") {
    out.push({ path, message: `"${key}" is an Integrity rule, so it is always on and cannot be set.`, fix: "Delete this line and fix what the rule reports." });
    return;
  }
  if (tier === "fit") {
    if (typeof value === "object" && value !== null) out.push({ path, message: `Expected "off" | "warn", found an object. Fit limits follow the layout, so they cannot be changed.`, fix: "Relax the severity, or change the layout." });
    else if (value === "error") out.push({ path, message: `Expected "off" | "warn", found "error". A Fit rule can only relax.`, fix: `Use checks.fit: "error" or --strict to raise every Fit rule.` });
    else if (value !== "off" && value !== "warn") out.push({ path, message: `Expected "off" | "warn", found ${describe(value)}.` });
    return;
  }
  if (!SEVERITY.includes(value as (typeof SEVERITY)[number])) out.push({ path, message: `Expected ${showSeverity}, found ${describe(value)}.` });
}

const beats = object({ before: string, after: string });

const DECK: Spec = object(
  {
    schemaVersion: literal(1),
    title: string,
    order: strings,
    description: string,
    lang: string,
    speaker: object({ name: string, title: string, org: string, url: string }, ["name"]),
    event: object({ name: string, label: string, city: string, region: string, country: string, venue: string, startDate: string, organizer: object({ name: string, url: string }, ["name", "url"]) }, ["name"]),
    links: object({ site: object({ label: string, url: string }, ["label", "url"]), tag: record(string) }),
    footer: string,
    beats,
    theme: object({ extends: string, tokens: record(string), fonts: object({ sans: strings, mono: strings }), grain: boolean, brand: object({ text: string, url: string }, ["text"]) }),
    chrome: object({ theme: string, beats, copySlides: boolean, custom: strings }),
    hosts: object({ site: string, frames: string, external: record(string) }),
    servers: { kind: "array", of: object({ app: string, command: string, port: number }, ["app", "command", "port"]) },
    presenter: object({ onHost: boolean }),
    reader: object({ enabled: boolean, notes: boolean, index: boolean }),
    analytics: object({ provider: literal("none", "vercel", "custom"), speedInsights: boolean, script: string }),
    timing: object({ target: number }),
    writing: object({ preset: literal("none", "plain"), rules: { kind: "rules", check: checkWritingRule }, banned: strings }),
    checks: object({ fit: literal("off", "warn", "error"), rules: { kind: "rules", check: checkRule } }),
    verify: object({ browsers: { kind: "array", of: literal("chromium", "webkit", "firefox") }, chromiumArgs: strings, channel: string }),
  },
  ["schemaVersion", "title", "order", "speaker"],
);

function expected(spec: Spec): string {
  switch (spec.kind) {
    case "literal":
      return spec.values.map((v) => JSON.stringify(v)).join(" | ");
    case "array":
      return `${expected(spec.of)}[]`;
    case "record":
      return `an object of ${expected(spec.of)} values`;
    case "object":
      return `an object with ${Object.keys(spec.fields).join(", ")}`;
    case "rules":
      return "an object of rule settings";
    default:
      return spec.kind;
  }
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value === "string" ? JSON.stringify(value) : typeof value === "object" ? "an object" : String(value);
}

function walk(value: unknown, spec: Spec, path: string, out: ConfigIssue[]) {
  if (value === undefined) return;
  const wrong = () => out.push({ path, message: `Expected ${expected(spec)}, found ${describe(value)}.` });
  switch (spec.kind) {
    case "string":
    case "number":
    case "boolean":
      if (typeof value !== spec.kind) wrong();
      return;
    case "literal":
      if (!spec.values.includes(value as string | number)) wrong();
      return;
    case "array":
      if (!Array.isArray(value)) return void wrong();
      value.forEach((v, i) => walk(v, spec.of, `${path}[${i}]`, out));
      return;
    case "record":
    case "rules":
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return void wrong();
      const entries = Object.entries(value);
      if (spec.kind === "record") return entries.forEach(([k, v]) => walk(v, spec.of, `${path}.${k}`, out));
      if (spec.kind === "rules") return entries.forEach(([k, v]) => spec.check(k, v, `${path}.${k}`, out));
      const at = (key: string) => (path ? `${path}.${key}` : key);
      for (const key of spec.required ?? []) {
        if ((value as Record<string, unknown>)[key] === undefined) out.push({ path: at(key), message: `is required. Expected ${expected(spec.fields[key])}.` });
      }
      const names = Object.keys(spec.fields);
      for (const [key, v] of entries) {
        const field = spec.fields[key];
        if (field) {
          walk(v, field, at(key), out);
          continue;
        }
        const near = closeTo(key, names);
        out.push(near ? { path: at(key), message: `is not a config field. Expected ${expected(spec.fields[near])} at ${at(near)}.`, fix: `Did you mean "${near}"?` } : { path: at(key), message: "is not a config field.", fix: `Valid fields here: ${names.join(", ")}.` });
      }
    }
  }
}

/** Every problem with a deck config, in file order. */
export function validateDeckConfig(config: unknown): ConfigIssue[] {
  const out: ConfigIssue[] = [];
  walk(config, DECK, "", out);
  return out;
}

/** Throws a `DeckConfigError` that names every problem at once. */
export function assertDeckConfig(config: unknown): void {
  const issues = validateDeckConfig(config);
  if (issues.length) throw new DeckConfigError(issues);
}
