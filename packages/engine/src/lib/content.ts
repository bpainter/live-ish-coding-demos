import input from "@live-ish/deck";
import { assembleDeck } from "../schema/assemble";
import type { Demo, DemoPage } from "../schema/demo";
import type { Slide } from "../schema/slide";

/**
 * The one injection point. `.live-ish/deck.gen.ts` imports the deck's own modules, `withDeck()`
 * aliases `@live-ish/deck` to it, and everything else in the engine reads the deck from here.
 */
export const { deck, slides, demos } = assembleDeck(input);

export function bySlideId(id: string): Slide | undefined {
  return slides.find((s) => s.id === id);
}

export function slideIdByNumber(n: number): string | undefined {
  return slides[n - 1]?.id;
}

export function neighbours(id: string): { prev?: Slide; next?: Slide; position: number } {
  const i = slides.findIndex((s) => s.id === id);
  return { prev: slides[i - 1], next: slides[i + 1], position: i };
}

/** A demo page by id, with its demo. */
export function pageById(id: string): { demo: Demo; page: DemoPage } | undefined {
  for (const demo of demos) {
    const page = demo.pages.find((p) => p.id === id);
    if (page) return { demo, page };
  }
  return undefined;
}

/** A link leaving the deck, with `links.tag` added. A link is never rewritten without asking. */
export function outboundHref(url: string, slideId?: string): string {
  const tag = deck.links.tag;
  if (!tag) return url;
  const out = new URL(url);
  for (const [k, v] of Object.entries(tag)) out.searchParams.set(k, v.replace("{slide}", slideId ?? ""));
  return out.toString();
}
