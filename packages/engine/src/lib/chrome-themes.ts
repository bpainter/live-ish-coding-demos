import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { colorsIn, floor2, parseColor, ratio, stack, toHex, type RGBA } from "./contrast";
import { DECK_PAIRS, DECK_PALETTE, SPEAKER_PALETTE, type DeckToken } from "./palettes";
import { FONT_FAMILIES, fontStack } from "./fonts";

/**
 * Audience themes. A built-in theme is one file, themes/<id>.json; a custom theme is the same shape
 * under the deck, named in `chrome.custom`. Everything else is generated from these: the CSS, the
 * `ChromeThemeId` type, the schema enum and the docs table (scripts/gen-themes.mts).
 *
 * A theme file is data. It sets tokens from the contract below and picks from the engine's named
 * effects and details. It cannot hold selectors, raw CSS or scripts, so it cannot reach the demo
 * inside a frame or the presenter's chrome.
 */
const ENGINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const THEMES_DIR = path.join(ENGINE, "themes");

/** The public token contract. A theme sets these and nothing else. */
export const TOKEN_GROUPS = {
  Backdrop: ["--chrome-backdrop", "--chrome-backdrop-light", "--chrome-backdrop-dark", "--chrome-grain"],
  Text: ["--chrome-ink", "--chrome-ink-soft", "--chrome-accent", "--chrome-font-sans", "--chrome-title-weight"],
  "Frame shell": ["--chrome-card-surface", "--chrome-card-border", "--chrome-card-radius", "--chrome-card-shadow", "--chrome-blur"],
  "Code panel": ["--chrome-code-surface", "--chrome-code-ink", "--chrome-code-keyword", "--chrome-code-string", "--chrome-code-comment", "--chrome-code-number", "--chrome-code-property", "--chrome-code-highlight-bg", "--chrome-code-highlight-bar", "--chrome-code-dim-opacity", "--chrome-font-mono"],
  Steps: ["--chrome-step-done", "--chrome-step-current", "--chrome-step-future"],
  Overlay: ["--chrome-spot-ring", "--chrome-spot-halo", "--chrome-spot-width", "--chrome-spot-style", "--chrome-callout-bg", "--chrome-callout-ink", "--chrome-callout-leader", "--chrome-keycap-bg", "--chrome-keycap-ink", "--chrome-keycap-edge", "--chrome-cursor"],
  Terminal: ["--term-bg", "--term-ink", "--term-prompt", "--term-comment", "--term-chrome"],
  Motion: ["--chrome-dur-fade", "--chrome-effect"],
} as const;

export const CONTRACT_TOKENS: string[] = Object.values(TOKEN_GROUPS).flat();
/** Layout limits and "44 columns fit the card" depend on these two. */
export const LOCKED_TOKENS = ["--chrome-code-size", "--chrome-code-leading"];
const TERM_TOKENS = TOKEN_GROUPS.Terminal as readonly string[];

/** Set through `code`, `fonts` and `motion`, so a theme file has one place for each. */
const DERIVED_TOKENS = ["--chrome-code-ink", "--chrome-code-keyword", "--chrome-code-string", "--chrome-code-comment", "--chrome-code-number", "--chrome-code-property", "--chrome-font-sans", "--chrome-font-mono", "--chrome-dur-fade", "--chrome-effect"];

export const EFFECTS = ["blink", "marquee", "scanlines", "press"] as const;
export type Effect = (typeof EFFECTS)[number];

/** Details a theme picks from: engine code with a fixed set of looks, reached through private --fx-* values. */
const DETAILS: Record<string, Record<string, Record<string, string>>> = {
  meter: {
    counter: {
      "--fx-meter-bg": "var(--term-bg)",
      "--fx-meter-ink": "var(--term-prompt)",
      "--fx-meter-font": "var(--chrome-font-mono)",
      "--fx-meter-pad": "0 12px",
      "--fx-meter-edge": "inset 2px 2px 0 var(--chrome-code-comment), inset -2px -2px 0 var(--chrome-code-surface)",
    },
  },
  title: { glow: { "--fx-title-shadow": "0 0 12px color-mix(in srgb, var(--chrome-accent) 45%, transparent)" } },
  rule: { hairline: { "--fx-rule": "1px solid var(--chrome-ink)" } },
};

const CODE_KEYS = ["ink", "keyword", "string", "comment", "number", "property"] as const;
export type CodeKey = (typeof CODE_KEYS)[number];

/** A font in a custom theme: a system stack as a string, or files under public/fonts/ with their license. */
export type ThemeFont = string | { family: string; files: { src: string; weight: number }[]; license: string };

export interface ThemeFile {
  $schema?: string;
  schemaVersion: 1;
  id: string;
  name: string;
  /** The theme this one takes missing values from. Default: `glass`. */
  extends?: string;
  traits?: string[];
  tokens?: Record<string, string>;
  code?: Partial<Record<CodeKey, string>>;
  fonts?: { sans?: ThemeFont; mono?: ThemeFont };
  motion?: { fade?: number; effect?: string };
  details?: Record<string, string>;
}

export interface ChromeTheme {
  id: string;
  name: string;
  traits: string[];
  /** Every contract token, resolved through the base theme. */
  tokens: Record<string, string>;
  code: Record<CodeKey, string>;
  fonts: { sans: ThemeFont; mono: ThemeFont };
  motion: { fade: number; effects: Effect[] };
  details: Record<string, string>;
  /** Where it came from: a path, or "built-in". */
  source: string;
}

export interface ThemeProblem {
  field: string;
  message: string;
}

export class ThemeError extends Error {
  override name = "ThemeError";
}

const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8")) as ThemeFile;

function builtInFiles(): Map<string, string> {
  const files = readdirSync(THEMES_DIR).filter((f) => f.endsWith(".json") && !f.includes(".schema."));
  return new Map(files.sort().map((f) => [f.replace(/\.json$/, ""), path.join(THEMES_DIR, f)]));
}

/** The default first, then the order the docs list them. A new theme file joins at the end. */
const ORDER = ["glass", "flat", "early-web", "soft", "brutalist", "layered", "tactile", "phosphor", "swiss", "high-contrast"];

/** The built-in ids, read from disk. Generated code holds the same list for the bundle. */
export function builtInIds(): string[] {
  const rank = (id: string) => (ORDER.includes(id) ? ORDER.indexOf(id) : ORDER.length);
  return [...builtInFiles().keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function mergeFile(base: ChromeTheme | null, file: ThemeFile, source: string): ChromeTheme {
  const code = { ...base?.code, ...file.code } as Record<CodeKey, string>;
  const fonts = { ...base?.fonts, ...file.fonts } as ChromeTheme["fonts"];
  const fade = file.motion?.fade ?? base?.motion.fade ?? 160;
  const effect = file.motion?.effect;
  const effects = effect === undefined ? (base?.motion.effects ?? []) : effect === "none" ? [] : (effect.split(/\s+/) as Effect[]);
  const tokens: Record<string, string> = { ...base?.tokens, ...file.tokens };
  for (const key of CODE_KEYS) tokens[`--chrome-code-${key}`] = code[key];
  if (fonts.sans) tokens["--chrome-font-sans"] = stackOf(fonts.sans);
  if (fonts.mono) tokens["--chrome-font-mono"] = stackOf(fonts.mono);
  tokens["--chrome-dur-fade"] = `${fade}ms`;
  tokens["--chrome-effect"] = effects.length ? effects.join(" ") : "none";
  return {
    id: file.id,
    name: file.name,
    traits: file.traits ?? [],
    tokens,
    code,
    fonts,
    motion: { fade, effects },
    details: { ...base?.details, ...file.details },
    source,
  };
}

const stackOf = (font: ThemeFont) => (typeof font === "string" ? fontStack(font) : `"${font.family}", system-ui, sans-serif`);

const cache = new Map<string, ChromeTheme>();

function loadBuiltIn(id: string): ChromeTheme {
  const hit = cache.get(id);
  if (hit) return hit;
  const file = builtInFiles().get(id);
  if (!file) throw new ThemeError(`Unknown chrome theme "${id}".`);
  const json = readJson(file);
  const theme = mergeFile(json.extends ? loadBuiltIn(json.extends) : null, json, "built-in");
  cache.set(id, theme);
  return theme;
}

/** `chrome.custom` paths, relative to the deck, as `{ id: absolute path }`. Bad files are left to `theme-lint`. */
export function customThemeFiles(customPaths: string[], root = process.cwd()): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of customPaths) {
    const abs = path.resolve(root, p);
    if (!existsSync(abs)) continue;
    try {
      out.set(readJson(abs).id, abs);
    } catch {
      /* theme-lint reports the file */
    }
  }
  return out;
}

/** The nearest id, for "did you mean". */
function nearestId(id: string, ids: string[]): string | undefined {
  const score = (a: string, b: string) => [...a].filter((c, i) => b[i] === c).length - Math.abs(a.length - b.length);
  return [...ids].sort((x, y) => score(y, id) - score(x, id))[0];
}

/** A theme with every token filled in. A custom theme takes what it leaves out from `extends`, or `glass`. */
export function resolveTheme(id: string, customPaths: string[] = [], root = process.cwd()): ChromeTheme {
  const custom = customThemeFiles(customPaths, root).get(id);
  if (custom) {
    const json = readJson(custom);
    return mergeFile(loadBuiltIn(json.extends ?? "glass"), json, custom);
  }
  if (builtInFiles().has(id)) return loadBuiltIn(id);
  const ids = [...builtInIds(), ...customThemeFiles(customPaths, root).keys()];
  throw new ThemeError(`Unknown chrome theme "${id}". Known themes: ${ids.join(", ")}. Did you mean "${nearestId(id, ids)}"?`);
}

export interface ThemeSummary {
  id: string;
  name: string;
  traits: string[];
  fonts: { sans: string; mono: string };
  motion: { fade: number; effect: string };
  /** Every theme's data, for `live-ish themes --json`. */
  tokens: Record<string, string>;
}

const fontName = (font: ThemeFont) => (typeof font === "string" ? font : font.family);

/** Every built-in theme, then the deck's own. */
export function listThemes(customPaths: string[] = [], root = process.cwd()): ThemeSummary[] {
  const ids = [...builtInIds(), ...customThemeFiles(customPaths, root).keys()];
  return ids.map((id) => {
    const t = resolveTheme(id, customPaths, root);
    return { id: t.id, name: t.name, traits: t.traits, fonts: { sans: fontName(t.fonts.sans), mono: fontName(t.fonts.mono) }, motion: { fade: t.motion.fade, effect: t.tokens["--chrome-effect"] }, tokens: t.tokens };
  });
}

// --- CSS ---------------------------------------------------------------------------------------

const HEADER = (id: string) => `/* Generated by live-ish from the theme file for "${id}". Do not edit. */`;

/** A translucent surface as a solid color, over the lighter backdrop. Null when already opaque. */
function solidSurface(theme: ChromeTheme): string | null {
  const surface = theme.tokens["--chrome-card-surface"];
  const color = parseColor(surface);
  if (!color || color[3] === 1) return null;
  const base = parseColor(theme.tokens["--chrome-backdrop-light"]);
  return base ? toHex(stack(color, base)) : null;
}

const effectVars: Record<Effect, [string, string]> = {
  blink: ["--fx-blink", "chrome-blink"],
  marquee: ["--fx-marquee", "chrome-marquee"],
  scanlines: ["--fx-scanlines", "block"],
  press: ["--fx-press", "chrome-press"],
};

/** The audience stylesheet: tokens scoped to `[data-chrome="<id>"]`, so nothing reaches the presenter's surfaces. */
export function themeCss(theme: ChromeTheme): string {
  const scope = `[data-chrome="${theme.id}"]`;
  const lines = Object.entries(theme.tokens)
    .filter(([k]) => !TERM_TOKENS.includes(k))
    .map(([k, v]) => `  ${k}: ${v};`);
  for (const effect of theme.motion.effects) lines.push(`  ${effectVars[effect][0]}: ${effectVars[effect][1]};`);
  for (const [key, value] of Object.entries(theme.details)) {
    for (const [k, v] of Object.entries(DETAILS[key]?.[value] ?? {})) lines.push(`  ${k}: ${v};`);
  }
  const rules = [HEADER(theme.id), `${scope} {\n${lines.join("\n")}\n}`];
  const solid = solidSurface(theme);
  if (solid || theme.tokens["--chrome-blur"] !== "none") {
    const plain = `--chrome-blur: none;${solid ? ` --chrome-card-surface: ${solid};` : ""}`;
    rules.push(`@media (prefers-reduced-transparency: reduce) { ${scope} { ${plain} } }`, `@supports not (backdrop-filter: blur(1px)) { ${scope} { ${plain} } }`, `:root[data-glass="off"] ${scope} { ${plain} }`);
  }
  return rules.join("\n") + "\n";
}

/** What a terminal frame links: `--term-*` only. The one theme input inside a frame. */
export function themeFrameCss(theme: ChromeTheme): string {
  const lines = TERM_TOKENS.map((k) => `  ${k}: ${theme.tokens[k]};`);
  return `${HEADER(theme.id)}\n:root {\n${lines.join("\n")}\n}\n`;
}

// --- Contrast ----------------------------------------------------------------------------------

export interface ContrastRow {
  /** The check, in words. */
  pair: string;
  /** The tokens under test, for error text. */
  tokens: string;
  /** Worst ratio across the backdrop extremes and surface colors. */
  ratio: number;
  floor: number;
  pass: boolean;
}

function solidOf(value: string, label: string): RGBA {
  const c = parseColor(value);
  if (!c) throw new ThemeError(`${label}: "${value}" is not a color the contrast check can read.`);
  return c;
}

/** Each pair in the bar every theme must meet, computed at its worst point. */
export function contrastReport(theme: ChromeTheme): ContrastRow[] {
  const t = theme.tokens;
  const color = (name: string) => solidOf(t[name], name);
  const backdrops = [color("--chrome-backdrop-light"), color("--chrome-backdrop-dark")];
  const rows: ContrastRow[] = [];
  const row = (pair: string, tokens: string, fg: RGBA, layers: RGBA[], bases: RGBA[], floor: number) => {
    const worst = Math.min(...bases.map((base) => ratio(stack(fg, ...layers, base), stack(...layers, base))));
    const value = floor2(worst);
    rows.push({ pair, tokens, ratio: value, floor, pass: worst >= floor });
  };
  for (const [pair, name, floor] of [
    ["Title on backdrop", "--chrome-ink", 4.5],
    ["Soft ink on backdrop", "--chrome-ink-soft", 4.5],
    ["Accent on backdrop", "--chrome-accent", 3],
    ["Done step segment on backdrop", "--chrome-step-done", 3],
    ["Current step segment on backdrop", "--chrome-step-current", 3],
    ["Future step segment on backdrop", "--chrome-step-future", 3],
  ] as const) {
    row(pair, `${name} on the backdrop`, color(name), [], backdrops, floor);
  }
  const surface = color("--chrome-code-surface");
  const band = color("--chrome-code-highlight-bg");
  const dim = Number(t["--chrome-code-dim-opacity"]);
  for (const key of CODE_KEYS) {
    const fg = solidOf(theme.code[key], `code.${key}`);
    row(`Code ${key} on the code surface`, `code.${key} on --chrome-code-surface`, fg, [], [surface], 7);
    row(`Code ${key} on a highlighted line`, `code.${key} on --chrome-code-highlight-bg`, fg, [band], [surface], 7);
    row(`Code ${key} dimmed`, `code.${key} at --chrome-code-dim-opacity`, [fg[0], fg[1], fg[2], dim], [], [surface], 4.5);
  }
  // Cards take the code panel's ink: intro panels, badges and frame status notes sit on them.
  const card = colorsIn(t["--chrome-card-surface"]);
  if (!card.length) throw new ThemeError(`--chrome-card-surface: "${t["--chrome-card-surface"]}" holds no color the contrast check can read.`);
  for (const key of ["ink", "comment", "keyword"] as const) {
    for (const layer of card) row(`Code ${key} on a card`, `code.${key} on --chrome-card-surface`, solidOf(theme.code[key], `code.${key}`), [layer], backdrops, 4.5);
  }
  const pairOf = (pair: string, fg: string, bg: string, floor: number) => row(pair, `${fg} on ${bg}`, color(fg), [], [color(bg)], floor);
  pairOf("Ring against halo", "--chrome-spot-ring", "--chrome-spot-halo", 3);
  pairOf("Cursor against halo", "--chrome-cursor", "--chrome-spot-halo", 3);
  pairOf("Callout", "--chrome-callout-ink", "--chrome-callout-bg", 4.5);
  pairOf("Keycap", "--chrome-keycap-ink", "--chrome-keycap-bg", 4.5);
  pairOf("Terminal ink", "--term-ink", "--term-bg", 7);
  pairOf("Terminal prompt", "--term-prompt", "--term-bg", 4.5);
  pairOf("Terminal comment", "--term-comment", "--term-bg", 4.5);
  pairOf("Terminal title bar", "--term-ink", "--term-chrome", 4.5);
  return rows;
}

/** The copy palette with `theme.tokens` applied. A token the check can't read keeps the default. */
export function deckContrastReport(overrides: Record<string, string> = {}): ContrastRow[] {
  const value = (t: DeckToken) => parseColor(overrides[t] ?? "") ?? solidOf(DECK_PALETTE[t], t);
  return DECK_PAIRS.map(([fg, bg, floor]) => {
    const r = ratio(value(fg), value(bg));
    return { pair: `${fg} on ${bg}`, tokens: `${fg} on ${bg}`, ratio: floor2(r), floor, pass: r >= floor };
  });
}

/** Presenter chrome: the fixed palette against the speaker view's floors. */
export function speakerContrastReport(): ContrastRow[] {
  const s = (t: keyof typeof SPEAKER_PALETTE) => solidOf(SPEAKER_PALETTE[t], t);
  const bg = s("--speaker-bg");
  const glows = [s("--speaker-glow-warm"), s("--speaker-glow-green")];
  const bases = [bg, stack(glows[0], bg), stack(glows[1], bg), stack(glows[0], glows[1], bg)];
  const rows: ContrastRow[] = [];
  const row = (pair: string, tokens: string, fg: RGBA, layers: RGBA[], over: RGBA[], floor: number) => {
    const worst = Math.min(...over.map((base) => ratio(stack(fg, ...layers, base), stack(...layers, base))));
    rows.push({ pair, tokens, ratio: floor2(worst), floor, pass: worst >= floor });
  };
  const surfaces: [string, RGBA[], RGBA[]][] = [
    ["the window", [], bases],
    ["a panel", [s("--speaker-panel")], bases],
    ["a panel hover", [s("--speaker-panel-strong")], bases],
    ["a References card", [s("--speaker-card"), s("--speaker-panel")], bases],
    ["the footer pill", [s("--speaker-pill")], bases],
    ["the solid fallback", [], [s("--speaker-solid")]],
  ];
  const texts = ["--speaker-ink", "--speaker-ink-body", "--speaker-ink-soft", "--speaker-here", "--speaker-over"] as const;
  for (const [where, layers, over] of surfaces) for (const t of texts) row(`${t} on ${where}`, `${t} on ${where}`, s(t), layers, over, 4.5);
  const ink = s("--speaker-ink");
  row("Ink on a footer button hover", "--speaker-ink on --speaker-hover", ink, [s("--speaker-hover"), s("--speaker-pill")], bases, 4.5);
  for (const tint of ["--speaker-tint-here", "--speaker-tint-cue", "--speaker-tint-alert", "--speaker-tint-neutral"] as const) {
    row(`Ink on ${tint} over a panel`, `--speaker-ink on ${tint}`, ink, [s(tint), s("--speaker-panel")], bases, 4.5);
    row(`Ink on ${tint} over the pill`, `--speaker-ink on ${tint}`, ink, [s(tint), s("--speaker-pill")], bases, 4.5);
  }
  row("Ink on a primary button", "--speaker-ink on --speaker-primary", ink, [], [s("--speaker-primary")], 4.5);
  row("Ink on a primary button hover", "--speaker-ink on --speaker-primary-hover", ink, [], [s("--speaker-primary-hover")], 4.5);
  for (const flag of ["--speaker-cue", "--speaker-alert", "--speaker-here"] as const) row(`Flag text on ${flag}`, `--speaker-on-flag on ${flag}`, s("--speaker-on-flag"), [], [s(flag)], 4.5);
  const ring = s("--speaker-here");
  row("Focus ring on a panel", "--speaker-here on --speaker-panel", ring, [s("--speaker-panel")], bases, 3);
  row("Focus ring on the footer pill", "--speaker-here on --speaker-pill", ring, [s("--speaker-pill")], bases, 3);
  row("Focus ring on the solid fallback", "--speaker-here on --speaker-solid", ring, [], [s("--speaker-solid")], 3);
  row("Focus ring on a primary button", "--speaker-here on --speaker-primary", ring, [], [s("--speaker-primary")], 3);
  return rows;
}

// --- Lint --------------------------------------------------------------------------------------

const TOP_LEVEL = new Set(["$schema", "schemaVersion", "id", "name", "extends", "traits", "tokens", "code", "fonts", "motion", "details"]);
/** What a token value can never hold: no rule, comment, import, script or external file. */
const UNSAFE_VALUE = /[{}<>;@\\]|\/\*|\*\/|url\(|expression\(|javascript:|!important/i;
const LOOKS_LIKE_SELECTOR = /^[.#[:*>&]|\s[>+~]\s/;

/** Everything wrong with a theme file, without resolving it. `theme-lint` runs this. */
export function lintThemeFile(raw: unknown): ThemeProblem[] {
  const out: ThemeProblem[] = [];
  const bad = (field: string, message: string) => out.push({ field, message });
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return [{ field: "(file)", message: "A theme file is one JSON object." }];
  const file = raw as Record<string, unknown>;
  for (const key of Object.keys(file)) {
    if (!TOP_LEVEL.has(key)) bad(key, LOOKS_LIKE_SELECTOR.test(key) ? "A theme file holds no selectors. Set a token from the contract." : "Unknown field.");
  }
  if (file.schemaVersion !== 1) bad("schemaVersion", "Must be 1.");
  if (typeof file.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(file.id)) bad("id", "Use lowercase letters, digits and dashes.");
  if (typeof file.name !== "string" || !file.name) bad("name", "Give the theme a name.");
  const tokens = (file.tokens ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(tokens)) {
    if (LOCKED_TOKENS.includes(key)) bad(`tokens.${key}`, "Not themeable: layout limits depend on 24 px code on a 36 px line.");
    else if (DERIVED_TOKENS.includes(key)) bad(`tokens.${key}`, "Set this through `code`, `fonts` or `motion`.");
    else if (!CONTRACT_TOKENS.includes(key)) bad(`tokens.${key}`, LOOKS_LIKE_SELECTOR.test(key) ? "A theme file holds no selectors. Set a token from the contract." : "Not in the token contract.");
    if (typeof value !== "string") bad(`tokens.${key}`, "A token value is a string.");
    else if (UNSAFE_VALUE.test(value)) bad(`tokens.${key}`, "A token value holds one CSS value: no rules, selectors, comments, url() or scripts.");
  }
  const code = (file.code ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(code)) {
    if (!(CODE_KEYS as readonly string[]).includes(key)) bad(`code.${key}`, "Unknown code color.");
    else if (typeof value !== "string" || !parseColor(value)) bad(`code.${key}`, "Must be a color.");
  }
  const motion = (file.motion ?? {}) as { fade?: unknown; effect?: unknown };
  if (motion.fade !== undefined && (typeof motion.fade !== "number" || motion.fade < 0 || motion.fade > 200)) bad("motion.fade", "Fades run 0 to 200 ms: longer ones make spotlights lag their steps.");
  if (motion.effect !== undefined) {
    const names = String(motion.effect).split(/\s+/);
    for (const n of names) if (n !== "none" && !(EFFECTS as readonly string[]).includes(n)) bad("motion.effect", `Unknown effect "${n}". Effects are engine code: ${EFFECTS.join(", ")}.`);
  }
  for (const [key, value] of Object.entries((file.details ?? {}) as Record<string, string>)) {
    if (!DETAILS[key]) bad(`details.${key}`, `Unknown detail. Choose from ${Object.keys(DETAILS).join(", ")}.`);
    else if (!DETAILS[key][value]) bad(`details.${key}`, `Choose from ${Object.keys(DETAILS[key]).join(", ")}.`);
  }
  const width = tokens["--chrome-spot-width"];
  if (typeof width === "string" && !(Number.parseFloat(width) >= 1 && Number.parseFloat(width) <= 6)) bad("tokens.--chrome-spot-width", "The ring sits inside the 7 px band, with the halo: use 1 to 6 px.");
  const style = tokens["--chrome-spot-style"];
  if (typeof style === "string" && !["solid", "dashed", "dotted", "double"].includes(style)) bad("tokens.--chrome-spot-style", "Use solid, dashed, dotted or double.");
  const weight = tokens["--chrome-title-weight"];
  if (typeof weight === "string" && !(Number(weight) >= 400 && Number(weight) <= 900)) bad("tokens.--chrome-title-weight", "Use a weight from 400 to 900.");
  const fonts = (file.fonts ?? {}) as { sans?: ThemeFont; mono?: ThemeFont };
  for (const [slot, font] of Object.entries(fonts)) {
    if (font === undefined) continue;
    if (typeof font === "string") {
      if (UNSAFE_VALUE.test(font)) bad(`fonts.${slot}`, "A font is a family name or a system stack.");
      else if (slot === "mono" && !FONT_FAMILIES[font]?.monospace && !/mono|courier|consol|menlo/i.test(font)) bad("fonts.mono", "Code needs a monospaced face (24 px, 400 or heavier, no ligatures that hide characters).");
    } else {
      if (!font.license) bad(`fonts.${slot}.license`, "Name the font's license.");
      for (const f of font.files ?? []) if (!f.src?.startsWith("/fonts/")) bad(`fonts.${slot}.files`, "A font file sits under public/fonts/.");
      for (const f of font.files ?? []) if (slot === "mono" && f.weight < 400) bad(`fonts.${slot}.files`, "Code is set at weight 400 or heavier.");
    }
  }
  return out;
}
