import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assembleDeck, DeckError, hasFrame, refusesEmbedding, writeDeckModule, type AssembledDeck, type DeckInput, type Demo, type DemoPage, type FramePage, type Slide, type Step } from "@live-ish/engine/verify";
import { EnvironmentError, UsageError } from "./args";

export interface DeckData extends AssembledDeck {
  root: string;
  input: DeckInput;
  /** Slide ids, in order. */
  ids: string[];
  /** The storage key of the presenter's state: `live-ish:<deck>:state`. */
  stateKey: string;
}

/** The deck at `root`, as the engine assembles it. Every walk reads this and nothing hard-coded. */
export async function loadDeck(root: string): Promise<DeckData> {
  if (!existsSync(path.join(root, "deck.config.ts"))) throw new EnvironmentError(`No deck.config.ts in ${root}. Run this from a deck folder.`);
  process.env.LIVE_ISH_DECK_ROOT = root;
  try {
    const file = writeDeckModule(root);
    const input = ((await import(pathToFileURL(file).href)) as { default: DeckInput }).default;
    const assembled = assembleDeck(input);
    const summary = path.join(root, ".live-ish", "deck.json");
    const deckId = existsSync(summary) ? (JSON.parse(readFileSync(summary, "utf8")) as { deckId: string }).deckId : assembled.deck.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return { ...assembled, root, input, ids: assembled.slides.map((s) => s.id), stateKey: `live-ish:${deckId}:state` };
  } catch (e) {
    if (e instanceof DeckError) throw new EnvironmentError(e.message);
    throw e;
  }
}

export interface Target {
  demo: Demo;
  page: FramePage;
}

/** A frame that never answers, on purpose. Its `csp` refuses every ancestor. */
export const isBlocked = (page: FramePage) => refusesEmbedding(page.frame);

/** Every page with a frame the walks can drive: not a blocked one, not one whose app is not running. */
export function liveFrames(deck: DeckData, serversUp = new Set<string>()): Target[] {
  return deck.demos.flatMap((demo) =>
    demo.pages.filter(hasFrame).flatMap((page): Target[] => {
      if (isBlocked(page)) return [];
      if (page.frame.kind === "server" && !serversUp.has(serverApp(page) ?? "")) return [];
      return [{ demo, page }];
    }),
  );
}

/** The app in a server frame's route: `/@shop/products/1` is `shop`. */
export const serverApp = (page: FramePage) => /^\/@([\w-]+)/.exec(page.frame.route)?.[1];

/** The `hosts.external` apps that answer, so a stopped server skips its pages and fails nothing. */
export async function runningServers(deck: DeckData): Promise<Set<string>> {
  const up = new Set<string>();
  for (const [app, origin] of Object.entries(deck.deck.hosts.external)) {
    const ok = await fetch(origin).then(() => true, () => false);
    if (ok) up.add(app);
  }
  return up;
}

/** Does `id` name this page: its own id, its demo's id, or its slide? */
export const matches = (id: string | undefined, demo: Demo, page: DemoPage) => !id || page.id === id || demo.id === id;

/** Narrows frames to one id. An id the deck does not have is a mistake, not an empty pass. */
export function pick(targets: Target[], id: string | undefined, deck: DeckData): Target[] {
  if (id && !deck.ids.includes(id) && !deck.demos.some((d) => d.id === id)) throw new UsageError(`No page or demo "${id}" in this deck.`);
  return targets.filter(({ demo, page }) => matches(id, demo, page));
}

/** The spotlight fixture, when the deck carries one: the page in `demos/00-fixtures/`. */
export function fixturePage(deck: DeckData): Target | null {
  const demo = deck.demos.find((d) => d.folder.endsWith("/00-fixtures"));
  const page = demo?.pages.find(hasFrame);
  return demo && page ? { demo, page } : null;
}

/** The next slide after `id`, and the previous one. */
export function around(deck: DeckData, id: string): { prev?: Slide; next?: Slide } {
  const i = deck.ids.indexOf(id);
  return { prev: deck.slides[i - 1], next: deck.slides[i + 1] };
}

/** Copy slides whose neighbours are copy slides too, for checks that want a plain slide change. */
export function plainRun(deck: DeckData, length: number): Slide | null {
  for (let i = 0; i + length <= deck.slides.length; i++) {
    if (deck.slides.slice(i, i + length).every((s) => !s.page)) return deck.slides[i];
  }
  return null;
}

/** Intro slides whose next page has a live frame: the slides that warm one. */
export interface WarmedIntro {
  prev: string;
  intro: string;
  next: string;
}

export function warmedIntros(deck: DeckData, serversUp?: Set<string>): WarmedIntro[] {
  const live = new Set(liveFrames(deck, serversUp).map((t) => t.page.id));
  const out: WarmedIntro[] = [];
  for (const demo of deck.demos) {
    const at = demo.pages.findIndex((p) => p.beat === "intro");
    const next = demo.pages[at + 1];
    if (at < 0 || !next || !live.has(next.id) || (hasFrame(next) && next.frame.route.startsWith("/@"))) continue;
    const prev = deck.ids[deck.ids.indexOf(demo.pages[at].id) - 1];
    if (prev) out.push({ prev, intro: demo.pages[at].id, next: next.id });
  }
  return out;
}

/** The first intro slide followed by a frame, for checks that want that move. */
export function firstWarmed(deck: DeckData): WarmedIntro | null {
  return warmedIntros(deck)[0] ?? null;
}

/** A page with at least `n` steps, preferring one with a code panel. */
export function pageWithSteps(deck: DeckData, n: number, serversUp?: Set<string>): Target | null {
  const all = liveFrames(deck, serversUp).filter((t) => t.page.steps.length >= n && t.page.frame.kind !== "terminal" && !t.page.steps.some((s) => s.route));
  return all.find((t) => t.page.files.length > 1) ?? all.find((t) => t.page.files.length > 0) ?? all[0] ?? null;
}

export const stepKey = (page: DemoPage, step: Step) => `${page.id}:${step.id}`;
