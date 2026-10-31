import { excerptFile, shownFile } from "../lib/demo-files";
import type { ServerRoute } from "../lib/frames/routes";
import type { DeckConfig, DemoConfig, IntroConfig, ShownFile } from "./config";
import { FULL_VIEWPORT, SPLITS, type Beat, type Demo, type DemoCodeFile, type DemoPage, type Frame, type FrameKind, type FramePage, type IntroPage, type SplitRatio, type Step } from "./demo";
import { DEFAULT_CHROME_THEME } from "../lib/chrome-themes.generated";
import type { Citation, CopyContent, Slide, SlideConfig } from "./slide";

/** What `.live-ish/deck.gen.ts` hands the engine: the author's modules and where each demo lives. */
export interface DeckInput {
  config: DeckConfig;
  slides: SlideConfig[];
  demos: { folder: string; demo: DemoConfig; hooks: boolean; routes?: ServerRoute[] }[];
}

/** The deck config with its defaults filled in. */
export interface Deck {
  schemaVersion: 1;
  title: string;
  description: string;
  lang: string;
  speaker: { name: string; title?: string; org?: string; url?: string };
  /** Title and organization for one line: "Staff engineer, Example Co". */
  role?: string;
  event?: DeckConfig["event"] & { label: string };
  links: { site?: { label: string; url: string }; tag?: Record<string, string> };
  footer: string;
  beats: { before: string; after: string };
  theme: { extends: string; fonts?: { sans?: string[]; mono?: string[] }; grain: boolean; brand?: { text: string; url?: string }; tokens: Record<string, string> };
  chrome: { theme: string; beats: { before?: string; after?: string }; copySlides: boolean; custom: string[] };
  hosts: { site?: string; frames?: string; external: Record<string, string> };
  presenter: { onHost: boolean };
  reader: { enabled: boolean; notes: boolean; index: boolean };
  analytics: { provider: "none" | "vercel" | "custom"; speedInsights: boolean; script?: string };
  timing: { target?: number };
}

export interface AssembledDeck {
  deck: Deck;
  slides: Slide[];
  demos: Demo[];
}

export class DeckError extends Error {
  override name = "DeckError";
}

export const DEFAULT_BEATS = { before: "What we used to do", after: "What we can do today" };

function resolveDeck(config: DeckConfig): Deck {
  if (config.schemaVersion !== 1) throw new DeckError(`deck.config.ts: schemaVersion must be 1, found ${String(config.schemaVersion)}.`);
  if (!config.title) throw new DeckError("deck.config.ts: title is required.");
  if (!config.speaker?.name) throw new DeckError("deck.config.ts: speaker.name is required.");
  if (!Array.isArray(config.order) || config.order.length === 0) throw new DeckError("deck.config.ts: order must list at least one slide or demo id.");
  const event = config.event ? { ...config.event, label: config.event.label ?? [config.event.name, config.event.city].filter(Boolean).join(", ") } : undefined;
  const role = [config.speaker.title, config.speaker.org].filter(Boolean).join(", ") || undefined;
  return {
    schemaVersion: 1,
    title: config.title,
    description: config.description ?? config.title,
    lang: config.lang ?? "en",
    speaker: config.speaker,
    role,
    event,
    links: { site: config.links?.site, tag: config.links?.tag },
    footer: config.footer ?? [event?.label, config.speaker.name, config.speaker.org].filter(Boolean).join(", "),
    beats: { ...DEFAULT_BEATS, ...config.beats },
    theme: { extends: config.theme?.extends ?? "default", fonts: config.theme?.fonts, grain: config.theme?.grain ?? true, brand: config.theme?.brand, tokens: config.theme?.tokens ?? {} },
    chrome: { theme: config.chrome?.theme ?? DEFAULT_CHROME_THEME, beats: config.chrome?.beats ?? {}, copySlides: config.chrome?.copySlides ?? false, custom: config.chrome?.custom ?? [] },
    hosts: { site: config.hosts?.site, frames: config.hosts?.frames, external: config.hosts?.external ?? {} },
    presenter: { onHost: config.presenter?.onHost ?? false },
    reader: { enabled: config.reader?.enabled ?? true, notes: config.reader?.notes ?? false, index: config.reader?.index ?? true },
    analytics: { provider: config.analytics?.provider ?? "none", speedInsights: config.analytics?.speedInsights ?? false, script: config.analytics?.script },
    timing: { target: config.timing?.target },
  };
}

/** The Levenshtein-nearest candidate, for "did you mean". */
function nearest(name: string, candidates: string[]): string | undefined {
  const distance = (a: string, b: string): number => {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const next = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = row[j];
        row[j] = next;
      }
    }
    return row[b.length];
  };
  return candidates.map((c) => ({ c, d: distance(name, c) })).sort((x, y) => x.d - y.d)[0]?.c;
}

function copyContent(slide: SlideConfig, deck: Deck): CopyContent | undefined {
  switch (slide.layout) {
    case "title":
      return { kind: "title", eyebrow: slide.eyebrow ?? deck.event?.label, lines: slide.lines ?? [slide.title] };
    case "grid":
      return {
        kind: "grid",
        variant: slide.variant ?? "icons",
        tone: slide.tone ?? "light",
        align: slide.align,
        eyebrow: slide.eyebrow,
        title: slide.display ? undefined : slide.title,
        display: slide.display,
        lede: slide.lede,
        cardsEyebrow: slide.cardsEyebrow,
        cards: slide.cards ?? [],
      };
    case "quotes":
      return { kind: "quotes", title: slide.title, quotes: slide.quotes ?? [] };
    case "statement":
      return { kind: "statement", lines: slide.lines ?? [slide.title] };
    case "people":
      return { kind: "people", title: slide.title, people: slide.people ?? [] };
    case "closing":
      return {
        kind: "closing",
        eyebrow: slide.eyebrow ?? slide.title,
        name: deck.speaker.name,
        role: deck.role,
        link: slide.linkLabel ?? slide.url?.replace(/^https?:\/\//, "").replace(/\/$/, ""),
        url: slide.url,
        caption: slide.caption,
        qr: slide.url ? `/live-ish/qr/${slide.id}.svg` : undefined,
      };
    default:
      return undefined;
  }
}

function copySlide(config: SlideConfig, deck: Deck): Omit<Slide, "index" | "timing"> & { minutes: number } {
  const { minutes = 1, citations = [], notes = "", layout = "content", ...rest } = config;
  const with_layout = { ...config, layout };
  // `label` and `eyebrow` are one slug on a section slide.
  const eyebrow = layout === "section" ? (config.label ?? config.eyebrow) : config.eyebrow;
  return { ...rest, eyebrow, layout, notes, citations, minutes, copy: copyContent(with_layout, deck) };
}

const LANG_BY_EXT: Record<string, DemoCodeFile["lang"]> = { html: "html", htm: "html", css: "css", js: "js", mjs: "js", cjs: "js", ts: "ts", mts: "ts", tsx: "tsx", json: "json", yaml: "yaml", yml: "yaml", sh: "bash", bash: "bash", http: "http" };

function langOf(file: ShownFile): DemoCodeFile["lang"] {
  return file.lang ?? LANG_BY_EXT[file.file.split(".").pop()?.toLowerCase() ?? ""] ?? "text";
}

function beatKind(demo: DemoConfig, beat: Exclude<Beat, "intro">): FrameKind {
  return demo[beat]?.kind ?? demo.kind ?? "web";
}

/** The folder a beat's files live in: `before/`, `after/`, or the demo's own on a terminal page. */
export function beatDir(folder: string, kind: FrameKind, beat: Exclude<Beat, "intro">): string {
  return kind === "terminal" ? folder : `${folder}/${beat}`;
}

function codeFiles(files: ShownFile[] | undefined, dir: string): DemoCodeFile[] {
  return (files ?? []).map((f) => {
    const lang = langOf(f);
    const name = f.file.split("/").pop() ?? f.file;
    return f.ranges ? excerptFile(`${dir}/${f.file}`, lang, f.ranges, name) : shownFile(`${dir}/${f.file}`, lang, name);
  });
}

function frameFor(demo: DemoConfig, beat: Exclude<Beat, "intro">, viewport: Frame["viewport"]): Frame {
  const page = demo[beat]!;
  const kind = beatKind(demo, beat);
  const hooks = kind === "terminal" ? [...new Set(["reset", ...(page.hooks ?? [])])] : page.hooks;
  const route = kind === "server" ? serverRoute(demo, beat) : (page.address ?? `/demos/${demo.id}/${beat}`);
  return { kind, route, viewport, flags: page.flags, hooks, poster: page.poster, spotlightClip: page.spotlightClip, keycap: page.keycap, base: page.frame?.base ?? demo.frame?.base };
}

/** A server frame's route names its app: `/@shop/products/1`. lib/frames/origins.ts resolves it. */
function serverRoute(demo: DemoConfig, beat: Exclude<Beat, "intro">): string {
  const frame = demo[beat]?.frame;
  if (!frame?.app || !frame.path) throw new DeckError(`${demo.id}: ${beat} has kind "server", so it needs frame: { app, path }.`);
  return `/@${frame.app}${frame.path}`;
}

function steps(demo: DemoConfig, beat: Exclude<Beat, "intro">): Step[] {
  return demo[beat]!.steps.map((s) => ({ ...s, notes: s.notes ?? [] }));
}

/** Highest first: the page, the beat's default, the demo, the deck. */
function pageChrome(demo: DemoConfig, beat: Beat, deck: Deck): string {
  const page = beat === "intro" ? demo.intro : demo[beat];
  const beatDefault = beat === "before" || beat === "after" ? deck.chrome.beats[beat] : undefined;
  return page?.chrome ?? beatDefault ?? demo.chrome ?? deck.chrome.theme;
}

function introPage(demo: DemoConfig, intro: IntroConfig, deck: Deck): IntroPage {
  const visual = intro.visual;
  return {
    id: `${demo.id}-intro`,
    beat: "intro",
    notes: intro.notes ?? "",
    steps: [],
    timing: { minutes: intro.minutes ?? 0.25, cumulative: 0 },
    chrome: pageChrome(demo, "intro", deck),
    description: intro.description,
    visual: visual
      ? {
          src: visual.src ?? `/intro/${demo.id}.png`,
          alt: visual.alt,
          capture: visual.capture ? { pageId: `${demo.id}-${visual.capture.beat}`, stepId: visual.capture.step, selector: visual.capture.selector } : undefined,
        }
      : undefined,
  };
}

function framePage(demo: DemoConfig, beat: "before" | "after" | "single", folder: string, deck: Deck): FramePage {
  const config = demo[beat]!;
  const kind = beatKind(demo, beat);
  const files = codeFiles(config.files, beatDir(folder, kind, beat));
  const split: SplitRatio = config.split ?? "50/50";
  const viewport = files.length > 0 ? SPLITS[split].viewport : FULL_VIEWPORT;
  const base = {
    id: beat === "single" ? demo.id : `${demo.id}-${beat}`,
    notes: config.notes ?? "",
    steps: steps(demo, beat),
    timing: { minutes: config.minutes ?? 1, cumulative: 0 },
    chrome: pageChrome(demo, beat, deck),
    split,
    frame: frameFor(demo, beat, viewport),
    files,
  };
  if (beat === "single") return { ...base, beat, title: demo.single?.title ?? demo.title, badge: demo.single?.badge };
  return { ...base, beat, eyebrow: demo.title, title: deck.beats[beat] };
}

/** One demo folder expanded into its pages: ids, routes, viewports, in reading order. */
export function expandDemo(input: DeckInput["demos"][number], order: number, deck: Deck): Demo {
  const { demo, folder, routes } = input;
  const pages: DemoPage[] = [];
  if (demo.beats === "single") {
    if (!demo.single) throw new DeckError(`${demo.id}: beats is "single", so the demo needs a single page.`);
    pages.push(framePage(demo, "single", folder, deck));
  } else {
    if (demo.intro) pages.push(introPage(demo, demo.intro, deck));
    if (demo.before) pages.push(framePage(demo, "before", folder, deck));
    if (demo.after) pages.push(framePage(demo, "after", folder, deck));
    if (demo.single) pages.push(framePage(demo, "single", folder, deck));
  }
  if (pages.length === 0) throw new DeckError(`${demo.id}: a demo needs at least one of intro, before, after or single.`);
  return {
    id: demo.id,
    order,
    folder,
    title: demo.title,
    scenario: demo.scenario,
    background: demo.background,
    support: demo.support,
    chip: demo.chip,
    navGroup: demo.navGroup,
    chrome: demo.chrome,
    pages,
    citations: demo.citations ?? [],
    cautions: demo.cautions ?? [],
    routes,
  };
}

function demoSlide(page: DemoPage, { routes: _routes, ...demo }: Demo): Omit<Slide, "index" | "timing"> & { minutes: number } {
  // A slide reaches client components, and route handlers are functions, so they stay on `demos`.
  return {
    id: page.id,
    layout: "demo-page",
    title: page.beat === "intro" ? demo.title : page.title,
    notes: page.notes,
    citations: demo.citations as Citation[],
    background: demo.background,
    chrome: page.chrome,
    page,
    demo,
    minutes: page.timing.minutes,
  };
}

/**
 * The whole deck from one list. `order` decides what is in it: a slide or demo left out of `order`
 * is not served. Slide numbers and cumulative minutes are computed, never typed.
 */
export function assembleDeck(input: DeckInput): AssembledDeck {
  const deck = resolveDeck(input.config);
  const slideById = new Map(input.slides.map((s) => [s.id, s]));
  const demoById = new Map(input.demos.map((d) => [d.demo.id, d]));
  const known = [...slideById.keys(), ...demoById.keys()];
  const seen = new Set<string>();
  const demos: Demo[] = [];
  const parts: (Omit<Slide, "index" | "timing"> & { minutes: number })[] = [];
  for (const id of input.config.order) {
    if (seen.has(id)) throw new DeckError(`deck.config.ts: order lists "${id}" twice.`);
    seen.add(id);
    const slide = slideById.get(id);
    const demo = demoById.get(id);
    if (slide && demo) throw new DeckError(`"${id}" is both a slide and a demo. Rename one.`);
    if (slide) {
      parts.push(copySlide(slide, deck));
    } else if (demo) {
      const expanded = expandDemo(demo, demos.length + 1, deck);
      demos.push(expanded);
      for (const page of expanded.pages) parts.push(demoSlide(page, expanded));
    } else {
      const hint = nearest(id, known);
      throw new DeckError(`deck.config.ts: order names "${id}", which is neither a slide nor a demo.${hint ? ` Did you mean "${hint}"?` : ""}`);
    }
  }
  let cumulative = 0;
  const slides = parts.map(({ minutes, ...part }, i): Slide => {
    cumulative = Math.round((cumulative + minutes) * 100) / 100;
    const timing = { minutes, cumulative };
    if (part.page) part.page.timing = timing;
    return { ...part, index: i + 1, timing };
  });
  const ids = new Set<string>();
  for (const s of slides) {
    if (ids.has(s.id)) throw new DeckError(`Two slides share the id "${s.id}". A demo's pages take the ids <demo>-intro, <demo>-before and <demo>-after.`);
    ids.add(s.id);
  }
  return { deck, slides, demos };
}
